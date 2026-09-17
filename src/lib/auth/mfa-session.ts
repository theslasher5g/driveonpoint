import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "../env";

/**
 * Zwischenstand zwischen Passwort- und MFA-Prüfung.
 *
 * Nach richtigem Passwort, aber vor dem TOTP-Code, gibt es noch keine echte
 * Sitzung — sonst wäre der zweite Faktor wirkungslos: ein gestohlenes
 * Passwort allein reichte dann schon. Dieses Cookie trägt nur, wer geprüft
 * werden muss, signiert und kurzlebig, damit es sich weder fälschen noch
 * lange missbrauchen lässt.
 */

const COOKIE = "dop_mfa_pending";
const VALID_MINUTES = 10;

export type PendingMfa = { staffId: string; expires: number };

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

export async function startMfaChallenge(staffId: string): Promise<void> {
  const pending: PendingMfa = { staffId, expires: Date.now() + VALID_MINUTES * 60_000 };
  const payload = Buffer.from(JSON.stringify(pending)).toString("base64url");
  const sealed = `${payload}.${sign(payload)}`;

  const store = await cookies();
  store.set(COOKIE, sealed, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isSecureUrl,
    path: "/team",
    maxAge: VALID_MINUTES * 60,
  });
}

export async function readMfaChallenge(): Promise<PendingMfa | null> {
  const store = await cookies();
  const sealed = store.get(COOKIE)?.value;
  if (!sealed) return null;

  const [payload, signature] = sealed.split(".");
  if (!payload || !signature) return null;
  if (!constantTimeEqual(sign(payload), signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PendingMfa;
    if (typeof parsed.staffId !== "string" || typeof parsed.expires !== "number") return null;
    if (parsed.expires < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearMfaChallenge(): Promise<void> {
  const store = await cookies();
  store.delete({ name: COOKIE, path: "/team" });
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
