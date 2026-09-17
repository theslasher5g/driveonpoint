"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { record } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { bookings, lessonTypes } from "@/lib/db/schema";
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
<p style="margin:0;color:#6C6C74;font-size:14px;">${escapeHtml(site.contact.phone)}</p>`,
        ),
      });
    } catch (error) {
      console.error("Absagemail konnte nicht versendet werden:", error);
    }
  }

  revalidatePath("/team/kalender");
  revalidatePath("/team");
}
