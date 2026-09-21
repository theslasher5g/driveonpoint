import { addDays, zurichWeekday } from "@/lib/time";

/** Montag der Woche, in der `day` liegt. */
export function mondayOf(day: string): string {
  const weekday = zurichWeekday(day);
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/** Erster und letzter Tag des Monats, als "2026-09-01"/"2026-09-30". */
export function monthBounds(yearMonth: string): { first: string; last: string } {
  const [year, month] = yearMonth.split("-").map(Number);
  const first = `${yearMonth}-01`;
  // Tag 0 des Folgemonats ist der letzte Tag dieses Monats.
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${yearMonth}-${String(lastDate).padStart(2, "0")}`;
  return { first, last };
}

/** "2026-09" für den Monat, in dem `day` liegt. */
export function yearMonthOf(day: string): string {
  return day.slice(0, 7);
}

/** Vormonat/Folgemonat als "YYYY-MM", ohne über den Jahreswechsel zu stolpern. */
export function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Das vollständige Wochenraster eines Monats: vom Montag der ersten bis zum
 * Sonntag der letzten sichtbaren Woche, damit keine angebrochene Woche im
 * Kalender fehlt.
 */
export function monthGridDays(yearMonth: string): string[] {
  const { first, last } = monthBounds(yearMonth);
  const gridStart = mondayOf(first);
  const gridEnd = addDays(mondayOf(last), 6);

  const days: string[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}
