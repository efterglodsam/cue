"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ActionResult } from "./shifts";
import { isDemoMode } from "@/lib/auth";
import { demoStore } from "@/lib/demo-store";

export async function createClientRecord(formData: FormData): Promise<ActionResult> {
  const { userId } = await requireProfile();
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;

  if (!name) return { ok: false, error: "Ange ett namn eller alias för brukaren." };

  if (isDemoMode) {
    demoStore.clients.push({
      id: crypto.randomUUID(),
      name,
      address,
      created_by: userId,
      created_at: new Date().toISOString(),
    });
    revalidatePath("/brukare");
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clients").insert({ name, address, created_by: userId });

  if (error) return { ok: false, error: "Kunde inte skapa brukaren." };

  revalidatePath("/brukare");
  revalidatePath("/schema");
  return { ok: true };
}

export async function deleteClientRecord(clientId: string): Promise<ActionResult> {
  await requireProfile();
  if (isDemoMode) {
    demoStore.clients = demoStore.clients.filter((client) => client.id !== clientId);
    demoStore.items = demoStore.items.filter((item) => item.client_id !== clientId);
    revalidatePath("/brukare");
    return { ok: true };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", clientId);

  if (error) return { ok: false, error: "Kunde inte ta bort brukaren." };

  revalidatePath("/brukare");
  revalidatePath("/schema");
  return { ok: true };
}
