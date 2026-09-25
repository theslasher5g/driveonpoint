import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "./db";
import { bookings, lessonTypes, staff } from "./db/schema";
import { zurichDay, zurichTime, zurichToInstant } from "./time";

/**
 * Auszüge für die Steuererklärung.
 *
 * Bewusst ohne jede Angabe zur Kundschaft: gelesen werden nur Datum, Angebot,
 * Fahrlehrerin und Betrag — also genau die Felder, die den Aufräumlauf nach
 * 30 Tagen überleben (siehe retention.ts). Ein Auszug sieht deshalb für einen
 * frischen und einen längst anonymisierten Termin gleich aus, und die
 * Buchhaltung braucht die Personendaten gar nicht erst.
 *
 * Die Referenz (DOP-XXXX) bleibt drin: sie ist der Beleg, über den sich eine
 * Zeile später einer Zahlung zuordnen lässt, und für sich genommen sagt sie
 * nichts über die Person aus.
 */

export type JournalRow = {
  day: string;
  time: string;
  reference: string;
  lessonName: string;
  staffName: string;
  amountRappen: number;
  promotionLabel: string | null;
  /** Nur bei verrechenbaren Ausfällen: warum der Termin nicht stattfand. */
  reason?: "Absage unter 24 h" | "Absage unter 24 h, wer abgesagt hat ist unbekannt" | "Nicht erschienen";
};

export type AccountingReport = {
  /** Erbrachte, nicht abgesagte Termine im Zeitraum. */
  rows: JournalRow[];
  totalRappen: number;
  /** Termine, die im Zeitraum liegen, aber noch bevorstehen. */
  openCount: number;
  openRappen: number;
  /**
   * Absagen innert 24 Stunden vor Beginn und Termine, zu denen niemand
   * erschienen ist. Laut AGB verrechenbar, aber nicht automatisch
   * verrechnet — deshalb getrennt und nicht im Umsatz enthalten. Absagen
   * durch die Fahrschule zählen nicht dazu.
   */
  chargeable: JournalRow[];
  chargeableRappen: number;
  byMonth: { month: number; count: number; totalRappen: number }[];
  byLessonType: { name: string; count: number; totalRappen: number }[];
};

const DAY_BEFORE_MS = 24 * 60 * 60 * 1000;

/** Erster Tag des Zeitraums und erster Tag danach, als "2026-01-01". */
export function periodBounds(year: number, month?: number): { from: string; to: string } {
  if (month) {
    const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: next };
  }
  return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
}

export async function accountingReport(year: number, month?: number): Promise<AccountingReport> {
  const { from, to } = periodBounds(year, month);

  const rows = await db
    .select({
      startsAt: bookings.startsAt,
      reference: bookings.reference,
      amountRappen: bookings.priceRappen,
      promotionLabel: bookings.appliedPromotionLabel,
      status: bookings.status,
      cancelledAt: bookings.cancelledAt,
      cancelledBy: bookings.cancelledBy,
      movedBy: bookings.movedBy,
      noShowAt: bookings.noShowAt,
      lessonName: lessonTypes.name,
      staffName: staff.name,
    })
    .from(bookings)
    .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .leftJoin(staff, eq(staff.id, bookings.staffId))
    .where(
      and(
        gte(bookings.startsAt, zurichToInstant(from, "00:00")),
        lt(bookings.startsAt, zurichToInstant(to, "00:00")),
      ),
    )
    .orderBy(asc(bookings.startsAt));

  const now = new Date();
  const journal: JournalRow[] = [];
  const chargeable: JournalRow[] = [];
  let totalRappen = 0;
  let openCount = 0;
  let openRappen = 0;
  let chargeableRappen = 0;

  const byMonth = new Map<number, { count: number; totalRappen: number }>();
  const byLessonType = new Map<string, { count: number; totalRappen: number }>();

  for (const row of rows) {
    const entry: JournalRow = {
      day: zurichDay(row.startsAt),
      time: zurichTime(row.startsAt),
      reference: row.reference,
      lessonName: row.lessonName ?? "Gelöschtes Angebot",
      staffName: row.staffName ?? "Nicht mehr zugeordnet",
      amountRappen: row.amountRappen,
      promotionLabel: row.promotionLabel,
    };

    // Nie per Mail bestätigt — ist kein Termin zustande gekommen.
    if (row.status === "angefragt") continue;

    if (row.status === "abgesagt") {
      const late =
        row.cancelledAt !== null &&
        row.cancelledAt.getTime() > row.startsAt.getTime() - DAY_BEFORE_MS;
      // Sagt die Fahrschule selbst ab (Krankheit, Wetter), ist das kein
      // Ausfall der Kundschaft und laut AGB nicht verrechenbar. Ebenso, wenn
      // die Fahrschule den Termin vorher verschoben hat — der neuen Zeit hat
      // die Kundschaft nie zugestimmt.
      if (late && row.cancelledBy !== "fahrschule" && row.movedBy !== "fahrschule") {
        chargeable.push({
          ...entry,
          reason:
            row.cancelledBy === "kundschaft"
              ? "Absage unter 24 h"
              : "Absage unter 24 h, wer abgesagt hat ist unbekannt",
        });
        chargeableRappen += row.amountRappen;
      }
      continue;
    }

    if (row.noShowAt) {
      chargeable.push({ ...entry, reason: "Nicht erschienen" });
      chargeableRappen += row.amountRappen;
      continue;
    }

    // Ein Termin zählt erst als Umsatz, wenn er stattgefunden hat.
    if (row.startsAt > now) {
      openCount += 1;
      openRappen += row.amountRappen;
      continue;
    }

    journal.push(entry);
    totalRappen += row.amountRappen;

    const monthKey = Number(entry.day.slice(5, 7));
    const monthEntry = byMonth.get(monthKey) ?? { count: 0, totalRappen: 0 };
    monthEntry.count += 1;
    monthEntry.totalRappen += row.amountRappen;
    byMonth.set(monthKey, monthEntry);

    const typeEntry = byLessonType.get(entry.lessonName) ?? { count: 0, totalRappen: 0 };
    typeEntry.count += 1;
    typeEntry.totalRappen += row.amountRappen;
    byLessonType.set(entry.lessonName, typeEntry);
  }

  return {
    rows: journal,
    totalRappen,
    openCount,
    openRappen,
    chargeable,
    chargeableRappen,
    byMonth: [...byMonth.entries()]
      .map(([month, value]) => ({ month, ...value }))
      .sort((a, b) => a.month - b.month),
    byLessonType: [...byLessonType.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.totalRappen - a.totalRappen),
  };
}

/** In welchen Jahren überhaupt Termine liegen — für die Auswahl auf der Seite. */
export async function bookedYears(): Promise<number[]> {
  const rows = await db.select({ startsAt: bookings.startsAt }).from(bookings);
  const years = new Set(rows.map((row) => Number(zurichDay(row.startsAt).slice(0, 4))));
  years.add(Number(zurichDay(new Date()).slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}
