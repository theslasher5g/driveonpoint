import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Anmeldung über Google, nach OpenID Connect mit Authorization Code und PKCE.
 *
 * Bewusst ohne fremde Bibliothek: der Ablauf ist kurz genug, und jede
 * Abhängigkeit in der Anmeldung ist eine Abhängigkeit, der man vertrauen
 * muss.
 *
 * Die entscheidende Regel steht nicht hier, sondern in der Rückrufroute:
 * über Google kommt nur herein, wer bereits ein aktives Konto in dieser
 * Anwendung hat. Es wird nie automatisch eines angelegt — sonst hätte jeder
 * mit einem Google-Konto Zugang zum Team-Bereich.
 */

/** Trägt den Zwischenstand über die Weiterleitung zu Google und zurück. */
export const PENDING_COOKIE = "dop_google";
export const PENDING_COOKIE_PATH = "/api/auth/google";

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function clientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID;
  if (!value) throw new Error("GOOGLE_CLIENT_ID fehlt.");
  return value;
}

function clientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) throw new Error("GOOGLE_CLIENT_SECRET fehlt.");
  return value;
}

export function redirectUri(): string {
  return `${env.appUrl}/api/auth/google/callback`;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

export type PendingLogin = {
  state: string;
  nonce: string;
  verifier: string;
};

export function startLogin(): { url: string; pending: PendingLogin } {
  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());

  const url = new URL(AUTHORIZE);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Ohne das nimmt Google stillschweigend das zuletzt benutzte Konto. Auf
  // einem geteilten Rechner meldet sich sonst die falsche Person an.
  url.searchParams.set("prompt", "select_account");

  return { url: url.toString(), pending: { state, nonce, verifier } };
}

/** Signiert den Zwischenstand, der im Cookie über die Weiterleitung reist. */
export function sealPending(pending: PendingLogin): string {
  const payload = Buffer.from(JSON.stringify(pending)).toString("base64url");
  const signature = createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function openPending(sealed: string | undefined): PendingLogin | null {
  if (!sealed) return null;
  const [payload, signature] = sealed.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
  if (!constantTimeEqual(expected, signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PendingLogin;
    if (!parsed.state || !parsed.nonce || !parsed.verifier) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
};

export async function exchangeCode(
  code: string,
  pending: PendingLogin,
): Promise<GoogleIdentity | null> {
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: pending.verifier,
    }),
    // Hängt Google, soll die Anmeldung scheitern und nicht ewig warten.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error("Google lehnte den Codetausch ab:", response.status);
    return null;
  }

  const body = (await response.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string") return null;

  return readIdToken(body.id_token, pending.nonce);
}

type IdTokenClaims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  sub?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
};

/**
 * Liest und prüft das Identitätstoken.
 *
 * Die Unterschrift wird nicht nachgerechnet, und das ist zulässig: das Token
 * kam eben direkt von Googles Tokenendpunkt über eine geprüfte
 * TLS-Verbindung, nicht über den Browser. OpenID Connect Core 3.1.3.7 lässt
 * die TLS-Prüfung an dieser Stelle ausdrücklich anstelle der
 * Signaturprüfung zu. Alles Übrige wird geprüft.
 *
 * Käme das Token je auf einem anderen Weg herein — etwa aus dem Browser —,
 * müsste hier zwingend die Unterschrift gegen Googles Schlüssel geprüft
 * werden.
 */
function readIdToken(idToken: string, expectedNonce: string): GoogleIdentity | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  let claims: IdTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as IdTokenClaims;
  } catch {
    return null;
  }

  if (typeof claims.iss !== "string" || !ISSUERS.has(claims.iss)) return null;
  if (claims.aud !== clientId()) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
  if (typeof claims.nonce !== "string" || !constantTimeEqual(claims.nonce, expectedNonce)) {
    return null;
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;
  if (typeof claims.email !== "string" || claims.email.length === 0) return null;

  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    // Eine unbestätigte Adresse darf kein Konto aufschliessen: sonst genügte
    // ein Google-Konto mit fremder Adresse, um sich als jemand anderes
    // auszugeben.
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : undefined,
  };
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export { constantTimeEqual as safeCompare };
