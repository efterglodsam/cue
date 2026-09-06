import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";

// Tests the ONE thing the whole app exists to guarantee (see README): a
// shift can never end up with two people assigned to it, and a swap can
// never be marked "bekraftad" without the shift actually changing hands.
// That guarantee lives entirely in the confirm_swap() SQL function
// (supabase/schema.sql) — the application-layer guards in
// src/lib/validation/swap.ts (already unit-tested) are a UX nicety on top,
// not the actual safety net, so this exercises the function directly.
describe("confirm_swap", () => {
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
      status = "vantar_bekraftelse",
      type = "ta_over",
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

  async function getShift(shiftId: string) {
    return db.asService(async (client) => {
      const { rows } = await client.query("select * from public.shifts where id = $1", [shiftId]);
      return rows[0];
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

  it("ta_over: flyttar passets ägarskap och markerar bytet bekräftat", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const shiftId = await makeShift(alice);
    const requestId = await makeSwapRequest({
      shiftId,
      requestedBy: alice,
      type: "ta_over",
      responderId: bob,
    });

    await db.asUser(alice, (client) =>
      client.query("select public.confirm_swap($1, $2)", [requestId, alice]),
    );

    const shift = await getShift(shiftId);
    const request = await getRequest(requestId);
    expect(shift.assigned_to).toBe(bob);
    expect(request.status).toBe("bekraftad");
    expect(request.confirmed_at).not.toBeNull();
  });

  it("direkt_byte: byter ägarskap på BÅDA passen", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const aliceShift = await makeShift(alice);
    const bobShift = await makeShift(bob);
    const requestId = await makeSwapRequest({
      shiftId: aliceShift,
      requestedBy: alice,
      type: "direkt_byte",
      responderId: bob,
      offeredShiftId: bobShift,
    });

    await db.asUser(alice, (client) =>
      client.query("select public.confirm_swap($1, $2)", [requestId, alice]),
    );

    expect((await getShift(aliceShift)).assigned_to).toBe(bob);
    expect((await getShift(bobShift)).assigned_to).toBe(alice);
  });

  it("bekräftelse av ett byte ogiltigförklarar andra öppna/väntande förfrågningar på samma pass", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const carl = await db.seedUser("Carl");
    const shiftId = await makeShift(alice);

    const winning = await makeSwapRequest({
      shiftId,
      requestedBy: alice,
      type: "ta_over",
      responderId: bob,
      status: "vantar_bekraftelse",
    });
    const otherPending = await makeSwapRequest({
      shiftId,
      requestedBy: alice,
      type: "ta_over",
      responderId: carl,
      status: "vantar_bekraftelse",
    });

    await db.asUser(alice, (client) =>
      client.query("select public.confirm_swap($1, $2)", [winning, alice]),
    );

    expect((await getRequest(otherPending)).status).toBe("avbruten");
  });

  it("nekar bekräftelse från någon annan än den som lade ut passet", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const carl = await db.seedUser("Carl");
    const shiftId = await makeShift(alice);
    const requestId = await makeSwapRequest({
      shiftId,
      requestedBy: alice,
      responderId: bob,
    });

    await expect(
      db.asUser(carl, (client) => client.query("select public.confirm_swap($1, $2)", [requestId, carl])),
    ).rejects.toThrow(/Endast den som lade ut passet/);

    expect((await getRequest(requestId)).status).toBe("vantar_bekraftelse");
  });

  it("nekar bekräftelse om ingen har erbjudit sig", async () => {
    const alice = await db.seedUser("Alice");
    const shiftId = await makeShift(alice);
    const requestId = await makeSwapRequest({
      shiftId,
      requestedBy: alice,
      responderId: null,
    });

    await expect(
      db.asUser(alice, (client) => client.query("select public.confirm_swap($1, $2)", [requestId, alice])),
    ).rejects.toThrow(/Ingen har erbjudit sig/);
  });

  it("nekar dubbel-bekräftelse av ett redan bekräftat byte", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const shiftId = await makeShift(alice);
    const requestId = await makeSwapRequest({ shiftId, requestedBy: alice, responderId: bob });

    await db.asUser(alice, (client) => client.query("select public.confirm_swap($1, $2)", [requestId, alice]));

    await expect(
      db.asUser(alice, (client) => client.query("select public.confirm_swap($1, $2)", [requestId, alice])),
    ).rejects.toThrow(/kan inte bekräftas/);
  });

  it("nekar direktbyte utan ett angivet erbjudet pass", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const shiftId = await makeShift(alice);
    const requestId = await makeSwapRequest({
      shiftId,
      requestedBy: alice,
      type: "direkt_byte",
      responderId: bob,
      offeredShiftId: null,
    });

    await expect(
      db.asUser(alice, (client) => client.query("select public.confirm_swap($1, $2)", [requestId, alice])),
    ).rejects.toThrow(/Inget erbjudet pass/);
  });

  it("försvar i djupet: bekräftar inte om passet inte längre tillhör den som lade ut bytet", async () => {
    // Insert-policyn på swap_requests hindrar normalt att den här raden ens
    // kan skapas (se rls-swap-requests.test.ts), men confirm_swap() ska
    // ändå aldrig lita blint på att den kollen redan gjorts — den kollar
    // själv att passet fortfarande är tilldelat requested_by innan den
    // flyttar det. Skriver raden direkt via service-anslutningen (förbi
    // RLS) för att isolera just den här kollen i confirm_swap() själv.
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const carl = await db.seedUser("Carl");
    const shiftId = await makeShift(bob); // passet tillhör faktiskt Bob...
    const requestId = await makeSwapRequest({
      shiftId,
      requestedBy: alice, // ...men förfrågan påstår att Alice lade ut det.
      type: "ta_over",
      responderId: carl,
      status: "vantar_bekraftelse",
    });

    await expect(
      db.asUser(alice, (client) => client.query("select public.confirm_swap($1, $2)", [requestId, alice])),
    ).rejects.toThrow(/tillhör inte längre den som lade ut bytet/);

    expect((await getShift(shiftId)).assigned_to).toBe(bob);
    expect((await getRequest(requestId)).status).toBe("vantar_bekraftelse");
  });

  it("race: två samtidiga bekräftelseförsök på samma förfrågan — bara det första vinner", async () => {
    const alice = await db.seedUser("Alice");
    const bob = await db.seedUser("Bob");
    const shiftId = await makeShift(alice);
    const requestId = await makeSwapRequest({ shiftId, requestedBy: alice, responderId: bob });

    // Client A tar `for update`-låset och håller kvar det (transaktionen är
    // öppen men inte committad) medan Client B försöker bekräfta samma
    // förfrågan samtidigt. B:s anrop ska blockera på låset, inte race:a
    // förbi det och läsa ett stale "vantar_bekraftelse"-tillstånd.
    const clientA = await db.beginAsUser(alice);
    await clientA.query("select public.confirm_swap($1, $2)", [requestId, alice]);

    const clientB = await db.beginAsUser(alice);
    const bPromise = clientB.query("select public.confirm_swap($1, $2)", [requestId, alice]);

    // Ge B:s anrop tid att faktiskt hinna fram till radlåset och blockera
    // (inte bara vänta på nätverket) innan A committar.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await clientA.query("commit");
    clientA.release();

    await expect(bPromise).rejects.toThrow(/kan inte bekräftas/);
    await clientB.query("rollback").catch(() => {});
    clientB.release();

    const request = await getRequest(requestId);
    expect(request.status).toBe("bekraftad");
    expect((await getShift(shiftId)).assigned_to).toBe(bob);
  });
});
