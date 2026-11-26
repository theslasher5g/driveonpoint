import "server-only";
import { and, eq, gte, inArray, isNull, lte, notInArray, or } from "drizzle-orm";
import { occupiesTime } from "./booking";
import { sendRescheduleConfirmation, sendWaitlistMoved } from "./booking-mail";
import { courseSession } from "./course-cancel";
import { SECOND_DAY_MAX_OFFSET, secondPartOf, type SecondPartSource } from "./availability-rules";
import { courseWindows, sessionSources } from "./course-dates";
import { db } from "./db";
import { availabilityExceptions, bookings, lessonTypes, staff, waitlistEntries } from "./db/schema";
import { env } from "./env";
import { addDays, daysBetween, formatDayShort, minutesSinceMidnight, zurichDay, zurichTime, zurichToInstant } from "./time";

/**
 * Einen ganzen Kurstermin auf ein anderes Datum legen — statt abzusagen und
 * alle neu buchen zu lassen. Kurstermin, Anmeldungen und Warteliste ziehen
 * gemeinsam um; alle bekommen eine Mail mit der neuen Zeit.
 */

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Wie ein Kurstermin aussieht: Länge des (1.) Kurstags und der 2. Kurstag
 * als Abstand mit Zeiten. Aus dem Eintrag unter Verfügbarkeit; fehlt der
 * (etwa weil die Serie inzwischen gelöscht ist), aus den Anmeldungen — so
 * verlieren die Angemeldeten ihren 2. Kurstag nicht. Die Seite zum
 * Verschieben zeigt damit genau das an, was beim Verschieben passiert.
 */
export async function courseShape(
  lessonTypeId: string,
  startsAt: Date,
  fallbackMinutes: number,
): Promise<{
  sources: Awaited<ReturnType<typeof sessionSources>>;
  windowMinutes: number;
  second: SecondPartSource | null;
}> {
  const day = zurichDay(startsAt);
  const sources = await sessionSources(lessonTypeId, day, zurichTime(startsAt));
  const source = sources.dates[0] ?? sources.rules[0];
  if (source) {
    return {
      sources,
      windowMinutes:
        minutesSinceMidnight(source.endTime.slice(0, 5)) - minutesSinceMidnight(source.startTime.slice(0, 5)),
      second: source.secondDayOffset ? source : null,
    };
  }
  const [booked] = await db
    .select({ endsAt: bookings.endsAt, secondStartsAt: bookings.secondStartsAt, secondEndsAt: bookings.secondEndsAt })
    .from(bookings)
    .where(and(eq(bookings.lessonTypeId, lessonTypeId), eq(bookings.startsAt, startsAt), occupiesTime()))
    .limit(1);
  return {
    sources,
    windowMinutes: booked ? Math.round((booked.endsAt.getTime() - startsAt.getTime()) / 60_000) : fallbackMinutes,
    second:
      booked?.secondStartsAt && booked.secondEndsAt
        ? {
            secondDayOffset: daysBetween(day, zurichDay(booked.secondStartsAt)),
            secondStartTime: zurichTime(booked.secondStartsAt),
            secondEndTime: zurichTime(booked.secondEndsAt),
          }
        : null,
  };
}

export async function moveCourseSession({
  lessonTypeId,
  startsAt,
  newDay,
  newTime,
  message,
}: {
  lessonTypeId: string;
  startsAt: Date;
  newDay: string;
  newTime: string;
  message: string | null;
}): Promise<
  { ok: true; moved: string[]; waitlist: number; mailsFailed: number } | { error: string }
> {
  const { lessonType, participants, waiting } = await courseSession(lessonTypeId, startsAt);
  if (!lessonType || lessonType.capacity <= 1) return { error: "Das ist kein Kurstermin." };

  const newStartsAt = zurichToInstant(newDay, newTime);
  if (newStartsAt.getTime() <= Date.now()) return { error: "Die neue Zeit liegt in der Vergangenheit." };
  if (newStartsAt.getTime() === startsAt.getTime()) return { error: "Das ist dieselbe Zeit wie bisher." };

  const oldDay = zurichDay(startsAt);
  const oldTime = zurichTime(startsAt);

  // Der Kurstermin unter Verfügbarkeit gibt das Zeitfenster vor (etwa
  // 18–21 Uhr); verschoben wird es als Ganzes. Er ist ein einzelnes Datum
  // oder ein Termin einer Serie.
  const shape = await courseShape(lessonTypeId, startsAt, lessonType.durationMinutes);
  const { dates, rules } = shape.sources;
  const newEndMinutes = minutesSinceMidnight(newTime) + shape.windowMinutes;
  if (newEndMinutes > 24 * 60) return { error: "Der Kurs würde über Mitternacht dauern." };
  const newEndTime = toTime(newEndMinutes);

  // Der Kurs dauert, wie er eingetragen ist; ein 2. Kurstag wandert im
  // selben Abstand mit (VKU Montag und Mittwoch bleibt Montag und Mittwoch).
  const newEndsAt = zurichToInstant(newDay, newEndTime);
  const newSecond = shape.second ? secondPartOf(shape.second, newDay) : null;
  const newSecondStartsAt = newSecond ? zurichToInstant(newSecond.day, newSecond.startTime) : null;
  const newSecondEndsAt = newSecond ? zurichToInstant(newSecond.day, newSecond.endTime) : null;
  const staffIds = [
    ...new Set([
      ...dates.map((date) => date.staffId),
      ...rules.map((rule) => rule.staffId),
      ...participants.map((entry) => entry.staffId).filter((id): id is string => !!id),
    ]),
  ];

  // Gibt es zur neuen Zeit schon einen Kurstermin dieses Angebots?
  const atNewTime = await sessionSources(lessonTypeId, newDay, newTime);
  if (atNewTime.dates.length > 0 || atNewTime.rules.length > 0) {
    return { error: "Zu dieser Zeit gibt es schon einen Kurstermin. Wähle eine andere Zeit." };
  }

  if (staffIds.length > 0) {
    const blocker = await movingBlocker({
      lessonTypeId,
      bufferMinutes: lessonType.bufferMinutes,
      staffIds,
      parts: [
        { day: newDay, start: minutesSinceMidnight(newTime), end: newEndMinutes },
        ...(newSecond
          ? [{ day: newSecond.day, start: minutesSinceMidnight(newSecond.startTime), end: minutesSinceMidnight(newSecond.endTime) }]
          : []),
      ],
      ownSession: { day: oldDay, time: oldTime },
      ownBookingIds: participants.map((entry) => entry.id),
    });
    if (blocker) return { error: blocker };
  }

  const purgeAfter = new Date(
    Math.max((newSecondEndsAt ?? newEndsAt).getTime(), Date.now()) +
      env.retentionDays * 24 * 60 * 60 * 1000,
  );

  await db.transaction(async (tx) => {
    // Ein alter Ausfall-Vermerk zur neuen Zeit (etwa ein früher abgesagter
    // Serientermin) würde den verschobenen Kurs sonst gleich wieder sperren.
    const movingStaff = [...new Set([...dates, ...rules].map((row) => row.staffId))];
    if (movingStaff.length > 0) {
      await tx
        .delete(availabilityExceptions)
        .where(
          and(
            inArray(availabilityExceptions.staffId, movingStaff),
            eq(availabilityExceptions.lessonTypeId, lessonTypeId),
            eq(availabilityExceptions.day, newDay),
            eq(availabilityExceptions.startTime, newTime),
            eq(availabilityExceptions.cancelledSession, true),
          ),
        );
    }
    if (dates.length > 0) {
      await tx
        .update(availabilityExceptions)
        .set({ day: newDay, startTime: newTime, endTime: newEndTime })
        .where(inArray(availabilityExceptions.id, dates.map((date) => date.id)));
    }
    // Termin einer Serie: am alten Tag fällt er aus, am neuen steht er als
    // einzelnes Datum. Die Serie selbst bleibt, wie sie ist.
    if (rules.length > 0) {
      await tx.insert(availabilityExceptions).values(
        rules.flatMap((rule) => [
          {
            staffId: rule.staffId,
            lessonTypeId,
            day: oldDay,
            startTime: oldTime,
            endTime: rule.endTime,
            available: false,
            cancelledSession: true,
            note: "Kurstermin verschoben",
          },
          {
            staffId: rule.staffId,
            lessonTypeId,
            day: newDay,
            startTime: newTime,
            endTime: newEndTime,
            secondDayOffset: rule.secondDayOffset,
            secondStartTime: rule.secondStartTime,
            secondEndTime: rule.secondEndTime,
            available: true,
          },
        ]),
      );
    }
    if (participants.length > 0) {
      await tx
        .update(bookings)
        .set({
          startsAt: newStartsAt,
          endsAt: newEndsAt,
          secondStartsAt: newSecondStartsAt,
          secondEndsAt: newSecondEndsAt,
          purgeAfter,
          reminderSentAt: null,
          movedBy: "fahrschule",
          updatedAt: new Date(),
        })
        .where(inArray(bookings.id, participants.map((entry) => entry.id)));
    }
    if (waiting.length > 0) {
      await tx
        .update(waitlistEntries)
        .set({ startsAt: newStartsAt })
        .where(inArray(waitlistEntries.id, waiting.map((entry) => entry.id)));
    }
  });

  // Mails erst nach dem Umzug: ein Mailproblem soll ihn nicht aufhalten.
  let mailsFailed = 0;
  for (const entry of participants) {
    if (!entry.customerEmail) continue;
    try {
      await sendRescheduleConfirmation({
        to: entry.customerEmail,
        name: entry.customerName ?? "",
        reference: entry.reference,
        cancelToken: entry.cancelToken,
        lessonName: lessonType.name,
        day: newDay,
        time: newTime,
        previousStartsAt: startsAt,
        durationMinutes: lessonType.durationMinutes,
        capacity: lessonType.capacity,
        byCustomer: false,
        message,
        endsAt: newEndsAt,
        second:
          newSecondStartsAt && newSecondEndsAt
            ? { startsAt: newSecondStartsAt, endsAt: newSecondEndsAt }
            : null,
      });
    } catch (error) {
      mailsFailed += 1;
      console.error("Mail zum verschobenen Kurs konnte nicht versendet werden:", error);
    }
  }
  for (const entry of waiting) {
    try {
      await sendWaitlistMoved({
        to: entry.email,
        name: entry.name,
        lessonName: lessonType.name,
        day: newDay,
        time: newTime,
        previousStartsAt: startsAt,
        message,
        removeToken: entry.token,
      });
    } catch (error) {
      mailsFailed += 1;
      console.error("Wartelisten-Mail zum verschobenen Kurs konnte nicht versendet werden:", error);
    }
  }

  return {
    ok: true,
    moved: participants.map((entry) => entry.reference),
    waitlist: waiting.length,
    mailsFailed,
  };
}

/**
 * Steht der Kursleitung zur neuen Zeit etwas im Weg? Dieselben Hürden wie
 * beim Buchen (findSlots): eigene Termine samt Pause und 2. Kurstag,
 * Abwesenheiten, geplante Termine anderer Kurse und andere Termine
 * desselben Kurses, die sich halb überschneiden. Vorher prüfte der Umzug
 * nur die reine Überschneidung mit Buchungen am 1. Tag — ein Kurs liess
 * sich so in einen leeren Nothilfekurs, über einen anderen VKU-Abend oder
 * mit dem 2. Kurstag in die Ferien legen.
 */
async function movingBlocker(input: {
  lessonTypeId: string;
  bufferMinutes: number;
  staffIds: string[];
  /** Neue Kurstage als Minuten im jeweiligen Tag. */
  parts: { day: string; start: number; end: number }[];
  /** Der Kurstermin, der gerade umzieht — er selbst ist kein Hindernis. */
  ownSession: { day: string; time: string };
  ownBookingIds: string[];
}): Promise<string | null> {
  const days = input.parts.map((part) => part.day).sort();
  const names = new Map(
    (
      await db.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, input.staffIds))
    ).map((row) => [row.id, row.name]),
  );
  const who = (id: string) => names.get(id) ?? "Die Kursleitung";
  const overlaps = (day: string, start: number, end: number, pause: number) =>
    input.parts.some((part) => part.day === day && start - pause < part.end && end + pause > part.start);

  // Buchungen, auch mit 2. Kurstag an einem der neuen Tage.
  const reachFrom = zurichToInstant(addDays(days[0], -SECOND_DAY_MAX_OFFSET), "00:00");
  const reachTo = zurichToInstant(days[days.length - 1], "23:59");
  const taken = await db
    .select({
      staffId: bookings.staffId,
      lessonTypeId: bookings.lessonTypeId,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      secondStartsAt: bookings.secondStartsAt,
      secondEndsAt: bookings.secondEndsAt,
      bufferMinutes: lessonTypes.bufferMinutes,
      lessonName: lessonTypes.name,
    })
    .from(bookings)
    .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(
      and(
        inArray(bookings.staffId, input.staffIds),
        occupiesTime(),
        gte(bookings.startsAt, reachFrom),
        lte(bookings.startsAt, reachTo),
        input.ownBookingIds.length > 0 ? notInArray(bookings.id, input.ownBookingIds) : undefined,
      ),
    );
  for (const row of taken) {
    // Anmeldungen zu einem anderen Termin desselben Kurses teilen sich keine
    // Pause (wie in findSlots); alles andere braucht die grössere der beiden.
    const pause =
      row.lessonTypeId === input.lessonTypeId ? 0 : Math.max(input.bufferMinutes, row.bufferMinutes ?? 0);
    const rowParts: [Date, Date][] = [[row.startsAt, row.endsAt]];
    if (row.secondStartsAt && row.secondEndsAt) rowParts.push([row.secondStartsAt, row.secondEndsAt]);
    for (const [from, to] of rowParts) {
      if (overlaps(zurichDay(from), minutesSinceMidnight(zurichTime(from)), minutesSinceMidnight(zurichTime(to)), pause)) {
        return `${who(row.staffId!)} hat zu dieser Zeit schon einen Termin (${row.lessonName ?? "Termin"}, ${zurichDay(from) === input.parts[0].day ? "" : `${formatDayShort(zurichDay(from))}, `}${zurichTime(from)} Uhr).`;
      }
    }
  }

  // Abwesenheiten an einem der neuen Tage (ausgefallene Kurstermine zählen nicht).
  const absences = await db
    .select({
      staffId: availabilityExceptions.staffId,
      day: availabilityExceptions.day,
      startTime: availabilityExceptions.startTime,
      endTime: availabilityExceptions.endTime,
    })
    .from(availabilityExceptions)
    .where(
      and(
        inArray(availabilityExceptions.staffId, input.staffIds),
        inArray(availabilityExceptions.day, days),
        eq(availabilityExceptions.available, false),
        eq(availabilityExceptions.cancelledSession, false),
        or(isNull(availabilityExceptions.lessonTypeId), eq(availabilityExceptions.lessonTypeId, input.lessonTypeId)),
      ),
    );
  const absent = absences.find((row) =>
    overlaps(row.day, minutesSinceMidnight(row.startTime.slice(0, 5)), minutesSinceMidnight(row.endTime.slice(0, 5)), 0),
  );
  if (absent) {
    return `${who(absent.staffId)} ist ${absent.day === input.parts[0].day ? "zu dieser Zeit" : `am ${formatDayShort(absent.day)}`} als abwesend eingetragen.`;
  }

  // Geplante Kurstermine — andere Kurse samt Pause, derselbe Kurs ohne.
  const windows = await courseWindows({
    fromDay: addDays(days[0], -SECOND_DAY_MAX_OFFSET),
    untilDay: days[days.length - 1],
    staffIds: input.staffIds,
  });
  for (const window of windows) {
    const same = window.lessonTypeId === input.lessonTypeId;
    if (same && window.day === input.ownSession.day && window.startTime === input.ownSession.time) continue;
    const pause = same ? 0 : Math.max(input.bufferMinutes, window.bufferMinutes);
    for (const part of [{ day: window.day, startTime: window.startTime, endTime: window.endTime }, window.second]) {
      if (part && overlaps(part.day, minutesSinceMidnight(part.startTime), minutesSinceMidnight(part.endTime), pause)) {
        return `${who(window.staffId)} hat zu dieser Zeit schon einen ${same ? "anderen Termin dieses Kurses" : "Kurstermin"} (${formatDayShort(part.day)}, ${part.startTime} Uhr).`;
      }
    }
  }
  return null;
}
