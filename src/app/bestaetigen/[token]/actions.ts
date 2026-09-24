"use server";

import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { record } from "@/lib/audit";
import {
  sendBookingConfirmation,
  sendMultiBookingConfirmation,
  sendNewBookingNotification,
  sendNewBookingsNotification,
} from "@/lib/booking-mail";
import { db } from "@/lib/db";
import { bookings, lessonTypes } from "@/lib/db/schema";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { zurichDay, zurichTime } from "@/lib/time";

/**
 * Bestätigung einer Online-Buchung über den Link aus der Mail.
 *
 * Erst hier wird der Termin verbindlich: Status auf "bestaetigt", dann
 * geht die eigentliche Bestätigung mit Absagelink und Kalenderdatei an die
 * Kundschaft und die Meldung ans eigene Postfach. Die Frist wird in derselben
 * Anweisung geprüft — ist sie abgelaufen, kann der Platz inzwischen an
 * jemand anderen gegangen sein, und der Termin darf nicht mehr aufleben.
 */
export async function confirmBookingAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (token.length < 20 || token.length > 100) redirect("/");

  const ip = await clientIp();
  const verdict = await consume(`bestaetigung:${ip}`, 20, 3600);
  if (!verdict.ok) redirect("/?fehler=zu-viele-anfragen");

  const now = new Date();
  const confirmed = await db
    .update(bookings)
    .set({ status: "bestaetigt", confirmedAt: now, confirmExpiresAt: null, updatedAt: now })
    .where(
      and(
        eq(bookings.confirmToken, token),
        eq(bookings.status, "angefragt"),
        gt(bookings.confirmExpiresAt, now),
      ),
    )
    .returning({
      reference: bookings.reference,
      cancelToken: bookings.cancelToken,
      startsAt: bookings.startsAt,
      lessonTypeId: bookings.lessonTypeId,
      priceRappen: bookings.priceRappen,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      customerNote: bookings.customerNote,
    });

  // Nichts bestätigt: schon erledigt, abgelaufen oder ein falscher Link.
  // Die Seite hinter demselben Link zeigt, welcher Fall es ist.
  if (confirmed.length === 0) redirect(`/bestaetigen/${encodeURIComponent(token)}`);

  confirmed.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const first = confirmed[0];

  await record(
    "buchung.bestaetigt",
    { label: "Kundschaft" },
    { referenzen: confirmed.map((entry) => entry.reference).join(", ") },
  );

  const [offering] = first.lessonTypeId
    ? await db
        .select({
          name: lessonTypes.name,
          durationMinutes: lessonTypes.durationMinutes,
          capacity: lessonTypes.capacity,
        })
        .from(lessonTypes)
        .where(eq(lessonTypes.id, first.lessonTypeId))
        .limit(1)
    : [];
  const lessonName = offering?.name ?? "Termin";
  const durationMinutes = offering?.durationMinutes ?? 45;
  // Ohne Angebot (gelöscht) im Zweifel als Einzellektion behandeln — das
  // zeigt "wird telefonisch vereinbart" statt einer erfundenen Adresse.
  const capacity = offering?.capacity ?? 1;

  const appointments = confirmed.map((entry) => ({
    day: zurichDay(entry.startsAt),
    time: zurichTime(entry.startsAt),
    reference: entry.reference,
    cancelToken: entry.cancelToken,
  }));

  // Ein Mailproblem darf die Bestätigung nicht zurücknehmen — die Seite
  // danach zeigt die Referenzen ohnehin an.
  if (first.customerEmail) {
    try {
      if (appointments.length === 1) {
        await sendBookingConfirmation({
          to: first.customerEmail,
          name: first.customerName ?? "",
          ...appointments[0],
          lessonName,
          durationMinutes,
          priceRappen: first.priceRappen,
          capacity,
        });
      } else {
        await sendMultiBookingConfirmation({
          to: first.customerEmail,
          name: first.customerName ?? "",
          lessonName,
          durationMinutes,
          priceRappen: first.priceRappen,
          booked: appointments,
          failedCount: 0,
        });
      }
    } catch (error) {
      console.error("Bestätigungsmail konnte nicht versendet werden:", error);
    }
  }

  try {
    const customer = {
      customerName: first.customerName ?? "",
      customerEmail: first.customerEmail ?? "",
      customerPhone: first.customerPhone ?? "",
      customerNote: first.customerNote ?? undefined,
    };
    if (appointments.length === 1) {
      await sendNewBookingNotification({ ...appointments[0], lessonName, ...customer });
    } else {
      await sendNewBookingsNotification({ lessonName, booked: appointments, ...customer });
    }
  } catch (error) {
    console.error("Benachrichtigung ans Postfach konnte nicht versendet werden:", error);
  }

  const refQuery = appointments
    .map((entry) => `ref=${encodeURIComponent(entry.reference)}`)
    .join("&");
  redirect(`/buchen/bestaetigt?${refQuery}`);
}
