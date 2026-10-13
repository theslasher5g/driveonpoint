"use server";

import { after } from "next/server";
import { z } from "zod";
import { issuePasswordReset } from "@/lib/auth/password-reset";
import { blockedUntil, consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

export type RequestResetState = { error?: string; sent?: boolean };

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(180) });

/**
 * Fordert einen Link zum Zurücksetzen an. Die Antwort ist immer dieselbe,
 * ob es zur Adresse ein Konto gibt oder nicht — und die Mail geht erst nach
 * der Antwort raus (after), damit auch die Antwortzeit nichts verrät.
 */
export async function requestResetAction(
  _previous: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const ip = await clientIp();
  if (await blockedUntil(ip)) {
    return { error: "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut." };
  }

  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Bitte gib eine gültige Mailadresse ein." };
  const { email } = parsed.data;

  const fromIp = await consume(`passwort-reset-ip:${ip}`, 5, 3600);
  if (!fromIp.ok) return { error: "Zu viele Anfragen. Bitte versuche es in einer Stunde erneut." };

  // Höchstens drei Mails pro Stunde an dieselbe Adresse — sonst liesse sich
  // ein Postfach mit Reset-Mails fluten. Überzählige Anfragen bekommen
  // trotzdem dieselbe Antwort.
  const forAccount = await consume(`passwort-reset-konto:${email}`, 3, 3600);
  if (forAccount.ok) {
    after(async () => {
      try {
        await issuePasswordReset(email);
      } catch (error) {
        console.error("Mail zum Zurücksetzen konnte nicht verschickt werden:", error);
      }
    });
  }

  return { sent: true };
}
