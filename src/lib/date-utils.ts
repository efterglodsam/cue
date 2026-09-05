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

// Returnerar hela veckor (mån–sön) som täcker aktuell månad, för månadsvyn.
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

export { addDays, isSameDay, format as formatDate };
export { sv };
