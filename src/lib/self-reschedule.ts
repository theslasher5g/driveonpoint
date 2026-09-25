import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { BOOKING_HORIZON_DAYS, findSlots } from "./booking";
import { db } from "./db";
import { bookings, lessonTypes, staff } from "./db/schema";
import { todayInZurich } from "./time";

/**
 * Verschieben durch die Kundschaft selbst, über den Link aus der Mail
 * (derselbe Schlüssel wie beim Absagen). Seite und Action unter
 * app/verschieben teilen sich diese Prüfungen.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Der Termin zum Link — nur künftige, mit Angebot. */
export async function bookingForToken(token: string) {
  if (token.length < 20 || token.length > 100) return null;
  const [row] = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      status: bookings.status,
      startsAt: bookings.startsAt,
      staffId: bookings.staffId,
      lessonTypeId: bookings.lessonTypeId,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      cancelToken: bookings.cancelToken,
      staffName: staff.name,
    })
    .from(bookings)
    .leftJoin(staff, eq(staff.id, bookings.staffId))
    .where(and(eq(bookings.cancelToken, token), gt(bookings.startsAt, new Date())))
    .limit(1);
  if (!row?.lessonTypeId) return null;
  const [lessonType] = await db
    .select()
    .from(lessonTypes)
    .where(eq(lessonTypes.id, row.lessonTypeId))
    .limit(1);
  return lessonType ? { ...row, lessonType } : null;
}

/** Kostenlos verschieben geht wie kostenlos absagen: bis 24 Stunden vorher. */
export function stillMovable(startsAt: Date): boolean {
  return startsAt.getTime() - Date.now() > DAY_MS;
}

/**
 * Die Zeiten, auf die sich der Termin legen lässt. Einzellektionen bleiben
 * bei derselben Fahrlehrperson; bei Kursen zählt jeder andere Kurstermin.
 */
export type TokenBooking = NonNullable<Awaited<ReturnType<typeof bookingForToken>>>;

export async function movableSlots(booking: TokenBooking) {
  const single = booking.lessonType.capacity <= 1;
  if (single && !booking.staffId) return [];
  const slots = await findSlots({
    lessonType: booking.lessonType,
    fromDay: todayInZurich(),
    days: BOOKING_HORIZON_DAYS,
    staffId: single ? booking.staffId! : undefined,
    excludeBookingId: booking.id,
  });
  return slots.filter((slot) => slot.startsAt.getTime() !== booking.startsAt.getTime());
}

