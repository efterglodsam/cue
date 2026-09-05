"use client";

import { useState, useTransition } from "react";
import { createClientRecord } from "@/lib/actions/clients";

export default function NewClientForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        + Lägg till brukare
      </button>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await createClientRecord(formData);
          if (!result.ok) setError(result.error);
          else setOpen(false);
        })
      }
      className="rounded-xl border border-slate-200 bg-white p-3"
    >
      <input
        name="name"
        required
        placeholder="Namn/alias (t.ex. Karin H.)"
        className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
      />
      <input
        name="address"
        placeholder="Adress (valfritt)"
        className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
      />
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
