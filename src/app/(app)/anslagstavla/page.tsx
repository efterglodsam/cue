import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import NoteBoard from "@/components/notes/NoteBoard";

export default async function AnslagstavlaPage() {
  const { userId } = await requireProfile();
  const supabase = await createClient();

  const [{ data: notes }, { data: profiles }] = await Promise.all([
    supabase.from("notes").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-100">Anslagstavla</h1>
      <NoteBoard initialNotes={notes ?? []} profiles={profiles ?? []} currentUserId={userId} />
    </div>
  );
}
