// Ren valideringslogik för pass, utan beroenden på Supabase eller Server
// Actions, så den går att enhetstesta isolerat.

import { zonedWallTimeToUtc } from "@/lib/date-utils";

export type ShiftInputResult =
  | {
      ok: true;
      data: {
        start_time: string;
        end_time: string;
        assigned_to: string;
        client_id: string | null;
        notes: string | null;
      };
    }
  | { ok: false; error: string };

export function parseShiftInput(input: {
  start_time: string;
  end_time: string;
  assigned_to: string;
  client_id?: string | null;
  notes?: string | null;
}): ShiftInputResult {
  const { start_time: startTime, end_time: endTime, assigned_to: assignedTo } = input;

  if (!startTime || !endTime) {
    return { ok: false, error: "Ange både start- och sluttid för passet." };
  }
  if (!assignedTo) {
    return { ok: false, error: "Välj vem som ska jobba passet." };
  }

  // Tiderna kommer från ett <input type="datetime-local"> och saknar
  // tidszon - tolka dem som svensk lokal tid (se zonedWallTimeToUtc), inte
  // som lokal tid i den miljö Server Action:en råkar köra i.
  const start = zonedWallTimeToUtc(startTime);
  const end = zonedWallTimeToUtc(endTime);

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "Ogiltigt datum eller tid." };
  }
  if (end <= start) {
    return { ok: false, error: "Sluttiden måste vara efter starttiden." };
  }

  return {
    ok: true,
    data: {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      assigned_to: assignedTo,
      client_id: input.client_id || null,
      notes: input.notes || null,
    },
  };
}