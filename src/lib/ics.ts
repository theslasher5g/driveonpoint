import { site } from "./site";

/** Sonderzeichen nach RFC 5545 maskieren. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Zeilen über 75 Oktetten müssen umbrochen werden, sonst lehnen Clients ab. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest.length > 0) parts.push(` ${rest}`);
  return parts.join("\r\n");
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
};

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

  for (const entry of entries) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${entry.uid}`,
      `DTSTAMP:${stamp(entry.updatedAt)}`,
      `DTSTART:${stamp(entry.startsAt)}`,
      `DTEND:${stamp(entry.endsAt)}`,
      `SUMMARY:${escapeText(entry.title)}`,
      `DESCRIPTION:${escapeText(entry.description)}`,
      `STATUS:${entry.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}
