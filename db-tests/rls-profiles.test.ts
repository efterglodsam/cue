import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";

// The RLS policy on public.profiles is the ONLY thing standing between a
// logged-in user and directly upgrading their own account — none of the
// admin checks in src/lib/actions/team.ts apply if a client talks to
// Supabase's REST/RPC layer directly instead of going through the app's
// Server Actions. See the "profiles" section of supabase/schema.sql.
describe("RLS: public.profiles", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  it("en vanlig användare kan INTE göra sig själv till admin", async () => {
    const alice = await db.seedUser("Alice", false);

    await expect(
      db.asUser(alice, (client) =>
        client.query("update public.profiles set is_admin = true where id = $1", [alice]),
      ),
    ).rejects.toThrow(/row-level security/i);

    const profile = await db.asService(async (client) => {
      const { rows } = await client.query("select is_admin from public.profiles where id = $1", [alice]);
      return rows[0];
    });
    expect(profile.is_admin).toBe(false);
  });

  it("en vanlig användare kan uppdatera sitt eget namn (utan att röra is_admin)", async () => {
    const alice = await db.seedUser("Alice", false);

    await db.asUser(alice, (client) =>
      client.query("update public.profiles set full_name = $1 where id = $2", ["Alice A.", alice]),
    );

    const profile = await db.asService(async (client) => {
      const { rows } = await client.query("select full_name, is_admin from public.profiles where id = $1", [
        alice,
      ]);
      return rows[0];
    });
    expect(profile.full_name).toBe("Alice A.");
    expect(profile.is_admin).toBe(false);
  });

  it("en vanlig användare kan INTE uppdatera någon ANNANS profil", async () => {
    const alice = await db.seedUser("Alice", false);
    const bob = await db.seedUser("Bob", false);

    await db.asUser(alice, (client) =>
      client.query("update public.profiles set full_name = $1 where id = $2", ["Hackad", bob]),
    );

    const bobProfile = await db.asService(async (client) => {
      const { rows } = await client.query("select full_name from public.profiles where id = $1", [bob]);
      return rows[0];
    });
    // RLS på UPDATE filtrerar tyst bort raden (0 rader träffade) snarare än
    // att kasta ett fel — samma som en WHERE-klausul som inte matchar något.
    expect(bobProfile.full_name).toBe("Bob");
  });

  it("en admin KAN göra en kollega till admin", async () => {
    const admin = await db.seedUser("Adminsson", true);
    const bob = await db.seedUser("Bob", false);

    await db.asUser(admin, (client) =>
      client.query("update public.profiles set is_admin = true where id = $1", [bob]),
    );

    const bobProfile = await db.asService(async (client) => {
      const { rows } = await client.query("select is_admin from public.profiles where id = $1", [bob]);
      return rows[0];
    });
    expect(bobProfile.is_admin).toBe(true);
  });

  it("en admin kan återkalla sin egen admin-status", async () => {
    const admin = await db.seedUser("Adminsson", true);

    await db.asUser(admin, (client) =>
      client.query("update public.profiles set is_admin = false where id = $1", [admin]),
    );

    const profile = await db.asService(async (client) => {
      const { rows } = await client.query("select is_admin from public.profiles where id = $1", [admin]);
      return rows[0];
    });
    expect(profile.is_admin).toBe(false);
  });

  it("en oinloggad (anon) kan varken läsa eller skriva profiler", async () => {
    await db.seedUser("Alice", false);

    const rows = await db.asUser(
      null,
      async (client) => (await client.query("select * from public.profiles")).rows,
      "anon",
    );
    expect(rows).toHaveLength(0);
  });
});
