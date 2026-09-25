import "server-only";
import { and, eq, gt, inArray, lt, notInArray } from "drizzle-orm";
import { occupiesTime } from "./booking";
import { sendRescheduleConfirmation, sendWaitlistMoved } from "./booking-mail";
import { courseSession } from "./course-cancel";
import { db } from "./db";
import { availabilityExceptions, bookings, lessonTypes, staff, waitlistEntries } from "./db/schema";
import { env } from "./env";
import { minutesSinceMidnight, zurichDay, zurichTime, zurichToInstant } from "./time";

/**
 * Einen ganzen Kurstermin auf ein anderes Datum legen — statt abzusagen und
 * alle neu buchen zu lassen. Kurstermin, Anmeldungen und Warteliste ziehen
 * gemeinsam um; alle bekommen eine Mail mit der neuen Zeit.
 */

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
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
  // 18–21 Uhr); verschoben wird es als Ganzes.
  const dates = await db
    .select()
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.lessonTypeId, lessonTypeId),
        eq(availabilityExceptions.day, oldDay),
        eq(availabilityExceptions.startTime, oldTime),
        eq(availabilityExceptions.available, true),
      ),
    );
  const windowMinutes = dates[0]
    ? minutesSinceMidnight(dates[0].endTime.slice(0, 5)) - minutesSinceMidnight(dates[0].startTime.slice(0, 5))
    : lessonType.durationMinutes;
  const newEndMinutes = minutesSinceMidnight(newTime) + windowMinutes;
  if (newEndMinutes > 24 * 60) return { error: "Der Kurs würde über Mitternacht dauern." };
  const newEndTime = toTime(newEndMinutes);

  const newEndsAt = new Date(newStartsAt.getTime() + lessonType.durationMinutes * 60_000);
  const staffIds = [
    ...new Set([
      ...dates.map((date) => date.staffId),
      ...participants.map((entry) => entry.staffId).filter((id): id is string => !!id),
    ]),
  ];

  // Gibt es zur neuen Zeit schon einen Kurstermin dieses Angebots?
  const [existing] = await db
    .select({ id: availabilityExceptions.id })
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.lessonTypeId, lessonTypeId),
        eq(availabilityExceptions.day, newDay),
        eq(availabilityExceptions.startTime, newTime),
        eq(availabilityExceptions.available, true),
      ),
    )
    .limit(1);
  if (existing) return { error: "Zu dieser Zeit gibt es schon einen Kurstermin. Wähle eine andere Zeit." };

  if (staffIds.length > 0) {
    // Andere Termine der Kursleitung, die sich mit der neuen Zeit überschneiden.
    const clashes = await db
      .select({ name: staff.name, startsAt: bookings.startsAt, lessonName: lessonTypes.name })
      .from(bookings)
      .innerJoin(staff, eq(staff.id, bookings.staffId))
      .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
      .where(
        and(
          inArray(bookings.staffId, staffIds),
          occupiesTime(),
          lt(bookings.startsAt, newEndsAt),
          gt(bookings.endsAt, newStartsAt),
          participants.length > 0
            ? notInArray(bookings.id, participants.map((entry) => entry.id))
            : undefined,
        ),
      )
      .limit(1);
    if (clashes[0]) {
      return {
        error: `${clashes[0].name} hat zu dieser Zeit schon einen Termin (${clashes[0].lessonName ?? "Termin"}, ${zurichTime(clashes[0].startsAt)} Uhr).`,
      };
    }

    // Als abwesend eingetragen?
    const absences = await db
      .select({ name: staff.name, startTime: availabilityExceptions.startTime, endTime: availabilityExceptions.endTime })
      .from(availabilityExceptions)
      .innerJoin(staff, eq(staff.id, availabilityExceptions.staffId))
      .where(
        and(
          inArray(availabilityExceptions.staffId, staffIds),
          eq(availabilityExceptions.day, newDay),
          eq(availabilityExceptions.available, false),
        ),
      );
    const newStart = minutesSinceMidnight(newTime);
    const absent = absences.find(
      (row) =>
        minutesSinceMidnight(row.startTime.slice(0, 5)) < newEndMinutes &&
        minutesSinceMidnight(row.endTime.slice(0, 5)) > newStart,
    );
    if (absent) return { error: `${absent.name} ist zu dieser Zeit als abwesend eingetragen.` };
  }

  const purgeAfter = new Date(
    Math.max(newEndsAt.getTime(), Date.now()) + env.retentionDays * 24 * 60 * 60 * 1000,
  );

  await db.transaction(async (tx) => {
    if (dates.length > 0) {
      await tx
        .update(availabilityExceptions)
        .set({ day: newDay, startTime: newTime, endTime: newEndTime })
        .where(inArray(availabilityExceptions.id, dates.map((date) => date.id)));
    }
    if (participants.length > 0) {
      await tx
        .update(bookings)
        .set({
          startsAt: newStartsAt,
          endsAt: newEndsAt,
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
