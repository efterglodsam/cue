"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ActionResult } from "./shifts";

export async function createNote(formData: FormData): Promise<ActionResult> {
  const { userId } = await requireProfile();
  const title = String(formData.get("title") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const pinned = formData.get("pinned") === "on";

  if (!body) return { ok: false, error: "Skriv något innan du postar anteckningen." };

  const supabase = await createClient();
  const { error } = await supabase.from("notes").insert({
    title,
    body,
    category,
    pinned,
    author_id: userId,
  });

  if (error) return { ok: false, error: "Kunde inte spara anteckningen. Försök igen." };

  revalidatePath("/anslagstavla");
  return { ok: true };
}

export async function updateNote(noteId: string, formData: FormData): Promise<ActionResult> {
  await requireProfile();
  const title = String(formData.get("title") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;

  if (!body) return { ok: false, error: "Anteckningen kan inte vara tom." };

  const supabase = await createClient();
  const { error } = await supabase.from("notes").update({ title, body, category }).eq("id", noteId);

  if (error) return { ok: false, error: "Kunde inte spara ändringarna." };

  revalidatePath("/anslagstavla");
  return { ok: true };
}

export async function togglePinNote(noteId: string, pinned: boolean): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("notes").update({ pinned }).eq("id", noteId);

  if (error) return { ok: false, error: "Kunde inte uppdatera anteckningen." };

  revalidatePath("/anslagstavla");
  return { ok: true };
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("id", noteId);

  if (error) return { ok: false, error: "Kunde inte ta bort anteckningen." };

  revalidatePath("/anslagstavla");
  return { ok: true };
}
