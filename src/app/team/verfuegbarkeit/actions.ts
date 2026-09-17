"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { availabilityExceptions, availabilityRules } from "@/lib/db/schema";
import { minutesSinceMidnight } from "@/lib/time";

const timeRange = z
  .object({
    von: z.string().regex(/^\d{2}:\d{2}$/, "Ungültige Uhrzeit."),
    bis: z.string().regex(/^\d{2}:\d{2}$/, "Ungültige Uhrzeit."),
  })
  .refine((value) => minutesSinceMidnight(value.bis) > minutesSinceMidnight(value.von), {
    message: "Das Ende muss nach dem Beginn liegen.",
  });

/**
 * Für wen darf die eingeloggte Person eintragen?
 *
 * Ohne diese Prüfung könnte jede angemeldete Person eine fremde
 * Mitarbeiter-Kennung ins Formular schreiben und deren Kalender ändern.
 */
async function resolveTarget(formData: FormData) {
  const user = await assertPermission("verfuegbarkeit.eigene");
  const requested = formData.get("person");

  if (typeof requested === "string" && requested.length > 0 && requested !== user.id) {
    if (!can(user.role, "verfuegbarkeit.alle")) {
      throw new Error("Du darfst nur deine eigene Verfügbarkeit ändern.");
    }
    return { user, staffId: requested };
  }

  return { user, staffId: user.id };
}

export type AvailabilityState = { error?: string; ok?: string };

export async function addRuleAction(
  _previous: AvailabilityState,
  formData: FormData,
): Promise<AvailabilityState> {
  const { user, staffId } = await resolveTarget(formData);

  const parsed = z
    .object({
      wochentag: z.coerce.number().int().min(0).max(6),
      von: z.string(),
      bis: z.string(),
    })
    .safeParse({
      wochentag: formData.get("wochentag"),
      von: formData.get("von"),
      bis: formData.get("bis"),
    });

  if (!parsed.success) return { error: "Bitte prüfe die Eingaben." };

  const range = timeRange.safeParse({ von: parsed.data.von, bis: parsed.data.bis });
  if (!range.success) return { error: range.error.issues[0].message };

  await db.insert(availabilityRules).values({
    staffId,
    weekday: parsed.data.wochentag,
    startTime: parsed.data.von,
    endTime: parsed.data.bis,
  });

  await record("verfuegbarkeit.regel-erstellt", { id: user.id, label: user.name }, {
    fuer: staffId,
    wochentag: parsed.data.wochentag,
  });

  revalidatePath("/team/verfuegbarkeit");
  revalidatePath("/team/kalender");
  return { ok: "Zeitfenster eingetragen." };
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const { user, staffId } = await resolveTarget(formData);
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  // Die Kennung der Person steht in der Bedingung: ein fremder Eintrag wird
  // so auch dann nicht gelöscht, wenn jemand die Kennung errät.
  await db
    .delete(availabilityRules)
    .where(and(eq(availabilityRules.id, id), eq(availabilityRules.staffId, staffId)));

  await record("verfuegbarkeit.regel-geloescht", { id: user.id, label: user.name }, { id });
  revalidatePath("/team/verfuegbarkeit");
  revalidatePath("/team/kalender");
}

export async function addExceptionAction(
  _previous: AvailabilityState,
  formData: FormData,
): Promise<AvailabilityState> {
  const { user, staffId } = await resolveTarget(formData);

  const parsed = z
    .object({
      tag: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
      von: z.string(),
      bis: z.string(),
      art: z.enum(["frei", "abwesend"]),
      notiz: z.string().trim().max(120).optional(),
    })
    .safeParse({
      tag: formData.get("tag"),
      von: formData.get("von"),
      bis: formData.get("bis"),
      art: formData.get("art"),
      notiz: formData.get("notiz") || undefined,
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const range = timeRange.safeParse({ von: parsed.data.von, bis: parsed.data.bis });
  if (!range.success) return { error: range.error.issues[0].message };

  await db.insert(availabilityExceptions).values({
    staffId,
    day: parsed.data.tag,
    startTime: parsed.data.von,
    endTime: parsed.data.bis,
    available: parsed.data.art === "frei",
    note: parsed.data.notiz ?? null,
  });

  await record("verfuegbarkeit.ausnahme-erstellt", { id: user.id, label: user.name }, {
    fuer: staffId,
    tag: parsed.data.tag,
    art: parsed.data.art,
  });

  revalidatePath("/team/verfuegbarkeit");
  revalidatePath("/team/kalender");
  return {
    ok: parsed.data.art === "frei" ? "Zusätzliche Zeit eingetragen." : "Abwesenheit eingetragen.",
  };
}

export async function deleteExceptionAction(formData: FormData): Promise<void> {
  const { user, staffId } = await resolveTarget(formData);
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  await db
    .delete(availabilityExceptions)
    .where(and(eq(availabilityExceptions.id, id), eq(availabilityExceptions.staffId, staffId)));

  await record("verfuegbarkeit.ausnahme-geloescht", { id: user.id, label: user.name }, { id });
  revalidatePath("/team/verfuegbarkeit");
  revalidatePath("/team/kalender");
}
