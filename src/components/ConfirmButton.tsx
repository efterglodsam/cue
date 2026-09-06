"use client";

import { useState, useTransition } from "react";

export default function ConfirmButton({
  onConfirm,
  label,
  confirmText = "Är du säker? Detta går inte att ångra.",
  className,
  pendingLabel = "Tar bort…",
}: {
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
  label: React.ReactNode;
  confirmText?: string;
  className?: string;
  pendingLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-300">{confirmText}</span>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await onConfirm();
              if (!result.ok) {
                setError(result.error ?? "Något gick fel.");
                setConfirming(false);
              }
            })
          }
          className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {isPending ? pendingLabel : "Ja, ta bort"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md px-2.5 py-1 font-medium text-slate-400 hover:bg-slate-800"
        >
          Avbryt
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={() => setConfirming(true)} className={className}>
        {label}
      </button>
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
