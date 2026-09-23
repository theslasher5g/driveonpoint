import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { consume } from "./rate-limit";

/**
 * Rechenaufgabe statt Bilderrätsel.
 *
 * Der Server nennt eine Zahl zwischen 0 und `max`, verrät aber nur deren
 * SHA-256-Summe. Der Browser probiert sie durch — ein paar hundert
 * Millisekunden — und schickt sie zurück. Für einen Menschen unsichtbar, für
 * ein Massenskript teuer genug, um Formularspam unattraktiv zu machen.
 *
 * Nach dem Verfahren von Altcha, hier direkt umgesetzt: keine fremde
 * Gegenstelle, keine Cookies, keine Weitergabe der IP-Adresse an Dritte.
 * Das erspart die Einwilligung, die ein eingebundenes Google reCAPTCHA
 * nach DSGVO und revDSG bräuchte.
 */

// Bewusst moderat: die Aufgabe muss auf einem vier Jahre alten Telefon in
// unter einer Sekunde fallen, sonst wartet echte Kundschaft vor dem Formular.
const MAX_NUMBER = 60_000;
const VALID_FOR_MS = 15 * 60 * 1000;

export type Challenge = {
  algorithm: "SHA-256";
  challenge: string;
  salt: string;
  maxnumber: number;
  signature: string;
  expires: number;
};

function sign(payload: string): string {
  return createHmac("sha256", env.captchaSecret).update(payload).digest("hex");
}

export function createChallenge(scope: string): Challenge {
  const expires = Date.now() + VALID_FOR_MS;
  const salt = `${randomInt(1e9).toString(36)}${expires.toString(36)}`;
  const secretNumber = randomInt(MAX_NUMBER);
  const challenge = createHash("sha256").update(`${salt}${secretNumber}`).digest("hex");

  return {
    algorithm: "SHA-256",
    challenge,
    salt,
    maxnumber: MAX_NUMBER,
    signature: sign(`${scope}:${challenge}:${expires}`),
    expires,
  };
}

type Solution = {
  challenge?: unknown;
  salt?: unknown;
  number?: unknown;
  signature?: unknown;
  expires?: unknown;
};

/**
 * Prüft die Lösung und entwertet sie. Die Aufgabe selbst speichert der
 * Server nicht — die Signatur belegt, dass sie von uns stammt und wofür sie
 * gilt. Gespeichert wird nur, dass sie eingelöst ist: ohne das liesse sich eine einmal
 * gelöste Aufgabe 15 Minuten lang beliebig oft einreichen — von beliebig
 * vielen Adressen aus, womit die Rechenarbeit für Massenversand entfiele.
 * Erst nach der Prüfung der Formularfelder aufrufen, damit ein Tippfehler
 * die Lösung nicht verbraucht.
 */
export async function redeemSolution(
  scope: string,
  raw: string | null | undefined,
): Promise<boolean> {
  const challenge = solvedChallenge(scope, raw);
  if (!challenge) return false;
  const verdict = await consume(`captcha-eingeloest:${challenge}`, 1, VALID_FOR_MS / 1000);
  return verdict.ok;
}

function solvedChallenge(scope: string, raw: string | null | undefined): string | null {
  if (!raw) return null;

  let parsed: Solution;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Solution;
  } catch {
    return null;
  }

  const { challenge, salt, number, signature, expires } = parsed;
  if (
    typeof challenge !== "string" ||
    typeof salt !== "string" ||
    typeof signature !== "string" ||
    typeof number !== "number" ||
    typeof expires !== "number"
  ) {
    return null;
  }

  if (!Number.isInteger(number) || number < 0 || number > MAX_NUMBER) return null;
  if (expires < Date.now()) return null;

  const expected = sign(`${scope}:${challenge}:${expires}`);
  if (!constantTimeEqual(expected, signature)) return null;

  const recomputed = createHash("sha256").update(`${salt}${number}`).digest("hex");
  return constantTimeEqual(recomputed, challenge) ? challenge : null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
