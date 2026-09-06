import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireProfile: vi.fn().mockResolvedValue({
    userId: "demo-user",
    profile: { id: "demo-user", full_name: "Demo", phone: null, is_admin: true, created_at: "" },
  }),
  isDemoMode: true,
}));

import { demoStore } from "@/lib/demo-store";
import {
  confirmPlacement,
  createPlacementItem,
  deletePlacementItem,
  updatePlacementItem,
} from "./placement";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

// I demo-mode (DEMO_MODE=true, ingen riktig Supabase) går placement.ts en
// helt annan kodväg mot en global in-memory-store (demoStore) istället för
// Supabase. Samma affärsregler ska gälla där som i den riktiga grenen.
describe("placement Server Actions — demo mode", () => {
  beforeEach(() => {
    demoStore.clients = [];
    demoStore.items = [];
    demoStore.confirmations = [];
  });

  it("kräver namn och platsbeskrivning", async () => {
    const missingName = await createPlacementItem("client-1", formData({ location_description: "Hallen" }));
    expect(missingName).toEqual({ ok: false, error: "Ange vad föremålet heter." });

    const missingLocation = await createPlacementItem("client-1", formData({ name: "Nycklar" }));
    expect(missingLocation).toEqual({ ok: false, error: "Beskriv var föremålet ska ligga." });
  });

  it("lägger till, uppdaterar, bekräftar och tar bort ett föremål i demoStore", async () => {
    const created = await createPlacementItem(
      "client-1",
      formData({ name: "Reservnycklar", location_description: "Överst i hallskåpet" }),
    );
    expect(created).toEqual({ ok: true });
    expect(demoStore.items).toHaveLength(1);
    const item = demoStore.items[0];
    expect(item.client_id).toBe("client-1");

    const updated = await updatePlacementItem(
      item.id,
      "client-1",
      formData({ name: "Reservnycklar (2 st)", location_description: "Nyckelskåpet" }),
    );
    expect(updated).toEqual({ ok: true });
    expect(demoStore.items[0].location_description).toBe("Nyckelskåpet");

    const confirmed = await confirmPlacement(item.id, "client-1");
    expect(confirmed).toEqual({ ok: true });
    expect(demoStore.confirmations).toHaveLength(1);
    expect(demoStore.confirmations[0].item_id).toBe(item.id);

    const deleted = await deletePlacementItem(item.id, "client-1");
    expect(deleted).toEqual({ ok: true });
    expect(demoStore.items).toHaveLength(0);
    // Bekräftelser för det borttagna föremålet städas bort med
    expect(demoStore.confirmations).toHaveLength(0);
  });

  it("updatePlacementItem på ett okänt id ger ett tydligt fel", async () => {
    const result = await updatePlacementItem(
      "does-not-exist",
      "client-1",
      formData({ name: "X", location_description: "Y" }),
    );
    expect(result).toEqual({ ok: false, error: "Föremålet hittades inte." });
  });
});
