"use server";

import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { record } from "@/lib/audit";
import { cancellationIsChargeable } from "@/lib/booking";
import { sendCancellationNotification } from "@/lib/booking-mail";
import { db } from "@/lib/db";
import { bookings, lessonTypes } from "@/lib/db/schema";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { notifyWaitlist } from "@/lib/waitlist";

/**
 * Absage über den Link aus der Bestätigungsmail.
 *
 * Der Token ist der einzige Nachweis, deshalb wird er nur mit dem Termin
 * zusammen abgefragt und nach der Absage entwertet: ein zweites Mal soll
 * derselbe Link nichts mehr auslösen.
 */
export async function cancelBookingAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (token.length < 20 || token.length > 100) redirect("/");

  const ip = await clientIp();
  const verdict = await consume(`absage:${ip}`, 20, 3600);
  if (!verdict.ok) redirect("/?fehler=zu-viele-anfragen");

  const now = new Date();
  const [cancelled] = await db
    .update(bookings)
    .set({
      status: "abgesagt",
      cancelledBy: "kundschaft",
      cancelToken: `abgesagt:${crypto.randomUUID()}`,
      cancelledAt: now,
      updatedAt: now,
    })
    .where(and(eq(bookings.cancelToken, token), gt(bookings.startsAt, new Date())))
    .returning({
      reference: bookings.reference,
      startsAt: bookings.startsAt,
      lessonTypeId: bookings.lessonTypeId,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      movedBy: bookings.movedBy,
    });

  if (cancelled) {
    await record("buchung.abgesagt", { label: "Kundschaft" }, { referenz: cancelled.reference });
    await notifyWaitlist(cancelled.lessonTypeId, cancelled.startsAt);

    const [offering] = cancelled.lessonTypeId
      ? await db
          .select({ name: lessonTypes.name })
          .from(lessonTypes)
          .where(eq(lessonTypes.id, cancelled.lessonTypeId))
          .limit(1)
      : [];

    try {
      await sendCancellationNotification({
        reference: cancelled.reference,
        lessonName: offering?.name ?? "Termin",
        startsAt: cancelled.startsAt,
        customerName: cancelled.customerName,
        customerPhone: cancelled.customerPhone,
        lateCancellation: cancellationIsChargeable(cancelled, now),
      });
    } catch (error) {
      // Die Absage steht bereits; ein Mailproblem darf sie nicht zurücknehmen.
      console.error("Absage-Benachrichtigung konnte nicht versendet werden:", error);
    }
  }

  redirect("/absagen/erledigt");
}
