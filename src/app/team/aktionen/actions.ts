"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { promotions } from "@/lib/db/schema";

export type PromotionState = { error?: string; ok?: string };

const schema = z
  .object({
    label: z
      .string()
      .trim()
      .min(3, "Gib der Aktion einen Namen, den Kundinnen und Kunden verstehen.")
      .max(80, "Der Name ist zu lang."),
    art: z.enum(["prozent", "betrag"]),
    wert: z.coerce.number().positive("Der Rabatt muss grösser als null sein."),
    angebot: z.string().optional(),
    von: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Startdatum."),
    bis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Enddatum."),
  })
  .refine((value) => value.bis >= value.von, {
    message: "Das Ende darf nicht vor dem Start liegen.",
  })
  .refine((value) => value.art !== "prozent" || value.wert <= 100, {
    message: "Mehr als 100 Prozent Rabatt gibt es nicht.",
  });

export async function createPromotionAction(
  _previous: PromotionState,
  formData: FormData,
): Promise<PromotionState> {
  const user = await assertPermission("aktionen.verwalten");

  const parsed = schema.safeParse({
    label: formData.get("label"),
    art: formData.get("art"),
    wert: formData.get("wert"),
    angebot: formData.get("angebot") || undefined,
    von: formData.get("von"),
    bis: formData.get("bis"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  await db.insert(promotions).values({
    label: input.label,
    percentOff: input.art === "prozent" ? Math.round(input.wert) : null,
    amountOffRappen: input.art === "betrag" ? Math.round(input.wert * 100) : null,
    lessonTypeId: input.angebot && input.angebot !== "alle" ? input.angebot : null,
    startsOn: input.von,
    endsOn: input.bis,
    active: true,
    createdBy: user.id,
  });

  await record("aktion.erstellt", { id: user.id, label: user.name }, { name: input.label });

  revalidateEverywhere();
  return { ok: `„${input.label}“ läuft ab ${input.von}.` };
}

export async function togglePromotionAction(formData: FormData): Promise<void> {
  const user = await assertPermission("aktionen.verwalten");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const shouldActivate = formData.get("aktiv") === "ja";

  await db.update(promotions).set({ active: shouldActivate }).where(eq(promotions.id, id));
  await record("aktion.umgeschaltet", { id: user.id, label: user.name }, { id, aktiv: shouldActivate });

  revalidateEverywhere();
}

export async function deletePromotionAction(formData: FormData): Promise<void> {
  const user = await assertPermission("aktionen.verwalten");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  await db.delete(promotions).where(eq(promotions.id, id));
  await record("aktion.geloescht", { id: user.id, label: user.name }, { id });

  revalidateEverywhere();
}

/** Preise erscheinen auf mehreren Seiten — alle müssen mitziehen. */
function revalidateEverywhere(): void {
  revalidatePath("/team/aktionen");
  revalidatePath("/preise");
  revalidatePath("/buchen");
  revalidatePath("/fahrstunden");
  revalidatePath("/vku");
  revalidatePath("/nothilfekurs");
  revalidatePath("/");
}
