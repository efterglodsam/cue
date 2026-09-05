"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createShift, updateShift, deleteShift } from "@/lib/actions/shifts";
import { formatDateTimeInput } from "@/lib/date-utils";
import type { Client, Profile, Shift } from "@/lib/supabase/types";

export default function ShiftDialog({
  open,
  onClose,
  shift,
  defaultDate,
  profiles,
  clients,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  shift?: Shift | null;
  defaultDate?: Date | null;
  profiles: Profile[];
  clients: Client[];
  currentUserId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const start = shift
    ? new Date(shift.start_time)
    : defaultDate
      ? new Date(defaultDate.setHours(8, 0, 0, 0))
      : new Date();
  const end = shift ? new Date(shift.end_time) : new Date(start.getTime() + 24 * 60 * 60 * 1000);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = shift
        ? await updateShift(shift.id, formData)
        : await createShift(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {shift ? "Redigera pass" : "Nytt pass"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Stäng">
            ✕
          </button>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Start</label>
              <input
                type="datetime-local"
                name="start_time"
                required
                defaultValue={formatDateTimeInput(start)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Slut</label>
              <input
                type="datetime-local"
                name="end_time"
                required
                defaultValue={formatDateTimeInput(end)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Vem jobbar?</label>
            <select
              name="assigned_to"
              required
              defaultValue={shift?.assigned_to ?? currentUserId}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Brukare/plats (valfritt)</label>
            <select
              name="client_id"
              defaultValue={shift?.client_id ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Ingen vald</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Anteckning (valfritt)</label>
            <textarea
              name="notes"
              defaultValue={shift?.notes ?? ""}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {shift && shift.assigned_to === currentUserId && (
            <Link
              href={`/byten?lagg_ut=${shift.id}`}
              className="block w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              🔁 Lägg ut för byte
            </Link>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {shift ? (
              <DeleteShiftButton shiftId={shift.id} onDeleted={onClose} />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isPending ? "Sparar…" : "Spara"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteShiftButton({ shiftId, onDeleted }: { shiftId: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (confirming) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Ta bort passet?</span>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteShift(shiftId);
                if (result.ok) onDeleted();
                else setError(result.error);
              })
            }
            className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            {isPending ? "Tar bort…" : "Ja, ta bort"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs font-medium text-slate-500"
          >
            Avbryt
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
    >
      Ta bort
    </button>
  );
}
