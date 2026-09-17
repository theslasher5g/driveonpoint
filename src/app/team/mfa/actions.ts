"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { record } from "@/lib/audit";
import { clearMfaChallenge, readMfaChallenge } from "@/lib/auth/mfa-session";
import { createSession } from "@/lib/auth/session";
import { consumeRecoveryCode, decryptSecret, verifyTotp } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { blockIp, blockedUntil, consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

export type MfaChallengeState = { error?: string };

const MAX_ATTEMPTS = 6;
const WINDOW_SECONDS = 600;

export async function verifyMfaAction(
  _previous: MfaChallengeState,
  formData: FormData,
): Promise<MfaChallengeState> {
  const ip = await clientIp();

  if (await blockedUntil(ip)) {
    return { error: "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut." };
  }

  const pending = await readMfaChallenge();
  if (!pending) {
    redirect("/team/anmelden?fehler=mfa-abgelaufen");
  }

  // Begrenzt sowohl je Verbindung als auch je Konto — ein sechsstelliger
  // Code hat nur eine Million Möglichkeiten, das Durchprobieren muss also
  // hart gebremst werden, härter als beim Passwort selbst.
  const verdict = await consume(`mfa:${ip}`, MAX_ATTEMPTS, WINDOW_SECONDS);
  const accountVerdict = await consume(`mfa-konto:${pending.staffId}`, MAX_ATTEMPTS, WINDOW_SECONDS);
  if (!verdict.ok || !accountVerdict.ok) {
    await blockIp(ip, 15, "Zu viele MFA-Versuche");
    await record("anmeldung.mfa-gesperrt", { label: "System" }, { staffId: pending.staffId });
    return { error: "Zu viele Versuche. Bitte in 15 Minuten erneut." };
  }

  const [account] = await db
    .select({
      id: staff.id,
      name: staff.name,
      active: staff.active,
      mustChangePassword: staff.mustChangePassword,
      totpEnabled: staff.totpEnabled,
      totpSecret: staff.totpSecret,
      mfaRecoveryCodes: staff.mfaRecoveryCodes,
    })
    .from(staff)
    .where(eq(staff.id, pending.staffId))
    .limit(1);

  if (!account || !account.active || !account.totpEnabled || !account.totpSecret) {
    await clearMfaChallenge();
    redirect("/team/anmelden?fehler=mfa-abgelaufen");
  }

  const code = String(formData.get("code") ?? "").trim();
  const secret = decryptSecret(account.totpSecret);
  let ok = secret !== null && verifyTotp(secret, code);
  let usedRecovery = false;

  // Kein gültiger Code? Als Wiederherstellungscode versuchen — die Eingabe
  // sieht anders aus (mit Bindestrich), sodass beides nicht verwechselt wird.
  if (!ok && code.includes("-") && account.mfaRecoveryCodes) {
    const result = consumeRecoveryCode(account.mfaRecoveryCodes, code);
    if (result.matched) {
      ok = true;
      usedRecovery = true;
      await db
        .update(staff)
        .set({ mfaRecoveryCodes: result.codes, updatedAt: new Date() })
        .where(eq(staff.id, account.id));
    }
  }

  if (!ok) {
    return { error: "Der Code stimmt nicht." };
  }

  await clearMfaChallenge();

  const store = await headers();
  await createSession(account.id, { userAgent: store.get("user-agent"), ip });
  await db.update(staff).set({ lastLoginAt: new Date() }).where(eq(staff.id, account.id));
  await record(
    "anmeldung.erfolgreich",
    { id: account.id, label: account.name },
    { weg: usedRecovery ? "wiederherstellungscode" : "totp" },
  );

  if (usedRecovery) {
    // Wer einen Wiederherstellungscode braucht, hat vermutlich das Gerät
    // verloren — das gehört ins Protokoll für die Administration.
    await record(
      "anmeldung.wiederherstellungscode-verwendet",
      { id: account.id, label: account.name },
    );
  }

  redirect(account.mustChangePassword ? "/team/konto?erstanmeldung=1" : "/team");
}
