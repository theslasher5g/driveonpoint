import { addDays, formatDate, weekdayName, zurichWeekday } from "./time";

export type RuleFrequency = "taeglich" | "woechentlich" | "monatlich";

type RuleDates = {
  frequency: RuleFrequency;
  weekday: number;
  validFrom: string | null;
  validUntil: string | null;
};

function daysInMonth(day: string): number {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Der wievielte Wochentag im Monat: 1 bis 4, oder "letzter". Der 5. ist
 * immer auch der letzte und gibt es nicht in jedem Monat — "jeden letzten
 * Montag" trifft dagegen jeden Monat.
 */
export function weekdayOrdinal(day: string): number | "letzter" {
  const ordinal = Math.ceil(Number(day.slice(8)) / 7);
  return ordinal >= 5 ? "letzter" : ordinal;
}

function isOrdinal(day: string, ordinal: number | "letzter"): boolean {
  const date = Number(day.slice(8));
  return ordinal === "letzter" ? date + 7 > daysInMonth(day) : Math.ceil(date / 7) === ordinal;
}

/**
 * Gilt die Regel an diesem Tag? An einer Stelle, damit Buchung und
 * Kalender dieselben Zeiten sehen.
 *
 * Monatlich heisst: derselbe Wochentag an derselben Stelle im Monat, etwa
 * jeden 4. Montag — nicht dasselbe Datum, das jeden Monat auf einen anderen
 * Wochentag fiele.
 */
export function ruleAppliesOn(rule: RuleDates, day: string, weekday: number): boolean {
  if (rule.validFrom && day < rule.validFrom) return false;
  if (rule.validUntil && day > rule.validUntil) return false;
  switch (rule.frequency) {
    case "taeglich":
      return true;
    case "monatlich":
      // Ohne Startdatum gäbe es keine Stelle im Monat; solche Regeln
      // entstehen nicht, sie sollen aber auch nichts anbieten.
      return (
        !!rule.validFrom &&
        weekday === zurichWeekday(rule.validFrom) &&
        isOrdinal(day, weekdayOrdinal(rule.validFrom))
      );
    default:
      return rule.weekday === weekday;
  }
}

/** "4." oder "letzten" — für "jeden 4. Montag" bzw. "jeden letzten Montag". */
export function ordinalLabel(day: string): string {
  const ordinal = weekdayOrdinal(day);
  return ordinal === "letzter" ? "letzten" : `${ordinal}.`;
}

/** "Jeden Montag", "Täglich", "Jeden 4. Montag im Monat" */
export function describeRule(rule: RuleDates): string {
  switch (rule.frequency) {
    case "taeglich":
      return "Täglich";
    case "monatlich":
      return rule.validFrom
        ? `Jeden ${ordinalLabel(rule.validFrom)} ${weekdayName(zurichWeekday(rule.validFrom))} im Monat`
        : "Monatlich";
    default:
      return `Jeden ${weekdayName(rule.weekday)}`;
  }
}

/** "ab 1. Oktober 2026 bis …" — leer, wenn die Regel schon läuft und kein Ende hat. */
export function describeRuleRange(rule: RuleDates, today: string): string {
  const parts: string[] = [];
  if (rule.validFrom && rule.validFrom > today) parts.push(`ab ${formatDate(rule.validFrom)}`);
  if (rule.validUntil) parts.push(`bis ${formatDate(rule.validUntil)}`);
  return parts.join(" ");
}

/** Alle Tage einer Wiederholung zwischen zwei Daten, beide eingeschlossen. */
export function occurrences(frequency: RuleFrequency, from: string, until: string): string[] {
  const rule = { frequency, weekday: zurichWeekday(from), validFrom: from, validUntil: until };
  const days: string[] = [];
  for (let day = from; day <= until; day = addDays(day, 1)) {
    if (ruleAppliesOn(rule, day, zurichWeekday(day))) days.push(day);
  }
  return days;
}

/**
 * Die nächsten Tage einer Regel ab einem Datum, höchstens `limit` und
 * höchstens gut ein Jahr voraus — für die Vorschau "Nächste Termine".
 */
export function nextOccurrences(rule: RuleDates, from: string, limit: number): string[] {
  const start = rule.validFrom && rule.validFrom > from ? rule.validFrom : from;
  const days: string[] = [];
  for (let offset = 0; offset < 400 && days.length < limit; offset += 1) {
    const day = addDays(start, offset);
    if (rule.validUntil && day > rule.validUntil) break;
    if (ruleAppliesOn(rule, day, zurichWeekday(day))) days.push(day);
  }
  return days;
}
