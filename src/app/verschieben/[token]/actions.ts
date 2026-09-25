"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { record } from "@/lib/audit";
import { moveBooking } from "@/lib/booking";
import { sendRescheduleConfirmation, sendRescheduleNotification } from "@/lib/booking-mail";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { consume } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/lib/request";
import { bookingForToken, movableSlots, stillMovable } from "@/lib/self-reschedule";
import { notifyWaitlist, removeFromWaitlist } from "@/lib/waitlist";

export type SelfRescheduleState = { error?: string };

export async function selfRescheduleAction(
  _previous: SelfRescheduleState,
  formData: FormData,
): Promise<SelfRescheduleState> {
  const token = String(formData.get("token") ?? "");
  const tag = String(formData.get("tag") ?? "");
  const zeit = String(formData.get("zeit") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag) || !/^\d{2}:\d{2}$/.test(zeit)) {
    return { error: "Bitte wähle eine Zeit aus der Liste." };
  }

  const ip = await clientIp();
  const verdict = await consume(`verschieben:${ip}`, 20, 3600);
  if (!verdict.ok) return { error: "Zu viele Versuche. Bitte versuche es in einer Stunde erneut." };

  const booking = await bookingForToken(token);
  if (!booking || booking.status !== "bestaetigt") {
    return { error: "Dieser Termin lässt sich nicht mehr verschieben." };
  }
  if (!stillMovable(booking.startsAt)) {
    return { error: "Weniger als 24 Stunden vor dem Termin geht das nur noch telefonisch." };
  }

  const slot = (await movableSlots(booking)).find((entry) => entry.day === tag && entry.time === zeit);
  if (!slot) return { error: "Diese Zeit ist nicht mehr frei. Bitte wähle eine andere." };

  const staffId =
    booking.staffId && slot.staffIds.includes(booking.staffId) ? booking.staffId : slot.staffIds[0];
  const moved = await moveBooking({
    bookingId: booking.id,
    lessonType: booking.lessonType,
    staffId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    second: slot.second,
    retentionDays: env.retentionDays,
    movedBy: "kundschaft",
  });
  if ("error" in moved) return { error: moved.error };

  // Kurs: beim alten Termin ist ein Platz frei, beim neuen steht die Person
  // nicht mehr auf der Warteliste.
  await notifyWaitlist(booking.lessonType.id, booking.startsAt);
  await removeFromWaitlist(booking.lessonType.id, slot.startsAt, booking.customerEmail);

  await record("buchung.selbst-verschoben", { label: "Kundschaft" }, {
    referenz: booking.reference,
    auf: `${tag} ${zeit}`,
    adresse: hashIp(ip),
  });

  const [newStaff] =
    staffId !== booking.staffId
      ? await db.select({ name: staff.name }).from(staff).where(eq(staff.id, staffId)).limit(1)
      : [{ name: booking.staffName }];

  try {
    if (booking.customerEmail) {
      await sendRescheduleConfirmation({
        to: booking.customerEmail,
        name: booking.customerName ?? "",
        reference: booking.reference,
        cancelToken: booking.cancelToken,
        lessonName: booking.lessonType.name,
        day: tag,
        time: zeit,
        previousStartsAt: booking.startsAt,
        durationMinutes: booking.lessonType.durationMinutes,
        capacity: booking.lessonType.capacity,
        byCustomer: true,
        ...(booking.lessonType.capacity > 1 ? { endsAt: slot.endsAt, second: slot.second } : {}),
      });
    }
  } catch (error) {
    console.error("Bestätigung zum Verschieben konnte nicht versendet werden:", error);
  }
  try {
    await sendRescheduleNotification({
      reference: booking.reference,
      lessonName: booking.lessonType.name,
      previousStartsAt: booking.startsAt,
      startsAt: slot.startsAt,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      staffName: newStaff?.name ?? null,
    });
  } catch (error) {
    console.error("Meldung zum Verschieben konnte nicht versendet werden:", error);
  }

  redirect(`/verschieben/${token}?verschoben=1`);
}
