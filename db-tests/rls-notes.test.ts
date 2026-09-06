import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";

// README: "vissa åtgärder (t.ex. redigera/ta bort en anteckning) endast får
// göras av den som skapade den". That's enforced purely by RLS on
// public.notes (author_id = auth.uid()) — worth proving directly, since
// src/lib/actions/notes.ts has no application-level ownership check at all.
describe("RLS: public.notes", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  async function makeNote(authorId: string, body = "Hej teamet") {
    return db.asService(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        "insert into public.notes (body, author_id) values ($1, $2) returning id",
        [body, authorId],
      );
      return rows[0].id;
    });
  }

  it("man kan posta en anteckning som sig själv, men inte som någon annan", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");

    await expect(
      db.asUser(alice, (client) =>
        client.query("insert into public.notes (body, author_id) values ($1, $2)", ["Hej", alice]),
      ),
    ).resolves.toBeDefined();

    await expect(
      db.asUser(alice, (client) =>
        client.query("insert into public.notes (body, author_id) values ($1, $2)", ["Hej", bob]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("man kan redigera sin egen anteckning men inte någon annans", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const aliceNote = await makeNote(alice);
    const bobNote = await makeNote(bob);

    await db.asUser(alice, (client) =>
      client.query("update public.notes set body = $1 where id = $2", ["Uppdaterad", aliceNote]),
    );
    const updated = await db.asService(async (client) => {
      const { rows } = await client.query("select body from public.notes where id = $1", [aliceNote]);
      return rows[0];
    });
    expect(updated.body).toBe("Uppdaterad");

    await db.asUser(alice, (client) =>
      client.query("update public.notes set body = $1 where id = $2", ["Hackad", bobNote]),
    );
    const untouched = await db.asService(async (client) => {
      const { rows } = await client.query("select body from public.notes where id = $1", [bobNote]);
      return rows[0];
    });
    expect(untouched.body).toBe("Hej teamet");
  });

  it("man kan ta bort sin egen anteckning men inte någon annans", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const bobNote = await makeNote(bob);

    await db.asUser(alice, (client) => client.query("delete from public.notes where id = $1", [bobNote]));
    const stillThere = await db.asService(async (client) => {
      const { rows } = await client.query("select id from public.notes where id = $1", [bobNote]);
      return rows;
    });
    expect(stillThere).toHaveLength(1);

    await db.asUser(bob, (client) => client.query("delete from public.notes where id = $1", [bobNote]));
    const gone = await db.asService(async (client) => {
      const { rows } = await client.query("select id from public.notes where id = $1", [bobNote]);
      return rows;
    });
    expect(gone).toHaveLength(0);
  });

  it("alla inloggade kan LÄSA alla anteckningar", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    await makeNote(alice, "Alices anteckning");

    const rows = await db.asUser(
      bob,
      async (client) => (await client.query("select body from public.notes")).rows,
    );
    expect(rows.map((r) => r.body)).toContain("Alices anteckning");
  });
});
