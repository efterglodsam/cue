"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  formatDate,
  formatDayLabel,
  formatTime,
  getMonthGrid,
  getWeekDays,
  isSameDay,
  isSameMonth,
  sv,
} from "@/lib/date-utils";
import { useRealtimeList } from "@/lib/hooks/useRealtimeList";
import { getFirstName } from "@/lib/profile-utils";
import ShiftDialog from "./ShiftDialog";
import type { Client, Profile, Shift } from "@/lib/supabase/types";

type View = "vecka" | "manad";

export default function ScheduleView({
  initialShifts,
  profiles,
  clients,
  currentUserId,
}: {
  initialShifts: Shift[];
  profiles: Profile[];
  clients: Client[];
  currentUserId: string;
}) {
  const shifts = useRealtimeList<Shift>("shifts", initialShifts);
  const [view, setView] = useState<View>("vecka");
  const [anchor, setAnchor] = useState(() => new Date());
  const [dialog, setDialog] = useState<{ shift?: Shift | null; date?: Date | null } | null>(null);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of shifts) {
      const key = formatDate(new Date(shift.start_time), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(shift);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [shifts]);

  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);
  const monthGrid = useMemo(() => getMonthGrid(anchor), [anchor]);

  function shiftsFor(day: Date): Shift[] {
    return shiftsByDay.get(formatDate(day, "yyyy-MM-dd")) ?? [];
  }

  function stepBack() {
    setAnchor((a) => (view === "vecka" ? addWeeks(a, -1) : addMonths(a, -1)));
  }
  function stepForward() {
    setAnchor((a) => (view === "vecka" ? addWeeks(a, 1) : addMonths(a, 1)));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={stepBack}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
            aria-label="Föregående"
          >
            ←
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Idag
          </button>
          <button
            onClick={stepForward}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
            aria-label="Nästa"
          >
            →
          </button>
          <span className="ml-2 text-sm font-medium capitalize text-slate-200">
            {formatDate(anchor, "MMMM yyyy", { locale: sv })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden overflow-hidden rounded-lg border border-slate-600 md:flex">
            {(["vecka", "manad"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm font-medium capitalize ${
                  view === v ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setDialog({ shift: null, date: new Date() })}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Nytt pass
          </button>
        </div>
      </div>

      {/* Mobil: lista per dag för veckan */}
      <div className="space-y-4 md:hidden">
        {weekDays.map((day) => (
          <DaySection
            key={day.toISOString()}
            day={day}
            shifts={shiftsFor(day)}
            profileById={profileById}
            clientById={clientById}
            currentUserId={currentUserId}
            onSelect={(s) => setDialog({ shift: s })}
            onAdd={() => setDialog({ shift: null, date: day })}
          />
        ))}
      </div>

      {/* Desktop: veckovy som rutnät */}
      {view === "vecka" && (
        <div className="hidden grid-cols-7 gap-3 md:grid">
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="min-h-[10rem] rounded-xl border border-slate-700 bg-slate-900 p-2">
              <p className="mb-2 text-xs font-semibold capitalize text-slate-400">
                {formatDate(day, "EEE d/M", { locale: sv })}
              </p>
              <div className="space-y-1.5">
                {shiftsFor(day).map((shift) => (
                  <ShiftChip
                    key={shift.id}
                    shift={shift}
                    profile={profileById.get(shift.assigned_to)}
                    client={shift.client_id ? clientById.get(shift.client_id) : undefined}
                    isMine={shift.assigned_to === currentUserId}
                    onClick={() => setDialog({ shift })}
                  />
                ))}
              </div>
              <button
                onClick={() => setDialog({ shift: null, date: day })}
                className="mt-2 w-full rounded-md py-1 text-xs font-medium text-blue-400 hover:bg-blue-950"
              >
                + Lägg till
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Desktop: månadsvy */}
      {view === "manad" && (
        <div className="hidden overflow-hidden rounded-xl border border-slate-700 md:block">
          <div className="grid grid-cols-7 bg-slate-900 text-xs font-semibold text-slate-400">
            {["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"].map((d) => (
              <div key={d} className="px-2 py-1.5">
                {d}
              </div>
            ))}
          </div>
          {monthGrid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-t border-slate-700">
              {week.map((day) => {
                const dayShifts = shiftsFor(day);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setDialog({ shift: null, date: day })}
                    className={`min-h-[5.5rem] border-r border-slate-800 p-1.5 text-left last:border-r-0 ${
                      isSameMonth(day, anchor) ? "bg-slate-900" : "bg-slate-950 text-slate-600"
                    }`}
                  >
                    <span className="text-xs font-medium">{formatDate(day, "d")}</span>
                    <div className="mt-1 space-y-0.5">
                      {dayShifts.slice(0, 2).map((s) => (
                        <p
                          key={s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialog({ shift: s });
                          }}
                          className={`truncate rounded px-1 py-0.5 text-[11px] ${
                            s.assigned_to === currentUserId
                              ? "bg-blue-900 text-blue-200"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {formatTime(new Date(s.start_time))} {getFirstName(profileById.get(s.assigned_to)?.full_name)}
                        </p>
                      ))}
                      {dayShifts.length > 2 && (
                        <p className="text-[11px] text-slate-500">+{dayShifts.length - 2} till</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <ShiftDialog
          open
          onClose={() => setDialog(null)}
          shift={dialog.shift}
          defaultDate={dialog.date}
          profiles={profiles}
          clients={clients}
          currentUserId={currentUserId}
        />
      )}

    </div>
  );
}

function DaySection({
  day,
  shifts,
  profileById,
  clientById,
  currentUserId,
  onSelect,
  onAdd,
}: {
  day: Date;
  shifts: Shift[];
  profileById: Map<string, Profile>;
  clientById: Map<string, Client>;
  currentUserId: string;
  onSelect: (shift: Shift) => void;
  onAdd: () => void;
}) {
  const isToday = isSameDay(day, new Date());
  return (
    <div className={`rounded-xl border p-3 ${isToday ? "border-blue-700 bg-blue-950/40" : "border-slate-700 bg-slate-900"}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold capitalize text-slate-200">{formatDayLabel(day)}</p>
        <button onClick={onAdd} className="text-xs font-medium text-blue-400">
          + Lägg till
        </button>
      </div>
      {shifts.length === 0 ? (
        <p className="text-sm text-slate-500">Inga pass inlagda</p>
      ) : (
        <div className="space-y-2">
          {shifts.map((shift) => (
            <ShiftChip
              key={shift.id}
              shift={shift}
              profile={profileById.get(shift.assigned_to)}
              client={shift.client_id ? clientById.get(shift.client_id) : undefined}
              isMine={shift.assigned_to === currentUserId}
              onClick={() => onSelect(shift)}
              large
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftChip({
  shift,
  profile,
  client,
  isMine,
  onClick,
  large,
}: {
  shift: Shift;
  profile?: Profile;
  client?: Client;
  isMine: boolean;
  onClick: () => void;
  large?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition ${
        isMine
          ? "border-blue-700 bg-blue-900 hover:bg-blue-800"
          : "border-slate-700 bg-slate-800 hover:bg-slate-700"
      } ${large ? "text-sm" : "text-xs"}`}
    >
      <p className="font-semibold text-slate-100">
        {formatTime(new Date(shift.start_time))}–{formatTime(new Date(shift.end_time))}
      </p>
      <p className={isMine ? "text-blue-200" : "text-slate-300"}>
        {isMine ? "Du" : getFirstName(profile?.full_name)}
        {client ? ` · ${client.name}` : ""}
      </p>
    </button>
  );
}
