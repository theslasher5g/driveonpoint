"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import {
  activePromotions,
  applyPromotions,
  CONFIRM_WINDOW_MINUTES,
  createBooking,
  findSlots,
  lessonTypeBySlug,
  newConfirmToken,
  withinBookingHorizon,
} from "@/lib/booking";
import { sendConfirmationRequest, type CourseParts } from "@/lib/booking-mail";
import { redeemSolution } from "@/lib/captcha";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { blockIp, blockedUntil, consume, hit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/lib/request";
import { site } from "@/lib/site";
import { daysBetween, minutesSinceMidnight } from "@/lib/time";

export type BookingState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Das Eingetippte, zurück ans Formular — siehe echoValues. */
  values?: Record<string, string>;
};

/**
 * Nach einer Server Action setzt React das Formular zurück. Ohne diese Werte
 * standen nach einem Tippfehler in der Telefonnummer auch Name, Mailadresse
 * und das AGB-Häkchen wieder leer da.
 */
function echoValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of ["name", "email", "telefon", "bemerkung", "agb", "bewertung"]) {
    const value = formData.get(key);
    if (typeof value === "string") values[key] = value.slice(0, 600);
  }
  return values;
}

// Die Buchung selbst leitet bei Erfolg weiter; zurück kommt nur ein Fehler.
export async function createBookingAction(
  previous: BookingState,
  formData: FormData,
): Promise<BookingState> {
  return { ...(await bookSingle(previous, formData)), values: echoValues(formData) };
}

export async function createMultiBookingAction(
  previous: BookingState,
  formData: FormData,
): Promise<BookingState> {
  return { ...(await bookSeveral(previous, formData)), values: echoValues(formData) };
}

/** Die Felder, die das Formular sichtbar markieren kann. */
const PERSON_FIELDS = new Set(["name", "email", "telefon", "bemerkung", "agb"]);

/**
 * Ein Fehler an einem unsichtbaren Feld (zu viele Termine, ungültiges
 * Datum) erschien vorher nur als „Bitte prüfe die markierten Felder" — ohne
 * dass etwas markiert war. Solche Fehler kommen jetzt als eigene Meldung.
 */
function validationError(issues: z.ZodIssue[]): BookingState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0]);
    if (!PERSON_FIELDS.has(key)) return { error: issue.message };
    fieldErrors[key] ??= issue.message;
  }
  return { error: "Bitte prüfe die markierten Felder.", fieldErrors };
}

/** Das erste Paar gewählter Zeiten am selben Tag, das sich überschneidet. */
function overlappingPick(termine: string[], durationMinutes: number): [string, string] | null {
  const picked = [...new Set(termine)].sort();
  for (let index = 1; index < picked.length; index += 1) {
    const [prevDay, prevTime] = picked[index - 1].split("T");
    const [day, time] = picked[index].split("T");
    if (prevDay !== day) continue;
    if (minutesSinceMidnight(time) - minutesSinceMidnight(prevTime) < durationMinutes) {
      return [prevTime, time];
    }
  }
  return null;
}

// Nach jeder Antwort löst das Formular eine neue Aufgabe (siehe
// CaptchaField) — erneutes Absenden genügt, ein Neuladen braucht es nicht.
const CAPTCHA_FAILED =
  "Die Sicherheitsprüfung ist nicht durchgelaufen. Warte einen Moment und sende noch einmal.";

/**
 * Eingabeprüfung an der Systemgrenze.
 *
 * Alles wird begrenzt und auf Form geprüft. Gespeichert wird ausschliesslich,
 * was hier durchkommt — die Datenbankschicht arbeitet mit gebundenen
 * Parametern, sodass Inhalte nie als Befehl gelesen werden können.
 */
const personFields = {
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(120, "Der Name ist zu lang."),
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
  bemerkung: z.string().trim().max(500, "Die Bemerkung ist zu lang.").optional(),
  agb: z.literal("ja", { errorMap: () => ({ message: "Bitte bestätige die Bedingungen." }) }),
};

const schema = z.object({
  angebot: z.string().min(1).max(60),
  tag: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  zeit: z.string().regex(/^\d{2}:\d{2}$/, "Ungültige Uhrzeit."),
  ...personFields,
});

/** Höchstens so viele Fahrstunden auf einmal — genug für "heute 8, 9 und
 * 10 Uhr" oder verteilt auf mehrere Tage, ohne dass sich das Limit für
 * Buchungen je Stunde und IP durch wenige, sehr grosse Anfragen umgehen liesse. */
const MAX_TERMINE = 6;

const multiSchema = z.object({
  angebot: z.string().min(1).max(60),
  termine: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Ungültiger Termin."))
    .min(1, "Bitte wähle mindestens einen Termin.")
    .max(MAX_TERMINE, `Bitte wähle höchstens ${MAX_TERMINE} Termine auf einmal.`),
  ...personFields,
});

async function bookSingle(
  _previous: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const ip = await clientIp();

  if (await blockedUntil(ip)) {
    return { error: "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut." };
  }

  // Unsichtbares Feld. Menschen füllen es nicht aus, einfache Skripte schon.
  if ((formData.get("website") as string | null)?.length) {
    await blockIp(ip, 60, "Formularfalle bei Buchung ausgelöst");
    return { error: "Die Anfrage konnte nicht verarbeitet werden." };
  }

  const verdict = await consume(`buchung:${ip}`, 5, 3600);
  if (!verdict.ok) {
    await record("buchung.begrenzt", { label: "System" }, { adresse: hashIp(ip) });
    return {
      error: "Zu viele Buchungen von dieser Verbindung. Bitte versuche es in einer Stunde.",
    };
  }

  const parsed = schema.safeParse({
    angebot: formData.get("angebot"),
    tag: formData.get("tag"),
    zeit: formData.get("zeit"),
    name: formData.get("name"),
    email: formData.get("email"),
    telefon: formData.get("telefon"),
    bemerkung: formData.get("bemerkung") || undefined,
    agb: formData.get("agb"),
  });

  if (!parsed.success) return validationError(parsed.error.issues);

  if (!(await redeemSolution("buchung", formData.get("captcha") as string | null))) {
    return { error: CAPTCHA_FAILED };
  }

  const input = parsed.data;
  const lessonType = await lessonTypeBySlug(input.angebot);
  if (!lessonType || !lessonType.active) {
    return { error: "Dieses Angebot gibt es nicht mehr." };
  }

  if (!withinBookingHorizon(input.tag, lessonType)) {
    return { error: "Dieser Termin ist nicht mehr frei. Bitte wähle einen anderen." };
  }

  // Der gewählte Termin wird gegen die tatsächliche Verfügbarkeit geprüft.
  // Ein manipuliertes Formular kann so keinen Termin ausserhalb der
  // Arbeitszeiten oder in einer Lücke erzwingen.
  const slots = await findSlots({ lessonType, fromDay: input.tag, days: 1 });
  const slot = slots.find((entry) => entry.day === input.tag && entry.time === input.zeit);
  if (!slot) {
    return { error: "Dieser Termin ist nicht mehr frei. Bitte wähle einen anderen." };
  }

  const priced = applyPromotions(lessonType, await activePromotions());
  const confirmation = pendingConfirmation();

  const result = await createBooking({
    lessonType,
    staffId: slot.staffIds[0],
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    second: slot.second,
    customerName: input.name,
    customerEmail: input.email,
    customerPhone: input.telefon,
    customerNote: input.bemerkung,
    priceRappen: priced.finalRappen,
    promotionLabel: priced.promotion?.label ?? null,
    retentionDays: env.retentionDays,
    confirmation,
    reviewConsent: formData.get("bewertung") === "ja",
  });

  if ("error" in result) {
    return { error: result.error };
  }

  await record(
    "buchung.erstellt",
    { label: "Website" },
    { referenz: result.reference, angebot: lessonType.slug },
  );

  const mailError = await requestConfirmation({
    to: input.email,
    name: input.name,
    token: confirmation.token,
    lessonName: lessonType.name,
    appointments: [
      {
        day: input.tag,
        time: input.zeit,
        // Kurse: mit Ende und 2. Kurstag in der Mail.
        ...(lessonType.capacity > 1 ? { endsAt: slot.endsAt, second: slot.second } : {}),
      },
    ],
  });
  if (mailError) return { error: mailError };

  redirect("/buchen/reserviert");
}

/** Token und Frist für eine neue Online-Buchung, die noch bestätigt werden muss. */
function pendingConfirmation() {
  return {
    token: newConfirmToken(),
    expiresAt: new Date(Date.now() + CONFIRM_WINDOW_MINUTES * 60_000),
  };
}

/**
 * Schickt die Bitte um Bestätigung. Kommt sie nicht raus, kann niemand den
 * Termin je bestätigen — dann wird die Anfrage sofort wieder gelöscht, statt
 * eine Stunde lang einen Platz zu blockieren, und die Person erfährt es
 * direkt im Formular.
 */
async function requestConfirmation(details: {
  to: string;
  name: string;
  token: string;
  lessonName: string;
  appointments: ({ day: string; time: string } & CourseParts)[];
}): Promise<string | null> {
  try {
    await sendConfirmationRequest({
      to: details.to,
      name: details.name,
      confirmToken: details.token,
      lessonName: details.lessonName,
      appointments: details.appointments,
      expiresMinutes: CONFIRM_WINDOW_MINUTES,
    });
    return null;
  } catch (error) {
    console.error("Bitte um Bestätigung konnte nicht versendet werden:", error);
    await db
      .delete(bookings)
      .where(and(eq(bookings.confirmToken, details.token), eq(bookings.status, "angefragt")));
    return `Wir konnten dir gerade keine Mail schicken. Bitte versuche es in ein paar Minuten noch einmal oder ruf uns an: ${site.contact.phone}`;
  }
}

/**
 * Mehrere Fahrstunden auf einmal buchen — heute um 8, 9 und 10 Uhr
 * hintereinander, oder verteilt auf mehrere Tage. Die eigenen Angaben und
 * die Sicherheitsprüfung laufen nur einmal für die ganze Auswahl; jeder
 * Termin wird trotzdem einzeln wie bei einer normalen Buchung geprüft und
 * angelegt — dieselbe Prüfung, nur mehrfach statt einmal aufgerufen. Ist ein
 * Termin inzwischen weg (jemand anders war schneller), fällt nur der aus,
 * nicht die ganze Anfrage.
 */
async function bookSeveral(
  _previous: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const ip = await clientIp();

  if (await blockedUntil(ip)) {
    return { error: "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut." };
  }

  if ((formData.get("website") as string | null)?.length) {
    await blockIp(ip, 60, "Formularfalle bei Buchung ausgelöst");
    return { error: "Die Anfrage konnte nicht verarbeitet werden." };
  }

  const verdict = await consume(`buchung:${ip}`, 5, 3600);
  if (!verdict.ok) {
    await record("buchung.begrenzt", { label: "System" }, { adresse: hashIp(ip) });
    return {
      error: "Zu viele Buchungen von dieser Verbindung. Bitte versuche es in einer Stunde.",
    };
  }

  const parsed = multiSchema.safeParse({
    angebot: formData.get("angebot"),
    termine: formData.getAll("termin"),
    name: formData.get("name"),
    email: formData.get("email"),
    telefon: formData.get("telefon"),
    bemerkung: formData.get("bemerkung") || undefined,
    agb: formData.get("agb"),
  });

  if (!parsed.success) return validationError(parsed.error.issues);

  const input = parsed.data;
  const lessonType = await lessonTypeBySlug(input.angebot);
  if (!lessonType || !lessonType.active) {
    return { error: "Dieses Angebot gibt es nicht mehr." };
  }
  // Mehrere auf einmal gibt es nur für Fahrstunden (siehe Buchungsseite).
  // Ohne diese Prüfung liessen sich über ein nachgebautes Formular mehrere
  // Kursplätze oder Schnupperstunden in einem Zug reservieren.
  if (lessonType.slug !== "fahrstunde") {
    return { error: "Für dieses Angebot lässt sich nur ein Termin auf einmal buchen." };
  }

  // Mehrere Fahrlehrpersonen können versetzte Zeiten haben (08:00 bei der
  // einen, 08:30 bei der anderen) — beide anzuhaken hiesse, gleichzeitig in
  // zwei Autos zu sitzen. Vor der Captcha-Einlösung, damit die Lösung bei
  // diesem Fehler nicht verbraucht ist.
  const clash = overlappingPick(input.termine, lessonType.durationMinutes);
  if (clash) {
    return {
      error: `${clash[0]} und ${clash[1]} Uhr am selben Tag überschneiden sich. Bitte wähle Zeiten, die nicht gleichzeitig liegen.`,
    };
  }

  if (!(await redeemSolution("buchung", formData.get("captcha") as string | null))) {
    return { error: CAPTCHA_FAILED };
  }

  // Doppelt angehakte Zeiten nur einmal zählen, dann nach Tag/Zeit aufteilen.
  // Termine ausserhalb des buchbaren Zeitraums zählen als nicht mehr frei.
  const unique = [...new Set(input.termine)].map((value) => {
    const [day, time] = value.split("T");
    return { day, time };
  });
  const requested = unique.filter((entry) => withinBookingHorizon(entry.day, lessonType));
  if (requested.length === 0) {
    return { error: "Keiner der gewählten Termine ist mehr frei. Bitte wähle andere." };
  }

  const days = requested.map((entry) => entry.day).sort();
  const fromDay = days[0];
  const span = daysBetween(fromDay, days[days.length - 1]) + 1;

  const slots = await findSlots({ lessonType, fromDay, days: span });
  const priced = applyPromotions(lessonType, await activePromotions());

  const booked: { day: string; time: string; reference: string; cancelToken: string }[] = [];
  let failedCount = unique.length - requested.length;

  // „Gleiche Fahrlehrerin" steht auf der Startseite: steht die Person der
  // vorigen Lektion auch für diese zur Wahl, bekommt sie den Termin.
  let lastStaffId: string | null = null;
  const confirmation = pendingConfirmation();

  for (const { day, time } of requested) {
    const slot = slots.find((entry) => entry.day === day && entry.time === time);
    if (!slot) {
      failedCount += 1;
      continue;
    }

    const staffId: string =
      lastStaffId && slot.staffIds.includes(lastStaffId) ? lastStaffId : slot.staffIds[0];

    const result = await createBooking({
      lessonType,
      staffId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      second: slot.second,
      customerName: input.name,
      customerEmail: input.email,
      customerPhone: input.telefon,
      customerNote: input.bemerkung,
      priceRappen: priced.finalRappen,
      promotionLabel: priced.promotion?.label ?? null,
      retentionDays: env.retentionDays,
      confirmation,
      reviewConsent: formData.get("bewertung") === "ja",
    });

    if ("error" in result) {
      failedCount += 1;
      continue;
    }

    lastStaffId = staffId;
    booked.push({ day, time, reference: result.reference, cancelToken: result.cancelToken });
  }

  if (booked.length === 0) {
    return {
      error:
        requested.length === 1
          ? "Dieser Termin ist nicht mehr frei. Bitte wähle einen anderen."
          : "Keiner der gewählten Termine ist mehr frei. Bitte wähle andere.",
    };
  }

  // Jeder zusätzlich gebuchte Termin zählt fürs Stundenlimit — sonst liesse
  // sich die Begrenzung über wenige, aber sehr grosse Buchungen umgehen.
  for (let extra = 1; extra < booked.length; extra += 1) {
    await hit(`buchung:${ip}`);
  }

  await record(
    "buchung.erstellt",
    { label: "Website" },
    { referenzen: booked.map((entry) => entry.reference).join(", "), angebot: lessonType.slug },
  );

  const mailError = await requestConfirmation({
    to: input.email,
    name: input.name,
    token: confirmation.token,
    lessonName: lessonType.name,
    appointments: booked.map(({ day, time }) => ({ day, time })),
  });
  if (mailError) return { error: mailError };

  const params = new URLSearchParams({ anzahl: String(booked.length) });
  if (failedCount > 0) params.set("fehlgeschlagen", String(failedCount));
  redirect(`/buchen/reserviert?${params}`);
}
