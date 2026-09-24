import "server-only";
import { env } from "./env";
import { buildInvite } from "./ics";
import { escapeHtml, mailLayout, sendMail, type Mail } from "./mail";
import { site } from "./site";
import { formatDayLong, formatPrice, zurichDay, zurichTime, zurichToInstant } from "./time";

/**
 * Fahrstunden und Schnupperstunden werden abgeholt: die Fahrlehrperson ruft
 * vorher an und vereinbart telefonisch, wo. VKU und Nothilfekurs finden
 * dagegen an einem festen Kursort statt. `capacity` unterscheidet die
 * beiden zuverlässig — mehr als ein Platz heisst Kurs, nicht Einzellektion.
 */
function isPickup(capacity: number): boolean {
  return capacity <= 1;
}

function meetingPointLines(capacity: number): string[] {
  if (isPickup(capacity)) {
    return [
      "Treffpunkt: wird telefonisch vereinbart",
      "Die Fahrlehrperson ruft dich vor der Lektion an und sagt dir, wo sie dich abholt.",
    ];
  }
  return [`Kursort: ${site.contact.street}, ${site.contact.zip} ${site.contact.city}`];
}

function meetingPointHtml(capacity: number): string {
  if (isPickup(capacity)) {
    return `<p style="margin:0 0 8px;font-weight:700;">Treffpunkt</p>
<p style="margin:0 0 20px;color:#515052;">Die Fahrlehrperson ruft dich vor der Lektion an und sagt dir, wo sie dich abholt.</p>`;
  }
  return `<p style="margin:0 0 8px;font-weight:700;">Kursort</p>
<p style="margin:0 0 20px;color:#515052;">${escapeHtml(site.contact.street)}, ${escapeHtml(site.contact.zip)} ${escapeHtml(site.contact.city)}</p>`;
}

/** Nur ein Kursort taugt als Kalender-Ort; ein Treffpunkt steht erst nach dem Anruf fest. */
function meetingPointLocation(capacity: number): string | undefined {
  return isPickup(capacity)
    ? undefined
    : `${site.contact.street}, ${site.contact.zip} ${site.contact.city}`;
}

/**
 * Kalenderdatei für die Bestätigung. Die UID hängt an der Referenz, damit
 * ein zweites Öffnen desselben Anhangs den Eintrag ersetzt statt ihn zu
 * verdoppeln.
 */
function calendarAttachment(
  appointments: { day: string; time: string; reference: string; cancelToken: string }[],
  lessonName: string,
  durationMinutes: number,
  location: string | undefined,
): NonNullable<Mail["attachments"]> {
  const now = new Date();
  const ics = buildInvite(
    appointments.map((entry) => {
      const startsAt = zurichToInstant(entry.day, entry.time);
      return {
        uid: `${entry.reference}@${site.domain}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
        title: `${lessonName} — ${site.name}`,
        description: [
          `Referenz ${entry.reference}`,
          `Absagen bis 24 Stunden vorher kostenlos: ${env.appUrl}/absagen/${entry.cancelToken}`,
          `Fragen: ${site.contact.phone}`,
        ].join("\n"),
        location,
        cancelled: false,
        updatedAt: now,
        alarmMinutesBefore: 60,
      };
    }),
  );
  const name = appointments.length === 1 ? `termin-${appointments[0].reference}` : "termine";
  return [
    {
      filename: `${name.toLowerCase()}.ics`,
      content: ics,
      contentType: "text/calendar; charset=utf-8; method=PUBLISH",
    },
  ];
}

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
  /** Ein Platz oder mehrere — entscheidet zwischen Treffpunkt und Kursort. */
  capacity: number;
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
    ...meetingPointLines(details.capacity),
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
${meetingPointHtml(details.capacity)}
<p style="margin:0 0 20px;">
  <a href="${escapeHtml(cancelUrl)}" style="display:inline-block;background:#FF312E;color:#000103;text-decoration:none;font-weight:700;padding:13px 22px;">Termin absagen</a>
</p>
<p style="margin:0;color:#515052;font-size:14px;">Absagen bis 24 Stunden vor Beginn sind kostenlos. Den Termin für deinen Kalender findest du im Anhang. Fragen beantworten wir unter ${escapeHtml(site.contact.phone)}.</p>`,
  );

  await sendMail({
    to: details.to,
    subject: `Termin bestätigt — ${details.reference}`,
    text,
    html,
    attachments: calendarAttachment(
      [details],
      details.lessonName,
      details.durationMinutes,
      meetingPointLocation(details.capacity),
    ),
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

/**
 * Meldung ans eigene Postfach, wenn die Kundschaft über den Link aus der
 * Bestätigung absagt. Ohne sie fiel eine Absage erst auf, wenn jemand den
 * Kalender öffnete — im schlechtesten Fall stand die Fahrlehrerin schon
 * am Treffpunkt. Kurzfristige Absagen (unter 24 Stunden) sind laut AGB
 * verrechenbar und werden deshalb eigens markiert.
 */
export async function sendCancellationNotification(details: {
  reference: string;
  lessonName: string;
  startsAt: Date;
  customerName: string | null;
  customerPhone: string | null;
  lateCancellation: boolean;
}): Promise<void> {
  const when = `${formatDayLong(zurichDay(details.startsAt))}, ${zurichTime(details.startsAt)} Uhr`;
  const late = details.lateCancellation
    ? "Kurzfristig: weniger als 24 Stunden vor Beginn, laut AGB verrechenbar."
    : "Mehr als 24 Stunden vorher, kostenlos.";

  const text = [
    `Abgesagt: ${details.lessonName}`,
    when,
    "",
    `Name: ${details.customerName ?? "—"}`,
    `Telefon: ${details.customerPhone ?? "—"}`,
    "",
    late,
    `Referenz: ${details.reference}`,
  ].join("\n");

  const html = mailLayout(
    "Termin von der Kundschaft abgesagt",
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;width:38%;">Angebot</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-weight:700;">${escapeHtml(details.lessonName)}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">Termin</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-weight:700;">${escapeHtml(when)}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #D6D6D2;font-size:14px;color:#515052;">Name</td>
      <td style="padding:10px 0;border-bottom:1px solid #D6D6D2;">${escapeHtml(details.customerName ?? "—")}</td></tr>
  <tr><td style="padding:10px 0;font-size:14px;color:#515052;">Telefon</td>
      <td style="padding:10px 0;">${escapeHtml(details.customerPhone ?? "—")}</td></tr>
</table>
<p style="margin:0 0 8px;font-weight:700;">${escapeHtml(late)}</p>
<p style="margin:0;color:#515052;font-size:14px;">Referenz ${escapeHtml(details.reference)} — im Kalender bereits als abgesagt markiert, der Platz ist wieder frei.</p>`,
  );

  await sendMail({
    to: site.contact.email,
    subject: `${details.lateCancellation ? "Kurzfristige Absage" : "Absage"} — ${details.reference}`,
    text,
    html,
  });
}

/**
 * Meldet der Kundschaft, dass ein Termin ausfällt, weil die zuständige
 * Fahrlehrperson die Fahrschule verlassen hat und sich niemand anders
 * Verfügbares fand. Anders als bei einer normalen Absage gibt es hier keinen
 * Ersatztermin, den wir automatisch anbieten könnten — die Person muss
 * selbst neu buchen.
 */
export async function sendRebookRequest(details: {
  to: string;
  name: string;
  reference: string;
  lessonName: string;
  day: string;
  time: string;
}): Promise<void> {
  const when = `${formatDayLong(details.day)}, ${details.time} Uhr`;
  const bookUrl = `${env.appUrl}/buchen`;

  const text = [
    `Hallo ${details.name}`,
    "",
    `Dein Termin bei ${site.name} fällt leider aus:`,
    "",
    details.lessonName,
    when,
    `Referenz: ${details.reference}`,
    "",
    "Die zuständige Fahrlehrperson ist nicht mehr bei uns, und wir konnten dafür niemanden mit",
    "freier Zeit zu genau diesem Termin finden. Es entstehen dir keine Kosten. Bitte vereinbare",
    "einen neuen Termin:",
    bookUrl,
    "",
    `Fragen? ${site.contact.phone}`,
  ].join("\n");

  const html = mailLayout(
    "Dein Termin fällt leider aus",
    `<p style="margin:0 0 16px;">Hallo ${escapeHtml(details.name)}</p>
<p style="margin:0 0 16px;"><strong>${escapeHtml(details.lessonName)}</strong><br>${escapeHtml(when)}<br>Referenz: ${escapeHtml(details.reference)}</p>
<p style="margin:0 0 16px;">Die zuständige Fahrlehrperson ist nicht mehr bei uns, und wir konnten dafür niemanden mit freier Zeit zu genau diesem Termin finden. Es entstehen dir keine Kosten.</p>
<p style="margin:0 0 20px;">
  <a href="${escapeHtml(bookUrl)}" style="display:inline-block;background:#FF312E;color:#000103;text-decoration:none;font-weight:700;padding:13px 22px;">Neuen Termin wählen</a>
</p>
<p style="margin:0;color:#515052;font-size:14px;">Fragen beantworten wir unter ${escapeHtml(site.contact.phone)}.</p>`,
  );

  await sendMail({
    to: details.to,
    subject: `Termin fällt aus — ${details.reference}`,
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
    // Mehrfachbuchungen gibt es nur für Fahrstunden (siehe buchen/page.tsx),
    // also immer Abholung, nie ein Kursort.
    ...meetingPointLines(1),
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
${meetingPointHtml(1)}
<p style="margin:0;color:#515052;font-size:14px;">Jeder Termin lässt sich einzeln bis 24 Stunden vorher kostenlos absagen, über den Link in der Tabelle oben. Alle Termine für deinen Kalender findest du im Anhang. Fragen beantworten wir unter ${escapeHtml(site.contact.phone)}.</p>`,
  );

  await sendMail({
    to: details.to,
    subject: `${details.booked.length} Termine bestätigt — ${sorted[0]?.reference}`,
    text,
    html,
    attachments: calendarAttachment(sorted, details.lessonName, details.durationMinutes, meetingPointLocation(1)),
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

/**
 * Erste Mail nach einer Online-Buchung: bitte bestätigen (Double-Opt-In).
 *
 * Erst der Klick auf den Link macht den Termin verbindlich. So landet kein
 * Termin im Kalender, den jemand mit einer fremden oder vertippten
 * Mailadresse gebucht hat — und die Bestätigung mit Absagelink und
 * Kalenderdatei geht nur an eine Adresse, die tatsächlich gelesen wird.
 */
export async function sendConfirmationRequest(details: {
  to: string;
  name: string;
  confirmToken: string;
  lessonName: string;
  appointments: { day: string; time: string }[];
  expiresMinutes: number;
}): Promise<void> {
  const confirmUrl = `${env.appUrl}/bestaetigen/${details.confirmToken}`;
  const sorted = [...details.appointments].sort((a, b) =>
    (a.day + a.time).localeCompare(b.day + b.time),
  );
  const whenLines = sorted.map((entry) => `${formatDayLong(entry.day)}, ${entry.time} Uhr`);
  const several = sorted.length > 1;

  const text = [
    `Hallo ${details.name}`,
    "",
    several
      ? `Bitte bestätige deine ${sorted.length} Termine bei ${site.name}:`
      : `Bitte bestätige deinen Termin bei ${site.name}:`,
    "",
    details.lessonName,
    ...whenLines,
    "",
    confirmUrl,
    "",
    `Wir halten ${several ? "die Termine" : "den Termin"} ${details.expiresMinutes} Minuten für dich frei. Ohne Bestätigung ${several ? "werden sie" : "wird er"} danach wieder freigegeben.`,
    "",
    "Hast du nichts gebucht? Dann ignoriere diese Mail — es passiert nichts weiter.",
  ].join("\n");

  const html = mailLayout(
    several ? "Bitte bestätige deine Termine" : "Bitte bestätige deinen Termin",
    `<p style="margin:0 0 16px;">Hallo ${escapeHtml(details.name)}</p>
<p style="margin:0 0 6px;font-weight:700;">${escapeHtml(details.lessonName)}</p>
<p style="margin:0 0 20px;">${whenLines.map(escapeHtml).join("<br>")}</p>
<p style="margin:0 0 20px;">
  <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#FF312E;color:#000103;text-decoration:none;font-weight:700;padding:13px 22px;">${several ? "Termine bestätigen" : "Termin bestätigen"}</a>
</p>
<p style="margin:0 0 12px;color:#515052;">Wir halten ${several ? "die Termine" : "den Termin"} ${details.expiresMinutes} Minuten für dich frei. Ohne Bestätigung ${several ? "werden sie" : "wird er"} danach wieder freigegeben.</p>
<p style="margin:0;color:#515052;font-size:14px;">Hast du nichts gebucht? Dann ignoriere diese Mail — es passiert nichts weiter.</p>`,
  );

  await sendMail({
    to: details.to,
    subject: several ? "Bitte bestätige deine Termine" : "Bitte bestätige deinen Termin",
    text,
    html,
  });
}

/**
 * Erinnerung rund einen Tag vor dem Termin. Geht so früh raus, dass die
 * kostenlose Absage meist noch möglich ist — wer merkt, dass es nicht
 * passt, gibt den Platz frei, statt einfach nicht zu erscheinen.
 */
export async function sendBookingReminder(details: {
  to: string;
  name: string;
  reference: string;
  cancelToken: string;
  lessonName: string;
  startsAt: Date;
  durationMinutes: number | null;
  /** Ein Platz oder mehrere — entscheidet zwischen Treffpunkt und Kursort. */
  capacity: number;
}): Promise<void> {
  const day = zurichDay(details.startsAt);
  const time = zurichTime(details.startsAt);
  const when = `${formatDayLong(day)}, ${time} Uhr`;
  const cancelUrl = `${env.appUrl}/absagen/${details.cancelToken}`;
  const deadline = new Date(details.startsAt.getTime() - 24 * 60 * 60 * 1000);
  const freeCancellation = deadline.getTime() > Date.now();
  const deadlineText = `${formatDayLong(zurichDay(deadline))}, ${zurichTime(deadline)} Uhr`;

  const cancelHint = freeCancellation
    ? `Passt es doch nicht? Kostenlos absagen kannst du noch bis ${deadlineText}:`
    : `Für eine kostenlose Absage ist es zu kurzfristig. Kommt etwas dazwischen, ruf uns an: ${site.contact.phone}`;

  const text = [
    `Hallo ${details.name}`,
    "",
    `Kurze Erinnerung an deinen Termin bei ${site.name}:`,
    "",
    details.lessonName,
    `${when}${details.durationMinutes ? ` (${details.durationMinutes} Minuten)` : ""}`,
    `Referenz: ${details.reference}`,
    "",
    ...meetingPointLines(details.capacity),
    "",
    cancelHint,
    ...(freeCancellation ? [cancelUrl] : []),
    "",
    `Fragen? ${site.contact.phone}`,
  ].join("\n");

  const html = mailLayout(
    "Erinnerung an deinen Termin",
    `<p style="margin:0 0 16px;">Hallo ${escapeHtml(details.name)}</p>
<p style="margin:0 0 6px;font-weight:700;">${escapeHtml(details.lessonName)}</p>
<p style="margin:0 0 20px;">${escapeHtml(when)}${details.durationMinutes ? ` · ${details.durationMinutes} Minuten` : ""}<br><span style="color:#515052;font-size:14px;">Referenz ${escapeHtml(details.reference)}</span></p>
${meetingPointHtml(details.capacity)}
<p style="margin:0 0 ${freeCancellation ? "12" : "0"}px;color:#515052;">${escapeHtml(cancelHint)}</p>
${
  freeCancellation
    ? `<p style="margin:0;"><a href="${escapeHtml(cancelUrl)}" style="color:#FF312E;font-weight:700;text-decoration:none;">Termin absagen</a></p>`
    : ""
}`,
  );

  await sendMail({
    to: details.to,
    subject: `Erinnerung: ${details.lessonName} am ${formatDayLong(day)}, ${time} Uhr`,
    text,
    html,
  });
}
