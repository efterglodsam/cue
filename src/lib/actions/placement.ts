"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ActionResult } from "./shifts";
import { isDemoMode } from "@/lib/auth";
import { demoStore } from "@/lib/demo-store";

async function uploadPhotoIfPresent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  photo: FormDataEntryValue | null,
): Promise<string | null> {
  if (!(photo instanceof File) || photo.size === 0) return null;

  const ext = photo.name.split(".").pop() ?? "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("placement-photos").upload(path, photo, {
    contentType: photo.type,
    upsert: false,
  });
  if (error) return null;

  const { data } = supabase.storage.from("placement-photos").getPublicUrl(path);
  return data.publicUrl;
}

export async function createPlacementItem(
  clientId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireProfile();
  const name = String(formData.get("name") ?? "").trim();
  const locationDescription = String(formData.get("location_description") ?? "").trim();

  if (!name) return { ok: false, error: "Ange vad föremålet heter." };
  if (!locationDescription) return { ok: false, error: "Beskriv var föremålet ska ligga." };

  if (isDemoMode) {
    demoStore.items.push({
      id: crypto.randomUUID(),
      client_id: clientId,
      name,
      location_description: locationDescription,
      photo_url: null,
      created_by: userId,
      updated_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    revalidatePath(`/brukare/${clientId}`);
    return { ok: true };
  }

  const supabase = await createClient();
  const photoUrl = await uploadPhotoIfPresent(supabase, formData.get("photo"));

  const { data: item, error } = await supabase
    .from("placement_items")
    .insert({
      client_id: clientId,
      name,
      location_description: locationDescription,
      photo_url: photoUrl,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();

  if (error || !item) return { ok: false, error: "Kunde inte lägga till föremålet." };

  await supabase.from("placement_item_history").insert({
    item_id: item.id,
    changed_by: userId,
    change_type: "skapad",
    new_value: { name, location_description: locationDescription },
  });

  revalidatePath(`/brukare/${clientId}`);
  return { ok: true };
}

export async function updatePlacementItem(
  itemId: string,
  clientId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireProfile();
  const name = String(formData.get("name") ?? "").trim();
  const locationDescription = String(formData.get("location_description") ?? "").trim();

  if (!name) return { ok: false, error: "Ange vad föremålet heter." };
  if (!locationDescription) return { ok: false, error: "Beskriv var föremålet ska ligga." };

  if (isDemoMode) {
    const item = demoStore.items.find((candidate) => candidate.id === itemId);
    if (!item) return { ok: false, error: "Föremålet hittades inte." };
    item.name = name;
    item.location_description = locationDescription;
    item.updated_by = userId;
    item.updated_at = new Date().toISOString();
    revalidatePath(`/brukare/${clientId}`);
    return { ok: true };
  }

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("placement_items")
    .select("name, location_description")
    .eq("id", itemId)
    .single();

  const photoUrl = await uploadPhotoIfPresent(supabase, formData.get("photo"));

  const { error } = await supabase
    .from("placement_items")
    .update({
      name,
      location_description: locationDescription,
      updated_by: userId,
      ...(photoUrl ? { photo_url: photoUrl } : {}),
    })
    .eq("id", itemId);

  if (error) return { ok: false, error: "Kunde inte spara ändringarna." };

  await supabase.from("placement_item_history").insert({
    item_id: itemId,
    changed_by: userId,
    change_type: "andrad",
    old_value: before ?? null,
    new_value: { name, location_description: locationDescription },
  });

  revalidatePath(`/brukare/${clientId}`);
  return { ok: true };
}

export async function deletePlacementItem(itemId: string, clientId: string): Promise<ActionResult> {
  const { userId } = await requireProfile();
  if (isDemoMode) {
    demoStore.items = demoStore.items.filter((item) => item.id !== itemId);
    demoStore.confirmations = demoStore.confirmations.filter(
      (confirmation) => confirmation.item_id !== itemId,
    );
    revalidatePath(`/brukare/${clientId}`);
    return { ok: true };
  }
  const supabase = await createClient();

  await supabase.from("placement_item_history").insert({
    item_id: itemId,
    changed_by: userId,
    change_type: "borttagen",
  });

  const { error } = await supabase.from("placement_items").delete().eq("id", itemId);
  if (error) return { ok: false, error: "Kunde inte ta bort föremålet." };

  revalidatePath(`/brukare/${clientId}`);
  return { ok: true };
}

export async function confirmPlacement(itemId: string, clientId: string): Promise<ActionResult> {
  const { userId } = await requireProfile();
  if (isDemoMode) {
    demoStore.confirmations.push({
      id: crypto.randomUUID(),
      item_id: itemId,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    });
    revalidatePath(`/brukare/${clientId}`);
    return { ok: true };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("placement_confirmations")
    .insert({ item_id: itemId, confirmed_by: userId });

  if (error) return { ok: false, error: "Kunde inte registrera bekräftelsen." };

  revalidatePath(`/brukare/${clientId}`);
  return { ok: true };
}
