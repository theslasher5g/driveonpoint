"use server";

import { z } from "zod";
import { verifySolution } from "@/lib/captcha";
import { escapeHtml, mailLayout, sendMail } from "@/lib/mail";
import { blockIp, blockedUntil, consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { site } from "@/lib/site";

export type ContactState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z.object({
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
    .max(30, "Die Nummer ist zu lang.")
    .regex(/^[0-9+().\s/-]*$/, "Die Nummer enthält unerlaubte Zeichen.")
    .optional()
    .or(z.literal("")),
  nachricht: z
    .string()
    .trim()
    .min(10, "Schreib bitte ein paar Worte mehr.")
    .max(2000, "Die Nachricht ist zu lang."),
});

export async function sendContactAction(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const ip = await clientIp();

  if (await blockedUntil(ip)) {
    return { error: "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut." };
  }

  if ((formData.get("website") as string | null)?.length) {
    await blockIp(ip, 60, "Formularfalle im Kontaktformular ausgelöst");
    return { error: "Die Anfrage konnte nicht verarbeitet werden." };
  }

  const verdict = await consume(`kontakt:${ip}`, 5, 3600);
  if (!verdict.ok) {
    return { error: "Zu viele Nachrichten von dieser Verbindung. Bitte versuche es später." };
  }

  if (!verifySolution("kontakt", formData.get("captcha") as string | null)) {
    return { error: "Die Sicherheitsprüfung ist nicht durchgelaufen. Bitte lade die Seite neu." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    telefon: formData.get("telefon") ?? "",
    nachricht: formData.get("nachricht"),
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

  try {
    await sendMail({
      to: site.contact.email,
      subject: `Anfrage über die Website — ${input.name}`,
      text: [
        `Name: ${input.name}`,
        `Mail: ${input.email}`,
        `Telefon: ${input.telefon || "keine Angabe"}`,
        "",
        input.nachricht,
      ].join("\n"),
      html: mailLayout(
        "Anfrage über die Website",
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
  <tr><td style="padding:8px 0;border-bottom:1px solid #EDE0C2;font-size:14px;color:#4A5F68;width:32%;">Name</td>
      <td style="padding:8px 0;border-bottom:1px solid #EDE0C2;font-weight:700;">${escapeHtml(input.name)}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #EDE0C2;font-size:14px;color:#4A5F68;">Mail</td>
      <td style="padding:8px 0;border-bottom:1px solid #EDE0C2;">${escapeHtml(input.email)}</td></tr>
  <tr><td style="padding:8px 0;font-size:14px;color:#4A5F68;">Telefon</td>
      <td style="padding:8px 0;">${escapeHtml(input.telefon || "keine Angabe")}</td></tr>
</table>
<p style="margin:0;white-space:pre-wrap;">${escapeHtml(input.nachricht)}</p>`,
      ),
    });
  } catch (error) {
    console.error("Kontaktanfrage konnte nicht versendet werden:", error);
    return {
      error: `Die Nachricht konnte nicht zugestellt werden. Ruf uns bitte an: ${site.contact.phone}`,
    };
  }

  // Eingangsbestätigung an die absendende Person — nur, wenn der Versand
  // an uns geklappt hat.
  try {
    await sendMail({
      to: input.email,
      subject: "Deine Anfrage ist angekommen",
      text: [
        `Hallo ${input.name}`,
        "",
        `Wir haben deine Nachricht erhalten und melden uns innert eines Werktags.`,
        "",
        "Deine Nachricht:",
        input.nachricht,
        "",
        `${site.legalName}, ${site.contact.phone}`,
      ].join("\n"),
      html: mailLayout(
        "Deine Anfrage ist angekommen",
        `<p style="margin:0 0 16px;">Hallo ${escapeHtml(input.name)}</p>
<p style="margin:0 0 16px;">Wir haben deine Nachricht erhalten und melden uns innert eines Werktags.</p>
<p style="margin:0 0 8px;font-weight:700;">Deine Nachricht</p>
<p style="margin:0;white-space:pre-wrap;color:#4A5F68;">${escapeHtml(input.nachricht)}</p>`,
      ),
    });
  } catch (error) {
    console.error("Eingangsbestätigung konnte nicht versendet werden:", error);
  }

  return { ok: true };
}
