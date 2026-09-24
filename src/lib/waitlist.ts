import "server-only";
import { and, asc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { BOOKING_HORIZON_DAYS, occupiesTime } from "./booking";
import { sendWaitlistNotification } from "./booking-mail";
import { db } from "./db";
import {
  availabilityExceptions,
  bookings,
  lessonTypes,
  staff,
  staffLessonTypes,
  waitlistEntries,
  type LessonType,
} from "./db/schema";
import { addDays, todayInZurich, zurichDay, zurichTime, zurichToInstant } from "./time";

/**
 * Warteliste für ausgebuchte Kurse.
 *
 * Ein Kurstermin ist ein einzelner Eintrag unter Verfügbarkeit (siehe
 * findSlots). Ist er voll, verschwindet er aus der Buchung — hier wird er
 * wieder gefunden, damit man sich eintragen kann. Wird ein Platz frei,
 * bekommen alle Eingetragenen eine Mail, wer zuerst bucht, hat ihn.
 */

export type FullSession = { day: string; time: string; startsAt: Date };

async function takenSeats(lessonTypeId: string, startsAt: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.lessonTypeId, lessonTypeId),
        eq(bookings.startsAt, startsAt),
        occupiesTime(),
      ),
    );
  return row?.count ?? 0;
}

/** Ausgebuchte Kurstermine im buchbaren Zeitraum, frühester zuerst. */
export async function fullCourseSessions(
  lessonType: LessonType,
  fromDay: string = todayInZurich(),
  days: number = BOOKING_HORIZON_DAYS,
): Promise<FullSession[]> {
  if (lessonType.capacity <= 1) return [];

  const dates = await db
    .select({ day: availabilityExceptions.day, startTime: availabilityExceptions.startTime })
    .from(availabilityExceptions)
    .innerJoin(staff, eq(staff.id, availabilityExceptions.staffId))
    .innerJoin(
      staffLessonTypes,
      and(
        eq(staffLessonTypes.staffId, availabilityExceptions.staffId),
        eq(staffLessonTypes.lessonTypeId, availabilityExceptions.lessonTypeId),
      ),
    )
    .where(
      and(
        eq(availabilityExceptions.lessonTypeId, lessonType.id),
        eq(availabilityExceptions.available, true),
        eq(staff.active, true),
        gte(availabilityExceptions.day, fromDay),
        lt(availabilityExceptions.day, addDays(fromDay, days)),
      ),
    )
    .orderBy(asc(availabilityExceptions.day), asc(availabilityExceptions.startTime));

  const now = Date.now();
  const seen = new Set<string>();
  const full: FullSession[] = [];

  for (const date of dates) {
    const time = date.startTime.slice(0, 5);
    const startsAt = zurichToInstant(date.day, time);
    const key = startsAt.toISOString();
    if (seen.has(key) || startsAt.getTime() <= now) continue;
    seen.add(key);
    if ((await takenSeats(lessonType.id, startsAt)) >= lessonType.capacity) {
      full.push({ day: date.day, time, startsAt });
    }
  }

  return full;
}

/** Ist genau dieser Kurstermin ausgebucht? Für das Eintragen auf die Warteliste. */
export async function isSessionFull(lessonType: LessonType, day: string, time: string) {
  const sessions = await fullCourseSessions(lessonType, day, 1);
  return sessions.some((session) => session.time === time);
}

/**
 * Nach einer Absage, einem Verschieben oder einer verfallenen Anfrage: ist
 * wieder Platz, bekommen alle auf der Warteliste Bescheid. Wirft nie —
 * die auslösende Aktion (etwa die Absage) steht schon und soll nicht an
 * einem Mailproblem scheitern.
 */
export async function notifyWaitlist(lessonTypeId: string | null, startsAt: Date): Promise<void> {
  if (!lessonTypeId || startsAt.getTime() <= Date.now()) return;
  try {
    const [lessonType] = await db
      .select()
      .from(lessonTypes)
      .where(eq(lessonTypes.id, lessonTypeId))
      .limit(1);
    if (!lessonType || lessonType.capacity <= 1) return;

    const seatsFree = lessonType.capacity - (await takenSeats(lessonTypeId, startsAt));
    if (seatsFree <= 0) return;

    const waiting = await db
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.lessonTypeId, lessonTypeId), eq(waitlistEntries.startsAt, startsAt)))
      .orderBy(asc(waitlistEntries.createdAt));
    if (waiting.length === 0) return;

    const day = zurichDay(startsAt);
    const time = zurichTime(startsAt);
    const notified: string[] = [];
    for (const entry of waiting) {
      try {
        await sendWaitlistNotification({
          to: entry.email,
          name: entry.name,
          lessonName: lessonType.name,
          slug: lessonType.slug,
          day,
          time,
          seatsFree,
          removeToken: entry.token,
        });
        notified.push(entry.id);
      } catch (error) {
        console.error("Wartelisten-Mail konnte nicht versendet werden:", error);
      }
    }
    if (notified.length > 0) {
      await db
        .update(waitlistEntries)
        .set({ notifiedAt: new Date() })
        .where(inArray(waitlistEntries.id, notified));
    }
  } catch (error) {
    console.error("Warteliste konnte nicht benachrichtigt werden:", error);
  }
}

/** Wer den Kurs gebucht hat, steht nicht mehr auf der Warteliste. */
export async function removeFromWaitlist(lessonTypeId: string | null, startsAt: Date, email: string | null) {
  if (!lessonTypeId || !email) return;
  await db
    .delete(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.lessonTypeId, lessonTypeId),
        eq(waitlistEntries.startsAt, startsAt),
        sql`lower(${waitlistEntries.email}) = ${email.trim().toLowerCase()}`,
      ),
    );
}

/** Nach dem Kurstermin braucht niemand mehr die Einträge — samt Personendaten weg. */
export async function pruneWaitlist(): Promise<number> {
  const removed = await db
    .delete(waitlistEntries)
    .where(lte(waitlistEntries.startsAt, new Date()))
    .returning({ id: waitlistEntries.id });
  return removed.length;
}

/** Wartelisten der Woche für den Team-Kalender. */
export async function waitlistsBetween(from: Date, to: Date) {
  return db
    .select({
      id: waitlistEntries.id,
      startsAt: waitlistEntries.startsAt,
      name: waitlistEntries.name,
      phone: waitlistEntries.phone,
      lessonName: lessonTypes.name,
      notifiedAt: waitlistEntries.notifiedAt,
    })
    .from(waitlistEntries)
    .innerJoin(lessonTypes, eq(lessonTypes.id, waitlistEntries.lessonTypeId))
    .where(and(gt(waitlistEntries.startsAt, from), lte(waitlistEntries.startsAt, to)))
    .orderBy(asc(waitlistEntries.startsAt), asc(waitlistEntries.createdAt));
}
