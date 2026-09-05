"use client";

import { useState, useTransition } from "react";
import { inviteColleague, removeColleague, setAdminStatus } from "@/lib/actions/team";
import ConfirmButton from "@/components/ConfirmButton";
import type { Profile } from "@/lib/supabase/types";

export default function TeamAdmin({
  profiles,
  currentUserId,
}: {
  profiles: Profile[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      <InviteForm />
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Teammedlemmar
        </h2>
        <div className="space-y-2">
          {profiles.map((p) => (
            <MemberRow key={p.id} profile={p} isSelf={p.id === currentUserId} />
          ))}
        </div>
      </div>
    </div>
  );
}

function InviteForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setSuccess(false);
          const result = await inviteColleague(formData);
          if (!result.ok) setError(result.error);
          else {
            setError(null);
            setSuccess(true);
            (document.getElementById("invite-form") as HTMLFormElement)?.reset();
          }
        })
      }
      id="invite-form"
      className="rounded-xl border border-slate-200 bg-white p-3"
    >
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Bjud in kollega
      </h2>
      <input
        name="full_name"
        placeholder="Namn (valfritt)"
        className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
      />
      <input
        name="email"
        type="email"
        required
        placeholder="E-postadress"
        className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {success && <p className="mt-1 text-xs text-emerald-600">Inbjudan skickad!</p>}
      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isPending ? "Skickar…" : "Skicka inbjudan"}
      </button>
    </form>
  );
}

function MemberRow({ profile, isSelf }: { profile: Profile; isSelf: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div>
        <p className="text-sm font-medium text-slate-800">
          {profile.full_name} {isSelf && <span className="text-slate-400">(du)</span>}
        </p>
        <p className="text-xs text-slate-400">{profile.is_admin ? "Admin" : "Medlem"}</p>
      </div>
      {!isSelf && (
        <div className="flex items-center gap-2">
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await setAdminStatus(profile.id, !profile.is_admin);
                if (!result.ok) setError(result.error);
              })
            }
            className="text-xs font-medium text-blue-600"
          >
            {profile.is_admin ? "Gör till medlem" : "Gör till admin"}
          </button>
          <ConfirmButton
            onConfirm={() => removeColleague(profile.id)}
            label="Ta bort"
            className="text-xs font-medium text-red-600"
            confirmText={`Ta bort ${profile.full_name} från teamet?`}
          />
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
