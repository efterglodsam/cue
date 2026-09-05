"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { ActionResult } from "./shifts";

export async function inviteColleague(formData: FormData): Promise<ActionResult> {
  const { profile } = await requireProfile();
  if (!profile.is_admin) {
    return { ok: false, error: "Endast admin kan bjuda in nya kollegor." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email) return { ok: false, error: "Ange en e-postadress." };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      error: "Inbjudningar kräver att SUPABASE_SERVICE_ROLE_KEY är konfigurerad på servern.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName || undefined },
  });

  if (error) {
    return { ok: false, error: "Kunde inte skicka inbjudan. Kontrollera e-postadressen." };
  }

  revalidatePath("/installningar");
  return { ok: true };
}

export async function removeColleague(userIdToRemove: string): Promise<ActionResult> {
  const { profile, userId } = await requireProfile();
  if (!profile.is_admin) {
    return { ok: false, error: "Endast admin kan ta bort kollegor." };
  }
  if (userIdToRemove === userId) {
    return { ok: false, error: "Du kan inte ta bort dig själv." };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      error: "Detta kräver att SUPABASE_SERVICE_ROLE_KEY är konfigurerad på servern.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userIdToRemove);

  if (error) return { ok: false, error: "Kunde inte ta bort kollegan." };

  revalidatePath("/installningar");
  return { ok: true };
}

export async function setAdminStatus(userIdToChange: string, isAdmin: boolean): Promise<ActionResult> {
  const { profile } = await requireProfile();
  if (!profile.is_admin) {
    return { ok: false, error: "Endast admin kan ändra admin-status." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_admin: isAdmin })
    .eq("id", userIdToChange);

  if (error) return { ok: false, error: "Kunde inte uppdatera admin-status." };

  revalidatePath("/installningar");
  return { ok: true };
}
