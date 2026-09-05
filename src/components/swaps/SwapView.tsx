"use client";

import { useMemo, useState, useTransition } from "react";
import { useRealtimeList } from "@/lib/hooks/useRealtimeList";
import { formatDate, formatTime, sv } from "@/lib/date-utils";
import {
  cancelSwap,
  confirmSwap,
  createSwapRequest,
  declineSwapResponse,
  respondToSwap,
} from "@/lib/actions/swaps";
import type { Client, Profile, Shift, SwapRequest, SwapType } from "@/lib/supabase/types";

function shiftLabel(shift: Shift | undefined, clientById: Map<string, Client>) {
  if (!shift) return "Okänt pass";
  const client = shift.client_id ? clientById.get(shift.client_id) : undefined;
  return `${formatDate(new Date(shift.start_time), "EEE d MMM", { locale: sv })} ${formatTime(
    new Date(shift.start_time),
  )}–${formatTime(new Date(shift.end_time))}${client ? ` · ${client.name}` : ""}`;
}

export default function SwapView({
  initialSwapRequests,
  allShifts,
  myUpcomingShifts,
  profiles,
  clients,
  currentUserId,
  preselectShiftId,
}: {
  initialSwapRequests: SwapRequest[];
  allShifts: Shift[];
  myUpcomingShifts: Shift[];
  profiles: Profile[];
  clients: Client[];
  currentUserId: string;
  preselectShiftId: string | null;
}) {
  const swapRequests = useRealtimeList<SwapRequest>("swap_requests", initialSwapRequests);
  const shifts = useRealtimeList<Shift>("shifts", allShifts);

  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const activeShiftIds = new Set(
    swapRequests.filter((r) => r.status === "oppen" || r.status === "vantar_bekraftelse").map((r) => r.shift_id),
  );
  const availableToOffer = myUpcomingShifts.filter((s) => !activeShiftIds.has(s.id));

  const openFromOthers = swapRequests.filter(
    (r) => r.status === "oppen" && r.requested_by !== currentUserId,
  );
  const mine = swapRequests.filter((r) => r.requested_by === currentUserId && r.status !== "avbruten");
  const history = swapRequests.filter((r) => r.status === "bekraftad" || r.status === "avbojd");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Lägg ut ett eget pass
        </h2>
        {availableToOffer.length === 0 ? (
          <p className="text-sm text-slate-400">Du har inga kommande pass utan pågående byte.</p>
        ) : (
          <div className="space-y-2">
            {availableToOffer.map((shift) => (
              <PutUpShiftRow
                key={shift.id}
                shift={shift}
                clientById={clientById}
                autoOpen={shift.id === preselectShiftId}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Öppna bytesförfrågningar
        </h2>
        {openFromOthers.length === 0 ? (
          <p className="text-sm text-slate-400">Inga öppna förfrågningar just nu.</p>
        ) : (
          <div className="space-y-3">
            {openFromOthers.map((req) => (
              <OpenRequestCard
                key={req.id}
                request={req}
                shift={shiftById.get(req.shift_id)}
                requester={profileById.get(req.requested_by)}
                clientById={clientById}
                myShifts={availableToOffer}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Mina förfrågningar
        </h2>
        {mine.length === 0 ? (
          <p className="text-sm text-slate-400">Du har inga aktiva bytesförfrågningar.</p>
        ) : (
          <div className="space-y-3">
            {mine
              .filter((r) => r.status === "oppen" || r.status === "vantar_bekraftelse")
              .map((req) => (
                <MyRequestCard
                  key={req.id}
                  request={req}
                  shift={shiftById.get(req.shift_id)}
                  offeredShift={req.offered_shift_id ? shiftById.get(req.offered_shift_id) : undefined}
                  responder={req.responder_id ? profileById.get(req.responder_id) : undefined}
                  clientById={clientById}
                />
              ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Historik</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">Inga tidigare byten än.</p>
        ) : (
          <div className="space-y-2">
            {history.map((req) => (
              <div key={req.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <p className="text-slate-700">
                  {shiftLabel(shiftById.get(req.shift_id), clientById)}
                </p>
                <p className="text-xs text-slate-400">
                  {req.status === "bekraftad"
                    ? `${profileById.get(req.requested_by)?.full_name ?? "?"} bytte med ${
                        profileById.get(req.responder_id ?? "")?.full_name ?? "?"
                      }${req.confirmed_at ? ` · ${formatDate(new Date(req.confirmed_at), "d MMM HH:mm", { locale: sv })}` : ""}`
                    : "Svar avböjt"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PutUpShiftRow({
  shift,
  clientById,
  autoOpen,
}: {
  shift: Shift;
  clientById: Map<string, Client>;
  autoOpen: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${autoOpen ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-700">{shiftLabel(shift, clientById)}</p>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Lägg ut för byte
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 flex items-center gap-2">
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await createSwapRequest(shift.id);
                if (!result.ok) setError(result.error);
                else setOpen(false);
              })
            }
            className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isPending ? "Lägger ut…" : "Bekräfta: lägg ut passet"}
          </button>
          <button onClick={() => setOpen(false)} className="text-xs font-medium text-slate-500">
            Avbryt
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

function OpenRequestCard({
  request,
  shift,
  requester,
  clientById,
  myShifts,
}: {
  request: SwapRequest;
  shift: Shift | undefined;
  requester: Profile | undefined;
  clientById: Map<string, Client>;
  myShifts: Shift[];
}) {
  const [mode, setMode] = useState<"none" | "byte">("none");
  const [selectedShift, setSelectedShift] = useState<string>(myShifts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function respond(type: SwapType, offeredShiftId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await respondToSwap(request.id, type, offeredShiftId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-800">{shiftLabel(shift, clientById)}</p>
      <p className="text-xs text-slate-500">Utlagt av {requester?.full_name ?? "okänd"}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          disabled={isPending}
          onClick={() => respond("ta_over", null)}
          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Ta detta pass
        </button>
        {myShifts.length > 0 && (
          <button
            disabled={isPending}
            onClick={() => setMode(mode === "byte" ? "none" : "byte")}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Erbjud direktbyte
          </button>
        )}
      </div>

      {mode === "byte" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
          >
            {myShifts.map((s) => (
              <option key={s.id} value={s.id}>
                {shiftLabel(s, clientById)}
              </option>
            ))}
          </select>
          <button
            disabled={isPending || !selectedShift}
            onClick={() => respond("direkt_byte", selectedShift)}
            className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            Erbjud mig
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function MyRequestCard({
  request,
  shift,
  offeredShift,
  responder,
  clientById,
}: {
  request: SwapRequest;
  shift: Shift | undefined;
  offeredShift: Shift | undefined;
  responder: Profile | undefined;
  clientById: Map<string, Client>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Något gick fel.");
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-800">{shiftLabel(shift, clientById)}</p>

      {request.status === "oppen" && (
        <>
          <p className="text-xs text-slate-500">Väntar på att någon svarar…</p>
          <button
            disabled={isPending}
            onClick={() => run(() => cancelSwap(request.id))}
            className="mt-2 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Avbryt bytet
          </button>
        </>
      )}

      {request.status === "vantar_bekraftelse" && (
        <>
          <p className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
            {responder?.full_name ?? "Någon"} vill{" "}
            {request.type === "direkt_byte" ? "byta mot sitt pass" : "ta över"} passet
            {offeredShift ? ` (${shiftLabel(offeredShift, clientById)})` : ""}. Bekräfta för att
            genomföra bytet.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              disabled={isPending}
              onClick={() => run(() => confirmSwap(request.id))}
              className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              Bekräfta bytet
            </button>
            <button
              disabled={isPending}
              onClick={() => run(() => declineSwapResponse(request.id))}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Avböj svaret
            </button>
          </div>
        </>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
