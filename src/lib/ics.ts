import { site } from "./site";

/** Sonderzeichen nach RFC 5545 maskieren. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Zeilen über 75 Oktetten müssen umbrochen werden, sonst lehnen Clients ab.
 * Gezählt wird in Bytes, nicht in Zeichen — ein Umlaut belegt in UTF-8 zwei
 * davon, und deutscher Text liegt sonst schnell über der Grenze. Getrennt
 * wird nur zwischen ganzen Zeichen.
 */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // Die Folgezeilen beginnen mit einem Leerzeichen, das mitzählt.
  let limit = 75;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function stamp(instant: Date): string {
  return `${instant.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

export type CalendarEntry = {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  description: string;
  cancelled: boolean;
  updatedAt: Date;
  location?: string;
  url?: string;
  /** Erinnerung im Kalender der Kundschaft, in Minuten vor Beginn. */
  alarmMinutesBefore?: number;
};

function eventLines(entry: CalendarEntry): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${entry.uid}`,
    `DTSTAMP:${stamp(entry.updatedAt)}`,
    `DTSTART:${stamp(entry.startsAt)}`,
    `DTEND:${stamp(entry.endsAt)}`,
    `SUMMARY:${escapeText(entry.title)}`,
    `DESCRIPTION:${escapeText(entry.description)}`,
    ...(entry.location ? [`LOCATION:${escapeText(entry.location)}`] : []),
    ...(entry.url ? [`URL:${entry.url}`] : []),
    `STATUS:${entry.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    ...(entry.alarmMinutesBefore
      ? [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${escapeText(entry.title)}`,
          `TRIGGER:-PT${entry.alarmMinutesBefore}M`,
          "END:VALARM",
        ]
      : []),
    "END:VEVENT",
  ];
}

export function buildCalendar(name: string, entries: CalendarEntry[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeText(site.name)}//Terminkalender//DE`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Europe/Zurich",
    // Google fragt abonnierte Kalender nur alle paar Stunden ab. Der Hinweis
    // bittet um stündlich; erzwingen lässt er sich nicht.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const entry of entries) lines.push(...eventLines(entry));

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

/**
 * Kalenderdatei als Anhang der Bestätigungsmail. Ein Tipp darauf legt den
 * Termin im Kalender der Kundschaft an. METHOD:PUBLISH statt REQUEST: eine
 * Einladung würde nach Zusage/Absage fragen, und diese Antwort ginge ins
 * Leere — absagen geht nur über den Link in der Mail.
 */
export function buildInvite(entries: CalendarEntry[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeText(site.name)}//Terminbestaetigung//DE`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const entry of entries) lines.push(...eventLines(entry));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}
