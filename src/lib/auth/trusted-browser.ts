import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "../db";
import { trustedBrowsers } from "../db/schema";
import { env } from "../env";

/**
 * "Diesen Browser 30 Tage merken": nach einem gültigen MFA-Code bekommt der
 * Browser ein eigenes Cookie. Meldet sich dasselbe Konto dort wieder an,
 * genügt das Passwort — der zweite Faktor ist dann der Browser selbst.
 *
 * Das Passwort bleibt immer nötig. Das Cookie gilt nur für das Konto, für
 * das es ausgestellt wurde, und fällt weg, wenn das Passwort geändert, MFA
 * zurückgesetzt oder das Konto deaktiviert wird (destroyAllSessions) — oder
 * wenn die Person unter "Mein Konto" alle gemerkten Browser vergisst.
 */

const COOKIE = "dop_browser";
export const TRUST_DAYS = 30;

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function trustThisBrowser(staffId: string, userAgent: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(trustedBrowsers).values({
    tokenHash: digest(token),
    staffId,
    expiresAt,
    userAgent: userAgent?.slice(0, 200) ?? null,
  });

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isSecureUrl,
    // Gebraucht wird es nur bei der Anmeldung.
    path: "/team",
    expires: expiresAt,
  });
}

/** Ist dieser Browser für dieses Konto gemerkt und noch gültig? */
export async function isTrustedBrowser(staffId: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return false;

  const [row] = await db
    .select({ staffId: trustedBrowsers.staffId })
    .from(trustedBrowsers)
    .where(
      and(
        eq(trustedBrowsers.tokenHash, digest(token)),
        eq(trustedBrowsers.staffId, staffId),
        gt(trustedBrowsers.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return !!row;
}

/** Alle gemerkten Browser eines Kontos vergessen. */
export async function forgetTrustedBrowsers(staffId: string): Promise<void> {
  await db.delete(trustedBrowsers).where(eq(trustedBrowsers.staffId, staffId));
}

export async function countTrustedBrowsers(staffId: string): Promise<number> {
  const rows = await db
    .select({ tokenHash: trustedBrowsers.tokenHash })
    .from(trustedBrowsers)
    .where(and(eq(trustedBrowsers.staffId, staffId), gt(trustedBrowsers.expiresAt, new Date())));
  return rows.length;
}
