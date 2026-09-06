import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";

// Innan denna skärpning krävde insert-policyn på placement_item_history bara
// att man var inloggad — inget hindrade en användare från att logga en
// ändring i en KOLLEGAS namn (changed_by = valfritt id). src/lib/actions/placement.ts
// sätter redan alltid changed_by till den faktiska användaren, så det här är
// rent en RLS-skärpning: changed_by måste nu vara auth.uid().
describe("RLS: public.placement_item_history", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  async function makeClient() {
    return db.asService(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        "insert into public.clients (name) values ('Testklient') returning id",
      );
      return rows[0].id;
    });
  }

  async function makeItem(clientId: string) {
    return db.asService(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        "insert into public.placement_items (client_id, name, location_description) values ($1, 'Nycklar', 'Hallskåpet') returning id",
        [clientId],
      );
      return rows[0].id;
    });
  }

  it("man kan skriva historik i sitt eget namn", async () => {
    const alice = await db.seedUser("Alice");
    const clientId = await makeClient();
    const itemId = await makeItem(clientId);

    await expect(
      db.asUser(alice, (client) =>
        client.query(
          "insert into public.placement_item_history (item_id, changed_by, change_type) values ($1, $2, 'andrad')",
          [itemId, alice],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it("man kan inte logga en ändring i en kollegas namn", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const clientId = await makeClient();
    const itemId = await makeItem(clientId);

    await expect(
      db.asUser(alice, (client) =>
        client.query(
          "insert into public.placement_item_history (item_id, changed_by, change_type) values ($1, $2, 'andrad')",
          [itemId, bob],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("alla inloggade kan läsa historiken", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const clientId = await makeClient();
    const itemId = await makeItem(clientId);
    await db.asUser(alice, (client) =>
      client.query(
        "insert into public.placement_item_history (item_id, changed_by, change_type) values ($1, $2, 'skapad')",
        [itemId, alice],
      ),
    );

    const rows = await db.asUser(
      bob,
      async (client) =>
        (
          await client.query("select change_type from public.placement_item_history where item_id = $1", [
            itemId,
          ])
        ).rows,
    );
    expect(rows.map((r) => r.change_type)).toContain("skapad");
  });
});
