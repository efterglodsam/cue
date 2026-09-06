import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSupabaseClient } from "./test-utils/mock-supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireProfile: vi.fn().mockResolvedValue({
    userId: "user-1",
    profile: { id: "user-1", full_name: "", phone: null, is_admin: false, created_at: "" },
  }),
  isDemoMode: false,
}));

import { createClient } from "@/lib/supabase/server";
import { createPlacementItem, deletePlacementItem } from "./placement";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function useSupabase(config: Parameters<typeof mockSupabaseClient>[0]) {
  const client = mockSupabaseClient(config);
  vi.mocked(createClient).mockResolvedValue(client as never);
  return client;
}

describe("placement Server Actions — Supabase (icke-demo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skapar föremålet och en historikrad av typen 'skapad'", async () => {
    const client = useSupabase({
      from: {
        placement_items: [{ data: { id: "item-1" }, error: null }],
        placement_item_history: [{ data: null, error: null }],
      },
    });

    const result = await createPlacementItem(
      "client-1",
      formData({ name: "Nycklar", location_description: "Hallen" }),
    );

    expect(result).toEqual({ ok: true });
    expect(client.from).toHaveBeenCalledWith("placement_items");
    expect(client.from).toHaveBeenCalledWith("placement_item_history");
  });

  it("felmeddelande om insert i placement_items misslyckas", async () => {
    useSupabase({
      from: { placement_items: [{ data: null, error: { message: "db error" } }] },
    });

    const result = await createPlacementItem(
      "client-1",
      formData({ name: "Nycklar", location_description: "Hallen" }),
    );

    expect(result).toEqual({ ok: false, error: "Kunde inte lägga till föremålet." });
  });

  it("loggar en 'borttagen'-historikrad innan raden faktiskt tas bort", async () => {
    const client = useSupabase({
      from: {
        placement_item_history: [{ data: null, error: null }],
        placement_items: [{ data: null, error: null }],
      },
    });

    const result = await deletePlacementItem("item-1", "client-1");

    expect(result).toEqual({ ok: true });
    expect(client.from).toHaveBeenCalledWith("placement_item_history");
    expect(client.from).toHaveBeenCalledWith("placement_items");
  });
});
