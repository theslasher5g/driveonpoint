"use server";

import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { record } from "@/lib/audit";
import { lessonTypeBySlug } from "@/lib/booking";
import { sendWaitlistConfirmation } from "@/lib/booking-mail";
import { redeemSolution } from "@/lib/captcha";
import { db } from "@/lib/db";
import { waitlistEntries } from "@/lib/db/schema";
import { blockIp, blockedUntil, consume } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/lib/request";
import { zurichToInstant } from "@/lib/time";
import { isSessionFull } from "@/lib/waitlist";

export type WaitlistState = {
  ok?: boolean;
  /** Ist doch ein Platz frei, zeigt das Formular statt eines Fehlers den Buchungslink. */
  bookable?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const schema = z.object({
  angebot: z.string().min(1).max(60),
  tag: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  zeit: z.string().regex(/^\d{2}:\d{2}$/, "Ungültige Uhrzeit."),
  name: z
    .string()
    .trim()
    .min(2, "Bitte gib deinen Namen an.")
    .max(120, "Der Name ist zu lang."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(180, "Die Adresse ist zu lang.")
    .email("Diese Mailadresse stimmt nicht."),
  telefon: z
    .string()
    .trim()
    .min(6, "Bitte gib eine Telefonnummer an.")
    .max(30, "Die Nummer ist zu lang.")
    .regex(/^[0-9+().\s/-]+$/, "Die Nummer enthält unerlaubte Zeichen."),
});

const PERSON_FIELDS = new Set(["name", "email", "telefon"]);

export async function joinWaitlistAction(
  previous: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const result = await join(previous, formData);
  if (result.ok) return result;

  const values: Record<string, string> = {};
  for (const key of ["name", "email", "telefon"]) {
    const value = formData.get(key);
    if (typeof value === "string") values[key] = value.slice(0, 200);
  }
  return { ...result, values };
}

async function join(
  _previous: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const ip = await clientIp();

  if (await blockedUntil(ip)) {
    return {
      error:
        "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut.",
    };
  }

  if ((formData.get("website") as string | null)?.length) {
    await blockIp(ip, 60, "Formularfalle bei der Warteliste ausgelöst");
    return { error: "Die Anfrage konnte nicht verarbeitet werden." };
  }

  const verdict = await consume(`warteliste:${ip}`, 5, 3600);
  if (!verdict.ok) {
    return {
      error:
        "Zu viele Anfragen von dieser Verbindung. Bitte versuche es später.",
    };
  }

  const parsed = schema.safeParse({
    angebot: formData.get("angebot"),
    tag: formData.get("tag"),
    zeit: formData.get("zeit"),
    name: formData.get("name"),
    email: formData.get("email"),
    telefon: formData.get("telefon") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!PERSON_FIELDS.has(key)) return { error: issue.message };
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Bitte prüfe die markierten Felder.", fieldErrors };
  }

  if (
    !(await redeemSolution(
      "warteliste",
      formData.get("captcha") as string | null,
    ))
  ) {
    return {
      error:
        "Die Sicherheitsprüfung ist nicht durchgelaufen. Warte einen Moment und sende noch einmal.",
    };
  }

  const input = parsed.data;
  const lessonType = await lessonTypeBySlug(input.angebot);
  if (!lessonType || !lessonType.active || lessonType.capacity <= 1) {
    return { error: "Für dieses Angebot gibt es keine Warteliste." };
  }

  // Nur für einen Kurstermin, den es gibt und der voll ist. Ist inzwischen
  // ein Platz frei, direkt buchen statt warten.
  if (!(await isSessionFull(lessonType, input.tag, input.zeit))) {
    return { bookable: true };
  }

  const startsAt = zurichToInstant(input.tag, input.zeit);
  const [existing] = await db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.lessonTypeId, lessonType.id),
        eq(waitlistEntries.startsAt, startsAt),
        sql`lower(${waitlistEntries.email}) = ${input.email}`,
      ),
    )
    .limit(1);

  // Wer schon drauf steht, bekommt dieselbe Antwort — ohne zweite Mail und
  // ohne zu verraten, welche Adressen eingetragen sind.
  if (existing) return { ok: true };

  const token = randomBytes(24).toString("base64url");
  await db.insert(waitlistEntries).values({
    lessonTypeId: lessonType.id,
    startsAt,
    name: input.name,
    email: input.email,
    phone: input.telefon,
    token,
  });

  try {
    await sendWaitlistConfirmation({
      to: input.email,
      name: input.name,
      lessonName: lessonType.name,
      day: input.tag,
      time: input.zeit,
      removeToken: token,
    });
  } catch (error) {
    // Der Eintrag steht; die Mail ist nur die Bestätigung dazu.
    console.error(
      "Wartelisten-Bestätigung konnte nicht versendet werden:",
      error,
    );
  }

  await record(
    "warteliste.eingetragen",
    { label: "Website" },
    {
      angebot: lessonType.name,
      termin: `${input.tag} ${input.zeit}`,
      adresse: hashIp(ip),
    },
  );

  return { ok: true };
}
