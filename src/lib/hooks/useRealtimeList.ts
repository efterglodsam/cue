"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface RealtimePayload<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE" | string;
  new: T;
  old: T;
}

// Ren reducer, brutna ut ur useEffect så den går att enhetstesta utan att
// rendera React eller prata med Supabase alls.
export function applyRealtimeEvent<T extends { id: string }>(
  current: T[],
  payload: RealtimePayload<T>,
): T[] {
  if (payload.eventType === "INSERT") {
    const row = payload.new;
    if (current.some((r) => r.id === row.id)) return current;
    return [...current, row];
  }
  if (payload.eventType === "UPDATE") {
    const row = payload.new;
    return current.map((r) => (r.id === row.id ? row : r));
  }
  if (payload.eventType === "DELETE") {
    const row = payload.old;
    return current.filter((r) => r.id !== row.id);
  }
  return current;
}

/**
 * Håller en lista av rader synkad med en Supabase-tabell via Realtime.
 * Startar från `initial` (hämtat server-side) och applicerar INSERT/UPDATE/
 * DELETE-events allt eftersom teamet gör ändringar, utan att man behöver
 * ladda om sidan.
 */
export function useRealtimeList<T extends { id: string }>(
  table: string,
  initial: T[],
): T[] {
  const [rows, setRows] = useState<T[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          setRows((current) =>
            applyRealtimeEvent(current, payload as unknown as RealtimePayload<T>),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table]);

  return rows;
}
