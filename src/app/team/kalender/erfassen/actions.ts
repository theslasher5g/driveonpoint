"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import {
  activePromotions,
  applyPromotions,
  createBooking,
  findSlots,
  lessonTypeBySlug,
} from "@/lib/booking";
import { sendBookingConfirmation } from "@/lib/booking-mail";
import { env } from "@/lib/env";

export type ManualBookingState = { error?: string; fieldErrors?: Record<string, string> };

const schema = z.object({
  angebot: z.string().min(1).max(60),
  person: z.string().uuid(),
  tag: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  zeit: z.string().regex(/^\d{2}:\d{2}$/, "Ungültige Uhrzeit."),
  name: z.string().trim().min(2, "Bitte den Namen angeben.").max(120, "Der Name ist zu lang."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(180, "Die Adresse ist zu lang.")
    .email("Diese Mailadresse stimmt nicht.")
    .optional()
    .or(z.literal("")),
  telefon: z
    .string()
    .trim()
    .min(6, "Bitte eine Telefonnummer angeben.")
    .max(30, "Die Nummer ist zu lang.")
    .regex(/^[0-9+().\s/-]+$/, "Die Nummer enthält unerlaubte Zeichen."),
  bemerkung: z.string().trim().max(500, "Die Bemerkung ist zu lang.").optional(),
});

/**
 * Termin von Hand erfassen — für Anrufe und Laufkundschaft, die nicht über
 * die öffentliche Buchungsseite kommen. Läuft durch dieselbe Verfügbarkeits-
 * und Doppelbuchungsprüfung wie eine Online-Buchung, nur ohne Captcha und
 * AGB-Häkchen: die anmeldende Person vertritt hier das Geschäft, nicht sich
 * selbst.
 */
export async function createManualBookingAction(
  _previous: ManualBookingState,
  formData: FormData,
): Promise<ManualBookingState> {
  const staffUser = await assertPermission("kalender.verwalten");

  const parsed = schema.safeParse({
    angebot: formData.get("angebot"),
    person: formData.get("person"),
    tag: formData.get("tag"),
    zeit: formData.get("zeit"),
    name: formData.get("name"),
    email: formData.get("email") || "",
    telefon: formData.get("telefon"),
    bemerkung: formData.get("bemerkung") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Bitte prüfe die markierten Felder.", fieldErrors };
  }

  const input = parsed.data;

  // Nur wer den ganzen Kalender sieht, darf für eine andere Person eintragen.
  if (input.person !== staffUser.id && !can(staffUser.role, "verfuegbarkeit.alle")) {
    return { error: "Du darfst nur für dich selbst einen Termin erfassen." };
  }

  const lessonType = await lessonTypeBySlug(input.angebot);
  if (!lessonType || !lessonType.active) {
    return { error: "Dieses Angebot gibt es nicht mehr." };
  }

  // Dieselbe Prüfung wie bei der Online-Buchung: der Termin muss tatsächlich
  // noch frei sein, unabhängig davon, was das Formular zuvor anzeigte.
  const slots = await findSlots({ lessonType, fromDay: input.tag, days: 1, staffId: input.person });
  const slot = slots.find((entry) => entry.day === input.tag && entry.time === input.zeit);
  if (!slot) {
    return { error: "Dieser Termin ist nicht mehr frei. Bitte wähle einen anderen." };
  }

  const priced = applyPromotions(lessonType, await activePromotions());

  const result = await createBooking({
    lessonType,
    staffId: input.person,
    startsAt: slot.startsAt,
    customerName: input.name,
    customerEmail: input.email ?? "",
    customerPhone: input.telefon,
    customerNote: input.bemerkung,
    priceRappen: priced.finalRappen,
    promotionLabel: priced.promotion?.label ?? null,
    retentionDays: env.retentionDays,
  });

  if ("error" in result) {
    return { error: result.error };
  }

  await record("buchung.manuell-erstellt", { id: staffUser.id, label: staffUser.name }, {
    referenz: result.reference,
    angebot: lessonType.slug,
    fuer: input.person,
  });

  if (input.email) {
    try {
      await sendBookingConfirmation({
        to: input.email,
        name: input.name,
        reference: result.reference,
        cancelToken: result.cancelToken,
        lessonName: lessonType.name,
        day: input.tag,
        time: input.zeit,
        durationMinutes: lessonType.durationMinutes,
        priceRappen: priced.finalRappen,
      });
    } catch (error) {
      console.error("Bestätigungsmail konnte nicht versendet werden:", error);
    }
  }

  // Ausdrücklich in die Wochenansicht: dort steht der neue Termin mit allen
  // Angaben. Ohne `ansicht` landet man im Monat, der den Tag nicht anspringt.
  redirect(
    `/team/kalender?ansicht=woche&woche=${input.tag}&erfasst=${encodeURIComponent(result.reference)}`,
  );
}
