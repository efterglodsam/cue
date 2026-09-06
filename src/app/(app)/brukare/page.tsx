import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import NewClientForm from "@/components/clients/NewClientForm";
import { isDemoMode } from "@/lib/auth";
import { demoStore } from "@/lib/demo-store";

export default async function BrukarePage() {
  await requireProfile();
  const supabase = await createClient();
  const { data: clients } = isDemoMode
    ? { data: [...demoStore.clients].sort((a, b) => a.name.localeCompare(b.name)) }
    : await supabase.from("clients").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Brukare</h1>
      <NewClientForm />
      <div className="mt-4 space-y-2">
        {(clients ?? []).length === 0 && (
          <p className="text-sm text-slate-400">Inga brukare tillagda än.</p>
        )}
        {(clients ?? []).map((client) => (
          <Link
            key={client.id}
            href={`/brukare/${client.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/40"
          >
            <p className="font-medium text-slate-800">{client.name}</p>
            {client.address && <p className="text-sm text-slate-500">{client.address}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
