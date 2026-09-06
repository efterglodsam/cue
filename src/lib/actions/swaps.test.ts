import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSupabaseClient } from "./test-utils/mock-supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireProfile: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import {
  cancelSwap,
  confirmSwap,
  createSwapRequest,
  declineSwapResponse,
  respondToSwap,
} from "./swaps";

const ALICE = "alice-id";
const BOB = "bob-id";
const CARL = "carl-id";

function asUser(userId: string) {
  vi.mocked(requireProfile).mockResolvedValue({
    userId,
    profile: { id: userId, full_name: "", phone: null, is_admin: false, created_at: "" },
  });
}

function useSupabase(config: Parameters<typeof mockSupabaseClient>[0]) {
  const client = mockSupabaseClient(config);
  vi.mocked(createClient).mockResolvedValue(client as never);
  return client;
}

// These tests cover the logic layered ON TOP of the swap.ts state-machine
// guards (already unit-tested): ownership checks, duplicate-request
// prevention, and how a Supabase error is surfaced — not the guard logic
// itself.
describe("swaps Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSwapRequest", () => {
    it("nekar om passet inte tillhör den som lägger ut det", async () => {
      asUser(ALICE);
      useSupabase({
        from: {
          shifts: [{ data: { assigned_to: BOB }, error: null }],
        },
      });

      const result = await createSwapRequest("shift-1");

      expect(result).toEqual({ ok: false, error: "Du kan bara lägga ut dina egna pass för byte." });
    });

    it("nekar om det redan finns en öppen förfrågan för passet", async () => {
      asUser(ALICE);
      useSupabase({
        from: {
          shifts: [{ data: { assigned_to: ALICE }, error: null }],
          swap_requests: [{ data: { id: "existing-request" }, error: null }],
        },
      });

      const result = await createSwapRequest("shift-1");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/redan en öppen bytesförfrågan/);
    });

    it("lyckas för ett eget pass utan aktiv förfrågan", async () => {
      asUser(ALICE);
      useSupabase({
        from: {
          shifts: [{ data: { assigned_to: ALICE }, error: null }],
          swap_requests: [
            { data: null, error: null }, // duplicate check: none found
            { data: null, error: null }, // the insert itself
          ],
        },
      });

      const result = await createSwapRequest("shift-1");

      expect(result).toEqual({ ok: true });
    });

    it("kräver ett angivet pass", async () => {
      asUser(ALICE);
      const result = await createSwapRequest("");
      expect(result).toEqual({ ok: false, error: "Inget pass valt." });
    });
  });

  describe("respondToSwap", () => {
    function openRequestFrom(requestedBy: string) {
      return {
        status: "oppen",
        type: null,
        requested_by: requestedBy,
        responder_id: null,
        offered_shift_id: null,
      };
    }

    it("nekar att svara på sin egen förfrågan (via canRespond-vakten)", async () => {
      asUser(ALICE);
      useSupabase({
        from: { swap_requests: [{ data: openRequestFrom(ALICE), error: null }] },
      });

      const result = await respondToSwap("req-1", "ta_over", null);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/inte svara på sin egen förfrågan/);
    });

    it("nekar direktbyte om det erbjudna passet inte tillhör svararen", async () => {
      asUser(BOB);
      useSupabase({
        from: {
          swap_requests: [{ data: openRequestFrom(ALICE), error: null }],
          shifts: [{ data: { assigned_to: CARL }, error: null }],
        },
      });

      const result = await respondToSwap("req-1", "direkt_byte", "bobs-shift");

      expect(result).toEqual({ ok: false, error: "Du kan bara erbjuda ett eget pass." });
    });

    it("lyckas för ett giltigt 'ta över'-svar", async () => {
      asUser(BOB);
      useSupabase({
        from: {
          swap_requests: [
            { data: openRequestFrom(ALICE), error: null }, // loadRequest
            { data: null, error: null }, // the update
          ],
        },
      });

      const result = await respondToSwap("req-1", "ta_over", null);

      expect(result).toEqual({ ok: true });
    });

    it("returnerar ett fel om bytesförfrågan inte hittas", async () => {
      asUser(BOB);
      useSupabase({ from: { swap_requests: [{ data: null, error: { message: "not found" } }] } });

      const result = await respondToSwap("missing", "ta_over", null);

      expect(result).toEqual({ ok: false, error: "Bytesförfrågan hittades inte." });
    });
  });

  describe("confirmSwap", () => {
    it("hindrar bekräftelse innan RPC:t ens anropas om vakten nekar", async () => {
      asUser(CARL); // varken den som lade ut passet eller svararen
      useSupabase({
        from: {
          swap_requests: [
            {
              data: {
                status: "vantar_bekraftelse",
                requested_by: ALICE,
                responder_id: BOB,
                type: "ta_over",
                offered_shift_id: null,
              },
              error: null,
            },
          ],
        },
      });

      const result = await confirmSwap("req-1");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Endast den som lade ut passet/);
    });

    it("returnerar ett fel om SQL-funktionen confirm_swap() misslyckas", async () => {
      asUser(ALICE);
      useSupabase({
        from: {
          swap_requests: [
            {
              data: {
                status: "vantar_bekraftelse",
                requested_by: ALICE,
                responder_id: BOB,
                type: "ta_over",
                offered_shift_id: null,
              },
              error: null,
            },
          ],
        },
        rpc: [{ data: null, error: { message: "boom" } }],
      });

      const result = await confirmSwap("req-1");

      expect(result).toEqual({ ok: false, error: "Kunde inte bekräfta bytet. Försök igen." });
    });
  });

  describe("declineSwapResponse / cancelSwap", () => {
    it("declineSwapResponse nekar för någon annan än den som lade ut passet", async () => {
      asUser(CARL);
      useSupabase({
        from: {
          swap_requests: [
            {
              data: {
                status: "vantar_bekraftelse",
                requested_by: ALICE,
                responder_id: BOB,
                type: "ta_over",
                offered_shift_id: null,
              },
              error: null,
            },
          ],
        },
      });

      const result = await declineSwapResponse("req-1");
      expect(result.ok).toBe(false);
    });

    it("cancelSwap nekar för ett redan bekräftat byte", async () => {
      asUser(ALICE);
      useSupabase({
        from: {
          swap_requests: [
            {
              data: {
                status: "bekraftad",
                requested_by: ALICE,
                responder_id: BOB,
                type: "ta_over",
                offered_shift_id: null,
              },
              error: null,
            },
          ],
        },
      });

      const result = await cancelSwap("req-1");
      expect(result.ok).toBe(false);
    });

    it("cancelSwap lyckas för ett öppet byte, av den som lade ut det", async () => {
      asUser(ALICE);
      useSupabase({
        from: {
          swap_requests: [
            {
              data: {
                status: "oppen",
                requested_by: ALICE,
                responder_id: null,
                type: null,
                offered_shift_id: null,
              },
              error: null,
            },
            { data: null, error: null }, // update
          ],
        },
      });

      const result = await cancelSwap("req-1");
      expect(result).toEqual({ ok: true });
    });
  });
});
