import "server-only";
import { env } from "./env";
import { escapeHtml, mailLayout, sendMail } from "./mail";
import { site } from "./site";
import { formatDayLong, formatPrice } from "./time";

/**
 * Bestätigungsmail für einen neuen Termin.
 *
 * Gemeinsam für die öffentliche Buchung und das manuelle Erfassen im
 * Team-Bereich (etwa nach einem Telefonanruf) — beide legen denselben
 * Termin an und die Kundschaft soll dieselbe Bestätigung bekommen, egal
 * auf welchem Weg der Termin entstanden ist.
 */
export async function sendBookingConfirmation(details: {
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
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;width:38%;">Angebot</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-weight:700;">${escapeHtml(details.lessonName)}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">Termin</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-weight:700;">${escapeHtml(when)}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">Dauer</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;">${details.durationMinutes} Minuten</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">Preis</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;">CHF ${formatPrice(details.priceRappen)}</td></tr>
  <tr><td style="padding:10px 0;font-size:14px;color:#515052;">Referenz</td>
      <td style="padding:10px 0;font-weight:700;">${escapeHtml(details.reference)}</td></tr>
</table>
<p style="margin:0 0 8px;font-weight:700;">Treffpunkt</p>
<p style="margin:0 0 20px;color:#515052;">${escapeHtml(site.contact.street)}, ${escapeHtml(site.contact.zip)} ${escapeHtml(site.contact.city)}<br>Einen abweichenden Treffpunkt im Einzugsgebiet vereinbaren wir telefonisch.</p>
<p style="margin:0 0 20px;">
  <a href="${escapeHtml(cancelUrl)}" style="display:inline-block;background:#FF312E;color:#000103;text-decoration:none;font-weight:700;padding:13px 22px;">Termin absagen</a>
</p>
<p style="margin:0;color:#515052;font-size:14px;">Absagen bis 24 Stunden vor Beginn sind kostenlos. Fragen beantworten wir unter ${escapeHtml(site.contact.phone)}.</p>`,
  );

  await sendMail({
    to: details.to,
    subject: `Termin bestätigt — ${details.reference}`,
    text,
    html,
  });
}

/**
 * Benachrichtigung ans eigene Postfach bei einer neuen Online-Buchung.
 *
 * Nur für den öffentlichen Buchungsweg: trägt jemand aus dem Team selbst
 * einen Termin ein (Anruf, Laufkundschaft), weiss die Person es bereits —
 * eine Mail darüber wäre nur Rauschen. Hier dagegen entsteht der Termin
 * ohne dass das Team etwas davon mitbekommt, ausser es prüft den Kalender.
 */
export async function sendNewBookingNotification(details: {
  reference: string;
  lessonName: string;
  day: string;
  time: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNote?: string;
}): Promise<void> {
  const when = `${formatDayLong(details.day)}, ${details.time} Uhr`;

  const text = [
    `Neue Online-Buchung: ${details.lessonName}`,
    `${when}`,
    "",
    `Name: ${details.customerName}`,
    `Telefon: ${details.customerPhone}`,
    `Mail: ${details.customerEmail}`,
    ...(details.customerNote ? [`Bemerkung: ${details.customerNote}`] : []),
    "",
    `Referenz: ${details.reference}`,
  ].join("\n");

  const html = mailLayout(
    "Neue Online-Buchung",
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;width:38%;">Angebot</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-weight:700;">${escapeHtml(details.lessonName)}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">Termin</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-weight:700;">${escapeHtml(when)}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">Name</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;">${escapeHtml(details.customerName)}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">Telefon</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;"><a href="tel:${escapeHtml(details.customerPhone)}">${escapeHtml(details.customerPhone)}</a></td></tr>
  <tr><td style="padding:10px 0;${details.customerNote ? "border-bottom:1px solid #D6D6D2;" : ""}font-size:14px;color:#515052;">Mail</td>
      <td style="padding:10px 0;${details.customerNote ? "border-bottom:1px solid #D6D6D2;" : ""}"><a href="mailto:${escapeHtml(details.customerEmail)}">${escapeHtml(details.customerEmail)}</a></td></tr>
  ${
    details.customerNote
      ? `<tr><td style="padding:10px 0;font-size:14px;color:#515052;">Bemerkung</td>
      <td style="padding:10px 0;">${escapeHtml(details.customerNote)}</td></tr>`
      : ""
  }
</table>
<p style="margin:0;color:#515052;font-size:14px;">Referenz ${escapeHtml(details.reference)} — steht bereits im Kalender.</p>`,
  );

  await sendMail({
    to: site.contact.email,
    subject: `Neue Buchung — ${details.reference}`,
    text,
    html,
  });
}
