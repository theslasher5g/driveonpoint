import "server-only";
import { and, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "./db";
import { bookings } from "./db/schema";

/**
 * Wie oft war diese Person schon da — für den Blick in den Kalender.
 *
 * Erkannt wird die Kundschaft an der Mailadresse oder an der Telefonnummer
 * (die letzten neun Ziffern, damit "079 …" und "+41 79 …" dieselbe Nummer
 * sind). Ein Konto gibt es nicht. Personendaten werden 30 Tage nach dem
 * Termin gelöscht, deshalb reicht die Historie nur so weit zurück.
 */
export type CustomerHistory = {
  /** Der wievielte Termin das ist (Absagen und Nichterscheinen nicht mitgezählt). */
  position: number;
  noShows: number;
  lateCancellations: number;
};

type Entry = {
  id: string;
  startsAt: Date;
  customerEmail: string | null;
  customerPhone: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

function emailKey(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export async function customerHistories(entries: Entry[]): Promise<Map<string, CustomerHistory>> {
  const result = new Map<string, CustomerHistory>();
  const emails = [...new Set(entries.map((e) => emailKey(e.customerEmail)).filter((v): v is string => !!v))];
  const phones = [...new Set(entries.map((e) => phoneKey(e.customerPhone)).filter((v): v is string => !!v))];
  if (emails.length === 0 && phones.length === 0) return result;

  const emailExpr = sql<string>`lower(${bookings.customerEmail})`;
  const phoneExpr = sql<string>`right(regexp_replace(${bookings.customerPhone}, '\\D', '', 'g'), 9)`;

  const related = await db
    .select({
      id: bookings.id,
      startsAt: bookings.startsAt,
      status: bookings.status,
      noShowAt: bookings.noShowAt,
      cancelledAt: bookings.cancelledAt,
      cancelledBy: bookings.cancelledBy,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
    })
    .from(bookings)
    .where(
      and(
        isNull(bookings.anonymisedAt),
        ne(bookings.status, "angefragt"),
        or(
          emails.length > 0 ? inArray(emailExpr, emails) : undefined,
          phones.length > 0 ? inArray(phoneExpr, phones) : undefined,
        ),
      ),
    );

  for (const entry of entries) {
    const mail = emailKey(entry.customerEmail);
    const phone = phoneKey(entry.customerPhone);
    if (!mail && !phone) continue;

    const same = related.filter(
      (row) =>
        row.id !== entry.id &&
        ((mail && emailKey(row.customerEmail) === mail) ||
          (phone && phoneKey(row.customerPhone) === phone)),
    );

    const earlierKept = same.filter(
      (row) => row.startsAt < entry.startsAt && row.status !== "abgesagt" && !row.noShowAt,
    ).length;

    result.set(entry.id, {
      position: earlierKept + 1,
      noShows: same.filter((row) => row.noShowAt && row.status !== "abgesagt").length,
      lateCancellations: same.filter(
        (row) =>
          row.status === "abgesagt" &&
          row.cancelledBy === "kundschaft" &&
          row.cancelledAt !== null &&
          row.cancelledAt.getTime() > row.startsAt.getTime() - DAY_MS,
      ).length,
    });
  }

  return result;
}

/** Kurzfassung für Kalenderkarte und Dialog. */
export function describeHistory(history: CustomerHistory | undefined): {
  label: string | null;
  warnings: string[];
} {
  if (!history) return { label: null, warnings: [] };
  const warnings: string[] = [];
  if (history.noShows > 0) warnings.push(`${history.noShows}× nicht erschienen`);
  if (history.lateCancellations > 0) warnings.push(`${history.lateCancellations}× kurzfristig abgesagt`);
  return {
    label: history.position === 1 ? "Erster Termin" : `${history.position}. Termin`,
    warnings,
  };
}
