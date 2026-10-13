"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import { completePasswordReset } from "@/lib/auth/password-reset";
import { blockedUntil, consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

export type NewPasswordState = { error?: string };

const schema = z
  .object({
    token: z.string().min(1).max(100),
    neu: z
      .string()
      .min(12, "Das neue Passwort braucht mindestens 12 Zeichen.")
      .max(200, "Das Passwort ist zu lang."),
    wiederholung: z.string(),
  })
  .refine((value) => value.neu === value.wiederholung, {
    message: "Die beiden Passwörter stimmen nicht überein.",
  });

export async function setNewPasswordAction(
  _previous: NewPasswordState,
  formData: FormData,
): Promise<NewPasswordState> {
  const ip = await clientIp();
  if (await blockedUntil(ip)) {
    return { error: "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut." };
  }
  const verdict = await consume(`passwort-reset-setzen:${ip}`, 10, 900);
  if (!verdict.ok) return { error: "Zu viele Versuche. Bitte in einer Viertelstunde erneut." };

  const parsed = schema.safeParse({
    token: formData.get("token"),
    neu: formData.get("neu"),
    wiederholung: formData.get("wiederholung"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const done = await completePasswordReset(parsed.data.token, parsed.data.neu);
  if (!done) {
    return { error: "Der Link ist abgelaufen oder wurde schon verwendet. Fordere einen neuen an." };
  }

  await record("passwort.zurueckgesetzt", { id: done.staffId, label: done.name });
  redirect("/team/anmelden?hinweis=passwort-neu");
}
