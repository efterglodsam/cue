import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import SwapView from "@/components/swaps/SwapView";

export default async function BytenPage({
  searchParams,
}: {
  searchParams: Promise<{ lagg_ut?: string }>;
}) {
  const { userId } = await requireProfile();
  const supabase = await createClient();
  const { lagg_ut: laggUt } = await searchParams;

  const now = new Date().toISOString();

  const [{ data: swapRequests }, { data: myShifts }, { data: profiles }, { data: clients }] =
    await Promise.all([
      supabase
        .from("swap_requests")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("shifts")
        .select("*")
        .eq("assigned_to", userId)
        .gte("start_time", now)
        .order("start_time", { ascending: true }),
      supabase.from("profiles").select("*"),
      supabase.from("clients").select("*"),
    ]);

  // Alla pass som förekommer i förfrågningarna, så vi kan visa tid/brukare
  const shiftIds = new Set<string>();
  for (const req of swapRequests ?? []) {
    shiftIds.add(req.shift_id);
    if (req.offered_shift_id) shiftIds.add(req.offered_shift_id);
  }
  for (const s of myShifts ?? []) shiftIds.add(s.id);

  const { data: referencedShifts } = await supabase
    .from("shifts")
    .select("*")
    .in("id", Array.from(shiftIds));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-100">Passbyten</h1>
      <SwapView
        initialSwapRequests={swapRequests ?? []}
        allShifts={referencedShifts ?? []}
        myUpcomingShifts={myShifts ?? []}
        profiles={profiles ?? []}
        clients={clients ?? []}
        currentUserId={userId}
        preselectShiftId={laggUt ?? null}
      />
    </div>
  );
}
