"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import { burnPasswordTime, createSession, verifyPassword } from "@/lib/auth/session";
import { startMfaChallenge } from "@/lib/auth/mfa-session";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { blockIp, blockedUntil, clearBucket, currentHits, hit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

export type LoginState = { error?: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(180),
  passwort: z.string().min(1).max(200),
});

/** Ab hier wird die Adresse gesperrt statt nur abgewiesen. */
const IP_FAILURES_BEFORE_BLOCK = 8;
const ACCOUNT_FAILURES_BEFORE_BLOCK = 10;
const WINDOW_SECONDS = 900;

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const ip = await clientIp();

  const until = await blockedUntil(ip);
  if (until) {
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    return { error: `Zu viele Fehlversuche. Erneut möglich in ${minutes} Minuten.` };
  }

  const parsed = schema.safeParse({
    email: formData.get("email"),
    passwort: formData.get("passwort"),
  });

  // Eine einheitliche Meldung für alle Fehlerfälle: sie darf nicht verraten,
  // ob es das Konto gibt, ob es gesperrt ist oder nur das Passwort falsch war.
  const generic = { error: "Mailadresse oder Passwort stimmt nicht." };

  if (!parsed.success) {
    await registerFailure(ip, "unbekannt");
    return generic;
  }

  const { email, passwort } = parsed.data;

  const [account] = await db
    .select({
      id: staff.id,
      passwordHash: staff.passwordHash,
      active: staff.active,
      mustChangePassword: staff.mustChangePassword,
      totpEnabled: staff.totpEnabled,
      name: staff.name,
    })
    .from(staff)
    .where(eq(staff.email, email))
    .limit(1);

  if (!account || !account.active) {
    // Gleicher Rechenaufwand wie bei einem echten Konto, damit sich aus der
    // Antwortzeit nicht ablesen lässt, ob die Adresse existiert.
    await burnPasswordTime();
    await registerFailure(ip, email);
    return generic;
  }

  const correct = await verifyPassword(account.passwordHash, passwort);
  if (!correct) {
    await registerFailure(ip, email);
    return generic;
  }

  // Gelungene Anmeldung setzt die Zähler zurück, damit ein vergessenes
  // Passwort am Morgen nicht den Rest des Tages blockiert.
  await Promise.all([clearBucket(`login-ip:${ip}`), clearBucket(`login-konto:${email}`)]);

  // Mit MFA ist das Passwort erst der erste Faktor. Es gibt jetzt bewusst
  // noch keine echte Sitzung — sonst wäre der zweite Faktor wirkungslos.
  if (account.totpEnabled) {
    await startMfaChallenge(account.id);
    await record("anmeldung.mfa-angefordert", { id: account.id, label: account.name });
    redirect("/team/mfa");
  }

  const store = await headers();
  await createSession(account.id, { userAgent: store.get("user-agent"), ip });
  await db.update(staff).set({ lastLoginAt: new Date() }).where(eq(staff.id, account.id));
  await record("anmeldung.erfolgreich", { id: account.id, label: account.name });

  redirect(account.mustChangePassword ? "/team/konto?erstanmeldung=1" : "/team");
}

async function registerFailure(ip: string, email: string): Promise<void> {
  await Promise.all([hit(`login-ip:${ip}`), hit(`login-konto:${email}`)]);

  const [fromIp, forAccount] = await Promise.all([
    currentHits(`login-ip:${ip}`, WINDOW_SECONDS),
    currentHits(`login-konto:${email}`, WINDOW_SECONDS),
  ]);

  if (fromIp >= IP_FAILURES_BEFORE_BLOCK) {
    // Die Sperre wächst mit jedem weiteren Versuch: 15, 30, 60 Minuten.
    const step = Math.min(3, Math.floor(fromIp / IP_FAILURES_BEFORE_BLOCK));
    await blockIp(ip, 15 * 2 ** (step - 1), "Zu viele fehlgeschlagene Anmeldungen");
    await record("anmeldung.gesperrt", { label: "System" }, { versuche: fromIp });
  }

  // Ein über viele Adressen verteilter Angriff läuft an der IP-Sperre vorbei.
  // Deshalb zählt zusätzlich das Konto selbst.
  if (forAccount >= ACCOUNT_FAILURES_BEFORE_BLOCK) {
    await blockIp(ip, 60, "Zu viele Fehlversuche auf dasselbe Konto");
    await record("anmeldung.konto-unter-beschuss", { label: "System" }, { versuche: forAccount });
  }
}
