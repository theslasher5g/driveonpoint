import "server-only";
import { and, eq, gt, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { record } from "./audit";
import { sendBookingReminder } from "./booking-mail";
import { db } from "./db";
import { bookings, lessonTypes } from "./db/schema";

const HOUR = 60 * 60 * 1000;

/**
 * Erinnerungen vor dem Termin.
 *
 * Läuft stündlich. Erfasst werden Termine, die in 24 bis 30 Stunden
 * beginnen: der erste Lauf in diesem Fenster verschickt die Erinnerung,
 * also meist rund 29 Stunden vorher — früh genug, dass die kostenlose Absage
 * (bis 24 Stunden vorher) noch ein paar Stunden offensteht. Fällt ein Lauf
 * aus, holt der nächste es nach; ein Termin, der unter 24 Stunden gerückt
 * ist, bekommt keine Erinnerung mehr, damit sie nicht erst am Morgen des
 * Termins ankommt.
 *
 * Wer erst vor Kurzem bestätigt hat, hat die Bestätigung noch frisch im
 * Postfach und bekommt keine zweite Mail zum selben Termin.
 */
export async function sendDueReminders(): Promise<number> {
  const now = new Date();

  // Erst beanspruchen, dann senden: überschneiden sich zwei Läufe, bekommt
  // trotzdem jede Buchung höchstens eine Erinnerung.
  const due = await db
    .update(bookings)
    .set({ reminderSentAt: now })
    .where(
      and(
        eq(bookings.status, "bestaetigt"),
        isNull(bookings.reminderSentAt),
        isNull(bookings.anonymisedAt),
        isNotNull(bookings.customerEmail),
        gt(bookings.startsAt, new Date(now.getTime() + 24 * HOUR)),
        lte(bookings.startsAt, new Date(now.getTime() + 30 * HOUR)),
        lt(bookings.confirmedAt, new Date(now.getTime() - 12 * HOUR)),
      ),
    )
    .returning({
      id: bookings.id,
      reference: bookings.reference,
      cancelToken: bookings.cancelToken,
      startsAt: bookings.startsAt,
      lessonTypeId: bookings.lessonTypeId,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
    });

  if (due.length === 0) return 0;

  const offerings = await db
    .select({
      id: lessonTypes.id,
      name: lessonTypes.name,
      durationMinutes: lessonTypes.durationMinutes,
      capacity: lessonTypes.capacity,
    })
    .from(lessonTypes);
  const offeringById = new Map(offerings.map((offering) => [offering.id, offering]));

  let sent = 0;
  for (const entry of due) {
    const offering = entry.lessonTypeId ? offeringById.get(entry.lessonTypeId) : undefined;
    try {
      await sendBookingReminder({
        to: entry.customerEmail!,
        name: entry.customerName ?? "",
        reference: entry.reference,
        cancelToken: entry.cancelToken,
        lessonName: offering?.name ?? "Termin",
        startsAt: entry.startsAt,
        durationMinutes: offering?.durationMinutes ?? null,
        // Ohne Angebot (gelöscht) im Zweifel als Einzellektion behandeln.
        capacity: offering?.capacity ?? 1,
      });
      sent += 1;
    } catch (error) {
      // Freigeben, damit der nächste Lauf es noch einmal versucht, solange
      // der Termin im Fenster liegt.
      console.error(`Erinnerung für ${entry.reference} konnte nicht versendet werden:`, error);
      await db.update(bookings).set({ reminderSentAt: null }).where(eq(bookings.id, entry.id));
    }
  }

  if (sent > 0) {
    await record("erinnerung.versendet", { label: "System" }, { anzahl: sent });
  }
  return sent;
}

/**
 * Löscht Online-Buchungen, die nie per Mail bestätigt wurden. Sie zählen
 * nach Ablauf der Frist schon nicht mehr als belegt (siehe occupiesTime);
 * hier verschwinden auch die Personendaten. Ein vollständiges Löschen statt
 * Anonymisieren, weil nie ein Termin zustande kam — für Buchhaltung und
 * Auslastung gibt es nichts aufzuheben.
 */
export async function deleteExpiredRequests(): Promise<number> {
  const removed = await db
    .delete(bookings)
    .where(and(eq(bookings.status, "angefragt"), lt(bookings.confirmExpiresAt, sql`now()`)))
    .returning({ id: bookings.id });

  if (removed.length > 0) {
    await record("buchung.verfallen", { label: "System" }, { anzahl: removed.length });
  }
  return removed.length;
}
