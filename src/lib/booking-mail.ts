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

export type BookedAppointment = { day: string; time: string; reference: string; cancelToken: string };

/**
 * Bestätigungsmail für mehrere gleichzeitig gebuchte Fahrstunden — heute um
 * 8, 9 und 10 Uhr, oder verteilt auf mehrere Tage. Jeder Termin bleibt eine
 * eigene Buchung mit eigenem Absagelink; die Mail fasst sie nur zusammen,
 * damit die Kundschaft nicht für jeden Termin eine eigene Mail bekommt.
 */
export async function sendMultiBookingConfirmation(details: {
  to: string;
  name: string;
  lessonName: string;
  durationMinutes: number;
  priceRappen: number;
  booked: BookedAppointment[];
  failedCount: number;
}): Promise<void> {
  const totalRappen = details.priceRappen * details.booked.length;
  const sorted = [...details.booked].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));

  const text = [
    `Hallo ${details.name}`,
    "",
    `${details.booked.length} Termine bei ${site.name} sind eingetragen:`,
    "",
    ...sorted.flatMap((b) => [
      `${formatDayLong(b.day)}, ${b.time} Uhr — ${details.lessonName} (Referenz ${b.reference})`,
      `Absagen: ${env.appUrl}/absagen/${b.cancelToken}`,
      "",
    ]),
    `Gesamtpreis: CHF ${formatPrice(totalRappen)}`,
    ...(details.failedCount > 0
      ? [
          "",
          `${details.failedCount} der gewählten Termine ${details.failedCount === 1 ? "war" : "waren"} leider nicht mehr frei und ${details.failedCount === 1 ? "ist" : "sind"} nicht dabei.`,
        ]
      : []),
    "",
    `Treffpunkt: ${site.contact.street}, ${site.contact.zip} ${site.contact.city}`,
    "Einen abweichenden Treffpunkt im Einzugsgebiet vereinbaren wir telefonisch.",
    "",
    "Jeder Termin ist einzeln bis 24 Stunden vorher kostenlos absagbar, über den jeweiligen Link oben.",
    "",
    `Fragen? ${site.contact.phone}`,
    "",
    `${site.legalName}, ${site.contact.street}, ${site.contact.zip} ${site.contact.city}`,
  ].join("\n");

  const rows = sorted
    .map(
      (b) => `<tr>
  <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-weight:700;">${escapeHtml(formatDayLong(b.day))}, ${escapeHtml(b.time)} Uhr</td>
  <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">${escapeHtml(b.reference)}</td>
  <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;text-align:right;">
    <a href="${escapeHtml(`${env.appUrl}/absagen/${b.cancelToken}`)}" style="color:#FF312E;font-weight:700;text-decoration:none;">Absagen</a>
  </td>
</tr>`,
    )
    .join("");

  const html = mailLayout(
    `${details.booked.length} Termine sind eingetragen`,
    `<p style="margin:0 0 16px;">Hallo ${escapeHtml(details.name)}</p>
<p style="margin:0 0 16px;font-weight:700;">${escapeHtml(details.lessonName)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 16px;">
${rows}
</table>
<p style="margin:0 0 20px;font-weight:700;">Gesamtpreis CHF ${formatPrice(totalRappen)}</p>
${
  details.failedCount > 0
    ? `<p style="margin:0 0 20px;color:#515052;">${details.failedCount} der gewählten Termine ${details.failedCount === 1 ? "war" : "waren"} leider nicht mehr frei und ${details.failedCount === 1 ? "ist" : "sind"} nicht dabei.</p>`
    : ""
}
<p style="margin:0 0 8px;font-weight:700;">Treffpunkt</p>
<p style="margin:0 0 20px;color:#515052;">${escapeHtml(site.contact.street)}, ${escapeHtml(site.contact.zip)} ${escapeHtml(site.contact.city)}<br>Einen abweichenden Treffpunkt im Einzugsgebiet vereinbaren wir telefonisch.</p>
<p style="margin:0;color:#515052;font-size:14px;">Jeder Termin lässt sich einzeln bis 24 Stunden vorher kostenlos absagen, über den Link in der Tabelle oben. Fragen beantworten wir unter ${escapeHtml(site.contact.phone)}.</p>`,
  );

  await sendMail({
    to: details.to,
    subject: `${details.booked.length} Termine bestätigt — ${sorted[0]?.reference}`,
    text,
    html,
  });
}

/** Wie sendNewBookingNotification, nur für mehrere gleichzeitig gebuchte Termine. */
export async function sendNewBookingsNotification(details: {
  lessonName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNote?: string;
  booked: BookedAppointment[];
}): Promise<void> {
  const sorted = [...details.booked].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  const when = sorted.map((b) => `${formatDayLong(b.day)}, ${b.time} Uhr`).join("; ");

  const text = [
    `Neue Online-Buchung: ${details.booked.length}× ${details.lessonName}`,
    when,
    "",
    `Name: ${details.customerName}`,
    `Telefon: ${details.customerPhone}`,
    `Mail: ${details.customerEmail}`,
    ...(details.customerNote ? [`Bemerkung: ${details.customerNote}`] : []),
    "",
    `Referenzen: ${sorted.map((b) => b.reference).join(", ")}`,
  ].join("\n");

  const rows = sorted
    .map(
      (b) => `<tr><td style="padding:6px 0;border-bottom:1px solid #D6D6D2;">${escapeHtml(formatDayLong(b.day))}, ${escapeHtml(b.time)} Uhr</td>
      <td style="padding:6px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">${escapeHtml(b.reference)}</td></tr>`,
    )
    .join("");

  const html = mailLayout(
    `${details.booked.length} neue Termine`,
    `<p style="margin:0 0 8px;font-weight:700;">${escapeHtml(details.lessonName)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
${rows}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;width:38%;">Name</td>
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
<p style="margin:0;color:#515052;font-size:14px;">Stehen bereits im Kalender.</p>`,
  );

  await sendMail({
    to: site.contact.email,
    subject: `Neue Buchung — ${details.booked.length} Termine`,
    text,
    html,
  });
}
