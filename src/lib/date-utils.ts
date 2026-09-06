import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { sv } from "date-fns/locale";

export function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Returnerar hela veckor (mån-sön) som täcker aktuell månad, för månadsvyn.
export function getMonthGrid(anchor: Date): Date[][] {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }
  return weeks;
}

export { addMonths, addWeeks, isSameMonth };

export function formatDayLabel(date: Date): string {
  return format(date, "EEEE d MMM", { locale: sv });
}

export function formatShortDate(date: Date): string {
  return format(date, "d MMM", { locale: sv });
}

export function formatTime(date: Date): string {
  return format(date, "HH:mm");
}

export function formatDateTimeInput(date: Date): string {
  // Format som fungerar i <input type="datetime-local">
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

// Tidszonen alla arbetspass utgår från. Cue används av ett team i Sverige,
// så en väggklocka som skrivs in i schemat ("09:00") menar alltid 09:00
// svensk tid - oavsett vilken tidszon servern själv råkar köra i.
export const APP_TIME_ZONE = "Europe/Stockholm";

/**
 * Tolkar en väggklocka utan tidszon - t.ex. värdet "2026-09-09T09:00" från
 * ett <input type="datetime-local">, eller en likadan sträng utan "T" - som
 * en tidpunkt i `timeZone` och returnerar motsvarande UTC-Date.
 *
 * `new Date("2026-09-09T09:00")` räcker INTE här: en sådan sträng utan
 * tidszon tolkas av JS-motorn som lokal tid i miljön den körs i. I webbläsaren
 * (svensk dator) blir det rätt, men Server Actions kör på servern, som ofta
 * har TZ=UTC - då blev 09:00 inskrivet i schemat sparat som 09:00 UTC, det
 * vill säga 11:00 svensk sommartid. Den här funktionen är oberoende av
 * miljöns egen tidszon: den frågar Intl.DateTimeFormat vad en given
 * UTC-tidpunkt visas som i målzonen, mäter mellanskillnaden och justerar -
 * vilket hanterar sommar-/vintertid korrekt för vilket datum som helst.
 *
 * Returnerar null om strängen inte går att tolka.
 */
export function zonedWallTimeToUtc(
  wallTime: string,
  timeZone: string = APP_TIME_ZONE,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(wallTime);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = s ? Number(s) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  // Gissning: låtsas att väggklockan redan var UTC.
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  // Fråga vad den gissade UTC-tidpunkten faktiskt visas som i målzonen.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(guessUtcMs))) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  // Vissa motorer visar midnatt som "24" med hourCycle h23.
  const shownHour = parts.hour === "24" ? "00" : parts.hour;
  const shownAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(shownHour),
    Number(parts.minute),
    Number(parts.second),
  );

  // Mellanskillnaden är precis zonens offset vid den tidpunkten (t.ex.
  // +2h sommartid, +1h vintertid) - dra bort den för att få rätt UTC-tid.
  const offsetMs = shownAsUtcMs - guessUtcMs;
  return new Date(guessUtcMs - offsetMs);
}

export { addDays, isSameDay, format as formatDate };
export { sv };