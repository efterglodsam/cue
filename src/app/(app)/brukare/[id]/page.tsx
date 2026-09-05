import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import PlacementChecklist from "@/components/placement/PlacementChecklist";

export default async function BrukareDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).single();
  if (!client) notFound();

  const [{ data: items }, { data: confirmations }, { data: profiles }] = await Promise.all([
    supabase
      .from("placement_items")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("placement_confirmations")
      .select("*")
      .order("confirmed_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);

  const itemIds = new Set((items ?? []).map((i) => i.id));
  const relevantConfirmations = (confirmations ?? []).filter((c) => itemIds.has(c.item_id));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/brukare" className="text-sm font-medium text-blue-600">
        ← Alla brukare
      </Link>
      <h1 className="mt-1 mb-1 text-2xl font-bold text-slate-900">{client.name}</h1>
      {client.address && <p className="mb-4 text-sm text-slate-500">{client.address}</p>}

      <PlacementChecklist
        clientId={client.id}
        initialItems={items ?? []}
        initialConfirmations={relevantConfirmations}
        profiles={profiles ?? []}
      />
    </div>
  );
}
