import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import TeamAdmin from "@/components/team/TeamAdmin";

export default async function InstallningarPage() {
  const { profile } = await requireProfile();
  if (!profile.is_admin) redirect("/schema");

  const supabase = await createClient();
  const { data: profiles } = await supabase.from("profiles").select("*").order("full_name");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Inställningar</h1>
      <TeamAdmin profiles={profiles ?? []} currentUserId={profile.id} />
    </div>
  );
}
