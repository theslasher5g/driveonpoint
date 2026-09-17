"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { lessonTypes } from "@/lib/db/schema";

export type PriceState = { error?: string; ok?: string };

/**
 * Beträge werden als Franken eingegeben und als Rappen gespeichert.
 * Gleitkommazahlen würden bei Rabattrechnungen Rundungsfehler ansammeln.
 */
const schema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, "Der Name fehlt.").max(80, "Der Name ist zu lang."),
  beschreibung: z.string().trim().max(160, "Die Beschreibung ist zu lang."),
  preis: z.coerce
    .number()
    .min(0, "Der Preis darf nicht negativ sein.")
    .max(10_000, "Der Preis ist unplausibel hoch."),
  dauer: z.coerce.number().int().min(15, "Mindestens 15 Minuten.").max(600),
  pause: z.coerce.number().int().min(0).max(120),
  plaetze: z.coerce.number().int().min(1, "Mindestens ein Platz.").max(100),
  vorlauf: z.coerce.number().int().min(0).max(720),
  aktiv: z.enum(["ja", "nein"]),
});

export async function updateLessonTypeAction(
  _previous: PriceState,
  formData: FormData,
): Promise<PriceState> {
  const user = await assertPermission("preise.verwalten");

  const parsed = schema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    beschreibung: formData.get("beschreibung") ?? "",
    preis: formData.get("preis"),
    dauer: formData.get("dauer"),
    pause: formData.get("pause"),
    plaetze: formData.get("plaetze"),
    vorlauf: formData.get("vorlauf"),
    aktiv: formData.get("aktiv"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const input = parsed.data;
  const priceRappen = Math.round(input.preis * 100);

  await db
    .update(lessonTypes)
    .set({
      name: input.name,
      shortDescription: input.beschreibung,
      priceRappen,
      durationMinutes: input.dauer,
      bufferMinutes: input.pause,
      capacity: input.plaetze,
      leadTimeHours: input.vorlauf,
      active: input.aktiv === "ja",
      updatedAt: new Date(),
    })
    .where(eq(lessonTypes.id, input.id));

  await record("preis.geaendert", { id: user.id, label: user.name }, {
    angebot: input.name,
    preisRappen: priceRappen,
  });

  revalidatePath("/team/preise");
  revalidatePath("/preise");
  revalidatePath("/buchen");
  revalidatePath("/");

  return { ok: `${input.name} gespeichert.` };
}
