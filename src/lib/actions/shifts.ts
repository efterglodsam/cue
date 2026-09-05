"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ShiftStatus } from "@/lib/supabase/types";
import { parseShiftInput } from "@/lib/validation/shift";

export type ActionResult = { ok: true } | { ok: false; error: string };

function readShiftForm(formData: FormData) {
  return parseShiftInput({
    start_time: String(formData.get("start_time") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    assigned_to: String(formData.get("assigned_to") ?? ""),
    client_id: String(formData.get("client_id") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
}

export async function createShift(formData: FormData): Promise<ActionResult> {
  const { userId } = await requireProfile();
  const parsed = readShiftForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("shifts").insert({
    ...parsed.data,
    created_by: userId,
  });

  if (error) {
    return { ok: false, error: "Kunde inte skapa passet. Försök igen." };
  }

  revalidatePath("/schema");
  return { ok: true };
}

export async function updateShift(shiftId: string, formData: FormData): Promise<ActionResult> {
  await requireProfile();
  const parsed = readShiftForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("shifts").update(parsed.data).eq("id", shiftId);

  if (error) {
    return { ok: false, error: "Kunde inte spara ändringarna. Försök igen." };
  }

  revalidatePath("/schema");
  return { ok: true };
}

export async function updateShiftStatus(
  shiftId: string,
  status: ShiftStatus,
): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").update({ status }).eq("id", shiftId);

  if (error) {
    return { ok: false, error: "Kunde inte uppdatera status." };
  }

  revalidatePath("/schema");
  return { ok: true };
}

export async function deleteShift(shiftId: string): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", shiftId);

  if (error) {
    return { ok: false, error: "Kunde inte ta bort passet. Försök igen." };
  }

  revalidatePath("/schema");
  return { ok: true };
}
