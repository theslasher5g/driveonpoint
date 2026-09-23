"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import QRCode from "qrcode";
import { record } from "@/lib/audit";
import { requireUser } from "@/lib/auth/guard";
import {
  createSession,
  destroyAllSessions,
  hashPassword,
  newCalendarToken,
  verifyPassword,
} from "@/lib/auth/session";
import {
  decryptSecret,
  encryptSecret,
  formatSecretForDisplay,
  generateRecoveryCodes,
  generateSecret,
  otpauthUrl,
  verifyTotp,
} from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { site } from "@/lib/site";

export type AccountState = { error?: string; ok?: string };

const schema = z
  .object({
    aktuell: z.string().min(1, "Bitte gib dein aktuelles Passwort ein."),
    neu: z
      .string()
      .min(12, "Das neue Passwort braucht mindestens 12 Zeichen.")
      .max(200, "Das Passwort ist zu lang."),
    wiederholung: z.string(),
  })
  .refine((value) => value.neu === value.wiederholung, {
    message: "Die beiden neuen Passwörter stimmen nicht überein.",
  })
  .refine((value) => value.neu !== value.aktuell, {
    message: "Das neue Passwort muss sich vom alten unterscheiden.",
  });

export async function changePasswordAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();
  const ip = await clientIp();

  // Begrenzt das Durchprobieren des aktuellen Passworts durch jemanden,
  // der einen unbeaufsichtigten Rechner vorfindet.
  const verdict = await consume(`passwortwechsel:${user.id}`, 10, 900);
  if (!verdict.ok) {
    return { error: "Zu viele Versuche. Bitte in 15 Minuten erneut." };
  }

  const parsed = schema.safeParse({
    aktuell: formData.get("aktuell"),
    neu: formData.get("neu"),
    wiederholung: formData.get("wiederholung"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [account] = await db
    .select({ passwordHash: staff.passwordHash })
    .from(staff)
    .where(eq(staff.id, user.id))
    .limit(1);

  if (!account) return { error: "Konto nicht gefunden." };

  if (!(await verifyPassword(account.passwordHash, parsed.data.aktuell))) {
    return { error: "Das aktuelle Passwort stimmt nicht." };
  }

  await db
    .update(staff)
    .set({
      passwordHash: await hashPassword(parsed.data.neu),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(staff.id, user.id));

  // Alle bestehenden Sitzungen fallen weg — wer das alte Passwort kannte,
  // ist damit auch auf fremden Geräten draussen. Danach gleich eine neue
  // Sitzung für dieses Gerät, sonst fliegt die eigene Person raus.
  await destroyAllSessions(user.id);
  const store = await headers();
  await createSession(user.id, { userAgent: store.get("user-agent"), ip });

  await record("passwort.geaendert", { id: user.id, label: user.name });
  // Das ganze Layout: mit dem Startpasswort war alles ausser „Mein Konto“
  // gesperrt, und der Hinweis oben auf dieser Seite muss verschwinden.
  revalidatePath("/team", "layout");

  return { ok: "Passwort geändert. Andere Geräte wurden abgemeldet." };
}

export async function rotateCalendarTokenAction(): Promise<void> {
  const user = await requireUser();

  await db
    .update(staff)
    .set({ calendarToken: newCalendarToken(), updatedAt: new Date() })
    .where(eq(staff.id, user.id));

  await record("kalenderlink.erneuert", { id: user.id, label: user.name });
  revalidatePath("/team/konto");
}

// --- Zwei-Faktor-Authentifizierung (MFA) -----------------------------------

export type MfaSetupState = {
  error?: string;
  qrDataUrl?: string;
  secretDisplay?: string;
};

/**
 * Startet die Einrichtung: neues Geheimnis erzeugen, verschlüsselt ablegen,
 * aber `totpEnabled` bleibt aus, bis ein Code bestätigt, dass die App richtig
 * eingerichtet ist. Ein erneuter Aufruf ersetzt ein vorheriges, noch nicht
 * bestätigtes Geheimnis — sonst bliebe nach einem Abbruch ein verwaistes
 * zurück, das QR-Code und tatsächlich gespeicherter Wert auseinanderlaufen
 * liesse.
 */
export async function startMfaSetupAction(): Promise<MfaSetupState> {
  const user = await requireUser();

  if (user.totpEnabled) {
    return { error: "MFA ist bereits eingerichtet. Zuerst deaktivieren, um es neu einzurichten." };
  }

  const verdict = await consume(`mfa-einrichten-start:${user.id}`, 20, 600);
  if (!verdict.ok) {
    return { error: "Zu viele Versuche. Bitte in 10 Minuten erneut." };
  }

  const secret = generateSecret();

  await db
    .update(staff)
    .set({ totpSecret: encryptSecret(secret), updatedAt: new Date() })
    .where(eq(staff.id, user.id));

  const url = otpauthUrl(secret, user.email, site.name);
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });

  return { qrDataUrl, secretDisplay: formatSecretForDisplay(secret) };
}

export type MfaConfirmState = { error?: string; codes?: string[] };

export async function confirmMfaSetupAction(
  _previous: MfaConfirmState,
  formData: FormData,
): Promise<MfaConfirmState> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "").trim();

  const verdict = await consume(`mfa-einrichten:${user.id}`, 10, 600);
  if (!verdict.ok) return { error: "Zu viele Versuche. Bitte in 10 Minuten erneut." };

  const [account] = await db
    .select({ totpSecret: staff.totpSecret })
    .from(staff)
    .where(eq(staff.id, user.id))
    .limit(1);

  const secret = account?.totpSecret ? decryptSecret(account.totpSecret) : null;
  if (!secret) return { error: "Keine Einrichtung im Gang. Bitte von vorne beginnen." };

  if (!verifyTotp(secret, code)) {
    return { error: "Der Code stimmt nicht. Prüfe die Uhrzeit deines Geräts." };
  }

  const { plain, stored } = generateRecoveryCodes();

  await db
    .update(staff)
    .set({
      totpEnabled: true,
      totpConfirmedAt: new Date(),
      mfaRecoveryCodes: stored,
      updatedAt: new Date(),
    })
    .where(eq(staff.id, user.id));

  await record("konto.mfa-eingerichtet", { id: user.id, label: user.name });
  revalidatePath("/team/konto");

  return { codes: plain };
}

const disableSchema = z.object({ code: z.string().min(1, "Bitte gib deinen Code ein.") });

/** Deaktivieren braucht einen frischen Code — ein blosser Klick reicht nicht. */
export async function disableMfaAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const verdict = await consume(`mfa-deaktivieren:${user.id}`, 10, 600);
  if (!verdict.ok) return { error: "Zu viele Versuche. Bitte in 10 Minuten erneut." };

  const parsed = disableSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [account] = await db
    .select({ totpSecret: staff.totpSecret })
    .from(staff)
    .where(eq(staff.id, user.id))
    .limit(1);

  const secret = account?.totpSecret ? decryptSecret(account.totpSecret) : null;
  if (!secret || !verifyTotp(secret, parsed.data.code)) {
    return { error: "Der Code stimmt nicht." };
  }

  await db
    .update(staff)
    .set({
      totpEnabled: false,
      totpSecret: null,
      totpConfirmedAt: null,
      mfaRecoveryCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(staff.id, user.id));

  await record("konto.mfa-deaktiviert", { id: user.id, label: user.name });
  revalidatePath("/team/konto");

  return { ok: "MFA ist deaktiviert." };
}

export type RecoveryCodesState = { error?: string; codes?: string[] };

/** Neue Wiederherstellungscodes — die alten werden dabei alle entwertet. */
export async function regenerateRecoveryCodesAction(
  _previous: RecoveryCodesState,
  formData: FormData,
): Promise<RecoveryCodesState> {
  const user = await requireUser();

  const verdict = await consume(`mfa-codes:${user.id}`, 5, 600);
  if (!verdict.ok) return { error: "Zu viele Versuche. Bitte in 10 Minuten erneut." };

  const parsed = disableSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [account] = await db
    .select({ totpSecret: staff.totpSecret, totpEnabled: staff.totpEnabled })
    .from(staff)
    .where(eq(staff.id, user.id))
    .limit(1);

  if (!account?.totpEnabled) return { error: "MFA ist nicht eingerichtet." };

  const secret = account.totpSecret ? decryptSecret(account.totpSecret) : null;
  if (!secret || !verifyTotp(secret, parsed.data.code)) {
    return { error: "Der Code stimmt nicht." };
  }

  const { plain, stored } = generateRecoveryCodes();

  await db
    .update(staff)
    .set({ mfaRecoveryCodes: stored, updatedAt: new Date() })
    .where(eq(staff.id, user.id));

  await record("konto.mfa-codes-erneuert", { id: user.id, label: user.name });
  revalidatePath("/team/konto");

  return { codes: plain };
}
