"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireUser } from "@/lib/auth/guard";
import {
  createSession,
  destroyAllSessions,
  hashPassword,
  newCalendarToken,
  verifyPassword,
} from "@/lib/auth/session";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

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
  revalidatePath("/team");

  return { ok: "Passwort geändert. Andere Geräte wurden abgemeldet." };
}

/**
 * Schaltet die Anmeldung mit Passwort ab oder wieder an.
 *
 * Abschalten geht nur, wenn ein Google-Konto verknüpft ist — sonst sperrt
 * man sich mit einem Klick selbst aus. Das ist keine Bequemlichkeitsfrage:
 * ohne diese Bedingung bräuchte es danach eine Administration, die das Konto
 * zurücksetzt, und wenn es das eigene Administrationskonto war, niemanden
 * mehr.
 */
export async function togglePasswordLoginAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const enable = formData.get("aktiv") === "ja";

  if (!enable && !user.googleSub) {
    redirect("/team/konto?fehler=ohne-google");
  }

  await db
    .update(staff)
    .set({ passwordLoginEnabled: enable, updatedAt: new Date() })
    .where(eq(staff.id, user.id));

  await record(
    enable ? "konto.passwort-anmeldung-an" : "konto.passwort-anmeldung-aus",
    { id: user.id, label: user.name },
  );

  revalidatePath("/team/konto");
}

/** Trennt das Google-Konto wieder. Nur, wenn ein Passwort als Weg bleibt. */
export async function unlinkGoogleAction(): Promise<void> {
  const user = await requireUser();

  if (!user.passwordLoginEnabled) {
    redirect("/team/konto?fehler=letzter-weg");
  }

  await db
    .update(staff)
    .set({ googleSub: null, googleLinkedAt: null, updatedAt: new Date() })
    .where(eq(staff.id, user.id));

  await record("konto.google-getrennt", { id: user.id, label: user.name });
  revalidatePath("/team/konto");
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
