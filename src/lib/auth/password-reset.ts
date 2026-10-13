import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { record } from "../audit";
import { db } from "../db";
import { passwordResets, staff, staffSessions, trustedBrowsers } from "../db/schema";
import { env } from "../env";
import { escapeHtml, mailLayout, sendMail } from "../mail";
import { site } from "../site";
import { hashPassword } from "./session";

/**
 * Passwort vergessen: ein Link per Mail, der eine Stunde und einmal gilt.
 *
 * - Wer eine Adresse eingibt, bekommt immer dieselbe Antwort — ob es dazu
 *   ein Konto gibt, verrät die Seite nicht.
 * - In der Datenbank liegt nur der Hash des Tokens.
 * - Ein neuer Link entwertet die älteren derselben Person.
 * - Nach dem Zurücksetzen sind alle Sitzungen und gemerkten Browser weg.
 *   MFA bleibt: wer es eingerichtet hat, braucht beim Anmelden weiterhin
 *   den Code. Ein Postfach allein reicht also nicht, um ein Konto mit MFA
 *   zu übernehmen.
 */

const VALID_MINUTES = 60;

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Legt einen Link an und verschickt ihn — nur für aktive Konten. */
export async function issuePasswordReset(email: string): Promise<void> {
  const [account] = await db
    .select({ id: staff.id, name: staff.name, email: staff.email, active: staff.active })
    .from(staff)
    .where(eq(staff.email, email))
    .limit(1);
  if (!account || !account.active) return;

  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.delete(passwordResets).where(eq(passwordResets.staffId, account.id));
    await tx.insert(passwordResets).values({
      tokenHash: digest(token),
      staffId: account.id,
      expiresAt: new Date(Date.now() + VALID_MINUTES * 60_000),
    });
  });

  const url = `${env.appUrl}/team/passwort-neu/${token}`;
  const firstName = account.name.split(" ")[0];
  const text = [
    `Hallo ${firstName}`,
    "",
    "Für dein Konto im Team-Bereich wurde ein neues Passwort angefordert. Über diesen Link legst du es fest:",
    url,
    "",
    `Der Link gilt ${VALID_MINUTES} Minuten und nur einmal.`,
    "Hast du nichts angefordert? Dann ignoriere diese Mail, dein Passwort bleibt unverändert.",
  ].join("\n");
  const html = mailLayout(
    "Neues Passwort festlegen",
    `<p style="margin:0 0 16px;">Hallo ${escapeHtml(firstName)}</p>
<p style="margin:0 0 20px;">Für dein Konto im Team-Bereich von ${escapeHtml(site.name)} wurde ein neues Passwort angefordert.</p>
<p style="margin:0 0 20px;">
  <a href="${escapeHtml(url)}" style="display:inline-block;background:#FF312E;color:#000103;text-decoration:none;font-weight:700;padding:13px 22px;">Neues Passwort festlegen</a>
</p>
<p style="margin:0 0 12px;color:#515052;font-size:14px;">Der Link gilt ${VALID_MINUTES} Minuten und nur einmal.</p>
<p style="margin:0;color:#515052;font-size:14px;">Hast du nichts angefordert? Dann ignoriere diese Mail, dein Passwort bleibt unverändert.</p>`,
  );

  await sendMail({ to: account.email, subject: "Neues Passwort für den Team-Bereich", text, html });
  await record("passwort.reset-angefordert", { id: account.id, label: account.name });
}

/** Gehört der Link zu einem aktiven Konto und gilt er noch? */
export async function resetTarget(token: string): Promise<{ staffId: string; name: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const [row] = await db
    .select({ staffId: passwordResets.staffId, name: staff.name, active: staff.active })
    .from(passwordResets)
    .innerJoin(staff, eq(staff.id, passwordResets.staffId))
    .where(and(eq(passwordResets.tokenHash, digest(token)), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.active) return null;
  return { staffId: row.staffId, name: row.name };
}

/**
 * Setzt das neue Passwort und entwertet den Link. Der Link wird in derselben
 * Transaktion gelöscht, in der er geprüft wird — zwei gleichzeitige Anfragen
 * mit demselben Link setzen das Passwort deshalb nur einmal.
 */
export async function completePasswordReset(
  token: string,
  password: string,
): Promise<{ staffId: string; name: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    const [used] = await tx
      .delete(passwordResets)
      .where(and(eq(passwordResets.tokenHash, digest(token)), gt(passwordResets.expiresAt, new Date())))
      .returning({ staffId: passwordResets.staffId });
    if (!used) return null;

    const [account] = await tx
      .update(staff)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(and(eq(staff.id, used.staffId), eq(staff.active, true)))
      .returning({ id: staff.id, name: staff.name });
    if (!account) return null;

    // Wer das alte Passwort kannte, ist damit überall draussen, auch auf
    // gemerkten Browsern.
    await tx.delete(passwordResets).where(eq(passwordResets.staffId, account.id));
    await tx.delete(staffSessions).where(eq(staffSessions.staffId, account.id));
    await tx.delete(trustedBrowsers).where(eq(trustedBrowsers.staffId, account.id));
    return { staffId: account.id, name: account.name };
  });
}
