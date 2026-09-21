export const ZONE = "Europe/Zurich";

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Liest die Wanduhrzeit eines Zeitpunkts in Zürich aus. */
function zonedParts(instant: Date) {
  const parts = PARTS.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Mitternacht liefert in manchen Umgebungen "24" statt "00".
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Verschiebung Zürich→UTC in Minuten, für den gegebenen Zeitpunkt. */
function offsetMinutes(instant: Date): number {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Wandelt eine Schweizer Wanduhrzeit in den echten Zeitpunkt um.
 * Zwei Durchläufe, weil die Verschiebung selbst vom Datum abhängt —
 * sonst läge jeder Termin rund um die Zeitumstellung eine Stunde daneben.
 */
export function zurichToInstant(day: string, timeOfDay: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = timeOfDay.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, date, hour, minute, 0);

  let guess = new Date(naive - offsetMinutes(new Date(naive)) * 60_000);
  guess = new Date(naive - offsetMinutes(guess) * 60_000);
  return guess;
}

/** Datum eines Zeitpunkts in Zürich, als "2026-09-22". */
export function zurichDay(instant: Date): string {
  const p = zonedParts(instant);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Uhrzeit eines Zeitpunkts in Zürich, als "14:00". */
export function zurichTime(instant: Date): string {
  const p = zonedParts(instant);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Wochentag in Zürich, 0 = Sonntag. */
export function zurichWeekday(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

export function addDays(day: string, count: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + count));
  return next.toISOString().slice(0, 10);
}

/** Anzahl Tage zwischen zwei "YYYY-MM-DD"-Daten, `to` minus `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function minutesSinceMidnight(timeOfDay: string): number {
  const [hour, minute] = timeOfDay.split(":").map(Number);
  return hour * 60 + minute;
}

export function fromMinutes(total: number): string {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const WEEKDAY_LONG = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];
const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function weekdayName(weekday: number, short = false): string {
  return short ? WEEKDAY_SHORT[weekday] : WEEKDAY_LONG[weekday];
}

/** Monatsname zu einer Zahl von 1 bis 12. */
export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

/** "Dienstag, 22. September 2026" */
export function formatDayLong(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = zurichWeekday(day);
  return `${WEEKDAY_LONG[weekday]}, ${date}. ${MONTHS[month - 1]} ${year}`;
}

/** "Di, 22. Sep." */
export function formatDayShort(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  const weekday = zurichWeekday(day);
  return `${WEEKDAY_SHORT[weekday]}, ${date}. ${MONTHS[month - 1].slice(0, 3)}.`;
}

export function todayInZurich(): string {
  return zurichDay(new Date());
}

/** Rappen als Schweizer Betrag, z. B. 9500 → "95.00". */
export function formatPrice(rappen: number): string {
  return (rappen / 100).toFixed(2);
}
