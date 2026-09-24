import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { occupiesTime } from "./booking";
import { sendCourseCancellation } from "./booking-mail";
import { db } from "./db";
import { availabilityExceptions, bookings, lessonTypes, waitlistEntries } from "./db/schema";
import { zurichDay, zurichTime } from "./time";

/**
 * Einen ganzen Kurstermin absagen — statt zwölf Buchungen einzeln.
 *
 * Ein Kurstermin ist ein Angebot zu einer Startzeit (siehe findSlots). Alle
 * Angemeldeten werden abgesagt und bekommen eine Mail, die Warteliste
 * ebenso, und der Termin verschwindet aus der Verfügbarkeit, damit ihn
 * niemand neu bucht.
 */

export async function courseSession(lessonTypeId: string, startsAt: Date) {
  const [lessonType] = await db
    .select()
    .from(lessonTypes)
    .where(eq(lessonTypes.id, lessonTypeId))
    .limit(1);

  const [participants, waiting] = await Promise.all([
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        status: bookings.status,
        customerName: bookings.customerName,
        customerEmail: bookings.customerEmail,
        customerPhone: bookings.customerPhone,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.lessonTypeId, lessonTypeId),
          eq(bookings.startsAt, startsAt),
          occupiesTime(),
        ),
      )
      .orderBy(asc(bookings.createdAt)),
    db
      .select()
      .from(waitlistEntries)
      .where(and(eq(waitlistEntries.lessonTypeId, lessonTypeId), eq(waitlistEntries.startsAt, startsAt))),
  ]);

  return { lessonType, participants, waiting };
}

export async function cancelCourseSession({
  lessonTypeId,
  startsAt,
  message,
}: {
  lessonTypeId: string;
  startsAt: Date;
  message: string | null;
}): Promise<{ cancelled: string[]; waitlist: number; mailsFailed: number }> {
  const { lessonType, participants, waiting } = await courseSession(lessonTypeId, startsAt);
  if (!lessonType || lessonType.capacity <= 1) return { cancelled: [], waitlist: 0, mailsFailed: 0 };

  const day = zurichDay(startsAt);
  const time = zurichTime(startsAt);
  const now = new Date();

  const cancelled =
    participants.length > 0
      ? await db
          .update(bookings)
          .set({ status: "abgesagt", cancelledAt: now, cancelledBy: "fahrschule", updatedAt: now })
          .where(inArray(bookings.id, participants.map((entry) => entry.id)))
          .returning({
            reference: bookings.reference,
            status: bookings.status,
            customerName: bookings.customerName,
            customerEmail: bookings.customerEmail,
          })
      : [];

  if (waiting.length > 0) {
    await db.delete(waitlistEntries).where(inArray(waitlistEntries.id, waiting.map((entry) => entry.id)));
  }

  // Der Kurstermin selbst: sonst stünde er sofort wieder frei zur Buchung.
  await db
    .delete(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.lessonTypeId, lessonTypeId),
        eq(availabilityExceptions.day, day),
        eq(availabilityExceptions.startTime, time),
        eq(availabilityExceptions.available, true),
      ),
    );

  // Erst nach den Änderungen: ein Mailproblem soll die Absage nicht aufhalten.
  let mailsFailed = 0;
  const recipients = [
    ...participants
      .filter((entry) => entry.customerEmail)
      .map((entry) => ({ to: entry.customerEmail!, name: entry.customerName ?? "", reference: entry.reference })),
    ...waiting.map((entry) => ({ to: entry.email, name: entry.name, reference: null })),
  ];
  for (const recipient of recipients) {
    try {
      await sendCourseCancellation({
        ...recipient,
        lessonName: lessonType.name,
        slug: lessonType.slug,
        day,
        time,
        message,
      });
    } catch (error) {
      mailsFailed += 1;
      console.error("Absagemail zum Kurs konnte nicht versendet werden:", error);
    }
  }

  return { cancelled: cancelled.map((entry) => entry.reference), waitlist: waiting.length, mailsFailed };
}
