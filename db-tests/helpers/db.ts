import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

// Points at a plain Postgres instance (local, or the `postgres` service
// container in CI) — not a Supabase project. See db-tests/fixtures/*.sql for
// what stands in for the parts of the Supabase platform schema.sql assumes.
const ADMIN_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

function readFixture(name: string): string {
  return readFileSync(path.resolve(__dirname, "../fixtures", name), "utf8");
}

const SCHEMA_SQL = readFileSync(
  path.resolve(__dirname, "../../supabase/schema.sql"),
  "utf8",
);

export type Role = "authenticated" | "anon";

export interface TestDb {
  pool: Pool;
  /** Run `fn` with a superuser connection — bypasses RLS entirely. For test setup/assertions. */
  asService<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  /**
   * Run `fn` inside a transaction with `auth.uid()`/`auth.role()` set as the
   * given user would see them, committing on success. Use this for the
   * common case of "one RLS-checked statement".
   */
  asUser<T>(
    userId: string | null,
    fn: (client: PoolClient) => Promise<T>,
    role?: Role,
  ): Promise<T>;
  /**
   * Lower-level: opens a transaction as the given user and returns the
   * client without committing. Caller owns commit/rollback/release. Needed
   * for tests that hold a lock open across two concurrent connections (see
   * confirm-swap.test.ts's race-condition test).
   */
  beginAsUser(userId: string | null, role?: Role): Promise<PoolClient>;
  /** Creates an auth.users + public.profiles row and returns its id. */
  seedUser(fullName: string, isAdmin?: boolean): Promise<string>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const dbName = `cue_test_${randomUUID().replace(/-/g, "")}`;
  const adminPool = new Pool({ connectionString: ADMIN_URL });
  await adminPool.query(`create database "${dbName}"`);
  await adminPool.end();

  const dbUrl = ADMIN_URL.replace(/\/[^/]*$/, `/${dbName}`);
  const pool = new Pool({ connectionString: dbUrl });

  await pool.query('create extension if not exists "pgcrypto"');
  await pool.query(readFixture("supabase-shim.sql"));
  await pool.query(SCHEMA_SQL);
  await pool.query(readFixture("grants.sql"));

  async function asService<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async function beginAsUser(userId: string | null, role: Role = "authenticated"): Promise<PoolClient> {
    const client = await pool.connect();
    await client.query("begin");
    // Role names come only from the fixed Role type above, never from test
    // input, so string interpolation here is safe (SET ROLE can't be
    // parameterized like a normal statement).
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    await client.query("select set_config('request.jwt.claim.role', $1, true)", [role]);
    return client;
  }

  async function asUser<T>(
    userId: string | null,
    fn: (client: PoolClient) => Promise<T>,
    role: Role = "authenticated",
  ): Promise<T> {
    const client = await beginAsUser(userId, role);
    try {
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async function seedUser(fullName: string, isAdmin = false): Promise<string> {
    return asService(async (client) => {
      const emailSlug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, ".");
      const { rows } = await client.query<{ id: string }>(
        "insert into auth.users (email) values ($1) returning id",
        [`${emailSlug}@example.test`],
      );
      const id = rows[0].id;
      // handle_new_user() already inserted a profiles row via the
      // on_auth_user_created trigger (and may have made this user admin if
      // it's the first one ever created in this test database) — overwrite
      // it with what the test actually asked for instead of inserting again.
      await client.query(
        "update public.profiles set full_name = $2, is_admin = $3 where id = $1",
        [id, fullName, isAdmin],
      );
      return id;
    });
  }

  async function close() {
    await pool.end();
    const admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`drop database if exists "${dbName}" with (force)`);
    await admin.end();
  }

  return { pool, asService, asUser, beginAsUser, seedUser, close };
}
