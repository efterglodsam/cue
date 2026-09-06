import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import ScheduleView from "@/components/schedule/ScheduleView";

export default async function SchemaPage() {
  const { userId } = await requireProfile();
  const supabase = await createClient();

  const [{ data: shifts }, { data: profiles }, { data: clients }] = await Promise.all([
    supabase.from("shifts").select("*").order("start_time", { ascending: true }),
    supabase.from("profiles").select("*").order("full_name", { ascending: true }),
    supabase.from("clients").select("*").order("name", { ascending: true }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Schema</h1>
      </div>
      <ScheduleView
        initialShifts={shifts ?? []}
        profiles={profiles ?? []}
        clients={clients ?? []}
        currentUserId={userId}
      />
    </div>
  );
}
