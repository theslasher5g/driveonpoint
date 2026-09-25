import { formatDate, weekdayName } from "./time";

export type RuleFrequency = "taeglich" | "woechentlich" | "monatlich";

type RuleDates = {
  frequency: RuleFrequency;
  weekday: number;
  validFrom: string | null;
  validUntil: string | null;
};

/**
 * Gilt die Regel an diesem Tag? An einer Stelle, damit Buchung und
 * Kalender dieselben Zeiten sehen.
 */
export function ruleAppliesOn(rule: RuleDates, day: string, weekday: number): boolean {
  if (rule.validFrom && day < rule.validFrom) return false;
  if (rule.validUntil && day > rule.validUntil) return false;
  switch (rule.frequency) {
    case "taeglich":
      return true;
    case "monatlich":
      // Ohne Startdatum gäbe es keinen Kalendertag; solche Regeln entstehen
      // nicht, sie sollen aber auch nichts anbieten.
      return !!rule.validFrom && day.slice(8) === rule.validFrom.slice(8);
    default:
      return rule.weekday === weekday;
  }
}

/** "Jeden Montag", "Täglich", "Monatlich am 15." */
export function describeRule(rule: RuleDates): string {
  switch (rule.frequency) {
    case "taeglich":
      return "Täglich";
    case "monatlich":
      return rule.validFrom ? `Monatlich am ${Number(rule.validFrom.slice(8))}.` : "Monatlich";
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
