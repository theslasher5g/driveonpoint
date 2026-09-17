import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "../db";
import { staff, staffSessions, type Staff } from "../db/schema";
import { env } from "../env";
import { hashIp } from "../request";

const COOKIE = "dop_session";
const SESSION_HOURS = 12;

/** OWASP-Empfehlung für argon2id: 19 MiB Speicher, zwei Durchgänge. */
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON_OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(digest, password);
  } catch {
    // Ein beschädigter oder fremdformatiger Eintrag darf nicht als Treffer gelten.
    return false;
  }
}

/**
 * Verbrennt Rechenzeit, wenn das Konto gar nicht existiert.
 *
 * Ohne das antwortet die Anmeldung bei unbekannten Adressen messbar schneller
 * als bei bekannten — daraus liesse sich ablesen, welche Adressen Konten sind.
 */
export async function burnPasswordTime(): Promise<void> {
  await argonHash(randomBytes(16).toString("hex"), ARGON_OPTIONS);
}

function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  staffId: string,
  meta: { userAgent?: string | null; ip?: string },
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  await db.insert(staffSessions).values({
    tokenHash: digestToken(token),
    staffId,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 200) ?? null,
    ipHash: meta.ip ? hashIp(meta.ip) : null,
  });

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    // Kein Zugriff aus JavaScript — ein gefundener XSS-Weg kann die
    // Sitzung damit nicht auslesen und weiterreichen.
    sameSite: "lax",
    secure: env.isSecureUrl,
    path: "/",
    expires: expiresAt,
  });
}

export type SessionUser = Pick<
  Staff,
  "id" | "email" | "name" | "role" | "mustChangePassword" | "calendarToken" | "totpEnabled"
>;

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      mustChangePassword: staff.mustChangePassword,
      calendarToken: staff.calendarToken,
      totpEnabled: staff.totpEnabled,
      active: staff.active,
    })
    .from(staffSessions)
    .innerJoin(staff, eq(staff.id, staffSessions.staffId))
    .where(
      and(eq(staffSessions.tokenHash, digestToken(token)), gt(staffSessions.expiresAt, new Date())),
    )
    .limit(1);

  if (!row || !row.active) return null;
  const { active: _active, ...user } = row;
  return user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await db.delete(staffSessions).where(eq(staffSessions.tokenHash, digestToken(token)));
  }
  store.delete(COOKIE);
}

/** Meldet alle Geräte eines Kontos ab, etwa nach einem Passwortwechsel. */
export async function destroyAllSessions(staffId: string): Promise<void> {
  await db.delete(staffSessions).where(eq(staffSessions.staffId, staffId));
}

export async function pruneSessions(): Promise<void> {
  await db.delete(staffSessions).where(lt(staffSessions.expiresAt, new Date()));
}

/** Zeitkonstanter Vergleich für Token, die aus der Anfrage stammen. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function newCalendarToken(): string {
  return randomBytes(24).toString("base64url");
}
