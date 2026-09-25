"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { record } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { findSlots, moveBooking } from "@/lib/booking";
import { sendRescheduleConfirmation } from "@/lib/booking-mail";
import { cancelCourseSession } from "@/lib/course-cancel";
import { moveCourseSession } from "@/lib/course-move";
import { requestCourseReviews, requestReviews } from "@/lib/reviews";
import { notifyWaitlist, removeFromWaitlist } from "@/lib/waitlist";
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
      lessonTypeId: bookings.lessonTypeId,
      status: bookings.status,
    })
    .from(bookings)
    .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!entry || entry.status === "abgesagt") return;

  const now = new Date();
  await db
    .update(bookings)
    .set({ status: "abgesagt", cancelledAt: now, cancelledBy: "fahrschule", updatedAt: now })
    .where(eq(bookings.id, id));

  // Ein Platz im Kurs ist frei — die Warteliste erfährt es.
  await notifyWaitlist(entry.lessonTypeId, entry.startsAt);

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

/**
 * Markiert einen begonnenen Termin als "nicht erschienen" — oder nimmt die
 * Markierung zurück, falls sie versehentlich gesetzt wurde. Laut AGB ist ein
 * solcher Termin verrechenbar; die Buchhaltung führt ihn deshalb getrennt
 * vom Umsatz auf, statt ihn als erbracht zu zählen.
 *
 * Darf auch die Fahrlehrperson für ihre eigenen Termine: sie wartet am
 * Treffpunkt und weiss es als Erste.
 */
export async function toggleNoShowAction(formData: FormData): Promise<void> {
  const user = await assertPermission("kalender.ansehen");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Ungültiger Termin.");

  const [entry] = await db
    .select({
      reference: bookings.reference,
      startsAt: bookings.startsAt,
      status: bookings.status,
      noShowAt: bookings.noShowAt,
      staffId: bookings.staffId,
    })
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (!entry) return;
  if (!can(user.role, "kalender.verwalten") && entry.staffId !== user.id) return;

  // Vor Beginn lässt sich noch nicht sagen, ob jemand kommt.
  if (!entry || entry.status === "abgesagt" || entry.status === "angefragt") return;
  if (entry.startsAt.getTime() > Date.now()) return;

  const now = new Date();
  await db
    .update(bookings)
    .set({ noShowAt: entry.noShowAt ? null : now, updatedAt: now })
    .where(eq(bookings.id, id));

  await record(
    entry.noShowAt ? "buchung.erschienen" : "buchung.nicht-erschienen",
    { id: user.id, label: user.name },
    { referenz: entry.reference },
  );

  revalidatePath("/team/kalender");
  revalidatePath("/team/buchhaltung");
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
      cancelToken: bookings.cancelToken,
    })
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (!entry || entry.status === "abgesagt" || !entry.staffId || !entry.lessonTypeId) {
    return { error: "Dieser Termin lässt sich nicht verschieben." };
  }
  // Eine Online-Anfrage ohne Bestätigung verfällt ohnehin; verschoben bekäme
  // die Kundschaft eine Mail mit Absagelink zu einem Termin, den sie nie
  // bestätigt hat.
  if (entry.status === "angefragt") {
    return { error: "Diese Anfrage ist noch nicht per Mail bestätigt und lässt sich nicht verschieben." };
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
    ignoreLeadTime: true,
  });
  const slot = slots.find((candidate) => candidate.day === tag && candidate.time === zeit);
  if (!slot) {
    return { error: "Dieser Termin ist nicht mehr frei. Bitte wähle einen anderen." };
  }

  // Unter derselben Sperre wie eine neue Buchung — zwischen der Auswahl und
  // dem Klick kann eine Online-Buchung den Platz genommen haben.
  const moved = await moveBooking({
    bookingId: id,
    lessonType,
    staffId: entry.staffId,
    startsAt: slot.startsAt,
    retentionDays: env.retentionDays,
    movedBy: "fahrschule",
  });
  if ("error" in moved) return { error: moved.error };

  // Beim alten Kurstermin ist jetzt ein Platz frei; beim neuen steht die
  // Person nicht mehr auf der Warteliste.
  await notifyWaitlist(entry.lessonTypeId, entry.startsAt);
  await removeFromWaitlist(entry.lessonTypeId, slot.startsAt, entry.customerEmail);

  const von = `${zurichDay(entry.startsAt)} ${zurichTime(entry.startsAt)}`;
  await record("buchung.verschoben", { id: user.id, label: user.name }, {
    referenz: entry.reference,
    von,
    auf: `${tag} ${zeit}`,
  });

  if (entry.customerEmail) {
    try {
      await sendRescheduleConfirmation({
        to: entry.customerEmail,
        name: entry.customerName ?? "",
        reference: entry.reference,
        cancelToken: entry.cancelToken,
        lessonName: lessonType.name,
        day: tag,
        time: zeit,
        previousStartsAt: entry.startsAt,
        durationMinutes: lessonType.durationMinutes,
        capacity: lessonType.capacity,
        byCustomer: false,
      });
    } catch (error) {
      console.error("Mail zum verschobenen Termin konnte nicht versendet werden:", error);
    }
  }

  revalidatePath("/team/kalender");
  revalidatePath("/team");
  redirect(
    `/team/kalender?ansicht=woche&woche=${tag}&verschoben=${encodeURIComponent(entry.reference)}`,
  );
}

export type CourseCancelState = { error?: string };

/**
 * Sagt einen ganzen Kurstermin ab: alle Angemeldeten und die Warteliste
 * bekommen eine Mail, der Termin verschwindet aus der Verfügbarkeit.
 * Ausgelöst von einer beliebigen Buchung dieses Termins.
 */
export async function cancelCourseAction(
  _previous: CourseCancelState,
  formData: FormData,
): Promise<CourseCancelState> {
  const user = await assertPermission("kalender.verwalten");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Ungültiger Termin." };
  const message = String(formData.get("nachricht") ?? "").trim().slice(0, 500) || null;

  const [entry] = await db
    .select({
      lessonTypeId: bookings.lessonTypeId,
      startsAt: bookings.startsAt,
      capacity: lessonTypes.capacity,
      lessonName: lessonTypes.name,
    })
    .from(bookings)
    .innerJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!entry || !entry.lessonTypeId || entry.capacity <= 1) {
    return { error: "Das ist kein Kurstermin." };
  }
  if (entry.startsAt.getTime() <= Date.now()) {
    return { error: "Der Kurs hat schon begonnen und lässt sich nicht mehr absagen." };
  }

  const result = await cancelCourseSession({
    lessonTypeId: entry.lessonTypeId,
    startsAt: entry.startsAt,
    message,
  });

  const day = zurichDay(entry.startsAt);
  await record("kurs.abgesagt", { id: user.id, label: user.name }, {
    angebot: entry.lessonName,
    termin: `${day} ${zurichTime(entry.startsAt)}`,
    referenzen: result.cancelled,
    warteliste: result.waitlist,
  });

  revalidatePath("/team/kalender");
  revalidatePath("/team");
  redirect(
    `/team/kalender?ansicht=woche&woche=${day}&kursAbgesagt=${result.cancelled.length}` +
      (result.mailsFailed > 0 ? `&mailFehler=${result.mailsFailed}` : ""),
  );
}

export type CourseMoveState = { error?: string };

/**
 * Legt einen ganzen Kurstermin auf ein anderes Datum: Kurstermin,
 * Anmeldungen und Warteliste ziehen mit, alle bekommen eine Mail.
 */
export async function moveCourseAction(
  _previous: CourseMoveState,
  formData: FormData,
): Promise<CourseMoveState> {
  const user = await assertPermission("kalender.verwalten");

  const id = String(formData.get("id") ?? "");
  const tag = String(formData.get("tag") ?? "");
  const zeit = String(formData.get("zeit") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Ungültiger Termin." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return { error: "Bitte ein Datum wählen." };
  if (!/^\d{2}:\d{2}$/.test(zeit)) return { error: "Bitte eine Uhrzeit wählen." };
  const message = String(formData.get("nachricht") ?? "").trim().slice(0, 500) || null;

  const [entry] = await db
    .select({
      lessonTypeId: bookings.lessonTypeId,
      startsAt: bookings.startsAt,
      capacity: lessonTypes.capacity,
      lessonName: lessonTypes.name,
    })
    .from(bookings)
    .innerJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!entry || !entry.lessonTypeId || entry.capacity <= 1) {
    return { error: "Das ist kein Kurstermin." };
  }
  if (entry.startsAt.getTime() <= Date.now()) {
    return { error: "Der Kurs hat schon begonnen und lässt sich nicht mehr verschieben." };
  }

  const result = await moveCourseSession({
    lessonTypeId: entry.lessonTypeId,
    startsAt: entry.startsAt,
    newDay: tag,
    newTime: zeit,
    message,
  });
  if ("error" in result) return { error: result.error };

  await record("kurs.verschoben", { id: user.id, label: user.name }, {
    angebot: entry.lessonName,
    von: `${zurichDay(entry.startsAt)} ${zurichTime(entry.startsAt)}`,
    auf: `${tag} ${zeit}`,
    referenzen: result.moved,
    warteliste: result.waitlist,
  });

  revalidatePath("/team/kalender");
  revalidatePath("/team");
  redirect(
    `/team/kalender?ansicht=woche&woche=${tag}&kursVerschoben=${result.moved.length}` +
      (result.mailsFailed > 0 ? `&mailFehler=${result.mailsFailed}` : ""),
  );
}

/**
 * Bitte um eine Google-Bewertung: für einen Termin (etwa rund um die
 * Prüfungsfahrt) oder für alle eines Kurstermins nach dem letzten Abend.
 * Geht nur an Kundschaft mit Einverständnis, jede Adresse höchstens einmal
 * (lib/reviews.ts). Einzelne eigene Termine darf auch die Fahrlehrperson.
 */
export async function requestReviewAction(formData: FormData): Promise<void> {
  const user = await assertPermission("kalender.ansehen");
  const id = String(formData.get("id") ?? "");
  const scope = formData.get("umfang") === "kurs" ? "kurs" : "termin";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const [entry] = await db
    .select({ staffId: bookings.staffId, startsAt: bookings.startsAt, reference: bookings.reference })
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);
  if (!entry) return;
  const manages = can(user.role, "kalender.verwalten");
  if (!manages && (scope === "kurs" || entry.staffId !== user.id)) return;

  const outcome = scope === "kurs" ? await requestCourseReviews(id) : await requestReviews([id]);
  if (!outcome) return;

  await record("bewertung.angefragt", { id: user.id, label: user.name }, {
    referenz: entry.reference,
    umfang: scope,
    gesendet: outcome.sent,
  });

  revalidatePath("/team/kalender");
  const skipped = outcome.noConsent + outcome.noEmail + outcome.alreadyAsked + outcome.notEligible;
  redirect(
    `/team/kalender?ansicht=woche&woche=${zurichDay(entry.startsAt)}&bewertung=${outcome.sent}-${outcome.noConsent}-${outcome.alreadyAsked}-${skipped - outcome.noConsent - outcome.alreadyAsked}-${outcome.failed}`,
  );
}
