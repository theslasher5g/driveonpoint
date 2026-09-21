"use server";

import { randomBytes } from "node:crypto";
import { and, count, eq, gt, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { record } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/guard";
import { destroyAllSessions, hashPassword, newCalendarToken } from "@/lib/auth/session";
import { findSlots } from "@/lib/booking";
import { sendRebookRequest } from "@/lib/booking-mail";
import { db } from "@/lib/db";
import { bookings, lessonTypes, staff, staffLessonTypes, staffRole } from "@/lib/db/schema";
import { zurichDay, zurichTime } from "@/lib/time";

export type StaffState = { error?: string; ok?: string; password?: string };

/**
 * Erzeugt ein Startpasswort, das man am Telefon durchgeben kann.
 * Ohne I, l, O und 0 — die werden beim Vorlesen zuverlässig verwechselt.
 */
function temporaryPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10)}`;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Der Name fehlt.").max(120, "Der Name ist zu lang."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Diese Mailadresse stimmt nicht.")
    .max(180, "Die Adresse ist zu lang."),
  telefon: z.string().trim().max(30).optional(),
  rolle: z.enum(staffRole.enumValues),
});

export async function createStaffAction(
  _previous: StaffState,
  formData: FormData,
): Promise<StaffState> {
  const admin = await assertPermission("mitarbeiter.verwalten");

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    telefon: formData.get("telefon") || undefined,
    rolle: formData.get("rolle"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const [existing] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.email, input.email))
    .limit(1);

  if (existing) return { error: "Für diese Mailadresse gibt es bereits ein Konto." };

  const password = temporaryPassword();

  const [created] = await db
    .insert(staff)
    .values({
      name: input.name,
      email: input.email,
      phone: input.telefon ?? null,
      role: input.rolle,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      calendarToken: newCalendarToken(),
    })
    .returning({ id: staff.id });

  await record("mitarbeiter.angelegt", { id: admin.id, label: admin.name }, {
    neu: created.id,
    rolle: input.rolle,
  });

  revalidatePath("/team/mitarbeiter");

  // Das Passwort wird nur hier einmal zurückgegeben. Gespeichert ist nur der
  // Hash — auch die Administration kann es später nicht mehr nachschlagen.
  return {
    ok: `Konto für ${input.name} angelegt.`,
    password,
  };
}

export async function updateRoleAction(formData: FormData): Promise<void> {
  const admin = await assertPermission("mitarbeiter.verwalten");

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("rolle") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  if (!staffRole.enumValues.includes(role as never)) return;

  // Die eigene Rolle bleibt tabu: sonst nimmt sich jemand versehentlich
  // selbst die Rechte und niemand kann sie zurückgeben.
  if (id === admin.id) return;

  await db
    .update(staff)
    .set({ role: role as (typeof staffRole.enumValues)[number], updatedAt: new Date() })
    .where(eq(staff.id, id));

  await record("mitarbeiter.rolle-geaendert", { id: admin.id, label: admin.name }, { id, rolle: role });
  revalidatePath("/team/mitarbeiter");
}

export async function toggleActiveAction(formData: FormData): Promise<void> {
  const admin = await assertPermission("mitarbeiter.verwalten");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  if (id === admin.id) return;

  const activate = formData.get("aktiv") === "ja";

  if (!activate) {
    // Das letzte aktive Administrationskonto darf nicht abgeschaltet werden,
    // sonst kommt niemand mehr an die Mitarbeiterverwaltung.
    const [remaining] = await db
      .select({ anzahl: count() })
      .from(staff)
      .where(and(eq(staff.role, "admin"), eq(staff.active, true), ne(staff.id, id)));

    if ((remaining?.anzahl ?? 0) === 0) return;
  }

  await db.update(staff).set({ active: activate, updatedAt: new Date() }).where(eq(staff.id, id));

  // Ein deaktiviertes Konto muss sofort draussen sein, nicht erst, wenn
  // die Sitzung von selbst abläuft.
  if (!activate) await destroyAllSessions(id);

  await record("mitarbeiter.umgeschaltet", { id: admin.id, label: admin.name }, { id, aktiv: activate });
  revalidatePath("/team/mitarbeiter");
}

export async function resetPasswordAction(
  _previous: StaffState,
  formData: FormData,
): Promise<StaffState> {
  const admin = await assertPermission("mitarbeiter.verwalten");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Unbekanntes Konto." };

  const [person] = await db
    .select({ name: staff.name })
    .from(staff)
    .where(eq(staff.id, id))
    .limit(1);

  if (!person) return { error: "Unbekanntes Konto." };

  const password = temporaryPassword();
  await db
    .update(staff)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(staff.id, id));

  await destroyAllSessions(id);
  await record("mitarbeiter.passwort-zurueckgesetzt", { id: admin.id, label: admin.name }, { id });
  revalidatePath("/team/mitarbeiter");

  return { ok: `Neues Startpasswort für ${person.name}:`, password };
}

export async function setLessonTypesAction(formData: FormData): Promise<void> {
  const admin = await assertPermission("mitarbeiter.verwalten");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const chosen = formData
    .getAll("angebot")
    .map(String)
    .filter((value) => /^[0-9a-f-]{36}$/i.test(value));

  await db.transaction(async (tx) => {
    await tx.delete(staffLessonTypes).where(eq(staffLessonTypes.staffId, id));
    if (chosen.length > 0) {
      await tx
        .insert(staffLessonTypes)
        .values(chosen.map((lessonTypeId) => ({ staffId: id, lessonTypeId })));
    }
  });

  await record("mitarbeiter.angebote-gesetzt", { id: admin.id, label: admin.name }, {
    id,
    anzahl: chosen.length,
  });

  revalidatePath("/team/mitarbeiter");
  revalidatePath("/buchen");
}

/**
 * Setzt MFA für eine andere Person zurück — für den Fall eines verlorenen
 * Geräts, wenn auch die Wiederherstellungscodes nicht mehr auffindbar sind.
 * Meldet die Person auf allen Geräten ab: der bisherige zweite Faktor ist
 * wertlos geworden, sie richtet ihn nach der Anmeldung neu ein.
 */
export async function resetMfaAction(formData: FormData): Promise<void> {
  const admin = await assertPermission("mitarbeiter.verwalten");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  await db
    .update(staff)
    .set({
      totpEnabled: false,
      totpSecret: null,
      totpConfirmedAt: null,
      mfaRecoveryCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(staff.id, id));

  await destroyAllSessions(id);
  await record("mitarbeiter.mfa-zurueckgesetzt", { id: admin.id, label: admin.name }, { id });
  revalidatePath("/team/mitarbeiter");
}

/**
 * Sucht unter den verbleibenden aktiven Mitarbeitenden jemanden, der eine
 * bestimmte Lektion zur bestimmten Zeit übernehmen kann — dieselbe Prüfung
 * wie beim Verschieben eines Termins, nur über alle in Frage kommenden
 * Personen statt einer einzigen.
 */
async function findReplacementStaff(
  lessonType: typeof lessonTypes.$inferSelect,
  day: string,
  time: string,
  neededSeats: number,
): Promise<string | null> {
  const broad = await findSlots({ lessonType, fromDay: day, days: 1 });
  const candidateIds = broad.find((slot) => slot.day === day && slot.time === time)?.staffIds ?? [];

  for (const candidateId of candidateIds) {
    const specific = await findSlots({ lessonType, fromDay: day, days: 1, staffId: candidateId });
    const slot = specific.find((entry) => entry.day === day && entry.time === time);
    if (slot && slot.seatsLeft >= neededSeats) return candidateId;
  }

  return null;
}

/**
 * Löscht ein Konto endgültig. Anders als "Zugang abschalten" lässt sich das
 * nicht rückgängig machen — wer die Fahrschule tatsächlich verlässt, statt
 * nur vorübergehend pausiert, gehört hier hinein.
 *
 * Künftige Termine dieser Person werden zuerst an eine andere, zur selben
 * Zeit freie und für das Angebot freigeschaltete Person übergeben. Bei einem
 * Gruppenkurs wandert die ganze Sitzung gemeinsam, nie nur einzelne
 * Anmeldungen — sonst stünde dieselbe Kursstunde bei zwei Lehrpersonen
 * gleichzeitig. Findet sich niemand, wird der Termin abgesagt und die
 * Kundschaft per Mail um einen neuen Termin gebeten.
 */
export async function deleteStaffAction(formData: FormData): Promise<void> {
  const admin = await assertPermission("mitarbeiter.verwalten");

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/team/mitarbeiter?fehler=unbekanntes-konto");
  if (id === admin.id) redirect("/team/mitarbeiter?fehler=eigenes-konto");

  const [person] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
  if (!person) redirect("/team/mitarbeiter?fehler=unbekanntes-konto");

  // Die letzte aktive Administration darf nicht verschwinden, sonst kommt
  // niemand mehr an die Mitarbeiterverwaltung heran.
  const [remaining] = await db
    .select({ anzahl: count() })
    .from(staff)
    .where(and(eq(staff.role, "admin"), eq(staff.active, true), ne(staff.id, id)));
  if (person.role === "admin" && (remaining?.anzahl ?? 0) === 0) {
    redirect("/team/mitarbeiter?fehler=letzte-administration");
  }

  // Sofort abschalten, damit die Suche nach Ersatz diese Person nicht mehr
  // selbst als Kandidatin findet und sich niemand mehr anmelden kann,
  // während die Termine umgehängt werden.
  await db.update(staff).set({ active: false, updatedAt: new Date() }).where(eq(staff.id, id));
  await destroyAllSessions(id);

  const now = new Date();
  const [openBookings, offerRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        startsAt: bookings.startsAt,
        lessonTypeId: bookings.lessonTypeId,
        customerName: bookings.customerName,
        customerEmail: bookings.customerEmail,
      })
      .from(bookings)
      .where(and(eq(bookings.staffId, id), ne(bookings.status, "abgesagt"), gt(bookings.startsAt, now))),
    db.select().from(lessonTypes),
  ]);

  const offerById = new Map(offerRows.map((offer) => [offer.id, offer]));

  // Nach Angebot und exakter Startzeit gruppiert: Das fasst die Anmeldungen
  // eines Gruppenkurses zu einer Sitzung zusammen.
  const sessions = new Map<string, typeof openBookings>();
  for (const entry of openBookings) {
    const key = `${entry.lessonTypeId}@${entry.startsAt.toISOString()}`;
    const group = sessions.get(key) ?? [];
    group.push(entry);
    sessions.set(key, group);
  }

  let uebergeben = 0;
  let abgesagt = 0;

  for (const group of sessions.values()) {
    const lessonType = group[0].lessonTypeId ? offerById.get(group[0].lessonTypeId) : undefined;
    const day = zurichDay(group[0].startsAt);
    const time = zurichTime(group[0].startsAt);

    const replacementId =
      lessonType && (await findReplacementStaff(lessonType, day, time, group.length));

    if (replacementId) {
      await db
        .update(bookings)
        .set({ staffId: replacementId, updatedAt: now })
        .where(inArray(bookings.id, group.map((entry) => entry.id)));
      uebergeben += group.length;
      continue;
    }

    await db
      .update(bookings)
      .set({ status: "abgesagt", cancelledAt: now, updatedAt: now })
      .where(inArray(bookings.id, group.map((entry) => entry.id)));
    abgesagt += group.length;

    for (const entry of group) {
      if (!entry.customerEmail) continue;
      try {
        await sendRebookRequest({
          to: entry.customerEmail,
          name: entry.customerName ?? "",
          reference: entry.reference,
          lessonName: lessonType?.name ?? "Termin",
          day,
          time,
        });
      } catch (error) {
        console.error("Mail zum ausgefallenen Termin konnte nicht versendet werden:", error);
      }
    }
  }

  await db.delete(staff).where(eq(staff.id, id));

  await record("mitarbeiter.geloescht", { id: admin.id, label: admin.name }, {
    geloescht: person.name,
    uebergeben,
    abgesagt,
  });

  revalidatePath("/team/mitarbeiter");
  revalidatePath("/team/kalender");
  revalidatePath("/team");

  redirect(
    `/team/mitarbeiter?geloescht=${encodeURIComponent(person.name)}&uebergeben=${uebergeben}&abgesagt=${abgesagt}`,
  );
}
