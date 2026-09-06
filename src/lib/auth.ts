import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import { demoProfile } from "@/lib/demo-store";

export const isDemoMode =
  process.env.NODE_ENV === "development" && process.env.DEMO_MODE === "true";

// Hämtar inloggad användares profil. Skickar till /login om ingen session finns.
export async function requireProfile(): Promise<{ profile: Profile; userId: string }> {
  if (isDemoMode) {
    return { profile: demoProfile, userId: demoProfile.id };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return { profile, userId: user.id };
}
