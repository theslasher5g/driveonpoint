import "server-only";
import { and, eq, gt, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { ruleAppliesOn, secondPartOf, type SecondPart, type SecondPartSource } from "./availability-rules";
import { db } from "./db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  lessonTypes,
  staff,
  staffLessonTypes,
} from "./db/schema";
import { addDays, zurichDay, zurichTime, zurichWeekday } from "./time";

/**
 * Kurstermine kommen aus zwei Quellen: einzelnen Daten (Ausnahme mit
 * "verfügbar") und Serien (Regel: jede Woche, jeden 4. Montag …). Fällt ein
 * einzelner Termin einer Serie aus, steht dafür eine Ausnahme mit
 * `cancelledSession`. Hier kommen die drei zusammen, damit Buchung,
 * Warteliste, Sperre anderer Angebote und Hinweismails dieselben
 * Kurstermine sehen.
 */

export type CourseWindow = {
  staffId: string;
  lessonTypeId: string;
  day: string;
  /** "HH:MM" */
  startTime: string;
  endTime: string;
  bufferMinutes: number;
  /** 2. Kurstag, falls der Kurs über zwei Tage geht. */
  second: SecondPart | null;
};

type Query = {
  fromDay: string;
  untilDay: string;
  /** Nur dieser Kurs … */
  lessonTypeId?: string;
  /** … oder alle Kurse ausser diesem. */
  excludeLessonTypeId?: string;
  staffIds?: string[];
  /** Nur aktive Personen, denen der Kurs zugeteilt ist — wie beim Buchen. */
  bookableOnly?: boolean;
};

export async function courseWindows(query: Query): Promise<CourseWindow[]> {
  if (query.staffIds && query.staffIds.length === 0) return [];

  const courses = await db
    .select({ id: lessonTypes.id, bufferMinutes: lessonTypes.bufferMinutes })
    .from(lessonTypes)
    .where(
      and(
        gt(lessonTypes.capacity, 1),
        eq(lessonTypes.active, true),
        query.lessonTypeId ? eq(lessonTypes.id, query.lessonTypeId) : undefined,
        query.excludeLessonTypeId ? ne(lessonTypes.id, query.excludeLessonTypeId) : undefined,
      ),
    );
  if (courses.length === 0) return [];
  const courseIds = courses.map((course) => course.id);
  const buffer = new Map(courses.map((course) => [course.id, course.bufferMinutes]));

  const staffFilter = query.staffIds ?? null;
  const [dates, rules, eligible] = await Promise.all([
    db
      .select({
        staffId: availabilityExceptions.staffId,
        lessonTypeId: availabilityExceptions.lessonTypeId,
        day: availabilityExceptions.day,
        startTime: availabilityExceptions.startTime,
        endTime: availabilityExceptions.endTime,
        secondDayOffset: availabilityExceptions.secondDayOffset,
        secondStartTime: availabilityExceptions.secondStartTime,
        secondEndTime: availabilityExceptions.secondEndTime,
        available: availabilityExceptions.available,
        cancelledSession: availabilityExceptions.cancelledSession,
      })
      .from(availabilityExceptions)
      .where(
        and(
          inArray(availabilityExceptions.lessonTypeId, courseIds),
          staffFilter ? inArray(availabilityExceptions.staffId, staffFilter) : undefined,
          gte(availabilityExceptions.day, query.fromDay),
          lte(availabilityExceptions.day, query.untilDay),
        ),
      ),
    db
      .select()
      .from(availabilityRules)
      .where(
        and(
          inArray(availabilityRules.lessonTypeId, courseIds),
          staffFilter ? inArray(availabilityRules.staffId, staffFilter) : undefined,
          or(isNull(availabilityRules.validFrom), lte(availabilityRules.validFrom, query.untilDay)),
          or(isNull(availabilityRules.validUntil), gte(availabilityRules.validUntil, query.fromDay)),
        ),
      ),
    query.bookableOnly
      ? db
          .select({ staffId: staffLessonTypes.staffId, lessonTypeId: staffLessonTypes.lessonTypeId })
          .from(staffLessonTypes)
          .innerJoin(staff, eq(staff.id, staffLessonTypes.staffId))
          .where(and(eq(staff.active, true), inArray(staffLessonTypes.lessonTypeId, courseIds)))
      : Promise.resolve(null),
  ]);

  const allowed = eligible ? new Set(eligible.map((row) => `${row.staffId}|${row.lessonTypeId}`)) : null;
  const key = (staffId: string, lessonTypeId: string, day: string, start: string) =>
    `${staffId}|${lessonTypeId}|${day}|${start}`;
  const cancelled = new Set(
    dates
      .filter((row) => row.cancelledSession)
      .map((row) => key(row.staffId, row.lessonTypeId!, row.day, row.startTime.slice(0, 5))),
  );

  const windows = new Map<string, CourseWindow>();
  const add = (
    staffId: string,
    lessonTypeId: string,
    day: string,
    startTime: string,
    endTime: string,
    source: SecondPartSource,
  ) => {
    const start = startTime.slice(0, 5);
    const id = key(staffId, lessonTypeId, day, start);
    if (cancelled.has(id) || windows.has(id)) return;
    if (allowed && !allowed.has(`${staffId}|${lessonTypeId}`)) return;
    windows.set(id, {
      staffId,
      lessonTypeId,
      day,
      startTime: start,
      endTime: endTime.slice(0, 5),
      bufferMinutes: buffer.get(lessonTypeId) ?? 0,
      second: secondPartOf(source, day),
    });
  };

  for (const row of dates) {
    if (row.available) add(row.staffId, row.lessonTypeId!, row.day, row.startTime, row.endTime, row);
  }
  if (rules.length > 0) {
    for (let day = query.fromDay; day <= query.untilDay; day = addDays(day, 1)) {
      const weekday = zurichWeekday(day);
      for (const rule of rules) {
        if (ruleAppliesOn(rule, day, weekday)) {
          add(rule.staffId, rule.lessonTypeId, day, rule.startTime, rule.endTime, rule);
        }
      }
    }
  }

  return [...windows.values()].sort(
    (a, b) => a.day.localeCompare(b.day) || a.startTime.localeCompare(b.startTime),
  );
}

/**
 * Woher kommt ein bestimmter Kurstermin? Einzelne Daten und Serien, die an
 * diesem Tag zu dieser Zeit einen Termin ergeben — für Absagen und
 * Verschieben, die je nach Quelle anders vorgehen.
 */
export async function sessionSources(lessonTypeId: string, day: string, time: string) {
  const [dates, rules, cancelled] = await Promise.all([
    db
      .select()
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.lessonTypeId, lessonTypeId),
          eq(availabilityExceptions.day, day),
          eq(availabilityExceptions.startTime, time),
          eq(availabilityExceptions.available, true),
        ),
      ),
    db.select().from(availabilityRules).where(eq(availabilityRules.lessonTypeId, lessonTypeId)),
    db
      .select({ staffId: availabilityExceptions.staffId })
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.lessonTypeId, lessonTypeId),
          eq(availabilityExceptions.day, day),
          eq(availabilityExceptions.startTime, time),
          eq(availabilityExceptions.cancelledSession, true),
        ),
      ),
  ]);
  const weekday = zurichWeekday(day);
  const skipped = new Set(cancelled.map((row) => row.staffId));
  return {
    dates,
    rules: rules.filter(
      (rule) =>
        rule.startTime.slice(0, 5) === time &&
        !skipped.has(rule.staffId) &&
        ruleAppliesOn(rule, day, weekday),
    ),
  };
}

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Bevor eine Kursserie verschwindet (gelöscht oder das Angebot der Person
 * entzogen): Termine mit Anmeldungen als einzelne Daten sichern. Sonst
 * stünden die Angemeldeten ohne Kurstermin da und erführen nichts — so
 * bleiben sie im Kalender und lassen sich dort absagen oder verschieben.
 */
export async function keepBookedSessions(
  executor: Executor,
  rule: typeof availabilityRules.$inferSelect,
): Promise<number> {
  const booked = await executor
    .select({ startsAt: bookings.startsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.staffId, rule.staffId),
        eq(bookings.lessonTypeId, rule.lessonTypeId),
        ne(bookings.status, "abgesagt"),
        gt(bookings.startsAt, new Date()),
      ),
    );
  const time = rule.startTime.slice(0, 5);
  const days = [
    ...new Set(
      booked
        .filter((row) => zurichTime(row.startsAt) === time)
        .map((row) => zurichDay(row.startsAt))
        .filter((day) => ruleAppliesOn(rule, day, zurichWeekday(day))),
    ),
  ];
  if (days.length === 0) return 0;
  await executor.insert(availabilityExceptions).values(
    days.map((day) => ({
      staffId: rule.staffId,
      lessonTypeId: rule.lessonTypeId,
      day,
      startTime: time,
      endTime: rule.endTime,
      secondDayOffset: rule.secondDayOffset,
      secondStartTime: rule.secondStartTime,
      secondEndTime: rule.secondEndTime,
      available: true,
    })),
  );
  return days.length;
}
