"use server";

import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { record } from "@/lib/audit";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

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

  const [cancelled] = await db
    .update(bookings)
    .set({
      status: "abgesagt",
      cancelToken: `abgesagt:${crypto.randomUUID()}`,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.cancelToken, token), gt(bookings.startsAt, new Date())))
    .returning({ reference: bookings.reference });

  if (cancelled) {
    await record("buchung.abgesagt", { label: "Kundschaft" }, { referenz: cancelled.reference });
  }

  redirect("/absagen/erledigt");
}
