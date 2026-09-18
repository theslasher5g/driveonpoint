"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { record } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/guard";
import { findSlots } from "@/lib/booking";
import { db } from "@/lib/db";
import { bookings, lessonTypes } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { escapeHtml, mailLayout, sendMail } from "@/lib/mail";
import { site } from "@/lib/site";
import { formatDayLong, zurichDay, zurichTime } from "@/lib/time";

/** Absage durch die Fahrschule, inklusive Benachrichtigung der Kundschaft. */
export async function cancelByStaffAction(formData: FormData): Promise<void> {
  const user = await assertPermission("kalender.verwalten");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Ungültiger Termin.");

  const [entry] = await db
    .select({
      reference: bookings.reference,
      startsAt: bookings.startsAt,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      lessonName: lessonTypes.name,
      status: bookings.status,
    })
    .from(bookings)
    .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!entry || entry.status === "abgesagt") return;

  await db
    .update(bookings)
    .set({ status: "abgesagt", updatedAt: new Date() })
    .where(eq(bookings.id, id));

  await record("buchung.abgesagt-intern", { id: user.id, label: user.name }, {
    referenz: entry.reference,
  });

  if (entry.customerEmail) {
    const when = `${formatDayLong(zurichDay(entry.startsAt))}, ${zurichTime(entry.startsAt)} Uhr`;
    try {
      await sendMail({
        to: entry.customerEmail,
        subject: `Termin abgesagt — ${entry.reference}`,
        text: [
          `Hallo ${entry.customerName ?? ""}`.trim(),
          "",
          `Wir mussten deinen Termin absagen:`,
          `${entry.lessonName ?? "Termin"}, ${when}`,
          "",
          "Es entstehen dir keine Kosten. Einen neuen Termin findest du hier:",
          `${site.domain}/buchen`,
          "",
          `Fragen? ${site.contact.phone}`,
        ].join("\n"),
        html: mailLayout(
          "Wir mussten deinen Termin absagen",
          `<p style="margin:0 0 16px;">Hallo ${escapeHtml(entry.customerName ?? "")}</p>
<p style="margin:0 0 16px;"><strong>${escapeHtml(entry.lessonName ?? "Termin")}</strong><br>${escapeHtml(when)}</p>
<p style="margin:0 0 16px;">Es entstehen dir keine Kosten. Melde dich bei uns, dann finden wir rasch einen Ersatztermin.</p>
<p style="margin:0;color:#515052;font-size:14px;">${escapeHtml(site.contact.phone)}</p>`,
        ),
      });
    } catch (error) {
      console.error("Absagemail konnte nicht versendet werden:", error);
    }
  }

  revalidatePath("/team/kalender");
  revalidatePath("/team");
}

export type RescheduleState = { error?: string };

/**
 * Verschiebt einen bestehenden Termin auf eine andere Zeit, statt ihn
 * abzusagen und neu anzulegen — Referenz und Absagelink bleiben dieselben.
 * Läuft durch dieselbe Verfügbarkeits- und Doppelbuchungsprüfung wie eine
 * neue Buchung, nur dass der Termin selbst dabei nicht als belegt zählt.
 */
export async function rescheduleBookingAction(
  _previous: RescheduleState,
  formData: FormData,
): Promise<RescheduleState> {
  const user = await assertPermission("kalender.verwalten");

  const id = String(formData.get("id") ?? "");
  const tag = String(formData.get("tag") ?? "");
  const zeit = String(formData.get("zeit") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Ungültiger Termin." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return { error: "Ungültiges Datum." };
  if (!/^\d{2}:\d{2}$/.test(zeit)) return { error: "Ungültige Uhrzeit." };

  const [entry] = await db
    .select({
      staffId: bookings.staffId,
      lessonTypeId: bookings.lessonTypeId,
      status: bookings.status,
      startsAt: bookings.startsAt,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      reference: bookings.reference,
    })
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (!entry || entry.status === "abgesagt" || !entry.staffId || !entry.lessonTypeId) {
    return { error: "Dieser Termin lässt sich nicht verschieben." };
  }

  const [lessonType] = await db
    .select()
    .from(lessonTypes)
    .where(eq(lessonTypes.id, entry.lessonTypeId))
    .limit(1);
  if (!lessonType) return { error: "Das Angebot zu diesem Termin gibt es nicht mehr." };

  // Dieselbe Prüfung wie bei einer neuen Buchung — nur zählt der eigene,
  // noch an der alten Zeit stehende Termin dabei nicht als Sperre.
  const slots = await findSlots({
    lessonType,
    fromDay: tag,
    days: 1,
    staffId: entry.staffId,
    excludeBookingId: id,
  });
  const slot = slots.find((candidate) => candidate.day === tag && candidate.time === zeit);
  if (!slot) {
    return { error: "Dieser Termin ist nicht mehr frei. Bitte wähle einen anderen." };
  }

  const purgeAfter = new Date(
    Math.max(slot.endsAt.getTime(), Date.now()) + env.retentionDays * 24 * 60 * 60 * 1000,
  );

  await db
    .update(bookings)
    .set({ startsAt: slot.startsAt, endsAt: slot.endsAt, purgeAfter, updatedAt: new Date() })
    .where(eq(bookings.id, id));

  const von = `${zurichDay(entry.startsAt)} ${zurichTime(entry.startsAt)}`;
  await record("buchung.verschoben", { id: user.id, label: user.name }, {
    referenz: entry.reference,
    von,
    auf: `${tag} ${zeit}`,
  });

  if (entry.customerEmail) {
    const when = `${formatDayLong(tag)}, ${zeit} Uhr`;
    try {
      await sendMail({
        to: entry.customerEmail,
        subject: `Termin verschoben — ${entry.reference}`,
        text: [
          `Hallo ${entry.customerName ?? ""}`.trim(),
          "",
          `Dein Termin bei ${site.name} wurde verschoben:`,
          "",
          `${lessonType.name}`,
          `Neu: ${when}`,
          "",
          `Referenz: ${entry.reference}`,
          "",
          `Fragen? ${site.contact.phone}`,
        ].join("\n"),
        html: mailLayout(
          "Dein Termin wurde verschoben",
          `<p style="margin:0 0 16px;">Hallo ${escapeHtml(entry.customerName ?? "")}</p>
<p style="margin:0 0 16px;"><strong>${escapeHtml(lessonType.name)}</strong><br>Neu: ${escapeHtml(when)}</p>
<p style="margin:0 0 16px;">Referenz: ${escapeHtml(entry.reference)}</p>
<p style="margin:0;color:#515052;font-size:14px;">Fragen beantworten wir unter ${escapeHtml(site.contact.phone)}.</p>`,
        ),
      });
    } catch (error) {
      console.error("Mail zum verschobenen Termin konnte nicht versendet werden:", error);
    }
  }

  revalidatePath("/team/kalender");
  revalidatePath("/team");
  redirect(`/team/kalender?woche=${tag}&verschoben=${encodeURIComponent(entry.reference)}`);
}
