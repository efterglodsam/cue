"use client";

import { useMemo, useState, useTransition } from "react";
import { useRealtimeList } from "@/lib/hooks/useRealtimeList";
import { formatDate, sv } from "@/lib/date-utils";
import {
  confirmPlacement,
  createPlacementItem,
  deletePlacementItem,
  updatePlacementItem,
} from "@/lib/actions/placement";
import ConfirmButton from "@/components/ConfirmButton";
import type { PlacementConfirmation, PlacementItem, Profile } from "@/lib/supabase/types";

export default function PlacementChecklist({
  clientId,
  initialItems,
  initialConfirmations,
  profiles,
}: {
  clientId: string;
  initialItems: PlacementItem[];
  initialConfirmations: PlacementConfirmation[];
  profiles: Profile[];
}) {
  const items = useRealtimeList<PlacementItem>("placement_items", initialItems);
  const confirmations = useRealtimeList<PlacementConfirmation>(
    "placement_confirmations",
    initialConfirmations,
  );
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const lastConfirmationByItem = useMemo(() => {
    const map = new Map<string, PlacementConfirmation>();
    for (const c of confirmations) {
      const current = map.get(c.item_id);
      if (!current || c.confirmed_at > current.confirmed_at) map.set(c.item_id, c);
    }
    return map;
  }, [confirmations]);

  return (
    <div className="space-y-3">
      <NewItemForm clientId={clientId} />
      {items.length === 0 && (
        <p className="text-sm text-slate-400">
          Inga föremål tillagda än. Lägg till nycklar, medicinlista, hjälpmedel m.m.
        </p>
      )}
      {items.map((item) => (
        <PlacementItemCard
          key={item.id}
          item={item}
          clientId={clientId}
          lastConfirmation={lastConfirmationByItem.get(item.id)}
          confirmedByName={
            lastConfirmationByItem.get(item.id)
              ? profileById.get(lastConfirmationByItem.get(item.id)!.confirmed_by)?.full_name
              : undefined
          }
        />
      ))}
    </div>
  );
}

function NewItemForm({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        + Lägg till föremål
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await createPlacementItem(clientId, formData);
          if (!result.ok) setError(result.error);
          else setOpen(false);
        });
      }}
      className="rounded-xl border border-slate-200 bg-white p-3"
    >
      <input
        name="name"
        required
        placeholder="Vad? (t.ex. reservnycklar)"
        className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
      />
      <textarea
        name="location_description"
        required
        rows={2}
        placeholder="Var ska det ligga? (t.ex. överst i hallskåpet)"
        className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
      />
      <input type="file" name="photo" accept="image/*" className="mt-2 text-xs" />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500"
        >
          Avbryt
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          {isPending ? "Sparar…" : "Spara"}
        </button>
      </div>
    </form>
  );
}

function PlacementItemCard({
  item,
  clientId,
  lastConfirmation,
  confirmedByName,
}: {
  item: PlacementItem;
  clientId: string;
  lastConfirmation?: PlacementConfirmation;
  confirmedByName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await updatePlacementItem(item.id, clientId, formData);
            if (!result.ok) setError(result.error);
            else setEditing(false);
          });
        }}
        className="rounded-xl border border-blue-200 bg-blue-50/40 p-3"
      >
        <input
          name="name"
          defaultValue={item.name}
          required
          className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
        />
        <textarea
          name="location_description"
          defaultValue={item.location_description}
          required
          rows={2}
          className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
        />
        <input type="file" name="photo" accept="image/*" className="mt-2 text-xs" />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500"
          >
            Avbryt
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Spara
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex gap-3">
        {item.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photo_url}
            alt={item.name}
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800">{item.name}</p>
          <p className="text-sm text-slate-600">{item.location_description}</p>
          <p className="mt-1 text-xs text-slate-400">
            {lastConfirmation
              ? `Senast bekräftad av ${confirmedByName ?? "okänd"} · ${formatDate(
                  new Date(lastConfirmation.confirmed_at),
                  "d MMM HH:mm",
                  { locale: sv },
                )}`
              : "Ännu inte bekräftad av någon"}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await confirmPlacement(item.id, clientId);
            })
          }
          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          ✓ Jag har lagt tillbaka detta
        </button>
        <button onClick={() => setEditing(true)} className="text-xs font-medium text-blue-600">
          Redigera
        </button>
        <ConfirmButton
          onConfirm={() => deletePlacementItem(item.id, clientId)}
          label="Ta bort"
          className="text-xs font-medium text-red-600"
          confirmText="Ta bort föremålet från listan?"
        />
      </div>
    </div>
  );
}
