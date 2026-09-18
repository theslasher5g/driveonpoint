import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";
import { site } from "./site";

const globalForMail = globalThis as unknown as { __dopMail?: Transporter };

function transport(): Transporter {
  if (globalForMail.__dopMail) return globalForMail.__dopMail;

  const created = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    // Der mitgelieferte Postfix-Container spricht STARTTLS mit eigenem
    // Zertifikat. Bei einem externen Anbieter über das Internet gehört hier
    // zwingend die Prüfung aktiviert.
    tls: { rejectUnauthorized: env.smtp.host !== "mail" },
    pool: true,
    maxConnections: 3,
  });

  globalForMail.__dopMail = created;
  return created;
}

/** Maskiert alles, was im HTML-Teil als Markup gelesen werden könnte. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendMail(mail: Mail): Promise<void> {
  // Zeilenumbrüche in Kopfzeilen erlauben das Anhängen weiterer Empfänger.
  const to = mail.to.replace(/[\r\n]/g, "").trim();
  const subject = mail.subject.replace(/[\r\n]/g, " ").trim();

  await transport().sendMail({
    from: env.mailFrom,
    replyTo: env.mailReplyTo,
    to,
    subject,
    text: mail.text,
    html: mail.html,
    headers: {
      "Auto-Submitted": "auto-generated",
      // Hält automatische Abwesenheitsantworten von der noreply-Adresse fern.
      Precedence: "bulk",
    },
  });
}

/** Rahmen für alle Mails. Tabellenlayout, weil Mailprogramme wenig können. */
export function mailLayout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:24px;background:#FDF0D5;font-family:Helvetica,Arial,sans-serif;color:#003049;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFBF2;">
<tr><td style="background:#C1121F;padding:22px 26px;">
<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(site.name)}</span>
</td></tr>
<tr><td style="padding:26px;">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.25;font-weight:700;">${escapeHtml(heading)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:18px 26px;border-top:1px solid #EDE0C2;font-size:12px;line-height:1.6;color:#4A5F68;">
Diese Nachricht wurde automatisch versendet. Antworten auf diese Adresse werden nicht gelesen.
</td></tr>
</table></body></html>`;
}
