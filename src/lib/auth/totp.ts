import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Zwei-Faktor-Authentifizierung per TOTP (RFC 6238, aufbauend auf HOTP nach
 * RFC 4226). Läuft vollständig lokal: der Code entsteht aus einem geteilten
 * Geheimnis und der aktuellen Uhrzeit, ohne dass je etwas an einen fremden
 * Dienst geht. Die Google Authenticator App ist nur einer von vielen
 * Clients, die diesen offenen Standard sprechen — Authy, 1Password und
 * praktisch jede andere Authenticator-App funktionieren genauso.
 *
 * Bewusst ohne fremde Bibliothek für die Berechnung selbst: der Algorithmus
 * ist kurz genug, um ihn nachzuvollziehen, statt ihn einer weiteren
 * Abhängigkeit anzuvertrauen. Für den QR-Code wird die Bibliothek "qrcode"
 * verwendet, die nur eine Bildmatrix aus dem übergebenen Text zeichnet —
 * auch das ohne jede Netzwerkanfrage.
 */

const DIGITS = 6;
const PERIOD_SECONDS = 30;
// Erlaubt eine Abweichung von je einem Zeitfenster vor und zurück, gegen
// leicht verschobene Uhren auf dem Telefon.
const WINDOW_STEPS = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Erzeugt ein neues, noch unbestätigtes Geheimnis (20 Bytes, wie üblich). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * otpauth://-Adresse für den QR-Code.
 *
 * Algorithmus, Ziffernzahl und Zeitfenster stehen bewusst auf den
 * Standardwerten (SHA1, 6 Ziffern, 30 Sekunden): das sind die einzigen
 * Werte, die wirklich jede Authenticator-App unterstützt. Abweichende Werte
 * würden die Kompatibilität mit älteren Apps aufs Spiel setzen, ohne einen
 * echten Sicherheitsgewinn.
 */
export function otpauthUrl(secret: string, accountLabel: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function hotp(secret: Buffer, counter: bigint): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

function currentStep(): bigint {
  return BigInt(Math.floor(Date.now() / 1000 / PERIOD_SECONDS));
}

/**
 * Prüft einen eingegebenen Code gegen das Geheimnis.
 *
 * Erlaubt ist ein Fenster von einem Schritt vor und zurück (insgesamt drei
 * geprüfte Codes), damit eine leicht falsch gehende Telefonuhr nicht jeden
 * Anmeldeversuch scheitern lässt. Ein grösseres Fenster stünde dagegen: es
 * gäbe mehr gültige Codes gleichzeitig und würde das Durchprobieren
 * erleichtern.
 */
export function verifyTotp(secretBase32: string, token: string): boolean {
  const cleaned = token.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;

  const secret = base32Decode(secretBase32);
  const step = currentStep();

  for (let offset = -WINDOW_STEPS; offset <= WINDOW_STEPS; offset += 1) {
    const candidate = hotp(secret, step + BigInt(offset));
    if (constantTimeEqual(candidate, cleaned)) return true;
  }
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// --- Verschlüsselung des gespeicherten Geheimnisses -----------------------

/**
 * Schlüssel für die Secret-Verschlüsselung, aus SESSION_SECRET abgeleitet.
 *
 * Kein eigenes Geheimnis dafür einzuführen hält die Einrichtung einfach;
 * HMAC mit einem festen Kontext-Text trennt diesen Schlüssel sauber von
 * anderen Ableitungen desselben Geheimnisses (siehe hashIp in request.ts).
 */
function encryptionKey(): Buffer {
  return createHmac("sha256", env.sessionSecret).update("totp-secret-encryption").digest();
}

/** Verschlüsselt das Geheimnis für die Ablage in der Datenbank (AES-256-GCM). */
export function encryptSecret(secretBase32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secretBase32, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(stored: string): string | null {
  try {
    const raw = Buffer.from(stored, "base64");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Ein beschädigter Wert oder ein zwischenzeitlich gewechseltes
    // SESSION_SECRET darf nicht als Serverfehler durchschlagen.
    return null;
  }
}

// --- Wiederherstellungscodes -----------------------------------------------

export type RecoveryCode = { hash: string; usedAt: string | null };

/** Für die manuelle Eingabe statt QR-Scan, in 4er-Gruppen zum Ablesen. */
export function formatSecretForDisplay(secretBase32: string): string {
  return secretBase32.match(/.{1,4}/g)?.join(" ") ?? secretBase32;
}

function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Erzeugt neue Wiederherstellungscodes. Der Klartext wird nur hier zurückgegeben. */
export function generateRecoveryCodes(count = 8): { plain: string[]; stored: RecoveryCode[] } {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // ohne i, l, o, 0, 1
  const plain: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(10);
    let code = "";
    for (const byte of bytes) code += alphabet[byte % alphabet.length];
    plain.push(`${code.slice(0, 5)}-${code.slice(5, 10)}`);
  }

  const stored = plain.map((code) => ({ hash: hashRecoveryCode(code), usedAt: null }));
  return { plain, stored };
}

/**
 * Prüft einen Wiederherstellungscode und verbraucht ihn bei Treffer.
 *
 * Gibt die aktualisierte Liste zurück, statt in der Datenbank zu schreiben —
 * das Schreiben bleibt bei der aufrufenden Stelle, die ohnehin schon eine
 * Datenbankverbindung offen hat.
 */
export function consumeRecoveryCode(
  codes: RecoveryCode[],
  input: string,
): { codes: RecoveryCode[]; matched: boolean } {
  const cleaned = input.trim().toLowerCase();
  const hash = hashRecoveryCode(cleaned);

  let matched = false;
  const updated = codes.map((entry) => {
    if (!matched && entry.usedAt === null && constantTimeEqual(entry.hash, hash)) {
      matched = true;
      return { ...entry, usedAt: new Date().toISOString() };
    }
    return entry;
  });

  return { codes: updated, matched };
}
