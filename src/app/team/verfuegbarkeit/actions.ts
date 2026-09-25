"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { availabilityExceptions, availabilityRules, lessonTypes, staffLessonTypes } from "@/lib/db/schema";
import { occurrences } from "@/lib/availability-rules";
import { addDays, daysBetween, minutesSinceMidnight, todayInZurich, zurichWeekday } from "@/lib/time";

/** Höchstens rund zwei Monate am Stück, damit ein Tippfehler beim Enddatum
 * keine tausend Zeilen erzeugt. */
const MAX_RANGE_DAYS = 62;

/** Kursserien: höchstens ein Jahr und so viele Termine auf einmal. */
const MAX_SERIES_DAYS = 366;
const MAX_SERIES_DATES = 60;

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} Stunde${hours === 1 ? "" : "n"}`;
  if (hours === 0) return `${rest} Minuten`;
  return `${hours} Stunde${hours === 1 ? "" : "n"} ${rest} Minuten`;
}

/**
 * Ein Zeitfenster, das kürzer ist als ein einzelner Termin des Angebots,
 * erzeugt nie einen buchbaren Slot — `findSlots` verwirft es kommentarlos
 * (src/lib/booking.ts). Ohne diese Prüfung trägt man z. B. für den
 * Nothilfekurs (5 Stunden) ein 4-stündiges Fenster ein und wundert sich,
 * warum nichts angezeigt wird.
 */
async function assertWindowFitsOffering(
  lessonTypeId: string,
  von: string,
  bis: string,
): Promise<string | null> {
  const [offering] = await db
    .select({ durationMinutes: lessonTypes.durationMinutes })
    .from(lessonTypes)
    .where(eq(lessonTypes.id, lessonTypeId))
    .limit(1);

  if (!offering) return "Dieses Angebot gibt es nicht mehr.";

  const windowMinutes = minutesSinceMidnight(bis) - minutesSinceMidnight(von);
  if (windowMinutes < offering.durationMinutes) {
    return `Ein Termin dieses Angebots dauert ${formatDuration(offering.durationMinutes)} — das Zeitfenster ist zu kurz, damit einer hineinpasst.`;
  }
  return null;
}

const timeRange = z
  .object({
    von: z.string().regex(/^\d{2}:\d{2}$/, "Ungültige Uhrzeit."),
    bis: z.string().regex(/^\d{2}:\d{2}$/, "Ungültige Uhrzeit."),
  })
  .refine((value) => minutesSinceMidnight(value.bis) > minutesSinceMidnight(value.von), {
    message: "Das Ende muss nach dem Beginn liegen.",
  });

/** Ein echtes Kalenderdatum: "2026-02-30" passt ins Muster, gibt es aber nicht. */
function calendarDay(message: string) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((day) => {
      const parsed = new Date(`${day}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
    }, message);
}

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

/**
 * Prüft, dass die Lektionsart tatsächlich zu den Angeboten dieser Person
 * gehört — sonst liesse sich sonst ein Zeitfenster für ein Angebot
 * eintragen, das die Person gar nicht unterrichtet.
 */
async function assertOffering(staffId: string, lessonTypeId: string): Promise<boolean> {
  const [row] = await db
    .select({ lessonTypeId: staffLessonTypes.lessonTypeId })
    .from(staffLessonTypes)
    .where(
      and(eq(staffLessonTypes.staffId, staffId), eq(staffLessonTypes.lessonTypeId, lessonTypeId)),
    )
    .limit(1);
  return row !== undefined;
}

export type AvailabilityState = { error?: string; ok?: string };

/**
 * Zeit für ein Angebot an einem Datum, auf Wunsch wiederholt: täglich,
 * wöchentlich am selben Wochentag oder monatlich am selben Kalendertag.
 *
 * Fahr- und Schnupperstunden werden wiederkehrend zu einer Regel, auf Wunsch
 * mit Enddatum. Bei Kursen entsteht jeder Kurstermin einzeln, bis zu einem
 * Enddatum, das dort Pflicht ist.
 */
export async function addOfferingDateAction(
  _previous: AvailabilityState,
  formData: FormData,
): Promise<AvailabilityState> {
  const { user, staffId } = await resolveTarget(formData);

  const parsed = z
    .object({
      lessonTypeId: z.string().uuid("Bitte ein Angebot wählen."),
      tag: calendarDay("Bitte ein Datum wählen."),
      wiederholung: z.enum(["einmalig", "taeglich", "woechentlich", "monatlich"]),
      tagBis: calendarDay("Ungültiges Enddatum.").optional(),
      von: z.string(),
      bis: z.string(),
    })
    .safeParse({
      lessonTypeId: formData.get("lessonTypeId"),
      tag: formData.get("tag"),
      wiederholung: formData.get("wiederholung") || "einmalig",
      tagBis: formData.get("tagBis") || undefined,
      von: formData.get("von"),
      bis: formData.get("bis"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const range = timeRange.safeParse({ von: input.von, bis: input.bis });
  if (!range.success) return { error: range.error.issues[0].message };

  if (input.tag < todayInZurich()) return { error: "Das Datum liegt in der Vergangenheit." };

  if (!(await assertOffering(staffId, input.lessonTypeId))) {
    return { error: "Dieses Angebot gehört nicht zu dieser Person." };
  }

  const [offering] = await db
    .select({ capacity: lessonTypes.capacity })
    .from(lessonTypes)
    .where(eq(lessonTypes.id, input.lessonTypeId))
    .limit(1);
  if (!offering) return { error: "Dieses Angebot gibt es nicht mehr." };
  const isCourse = offering.capacity > 1;

  const fitError = await assertWindowFitsOffering(input.lessonTypeId, input.von, input.bis);
  if (fitError) return { error: fitError };

  if (input.tagBis && input.tagBis < input.tag) {
    return { error: "Das Enddatum darf nicht vor dem Startdatum liegen." };
  }

  let message: string;
  if (input.wiederholung === "einmalig") {
    await db.insert(availabilityExceptions).values({
      staffId,
      lessonTypeId: input.lessonTypeId,
      day: input.tag,
      startTime: input.von,
      endTime: input.bis,
      available: true,
    });
    message = isCourse ? "Kurstermin eingetragen." : "Datum eingetragen.";
  } else if (isCourse) {
    // Kurse bekommen jeden Termin einzeln: Absagen, Verschieben und
    // Warteliste hängen am einzelnen Kurstermin, nicht an einer Regel.
    if (!input.tagBis) return { error: "Bitte angeben, bis wann sich der Kurs wiederholt." };
    if (daysBetween(input.tag, input.tagBis) > MAX_SERIES_DAYS) {
      return { error: "Bitte höchstens ein Jahr im Voraus eintragen." };
    }
    const days = occurrences(input.wiederholung, input.tag, input.tagBis);
    if (days.length > MAX_SERIES_DATES) {
      return { error: `Das wären ${days.length} Kurstermine. Bitte höchstens ${MAX_SERIES_DATES} auf einmal eintragen.` };
    }
    // Schon eingetragene Kurstermine zur selben Zeit nicht verdoppeln.
    const existing = await db
      .select({ day: availabilityExceptions.day })
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.staffId, staffId),
          eq(availabilityExceptions.lessonTypeId, input.lessonTypeId),
          eq(availabilityExceptions.available, true),
          eq(availabilityExceptions.startTime, input.von),
          inArray(availabilityExceptions.day, days),
        ),
      );
    const taken = new Set(existing.map((row) => row.day));
    const fresh = days.filter((day) => !taken.has(day));
    if (fresh.length === 0) return { error: "Diese Kurstermine sind schon alle eingetragen." };
    await db.insert(availabilityExceptions).values(
      fresh.map((day) => ({
        staffId,
        lessonTypeId: input.lessonTypeId,
        day,
        startTime: input.von,
        endTime: input.bis,
        available: true,
      })),
    );
    message = `${fresh.length} ${fresh.length === 1 ? "Kurstermin" : "Kurstermine"} eingetragen.`;
  } else {
    await db.insert(availabilityRules).values({
      staffId,
      lessonTypeId: input.lessonTypeId,
      frequency: input.wiederholung,
      weekday: zurichWeekday(input.tag),
      startTime: input.von,
      endTime: input.bis,
      validFrom: input.tag,
      validUntil: input.tagBis ?? null,
    });
    message = "Wiederkehrende Zeit eingetragen.";
  }

  await record("verfuegbarkeit.datum-erstellt", { id: user.id, label: user.name }, {
    fuer: staffId,
    lektionsart: input.lessonTypeId,
    tag: input.tag,
    wiederholung: input.wiederholung,
    bis: input.tagBis,
  });

  revalidatePath("/team/verfuegbarkeit");
  revalidatePath("/team/kalender");
  return { ok: message };
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
      // Für Ferien & Co.: optionales Enddatum, sonst gilt nur `tag` selbst.
      tagBis: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Enddatum.")
        .optional(),
      von: z.string(),
      bis: z.string(),
      art: z.enum(["frei", "abwesend"]),
      lessonTypeId: z.string().uuid().optional(),
      notiz: z.string().trim().max(120).optional(),
    })
    .safeParse({
      tag: formData.get("tag"),
      tagBis: formData.get("tagBis") || undefined,
      von: formData.get("von"),
      bis: formData.get("bis"),
      art: formData.get("art"),
      lessonTypeId: formData.get("lessonTypeId") || undefined,
      notiz: formData.get("notiz") || undefined,
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const range = timeRange.safeParse({ von: parsed.data.von, bis: parsed.data.bis });
  if (!range.success) return { error: range.error.issues[0].message };

  // Zusätzliche Zeit gilt immer für ein bestimmtes Angebot: ohne Angebot
  // stünde sie auch jedem Kurs offen und erschiene dort als Kurstermin.
  if (parsed.data.art === "frei" && !parsed.data.lessonTypeId) {
    return { error: "Zusätzliche Zeit bitte beim jeweiligen Angebot eintragen." };
  }

  if (parsed.data.lessonTypeId && !(await assertOffering(staffId, parsed.data.lessonTypeId))) {
    return { error: "Dieses Angebot gehört nicht zu dieser Person." };
  }

  // Nur "zusätzlich frei" für ein bestimmtes Angebot muss ins Zeitfenster
  // dieses Angebots passen. "Abwesend" blockiert einfach eine Zeit, egal
  // wie kurz — und "alle Angebote" hat keine einzelne Dauer zu prüfen.
  if (parsed.data.art === "frei" && parsed.data.lessonTypeId) {
    const fitError = await assertWindowFitsOffering(
      parsed.data.lessonTypeId,
      parsed.data.von,
      parsed.data.bis,
    );
    if (fitError) return { error: fitError };
  }

  const endDay = parsed.data.tagBis ?? parsed.data.tag;
  if (endDay < parsed.data.tag) {
    return { error: "Das Enddatum darf nicht vor dem Startdatum liegen." };
  }

  const days: string[] = [];
  for (let day = parsed.data.tag; day <= endDay; day = addDays(day, 1)) {
    days.push(day);
    if (days.length > MAX_RANGE_DAYS) {
      return { error: `Bitte höchstens ${MAX_RANGE_DAYS} Tage auf einmal eintragen.` };
    }
  }

  await db.insert(availabilityExceptions).values(
    days.map((day) => ({
      staffId,
      lessonTypeId: parsed.data.lessonTypeId ?? null,
      day,
      startTime: parsed.data.von,
      endTime: parsed.data.bis,
      available: parsed.data.art === "frei",
      note: parsed.data.notiz ?? null,
    })),
  );

  await record("verfuegbarkeit.ausnahme-erstellt", { id: user.id, label: user.name }, {
    fuer: staffId,
    tag: parsed.data.tag,
    bis: endDay !== parsed.data.tag ? endDay : undefined,
    art: parsed.data.art,
    lektionsart: parsed.data.lessonTypeId ?? "alle",
  });

  revalidatePath("/team/verfuegbarkeit");
  revalidatePath("/team/kalender");
  const tage = days.length > 1 ? ` (${days.length} Tage)` : "";
  return {
    ok:
      (parsed.data.art === "frei" ? "Zusätzliche Zeit eingetragen." : "Abwesenheit eingetragen.") +
      tage,
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
