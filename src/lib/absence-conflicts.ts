import "server-only";
import { and, asc, eq, gt, gte, lte } from "drizzle-orm";
import { SECOND_DAY_MAX_OFFSET } from "./availability-rules";
import { occupiesTime } from "./booking";
import { db } from "./db";
import { bookings, lessonTypes } from "./db/schema";
import { addDays, minutesSinceMidnight, zurichDay, zurichTime, zurichToInstant } from "./time";

/**
 * Termine, die in eine eben eingetragene Abwesenheit fallen.
 *
 * Die Abwesenheit sperrt nur neue Buchungen; was schon gebucht ist, bleibt
 * stehen und muss im Kalender abgesagt oder verschoben werden. Ohne
 * Hinweis fiel das niemandem auf, bis die Kundschaft am Treffpunkt stand.
 * Gesperrt wird das Eintragen trotzdem nicht — eine Krankmeldung muss sich
 * immer erfassen lassen.
 */
export type AbsenceConflict = {
  /** Erste Buchung des Termins, für den Link in den Kalender. */
  bookingId: string;
  day: string;
  time: string;
  lessonName: string;
  /** Einzellektion: Name der Kundschaft. Kurs: null, dafür `participants`. */
  customerName: string | null;
  participants: number;
  /** Fällt nur der 2. Kurstag in die Abwesenheit? */
  secondDayOnly: boolean;
  /** Noch nicht per Mail bestätigt (verfällt womöglich von selbst). */
  pending: boolean;
};

export async function bookingsDuringAbsence(input: {
  staffId: string;
  days: string[];
  from: string;
  to: string;
  /** Abwesenheit nur für ein Angebot; leer = alle. */
  lessonTypeId?: string | null;
}): Promise<AbsenceConflict[]> {
  if (input.days.length === 0) return [];
  const sorted = [...input.days].sort();
  const daySet = new Set(sorted);
  const start = minutesSinceMidnight(input.from);
  const end = minutesSinceMidnight(input.to);

  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      secondStartsAt: bookings.secondStartsAt,
      secondEndsAt: bookings.secondEndsAt,
      lessonTypeId: bookings.lessonTypeId,
      customerName: bookings.customerName,
      lessonName: lessonTypes.name,
      capacity: lessonTypes.capacity,
    })
    .from(bookings)
    .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(
      and(
        eq(bookings.staffId, input.staffId),
        occupiesTime(),
        // Vorbei ist vorbei — nur, was noch bevorsteht.
        gt(bookings.endsAt, new Date()),
        // Auch Kurse, die früher beginnen und deren 2. Tag hier liegt.
        gte(bookings.startsAt, zurichToInstant(addDays(sorted[0], -SECOND_DAY_MAX_OFFSET), "00:00")),
        lte(bookings.startsAt, zurichToInstant(sorted[sorted.length - 1], "23:59")),
        input.lessonTypeId ? eq(bookings.lessonTypeId, input.lessonTypeId) : undefined,
      ),
    )
    .orderBy(asc(bookings.startsAt));

  const hits = (from: Date, to: Date) => {
    if (!daySet.has(zurichDay(from))) return false;
    return minutesSinceMidnight(zurichTime(from)) < end && minutesSinceMidnight(zurichTime(to)) > start;
  };

  // Ein Kurs erscheint einmal, mit der Zahl der Angemeldeten.
  const byTerm = new Map<string, AbsenceConflict>();
  for (const row of rows) {
    const first = hits(row.startsAt, row.endsAt);
    const second = !!row.secondStartsAt && !!row.secondEndsAt && hits(row.secondStartsAt, row.secondEndsAt);
    if (!first && !second) continue;
    const course = (row.capacity ?? 1) > 1;
    const key = course ? `${row.lessonTypeId}|${row.startsAt.toISOString()}` : row.id;
    const existing = byTerm.get(key);
    if (existing) {
      existing.participants += 1;
      existing.pending &&= row.status === "angefragt";
      continue;
    }
    byTerm.set(key, {
      bookingId: row.id,
      day: zurichDay(row.startsAt),
      time: zurichTime(row.startsAt),
      lessonName: row.lessonName ?? "Termin",
      customerName: course ? null : row.customerName,
      participants: 1,
      secondDayOnly: !first,
      pending: row.status === "angefragt",
    });
  }
  return [...byTerm.values()];
}

