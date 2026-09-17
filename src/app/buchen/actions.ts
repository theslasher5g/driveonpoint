"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import {
  activePromotions,
  applyPromotions,
  createBooking,
  findSlots,
  lessonTypeBySlug,
} from "@/lib/booking";
import { verifySolution } from "@/lib/captcha";
import { env } from "@/lib/env";
import { escapeHtml, mailLayout, sendMail } from "@/lib/mail";
import { blockIp, blockedUntil, consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { site } from "@/lib/site";
import { formatDayLong, formatPrice } from "@/lib/time";

export type BookingState = { error?: string; fieldErrors?: Record<string, string> };

/**
 * Eingabeprüfung an der Systemgrenze.
 *
 * Alles wird begrenzt und auf Form geprüft. Gespeichert wird ausschliesslich,
 * was hier durchkommt — die Datenbankschicht arbeitet mit gebundenen
 * Parametern, sodass Inhalte nie als Befehl gelesen werden können.
 */
const schema = z.object({
  angebot: z.string().min(1).max(60),
  tag: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  zeit: z.string().regex(/^\d{2}:\d{2}$/, "Ungültige Uhrzeit."),
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(120, "Der Name ist zu lang."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(180, "Die Adresse ist zu lang.")
    .email("Diese Mailadresse stimmt nicht."),
  telefon: z
    .string()
    .trim()
    .min(6, "Bitte gib eine Telefonnummer an.")
    .max(30, "Die Nummer ist zu lang.")
    .regex(/^[0-9+().\s/-]+$/, "Die Nummer enthält unerlaubte Zeichen."),
  bemerkung: z.string().trim().max(500, "Die Bemerkung ist zu lang.").optional(),
  agb: z.literal("ja", { errorMap: () => ({ message: "Bitte bestätige die Bedingungen." }) }),
});

export async function createBookingAction(
  _previous: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const ip = await clientIp();

  if (await blockedUntil(ip)) {
    return { error: "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut." };
  }

  // Unsichtbares Feld. Menschen füllen es nicht aus, einfache Skripte schon.
  if ((formData.get("website") as string | null)?.length) {
    await blockIp(ip, 60, "Formularfalle bei Buchung ausgelöst");
    return { error: "Die Anfrage konnte nicht verarbeitet werden." };
  }

  const verdict = await consume(`buchung:${ip}`, 5, 3600);
  if (!verdict.ok) {
    await record("buchung.begrenzt", { label: "System" }, { ip });
    return {
      error: "Zu viele Buchungen von dieser Verbindung. Bitte versuche es in einer Stunde.",
    };
  }

  if (!verifySolution("buchung", formData.get("captcha") as string | null)) {
    return { error: "Die Sicherheitsprüfung ist nicht durchgelaufen. Bitte lade die Seite neu." };
  }

  const parsed = schema.safeParse({
    angebot: formData.get("angebot"),
    tag: formData.get("tag"),
    zeit: formData.get("zeit"),
    name: formData.get("name"),
    email: formData.get("email"),
    telefon: formData.get("telefon"),
    bemerkung: formData.get("bemerkung") || undefined,
    agb: formData.get("agb"),
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
  const lessonType = await lessonTypeBySlug(input.angebot);
  if (!lessonType || !lessonType.active) {
    return { error: "Dieses Angebot gibt es nicht mehr." };
  }

  // Der gewählte Termin wird gegen die tatsächliche Verfügbarkeit geprüft.
  // Ein manipuliertes Formular kann so keinen Termin ausserhalb der
  // Arbeitszeiten oder in einer Lücke erzwingen.
  const slots = await findSlots({ lessonType, fromDay: input.tag, days: 1 });
  const slot = slots.find((entry) => entry.day === input.tag && entry.time === input.zeit);
  if (!slot) {
    return { error: "Dieser Termin ist nicht mehr frei. Bitte wähle einen anderen." };
  }

  const priced = applyPromotions(lessonType, await activePromotions());

  const result = await createBooking({
    lessonType,
    staffId: slot.staffIds[0],
    startsAt: slot.startsAt,
    customerName: input.name,
    customerEmail: input.email,
    customerPhone: input.telefon,
    customerNote: input.bemerkung,
    priceRappen: priced.finalRappen,
    promotionLabel: priced.promotion?.label ?? null,
    retentionDays: env.retentionDays,
  });

  if ("error" in result) {
    return { error: result.error };
  }

  await record(
    "buchung.erstellt",
    { label: "Website" },
    { referenz: result.reference, angebot: lessonType.slug },
  );

  try {
    await sendConfirmation({
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
    // Der Termin steht bereits. Ein Mailproblem darf ihn nicht zurücknehmen —
    // die Bestätigungsseite zeigt die Angaben ohnehin an.
    console.error("Bestätigungsmail konnte nicht versendet werden:", error);
  }

  redirect(`/buchen/bestaetigt?ref=${encodeURIComponent(result.reference)}`);
}

async function sendConfirmation(details: {
  to: string;
  name: string;
  reference: string;
  cancelToken: string;
  lessonName: string;
  day: string;
  time: string;
  durationMinutes: number;
  priceRappen: number;
}): Promise<void> {
  const when = `${formatDayLong(details.day)}, ${details.time} Uhr`;
  const cancelUrl = `${env.appUrl}/absagen/${details.cancelToken}`;

  const text = [
    `Hallo ${details.name}`,
    "",
    `Dein Termin bei ${site.name} ist eingetragen:`,
    "",
    details.lessonName,
    `${when} (${details.durationMinutes} Minuten)`,
    `Preis: CHF ${formatPrice(details.priceRappen)}`,
    `Referenz: ${details.reference}`,
    "",
    `Treffpunkt: ${site.contact.street}, ${site.contact.zip} ${site.contact.city}`,
    "Einen abweichenden Treffpunkt im Einzugsgebiet vereinbaren wir telefonisch.",
    "",
    "Absagen bis 24 Stunden vorher ist kostenlos:",
    cancelUrl,
    "",
    `Fragen? ${site.contact.phone}`,
    "",
    `${site.legalName}, ${site.contact.street}, ${site.contact.zip} ${site.contact.city}`,
  ].join("\n");

  const html = mailLayout(
    "Dein Termin ist eingetragen",
    `<p style="margin:0 0 16px;">Hallo ${escapeHtml(details.name)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
  <tr><td style="padding:10px 0;border-bottom:1px solid #E8EAE5;font-size:14px;color:#5A6B82;width:38%;">Angebot</td>
      <td style="padding:10px 0;border-bottom:1px solid #E8EAE5;font-weight:700;">${escapeHtml(details.lessonName)}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E8EAE5;font-size:14px;color:#5A6B82;">Termin</td>
      <td style="padding:10px 0;border-bottom:1px solid #E8EAE5;font-weight:700;">${escapeHtml(when)}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E8EAE5;font-size:14px;color:#5A6B82;">Dauer</td>
      <td style="padding:10px 0;border-bottom:1px solid #E8EAE5;">${details.durationMinutes} Minuten</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E8EAE5;font-size:14px;color:#5A6B82;">Preis</td>
      <td style="padding:10px 0;border-bottom:1px solid #E8EAE5;">CHF ${formatPrice(details.priceRappen)}</td></tr>
  <tr><td style="padding:10px 0;font-size:14px;color:#5A6B82;">Referenz</td>
      <td style="padding:10px 0;font-weight:700;">${escapeHtml(details.reference)}</td></tr>
</table>
<p style="margin:0 0 8px;font-weight:700;">Treffpunkt</p>
<p style="margin:0 0 20px;color:#5A6B82;">${escapeHtml(site.contact.street)}, ${escapeHtml(site.contact.zip)} ${escapeHtml(site.contact.city)}<br>Einen abweichenden Treffpunkt im Einzugsgebiet vereinbaren wir telefonisch.</p>
<p style="margin:0 0 20px;">
  <a href="${escapeHtml(cancelUrl)}" style="display:inline-block;background:#0B4FD1;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;">Termin absagen</a>
</p>
<p style="margin:0;color:#5A6B82;font-size:14px;">Absagen bis 24 Stunden vor Beginn sind kostenlos. Fragen beantworten wir unter ${escapeHtml(site.contact.phone)}.</p>`,
  );

  await sendMail({
    to: details.to,
    subject: `Termin bestätigt — ${details.reference}`,
    text,
    html,
  });
}
