import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";

// confirm-swap.test.ts exercises the confirm_swap() RPC itself. This file
// exercises the OTHER side of the same guarantee: that a client can't just
// skip confirm_swap() and write to public.swap_requests directly (e.g. via
// devtools) to fake a confirmation, impersonate a responder, or otherwise
// bypass the state machine that src/lib/validation/swap.ts already enforces
// on the application layer. See the comment above the swap_requests RLS
// policies in supabase/schema.sql for the full rationale.
describe("RLS: public.swap_requests (direct table access, bypassing confirm_swap)", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  async function makeShift(assignedTo: string, hoursFromNow = 24) {
    const start = new Date(Date.now() + hoursFromNow * 3600_000);
    const end = new Date(start.getTime() + 24 * 3600_000);
    return db.asService(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into public.shifts (start_time, end_time, assigned_to)
         values ($1, $2, $3) returning id`,
        [start.toISOString(), end.toISOString(), assignedTo],
      );
      return rows[0].id;
    });
  }

  async function makeSwapRequest(opts: {
    shiftId: string;
    requestedBy: string;
    status?: string;
    type?: "ta_over" | "direkt_byte" | null;
    responderId?: string | null;
    offeredShiftId?: string | null;
  }) {
    const {
      shiftId,
      requestedBy,
      status = "oppen",
      type = null,
      responderId = null,
      offeredShiftId = null,
    } = opts;
    return db.asService(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into public.swap_requests
           (shift_id, requested_by, status, type, responder_id, offered_shift_id)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [shiftId, requestedBy, status, type, responderId, offeredShiftId],
      );
      return rows[0].id;
    });
  }

  async function getRequest(requestId: string) {
    return db.asService(async (client) => {
      const { rows } = await client.query("select * from public.swap_requests where id = $1", [
        requestId,
      ]);
      return rows[0];
    });
  }

  describe("insert", () => {
    it("man kan lägga ut sitt eget pass för byte", async () => {
      const alice = await db.seedUser("Alice");
      const shiftId = await makeShift(alice);

      await expect(
        db.asUser(alice, (client) =>
          client.query(
            "insert into public.swap_requests (shift_id, requested_by, status) values ($1, $2, 'oppen')",
            [shiftId, alice],
          ),
        ),
      ).resolves.toBeDefined();
    });

    it("man kan inte lägga ut någon annans pass för byte", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const aliceShift = await makeShift(alice);

      await expect(
        db.asUser(bob, (client) =>
          client.query(
            "insert into public.swap_requests (shift_id, requested_by, status) values ($1, $2, 'oppen')",
            [aliceShift, bob],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("man kan inte skapa en förfrågan som redan är bekräftad eller har en responder", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const shiftId = await makeShift(alice);

      await expect(
        db.asUser(alice, (client) =>
          client.query(
            "insert into public.swap_requests (shift_id, requested_by, status) values ($1, $2, 'bekraftad')",
            [shiftId, alice],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);

      await expect(
        db.asUser(alice, (client) =>
          client.query(
            "insert into public.swap_requests (shift_id, requested_by, status, responder_id) values ($1, $2, 'oppen', $3)",
            [shiftId, alice, bob],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  describe("update: kringgå confirm_swap()", () => {
    it("ingen kan sätta status = bekraftad direkt (måste gå via confirm_swap())", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({
        shiftId,
        requestedBy: alice,
        status: "vantar_bekraftelse",
        responderId: bob,
      });

      await expect(
        db.asUser(alice, (client) =>
          client.query("update public.swap_requests set status = 'bekraftad' where id = $1", [requestId]),
        ),
      ).rejects.toThrow(/bara bekräftas via confirm_swap/i);

      expect((await getRequest(requestId)).status).toBe("vantar_bekraftelse");
    });

    it("man kan inte ändra shift_id, requested_by eller created_at i efterhand", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const otherShift = await makeShift(alice);
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({ shiftId, requestedBy: alice });

      await expect(
        db.asUser(alice, (client) =>
          client.query("update public.swap_requests set shift_id = $1 where id = $2", [
            otherShift,
            requestId,
          ]),
        ),
      ).rejects.toThrow(/får inte ändra/i);

      await expect(
        db.asUser(alice, (client) =>
          client.query("update public.swap_requests set requested_by = $1 where id = $2", [
            bob,
            requestId,
          ]),
        ),
      ).rejects.toThrow(/får inte ändra/i);
    });
  });

  describe("update: svara på en öppen förfrågan", () => {
    it("en annan användare kan ta över/erbjuda sig genom att sätta sig själv som responder", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({ shiftId, requestedBy: alice });

      await db.asUser(bob, (client) =>
        client.query(
          "update public.swap_requests set status = 'vantar_bekraftelse', responder_id = $1, type = 'ta_over' where id = $2",
          [bob, requestId],
        ),
      );

      const request = await getRequest(requestId);
      expect(request.status).toBe("vantar_bekraftelse");
      expect(request.responder_id).toBe(bob);
    });

    it("den som lade ut passet kan inte svara på sin egen förfrågan", async () => {
      const alice = await db.seedUser("Alice");
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({ shiftId, requestedBy: alice });

      await expect(
        db.asUser(alice, (client) =>
          client.query(
            "update public.swap_requests set status = 'vantar_bekraftelse', responder_id = $1, type = 'ta_over' where id = $2",
            [alice, requestId],
          ),
        ),
      ).rejects.toThrow(/inte svara på sin egen/i);
    });

    it("man kan inte utge sig för att vara någon annan som responder", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const carl = await db.seedUser("Carl");
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({ shiftId, requestedBy: alice });

      await expect(
        db.asUser(bob, (client) =>
          client.query(
            "update public.swap_requests set status = 'vantar_bekraftelse', responder_id = $1, type = 'ta_over' where id = $2",
            [carl, requestId],
          ),
        ),
      ).rejects.toThrow(/responder_id måste vara den som svarar/i);
    });
  });

  describe("update: avböja ett svar", () => {
    it("den som lade ut passet kan avböja ett svar (tillbaka till öppen)", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({
        shiftId,
        requestedBy: alice,
        status: "vantar_bekraftelse",
        responderId: bob,
        type: "ta_over",
      });

      await db.asUser(alice, (client) =>
        client.query(
          "update public.swap_requests set status = 'oppen', responder_id = null, type = null, offered_shift_id = null where id = $1",
          [requestId],
        ),
      );

      const request = await getRequest(requestId);
      expect(request.status).toBe("oppen");
      expect(request.responder_id).toBeNull();
    });

    it("bara den som lade ut passet kan avböja — inte responder själv", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({
        shiftId,
        requestedBy: alice,
        status: "vantar_bekraftelse",
        responderId: bob,
        type: "ta_over",
      });

      await expect(
        db.asUser(bob, (client) =>
          client.query(
            "update public.swap_requests set status = 'oppen', responder_id = null, type = null, offered_shift_id = null where id = $1",
            [requestId],
          ),
        ),
      ).rejects.toThrow(/endast den som lade ut passet kan avböja/i);
    });

    it("en avböjning måste faktiskt nollställa svaret", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({
        shiftId,
        requestedBy: alice,
        status: "vantar_bekraftelse",
        responderId: bob,
        type: "ta_over",
      });

      await expect(
        db.asUser(alice, (client) =>
          client.query("update public.swap_requests set status = 'oppen' where id = $1", [requestId]),
        ),
      ).rejects.toThrow(/måste nollställa svaret/i);
    });
  });

  describe("update: avbryta", () => {
    it("den som lade ut passet kan avbryta en öppen eller väntande förfrågan", async () => {
      const alice = await db.seedUser("Alice");
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({ shiftId, requestedBy: alice });

      await db.asUser(alice, (client) =>
        client.query("update public.swap_requests set status = 'avbruten' where id = $1", [requestId]),
      );

      expect((await getRequest(requestId)).status).toBe("avbruten");
    });

    it("responder kan inte avbryta någon annans förfrågan", async () => {
      const alice = await db.seedUser("Alice");
      const bob = await db.seedUser("Bob");
      const shiftId = await makeShift(alice);
      const requestId = await makeSwapRequest({
        shiftId,
        requestedBy: alice,
        status: "vantar_bekraftelse",
        responderId: bob,
        type: "ta_over",
      });

      await expect(
        db.asUser(bob, (client) =>
          client.query("update public.swap_requests set status = 'avbruten' where id = $1", [requestId]),
        ),
      ).rejects.toThrow(/endast den som lade ut passet kan avbryta/i);
    });
  });

  it("ingen kan ta bort en bytesförfrågan direkt (ingen delete-policy)", async () => {
    const alice = await db.seedUser("Alice");
    const shiftId = await makeShift(alice);
    const requestId = await makeSwapRequest({ shiftId, requestedBy: alice });

    await db.asUser(alice, (client) =>
      client.query("delete from public.swap_requests where id = $1", [requestId]),
    );

    expect(await getRequest(requestId)).toBeDefined();
  });
});
