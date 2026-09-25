/**
 * Prüfstand für die Buchungs- und Kalenderlogik.
 *
 * Aufruf: npm run pruefen:buchung
 *
 * Spielt die Fälle durch, die im Alltag wehtun: eine belegte Fahrstunde muss
 * verschwinden, ein Kurs muss seine Plätze runterzählen, und niemand darf zur
 * selben Zeit im Auto und im Kursraum stehen.
 *
 * ACHTUNG: schreibt in die Datenbank, auf die DATABASE_URL zeigt — er legt
 * eine Testperson, Verfügbarkeiten und Buchungen an und löscht sie am Ende
 * wieder. Nur gegen eine Entwicklungsdatenbank laufen lassen, niemals gegen
 * den laufenden Betrieb. Bei NODE_ENV=production bricht er von selbst ab.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  lessonTypes,
  staff,
  staffLessonTypes,
  systemChecks,
  waitlistEntries,
} from "@/lib/db/schema";
import { randomBytes } from "node:crypto";
import { accountingReport } from "@/lib/accounting";
import { createBooking, findSlots, lessonTypeBySlug, moveBooking, newConfirmToken } from "@/lib/booking";
import { markError, markOk } from "@/lib/checks";
import { cancelCourseSession } from "@/lib/course-cancel";
import { moveCourseSession } from "@/lib/course-move";
import { customerHistories, describeHistory } from "@/lib/customer-history";
import { currentProblems } from "@/lib/monitoring";
import { requestReviews } from "@/lib/reviews";
import { deleteExpiredRequests, sendDueReminders } from "@/lib/reminders";
import { addDays, todayInZurich, zurichDay, zurichWeekday } from "@/lib/time";
import { fullCourseSessions, isSessionFull, notifyWaitlist, removeFromWaitlist } from "@/lib/waitlist";

const MARK = "PRUEFSTAND";
let failures = 0;

/** Alles, was der Lauf angelegt hat — auch auf bestehenden Konten. */
const createdRules: string[] = [];
const createdCourseDates: string[] = [];
const createdOfferings: { staffId: string; lessonTypeId: string }[] = [];

async function addRule(staffId: string, lessonTypeId: string, weekday: number, from: string, to: string) {
  const [row] = await db
    .insert(availabilityRules)
    .values({ staffId, lessonTypeId, weekday, startTime: from, endTime: to })
    .returning({ id: availabilityRules.id });
  createdRules.push(row.id);
}

/** Kurse laufen über einzelne Kurstermine, nicht über Wochenregeln. */
async function addCourseDate(staffId: string, lessonTypeId: string, day: string, from: string, to: string) {
  const [row] = await db
    .insert(availabilityExceptions)
    .values({ staffId, lessonTypeId, day, startTime: from, endTime: to, available: true })
    .returning({ id: availabilityExceptions.id });
  createdCourseDates.push(row.id);
}

/** Merkt sich die Zuordnung nur, wenn sie hier wirklich neu entstanden ist. */
async function addOffering(staffId: string, lessonTypeId: string) {
  const inserted = await db
    .insert(staffLessonTypes)
    .values({ staffId, lessonTypeId })
    .onConflictDoNothing()
    .returning({ staffId: staffLessonTypes.staffId });
  if (inserted.length > 0) createdOfferings.push({ staffId, lessonTypeId });
}

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "  OK  " : " FEHL "} ${label}\n         erwartet: ${JSON.stringify(expected)}  tatsächlich: ${JSON.stringify(actual)}`);
}

function note(label: string, value: unknown) {
  console.log(`  ..    ${label}: ${JSON.stringify(value)}`);
}

async function cleanup() {
  await db.delete(bookings).where(like(bookings.customerName, `${MARK}%`));
  await db.delete(waitlistEntries).where(like(waitlistEntries.name, `${MARK}%`));

  // Regeln und Zuordnungen, die der Lauf auf bestehenden Konten angelegt hat.
  if (createdRules.length > 0) {
    await db.delete(availabilityRules).where(inArray(availabilityRules.id, createdRules));
    createdRules.length = 0;
  }
  if (createdCourseDates.length > 0) {
    await db.delete(availabilityExceptions).where(inArray(availabilityExceptions.id, createdCourseDates));
    createdCourseDates.length = 0;
  }
  for (const entry of createdOfferings) {
    await db
      .delete(staffLessonTypes)
      .where(
        and(
          eq(staffLessonTypes.staffId, entry.staffId),
          eq(staffLessonTypes.lessonTypeId, entry.lessonTypeId),
        ),
      );
  }
  createdOfferings.length = 0;

  const testStaff = await db.select({ id: staff.id }).from(staff).where(like(staff.name, `${MARK}%`));
  const ids = testStaff.map((row) => row.id);
  if (ids.length > 0) {
    await db.delete(availabilityRules).where(inArray(availabilityRules.staffId, ids));
    await db.delete(staffLessonTypes).where(inArray(staffLessonTypes.staffId, ids));
    await db.delete(staff).where(inArray(staff.id, ids));
  }
}

async function book(
  slug: string,
  staffId: string,
  startsAt: Date,
  who: string,
): Promise<{ ok: boolean; message: string }> {
  const lessonType = (await lessonTypeBySlug(slug))!;
  const result = await createBooking({
    lessonType,
    staffId,
    startsAt,
    customerName: `${MARK} ${who}`,
    customerEmail: "",
    customerPhone: "079 000 00 00",
    customerNote: undefined,
    priceRappen: lessonType.priceRappen,
    promotionLabel: null,
    retentionDays: 30,
  });
  return "error" in result
    ? { ok: false, message: result.error }
    : { ok: true, message: result.reference };
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "Der Prüfstand legt Testdaten an und läuft deshalb nicht mit NODE_ENV=production.",
    );
    process.exit(1);
  }

  await cleanup();

  // --- Testpersonen und Testtermine ------------------------------------
  // Eigene Testpersonen statt bestehender Konten: sonst hängt das Ergebnis
  // davon ab, welche Zeiten in der Datenbank schon eingetragen sind.
  const [personA] = await db
    .insert(staff)
    .values({
      name: `${MARK} Erstperson`,
      email: `${MARK.toLowerCase()}-a@example.invalid`,
      passwordHash: "x",
      calendarToken: `${MARK}-token-a`,
      role: "bearbeiter",
    })
    .returning({ id: staff.id });
  const [personB] = await db
    .insert(staff)
    .values({
      name: `${MARK} Zweitperson`,
      email: `${MARK.toLowerCase()}-b@example.invalid`,
      passwordHash: "x",
      calendarToken: `${MARK}-token-b`,
      role: "bearbeiter",
    })
    .returning({ id: staff.id });

  const fahrstunde = (await lessonTypeBySlug("fahrstunde"))!;
  const vku = (await lessonTypeBySlug("vku"))!;

  // Ein Tag weit genug in der Zukunft, damit die Vorlaufzeiten (24 h / 48 h)
  // keine Termine wegschneiden.
  // Ausserdem ein Tag, an dem niemand sonst Fahrstunden-Zeiten eingetragen
  // hat — die Abfragen unten schauen über alle Personen.
  const busyWeekdays = new Set(
    (
      await db
        .select({ weekday: availabilityRules.weekday })
        .from(availabilityRules)
        .where(eq(availabilityRules.lessonTypeId, fahrstunde.id))
    ).map((row) => row.weekday),
  );
  let day = addDays(todayInZurich(), 10);
  for (let step = 0; step < 7 && busyWeekdays.has(zurichWeekday(day)); step += 1) {
    day = addDays(day, 1);
  }
  const weekday = zurichWeekday(day);

  // Beide Personen bieten beide Angebote an.
  for (const id of [personA.id, personB.id]) {
    for (const type of [fahrstunde, vku]) {
      await addOffering(id, type.id);
    }
  }

  console.log(`\nTesttag: ${day} (Wochentag ${weekday})\n`);

  // ===================================================================
  console.log("SZENARIO A — Fahrstunde, nur eine Person verfügbar");
  // ===================================================================
  await addRule(personA.id, fahrstunde.id, weekday, "08:00", "12:00");

  let slots = await findSlots({ lessonType: fahrstunde, fromDay: day, days: 1 });
  note("freie Zeiten vorher", slots.map((s) => s.time));
  check("vier Termine im Fenster 08:00–12:00", slots.map((s) => s.time), ["08:00", "09:00", "10:00", "11:00"]);

  const nine = slots.find((s) => s.time === "09:00")!;
  const bookedA = await book("fahrstunde", personA.id, nine.startsAt, "A1");
  check("Buchung 09:00 gelingt", bookedA.ok, true);

  slots = await findSlots({ lessonType: fahrstunde, fromDay: day, days: 1 });
  note("freie Zeiten nachher", slots.map((s) => s.time));
  check("09:00 ist weg", slots.some((s) => s.time === "09:00"), false);
  check("08:00 bleibt (Puffer davor reicht)", slots.some((s) => s.time === "08:00"), true);
  check("10:00 bleibt", slots.some((s) => s.time === "10:00"), true);

  const doubleBook = await book("fahrstunde", personA.id, nine.startsAt, "A2");
  check("zweite Buchung auf 09:00 wird abgewiesen", doubleBook.ok, false);

  // ===================================================================
  console.log("\nSZENARIO B — Fahrstunde, zweite Person verfügbar");
  // ===================================================================
  await addRule(personB.id, fahrstunde.id, weekday, "08:00", "12:00");

  slots = await findSlots({ lessonType: fahrstunde, fromDay: day, days: 1 });
  const nineAgain = slots.find((s) => s.time === "09:00");
  check("09:00 ist wieder frei, weil Person B kann", nineAgain !== undefined, true);
  check("dafür ist nur noch Person B eingetragen", nineAgain?.staffIds, [personB.id]);

  const bookedB = await book("fahrstunde", personB.id, nineAgain!.startsAt, "B1");
  check("Buchung 09:00 bei Person B gelingt", bookedB.ok, true);

  slots = await findSlots({ lessonType: fahrstunde, fromDay: day, days: 1 });
  check("09:00 ist jetzt endgültig weg", slots.some((s) => s.time === "09:00"), false);

  // ===================================================================
  console.log("\nSZENARIO C — VKU, mehrere Plätze");
  // ===================================================================
  await addCourseDate(personA.id, vku.id, day, "18:00", "21:00");

  let vkuSlots = await findSlots({ lessonType: vku, fromDay: day, days: 1 });
  check("genau ein Kurstermin (18:00)", vkuSlots.map((s) => s.time), ["18:00"]);
  check(`${vku.capacity} freie Plätze`, vkuSlots[0]?.seatsLeft, vku.capacity);

  const kurs = vkuSlots[0];
  await book("vku", personA.id, kurs.startsAt, "V1");
  vkuSlots = await findSlots({ lessonType: vku, fromDay: day, days: 1 });
  check("nach einer Anmeldung ein Platz weniger", vkuSlots[0]?.seatsLeft, vku.capacity - 1);

  for (let i = 2; i <= vku.capacity; i += 1) {
    const result = await book("vku", personA.id, kurs.startsAt, `V${i}`);
    if (!result.ok) console.log(`         Anmeldung ${i} abgewiesen: ${result.message}`);
  }

  vkuSlots = await findSlots({ lessonType: vku, fromDay: day, days: 1 });
  check("ausgebuchter Kurs verschwindet", vkuSlots.length, 0);

  const overbook = await book("vku", personA.id, kurs.startsAt, "V-zuviel");
  check("Anmeldung über die Kapazität hinaus wird abgewiesen", overbook.ok, false);

  // ===================================================================
  console.log("\nSZENARIO D — Kollision zwischen den Angeboten");
  // ===================================================================
  // Person B: Fahrstunde-Fenster, das das VKU-Fenster überlappt.
  await addRule(personB.id, fahrstunde.id, weekday, "18:00", "21:00");
  await addCourseDate(personB.id, vku.id, day, "18:00", "21:00");

  const fahrAbends = await findSlots({ lessonType: fahrstunde, fromDay: day, days: 1, staffId: personB.id });
  const sechs = fahrAbends.find((s) => s.time === "18:00")!;
  const fahrBooked = await book("fahrstunde", personB.id, sechs.startsAt, "D-fahrstunde");
  check("Fahrstunde um 18:00 bei Person B gebucht", fahrBooked.ok, true);

  const vkuTrotzFahrstunde = await findSlots({ lessonType: vku, fromDay: day, days: 1, staffId: personB.id });
  note("VKU-Termine für Person B trotz Fahrstunde um 18:00", vkuTrotzFahrstunde.map((s) => `${s.time} (${s.seatsLeft} Plätze)`));
  check(
    "VKU um 18:00 darf NICHT angeboten werden, Person B fährt da schon",
    vkuTrotzFahrstunde.some((s) => s.time === "18:00"),
    false,
  );

  const vkuDoppel = await book("vku", personB.id, sechs.startsAt, "D-vku");
  check(
    "VKU-Anmeldung auf die belegte Zeit muss abgewiesen werden",
    vkuDoppel.ok,
    false,
  );

  // ===================================================================
  console.log("\nSZENARIO E — Gegenrichtung: Kurs belegt, Fahrstunde gesperrt");
  // ===================================================================
  // Person A hat morgens Fahrstunden und abends VKU. Der Kurs 18:00–21:00
  // muss die Fahrstunden am Abend sperren.
  await addRule(personA.id, fahrstunde.id, weekday, "18:00", "22:00");

  // Eigener Tag, damit die ausgebuchten Kurse aus Szenario C nicht stören.
  const tagE = addDays(day, 7);
  await addCourseDate(personA.id, vku.id, tagE, "18:00", "21:00");

  const vorKurs = await findSlots({ lessonType: fahrstunde, fromDay: tagE, days: 1, staffId: personA.id });
  const abendsVorher = vorKurs.filter((s) => s.time >= "18:00").map((s) => s.time);
  note("Fahrstunden abends, bevor der Kurs steht", abendsVorher);
  check("abends sind Fahrstunden möglich", abendsVorher.includes("18:00"), true);

  const kursA = (await findSlots({ lessonType: vku, fromDay: tagE, days: 1, staffId: personA.id }))[0];
  check("Kurstermin für Person A vorhanden", kursA?.time, "18:00");
  await book("vku", personA.id, kursA.startsAt, "E1");

  const nachKurs = await findSlots({ lessonType: fahrstunde, fromDay: tagE, days: 1, staffId: personA.id });
  const abends = nachKurs.filter((s) => s.time >= "18:00").map((s) => s.time);
  note("Fahrstunden abends, nachdem der Kurs steht", abends);
  check("kein Fahrstundentermin während des Kurses 18:00–21:00", abends.filter((t) => t < "21:00").length, 0);

  const fahrImKurs = await book("fahrstunde", personA.id, kursA.startsAt, "E2");
  check("Fahrstunde mitten im Kurs wird abgewiesen", fahrImKurs.ok, false);

  // ===================================================================
  console.log("\nSZENARIO F — zwei Kurse hintereinander");
  // ===================================================================
  const nothilfe = (await lessonTypeBySlug("nothilfekurs"))!;
  await addOffering(personB.id, nothilfe.id);
  const tagZwei = addDays(day, 7);
  await addCourseDate(personB.id, nothilfe.id, tagZwei, "08:00", "13:00");
  const nothilfeSlot = (await findSlots({ lessonType: nothilfe, fromDay: tagZwei, days: 1, staffId: personB.id }))[0];
  check("Nothilfekurs-Termin vorhanden", nothilfeSlot?.time, "08:00");
  const n1 = await book("nothilfekurs", personB.id, nothilfeSlot.startsAt, "F1");
  check("erste Anmeldung zum Nothilfekurs gelingt", n1.ok, true);

  // Direkt anschliessender Kurs (13:00–18:00) darf nicht als Überschneidung gelten.
  const anschluss = new Date(nothilfeSlot.startsAt.getTime() + nothilfe.durationMinutes * 60_000);
  const n2 = await book("nothilfekurs", personB.id, anschluss, "F2");
  check("direkt anschliessender Kurs ist keine Überschneidung", n2.ok, true);

  // ===================================================================
  console.log("\nSZENARIO G — Pause gilt auch in der letzten Prüfung beim Speichern");
  // ===================================================================
  // 09:00–09:45 steht bei Person A, danach 15 Minuten Pause. Zwei gleichzeitige
  // Anfragen sehen beide dieselbe freie Liste; createBooking muss den Termin
  // in der Pause selbst abweisen, nicht nur findSlots.
  const inPause = new Date(nine.startsAt.getTime() + 50 * 60_000);
  const g1 = await book("fahrstunde", personA.id, inPause, "G1");
  check("Fahrstunde um 09:50 (in der Pause) wird abgewiesen", g1.ok, false);
  const nachPause = new Date(nine.startsAt.getTime() + 60 * 60_000);
  const g2 = await book("fahrstunde", personA.id, nachPause, "G2");
  check("Fahrstunde um 10:00 (nach der Pause) gelingt", g2.ok, true);

  // ===================================================================
  console.log("\nSZENARIO H — Vorlaufzeit gilt online, nicht beim Erfassen im Team");
  // ===================================================================
  const heute = todayInZurich();
  const morgen = addDays(heute, 1);
  await addRule(personB.id, fahrstunde.id, zurichWeekday(heute), "00:00", "23:45");
  await addRule(personB.id, fahrstunde.id, zurichWeekday(morgen), "00:00", "23:45");
  const online = await findSlots({ lessonType: fahrstunde, fromDay: heute, days: 2, staffId: personB.id });
  const team = await findSlots({
    lessonType: fahrstunde,
    fromDay: heute,
    days: 2,
    staffId: personB.id,
    ignoreLeadTime: true,
  });
  note("online / im Team", [online.length, team.length]);
  check("im Team sind kurzfristigere Zeiten wählbar", team.length > online.length, true);
  check(
    "auch im Team nichts in der Vergangenheit",
    team.every((slot) => slot.startsAt.getTime() > Date.now()),
    true,
  );

  // ===================================================================
  console.log("\nSZENARIO I — Unbestätigte Online-Buchung hält den Platz nur bis zur Frist");
  // ===================================================================
  const tagI = addDays(todayInZurich(), 12);
  await addRule(personA.id, fahrstunde.id, zurichWeekday(tagI), "14:00", "16:00");
  const freiI = () =>
    findSlots({ lessonType: fahrstunde, fromDay: tagI, days: 1, staffId: personA.id }).then(
      (list) => list.some((slot) => slot.time === "14:00"),
    );
  const slotI = (await findSlots({ lessonType: fahrstunde, fromDay: tagI, days: 1, staffId: personA.id })).find(
    (slot) => slot.time === "14:00",
  )!;
  check("14:00 ist anfangs frei", Boolean(slotI), true);

  const tokenI = newConfirmToken();
  const anfrage = await createBooking({
    lessonType: fahrstunde,
    staffId: personA.id,
    startsAt: slotI.startsAt,
    customerName: `${MARK} I1`,
    customerEmail: "pruefstand@example.invalid",
    customerPhone: "079 000 00 00",
    priceRappen: fahrstunde.priceRappen,
    retentionDays: 30,
    confirmation: { token: tokenI, expiresAt: new Date(Date.now() + 60 * 60_000) },
  });
  check("unbestätigte Buchung wird angelegt", "error" in anfrage, false);
  check("solange die Frist läuft, ist 14:00 belegt", await freiI(), false);
  check("zweite Buchung auf 14:00 wird abgewiesen", (await book("fahrstunde", personA.id, slotI.startsAt, "I2")).ok, false);

  await db
    .update(bookings)
    // Frist samt der Luft danach abgelaufen (siehe occupiesTime).
    .set({ confirmExpiresAt: new Date(Date.now() - 6 * 60_000) })
    .where(eq(bookings.confirmToken, tokenI));
  check("nach Ablauf der Frist ist 14:00 wieder frei", await freiI(), true);
  check("jemand anders bekommt den Platz", (await book("fahrstunde", personA.id, slotI.startsAt, "I3")).ok, true);

  await deleteExpiredRequests();
  const rest = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.confirmToken, tokenI));
  check("verfallene Anfrage ist gelöscht", rest.length, 0);

  // ===================================================================
  console.log("\nSZENARIO J — Erinnerung und Nicht-erschienen in der Buchhaltung");
  // ===================================================================
  const HOUR = 60 * 60_000;
  const now = Date.now();
  async function insert(who: string, startsIn: number, extra: Partial<typeof bookings.$inferInsert>) {
    const startsAt = new Date(now + startsIn);
    const [row] = await db
      .insert(bookings)
      .values({
        reference: `PRF-${randomBytes(3).toString("hex").toUpperCase()}`,
        cancelToken: randomBytes(24).toString("base64url"),
        staffId: personB.id,
        lessonTypeId: fahrstunde.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 45 * 60_000),
        status: "bestaetigt",
        customerName: `${MARK} ${who}`,
        customerEmail: "pruefstand@example.invalid",
        customerPhone: "079 000 00 00",
        priceRappen: 9500,
        purgeAfter: new Date(now + 40 * 24 * HOUR),
        ...extra,
      })
      .returning({ id: bookings.id, reference: bookings.reference, startsAt: bookings.startsAt });
    return row;
  }

  const faellig = await insert("J1", 28 * HOUR, { confirmedAt: new Date(now - 48 * HOUR) });
  const frisch = await insert("J2", 28 * HOUR + 60 * 60_000, { confirmedAt: new Date(now - HOUR) });
  const zuNah = await insert("J3", 20 * HOUR, { confirmedAt: new Date(now - 48 * HOUR) });
  const reminded = async (id: string) =>
    (await db.select({ at: bookings.reminderSentAt }).from(bookings).where(eq(bookings.id, id)))[0].at !== null;

  if (process.env.SMTP_HOST) {
    await sendDueReminders();
    check("Erinnerung für Termin in 28 h", await reminded(faellig.id), true);
    check("keine Erinnerung direkt nach der Bestätigung", await reminded(frisch.id), false);
    check("keine Erinnerung unter 24 h", await reminded(zuNah.id), false);
    check("zweiter Lauf schickt nichts doppelt", await sendDueReminders(), 0);
  } else {
    note("Erinnerungen übersprungen", "SMTP_HOST nicht gesetzt — ohne Mailversand nicht prüfbar");
  }

  const verpasst = await insert("J4", -3 * HOUR, { confirmedAt: new Date(now - 48 * HOUR), noShowAt: new Date() });
  const erschienen = await insert("J5", -4 * HOUR, { confirmedAt: new Date(now - 48 * HOUR) });
  const nieBestaetigt = await insert("J6", -5 * HOUR, {
    status: "angefragt",
    confirmToken: newConfirmToken(),
    confirmExpiresAt: new Date(now - 6 * HOUR),
  });
  const tagJ = zurichDay(verpasst.startsAt);
  const bericht = await accountingReport(Number(tagJ.slice(0, 4)), Number(tagJ.slice(5, 7)));
  const inUmsatz = (ref: string) => bericht.rows.some((row) => row.reference === ref);
  const ausfall = bericht.chargeable.find((row) => row.reference === verpasst.reference);
  check("nicht erschienen: nicht im Umsatz", inUmsatz(verpasst.reference), false);
  check("nicht erschienen: als verrechenbarer Ausfall", ausfall?.reason, "Nicht erschienen");
  check("erschienen: im Umsatz", inUmsatz(erschienen.reference), true);
  check(
    "nie bestätigt: weder Umsatz noch Ausfall",
    inUmsatz(nieBestaetigt.reference) || bericht.chargeable.some((row) => row.reference === nieBestaetigt.reference),
    false,
  );

  // ===================================================================
  console.log("\nSZENARIO K — Wochenregel für einen Kurs bietet nichts an");
  // ===================================================================
  // Kurse laufen nur über Kurstermine. Eine alte Wochenregel für den VKU
  // war im Team-Bereich unsichtbar, bot den Kurs aber jede Woche an.
  const tagK = addDays(todayInZurich(), 16);
  await addRule(personA.id, vku.id, zurichWeekday(tagK), "18:00", "21:00");
  const vkuK = await findSlots({ lessonType: vku, fromDay: tagK, days: 1, staffId: personA.id });
  check("Wochenregel für VKU erzeugt keinen Kurstermin", vkuK.length, 0);

  // ===================================================================
  console.log("\nSZENARIO L — Warteliste für einen vollen Kurs");
  // ===================================================================
  const tagL = addDays(todayInZurich(), 18);
  await addCourseDate(personA.id, vku.id, tagL, "18:00", "21:00");
  const kursL = (await findSlots({ lessonType: vku, fromDay: tagL, days: 1, staffId: personA.id })).find(
    (slot) => slot.time === "18:00",
  )!;
  check("Kurstermin ist buchbar", kursL !== undefined, true);
  check("noch nicht ausgebucht", await isSessionFull(vku, tagL, "18:00"), false);
  const plaetze = kursL.seatsLeft;
  for (let index = 0; index < plaetze; index += 1) {
    await book("vku", personA.id, kursL.startsAt, `L${index + 1}`);
  }
  const vollL = await fullCourseSessions(vku, tagL, 1);
  check("voller Kurs erscheint als ausgebucht", vollL.map((session) => session.time), ["18:00"]);
  check("isSessionFull erkennt ihn", await isSessionFull(vku, tagL, "18:00"), true);

  const wartendMail = "pruefstand-warteliste@example.invalid";
  const [wartend] = await db
    .insert(waitlistEntries)
    .values({
      lessonTypeId: vku.id,
      startsAt: kursL.startsAt,
      name: `${MARK} Wartend`,
      email: wartendMail,
      phone: "079 000 00 01",
      token: randomBytes(24).toString("base64url"),
    })
    .returning({ id: waitlistEntries.id });
  const benachrichtigt = async () =>
    (await db.select({ at: waitlistEntries.notifiedAt }).from(waitlistEntries).where(eq(waitlistEntries.id, wartend.id)))[0]
      ?.at ?? null;

  // Noch voll: keine Mail.
  await notifyWaitlist(vku.id, kursL.startsAt);
  check("voller Kurs: niemand wird benachrichtigt", await benachrichtigt(), null);

  const [absage] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.lessonTypeId, vku.id), eq(bookings.startsAt, kursL.startsAt), like(bookings.customerName, `${MARK}%`)))
    .limit(1);
  await db.update(bookings).set({ status: "abgesagt", cancelledBy: "kundschaft", cancelledAt: new Date() }).where(eq(bookings.id, absage.id));
  check("nach einer Absage nicht mehr ausgebucht", (await fullCourseSessions(vku, tagL, 1)).length, 0);

  if (process.env.SMTP_HOST) {
    await notifyWaitlist(vku.id, kursL.startsAt);
    check("freier Platz: Warteliste wird benachrichtigt", (await benachrichtigt()) !== null, true);
  } else {
    note("Wartelisten-Mail übersprungen", "SMTP_HOST nicht gesetzt — ohne Mailversand nicht prüfbar");
  }

  await removeFromWaitlist(vku.id, kursL.startsAt, wartendMail.toUpperCase());
  check("nach der Buchung von der Warteliste gestrichen", await benachrichtigt(), null);
  const [nochDa] = await db.select({ id: waitlistEntries.id }).from(waitlistEntries).where(eq(waitlistEntries.id, wartend.id));
  check("Eintrag ist gelöscht", nochDa === undefined, true);

  // ===================================================================
  console.log("\nSZENARIO M — Kundenhistorie und wer abgesagt hat");
  // ===================================================================
  // Dieselbe Person, einmal mit "079 …", einmal mit "+41 79 …" erfasst.
  const person = { customerEmail: "pruefstand-historie@example.invalid", customerPhone: "079 999 88 77" };
  const confirmed = { confirmedAt: new Date(now - 60 * 24 * HOUR) };
  await insert("M1", -10 * 24 * HOUR, { ...person, ...confirmed });
  await insert("M2", -6 * 24 * HOUR, { ...person, ...confirmed, noShowAt: new Date(now - 6 * 24 * HOUR) });
  const kundeAbgesagt = await insert("M3", -3 * 24 * HOUR, {
    ...person,
    ...confirmed,
    status: "abgesagt",
    cancelledBy: "kundschaft",
    cancelledAt: new Date(now - 3 * 24 * HOUR - 2 * HOUR),
  });
  const schuleAbgesagt = await insert("M4", -2 * 24 * HOUR, {
    ...person,
    ...confirmed,
    status: "abgesagt",
    cancelledBy: "fahrschule",
    cancelledAt: new Date(now - 2 * 24 * HOUR - HOUR),
  });
  const aktuell = await insert("M5", 5 * 24 * HOUR, {
    customerEmail: "",
    customerPhone: "+41 79 999 88 77",
    ...confirmed,
  });
  const historie = (
    await customerHistories([
      { id: aktuell.id, startsAt: aktuell.startsAt, customerEmail: "", customerPhone: "+41 79 999 88 77" },
    ])
  ).get(aktuell.id);
  check("zweiter wahrgenommener Termin (Nichterscheinen zählt nicht)", historie?.position, 2);
  check("einmal nicht erschienen", historie?.noShows, 1);
  check("nur die eigene kurzfristige Absage zählt", historie?.lateCancellations, 1);

  const ausfaelle = async (ref: string, startsAt: Date) => {
    const tag = zurichDay(startsAt);
    const report = await accountingReport(Number(tag.slice(0, 4)), Number(tag.slice(5, 7)));
    return report.chargeable.find((row) => row.reference === ref)?.reason ?? null;
  };
  check("kurzfristige Absage der Kundschaft wird verrechnet", await ausfaelle(kundeAbgesagt.reference, kundeAbgesagt.startsAt), "Absage unter 24 h");
  check("kurzfristige Absage der Fahrschule nicht", await ausfaelle(schuleAbgesagt.reference, schuleAbgesagt.startsAt), null);

  check(
    "Kurs: keine Terminzählung, nur Warnungen",
    describeHistory({ position: 1, noShows: 1, lateCancellations: 0 }, { course: true }),
    { label: null, warnings: ["1× nicht erschienen"] },
  );

  // ===================================================================
  console.log("\nSZENARIO N — Ganzen Kurstermin absagen");
  // ===================================================================
  const tagN = addDays(todayInZurich(), 19);
  await addCourseDate(personA.id, vku.id, tagN, "18:00", "21:00");
  const kursN = (await findSlots({ lessonType: vku, fromDay: tagN, days: 1, staffId: personA.id })).find(
    (slot) => slot.time === "18:00",
  )!;
  for (const who of ["N1", "N2", "N3"]) await book("vku", personA.id, kursN.startsAt, who);
  await db.insert(waitlistEntries).values({
    lessonTypeId: vku.id,
    startsAt: kursN.startsAt,
    name: `${MARK} Wartend N`,
    email: "pruefstand-n@example.invalid",
    phone: "079 000 00 02",
    token: randomBytes(24).toString("base64url"),
  });
  const ergebnisN = await cancelCourseSession({ lessonTypeId: vku.id, startsAt: kursN.startsAt, message: "Prüfstand" });
  check("alle drei Anmeldungen abgesagt", ergebnisN.cancelled.length, 3);
  check("Warteliste mitgezählt", ergebnisN.waitlist, 1);
  const nachN = await db
    .select({ status: bookings.status, by: bookings.cancelledBy })
    .from(bookings)
    .where(and(eq(bookings.lessonTypeId, vku.id), eq(bookings.startsAt, kursN.startsAt)));
  check(
    "alle abgesagt, von der Fahrschule",
    nachN.every((row) => row.status === "abgesagt" && row.by === "fahrschule"),
    true,
  );
  const wartendN = await db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.lessonTypeId, vku.id), eq(waitlistEntries.startsAt, kursN.startsAt)));
  check("Warteliste gelöscht", wartendN.length, 0);
  check(
    "Kurstermin nicht mehr buchbar",
    (await findSlots({ lessonType: vku, fromDay: tagN, days: 1 })).some((slot) => slot.time === "18:00"),
    false,
  );

  // ===================================================================
  console.log("\nSZENARIO P — Termin verschieben, mit Sperre");
  // ===================================================================
  // Person B, Fahrstunde, eigener Tag: 10:00 wird gebucht, dann auf 11:00
  // verlegt; 11:00 darf danach niemand mehr bekommen, 10:00 wieder schon.
  const tagP = addDays(day, 2);
  await addRule(personB.id, fahrstunde.id, zurichWeekday(tagP), "10:00", "14:00");
  const slotsP = await findSlots({ lessonType: fahrstunde, fromDay: tagP, days: 1, staffId: personB.id });
  const zehn = slotsP.find((slot) => slot.time === "10:00")!;
  const elf = slotsP.find((slot) => slot.time === "11:00")!;
  const zwoelf = slotsP.find((slot) => slot.time === "12:00")!;
  check("Testzeiten 10, 11, 12 Uhr frei", [zehn, elf, zwoelf].every(Boolean), true);
  await book("fahrstunde", personB.id, zehn.startsAt, "P1");
  await book("fahrstunde", personB.id, zwoelf.startsAt, "P2");
  const [p1] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.customerName, `${MARK} P1`));
  const verschoben = await moveBooking({
    bookingId: p1.id,
    lessonType: fahrstunde,
    staffId: personB.id,
    startsAt: elf.startsAt,
    retentionDays: 30,
    movedBy: "fahrschule",
  });
  check("P1 von 10 auf 11 Uhr verschoben", "ok" in verschoben, true);
  const zeitenP = (await findSlots({ lessonType: fahrstunde, fromDay: tagP, days: 1, staffId: personB.id })).map(
    (slot) => slot.time,
  );
  check("10 Uhr wieder frei, 11 Uhr belegt", [zeitenP.includes("10:00"), zeitenP.includes("11:00")], [true, false]);
  const [p2] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.customerName, `${MARK} P2`));
  const kollision = await moveBooking({
    bookingId: p2.id,
    lessonType: fahrstunde,
    staffId: personB.id,
    startsAt: elf.startsAt,
    retentionDays: 30,
    movedBy: "fahrschule",
  });
  check("P2 auf das belegte 11 Uhr wird abgewiesen", "error" in kollision, true);

  // Kurzfristige Absage nach einer Verschiebung durch die Fahrschule: nicht
  // verrechenbar. Nach einer eigenen Verschiebung schon.
  const vonUns = await insert("P3", -2 * 24 * HOUR, {
    status: "abgesagt",
    cancelledBy: "kundschaft",
    cancelledAt: new Date(now - 2 * 24 * HOUR - HOUR),
    movedBy: "fahrschule",
    confirmedAt: new Date(now - 10 * 24 * HOUR),
  });
  const selbst = await insert("P4", -2 * 24 * HOUR + 2 * HOUR, {
    status: "abgesagt",
    cancelledBy: "kundschaft",
    cancelledAt: new Date(now - 2 * 24 * HOUR),
    movedBy: "kundschaft",
    confirmedAt: new Date(now - 10 * 24 * HOUR),
  });
  const tagP3 = zurichDay(vonUns.startsAt);
  const berichtP = await accountingReport(Number(tagP3.slice(0, 4)), Number(tagP3.slice(5, 7)));
  const grundP = (ref: string) => berichtP.chargeable.find((row) => row.reference === ref)?.reason ?? null;
  check("von uns verschoben, dann kurzfristig abgesagt: kostenlos", grundP(vonUns.reference), null);
  check("selbst verschoben, dann kurzfristig abgesagt: verrechnet", grundP(selbst.reference), "Absage unter 24 h");

  // ===================================================================
  console.log("\nSZENARIO Q — Ganzen Kurs verschieben");
  // ===================================================================
  const tagQ = addDays(todayInZurich(), 20);
  const zielQ = addDays(todayInZurich(), 22);
  await addCourseDate(personA.id, vku.id, tagQ, "18:00", "21:00");
  const kursQ = (await findSlots({ lessonType: vku, fromDay: tagQ, days: 1, staffId: personA.id })).find(
    (slot) => slot.time === "18:00",
  )!;
  for (const who of ["Q1", "Q2"]) await book("vku", personA.id, kursQ.startsAt, who);
  await db.insert(waitlistEntries).values({
    lessonTypeId: vku.id,
    startsAt: kursQ.startsAt,
    name: `${MARK} Wartend Q`,
    email: "pruefstand-q@example.invalid",
    phone: "079 000 00 03",
    token: randomBytes(24).toString("base64url"),
  });
  const umzug = await moveCourseSession({
    lessonTypeId: vku.id,
    startsAt: kursQ.startsAt,
    newDay: zielQ,
    newTime: "19:00",
    message: null,
  });
  check("Kurs verschoben, zwei Anmeldungen", "ok" in umzug ? umzug.moved.length : umzug.error, 2);
  const zielStart = (await findSlots({ lessonType: vku, fromDay: zielQ, days: 1, staffId: personA.id })).find(
    (slot) => slot.time === "19:00",
  );
  check("neuer Kurstermin buchbar, 2 Plätze weniger", zielStart ? vku.capacity - zielStart.seatsLeft : null, 2);
  check(
    "alter Kurstermin weg",
    (await findSlots({ lessonType: vku, fromDay: tagQ, days: 1, staffId: personA.id })).some((slot) => slot.time === "18:00"),
    false,
  );
  const wartendQ = await db
    .select({ startsAt: waitlistEntries.startsAt })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.email, "pruefstand-q@example.invalid"));
  check("Warteliste zieht mit", wartendQ[0]?.startsAt.getTime() === zielStart?.startsAt.getTime(), true);
  // Nachher aufräumen: addCourseDate hat die Zeile angelegt, die jetzt am
  // neuen Tag steht — sie bleibt in createdCourseDates und wird gelöscht.

  // Zweiter Umzug auf eine Zeit, zu der Person A eine Fahrstunde hat.
  await addRule(personA.id, fahrstunde.id, zurichWeekday(zielQ), "08:00", "12:00");
  const fahrQ = (await findSlots({ lessonType: fahrstunde, fromDay: zielQ, days: 1, staffId: personA.id })).find(
    (slot) => slot.time === "09:00",
  )!;
  await book("fahrstunde", personA.id, fahrQ.startsAt, "Q3");
  const konflikt = await moveCourseSession({
    lessonTypeId: vku.id,
    startsAt: zielStart!.startsAt,
    newDay: zielQ,
    newTime: "09:00",
    message: null,
  });
  check("Umzug auf belegte Zeit abgewiesen", "error" in konflikt, true);

  // ===================================================================
  console.log("\nSZENARIO R — Bitte um Google-Bewertung");
  // ===================================================================
  if (process.env.SMTP_HOST) {
    const vorherUrl = process.env.GOOGLE_REVIEW_URL;
    process.env.GOOGLE_REVIEW_URL = "https://g.page/r/pruefstand/review";
    const mitJa = { customerEmail: "pruefstand-bewertung@example.invalid", reviewConsent: true, confirmedAt: new Date(now - 10 * 24 * HOUR) };
    const r1 = await insert("R1", -2 * 24 * HOUR, mitJa);
    const r2 = await insert("R2", -1 * 24 * HOUR, mitJa);
    const ohneJa = await insert("R3", -1 * 24 * HOUR, {
      customerEmail: "pruefstand-ohne@example.invalid",
      reviewConsent: false,
      confirmedAt: new Date(now - 10 * 24 * HOUR),
    });
    const nichtDa = await insert("R4", -3 * 24 * HOUR, {
      customerEmail: "pruefstand-nichtda@example.invalid",
      reviewConsent: true,
      noShowAt: new Date(now - 3 * 24 * HOUR),
      confirmedAt: new Date(now - 10 * 24 * HOUR),
    });
    const kuenftig = await insert("R5", 3 * 24 * HOUR, {
      customerEmail: "pruefstand-kuenftig@example.invalid",
      reviewConsent: true,
      confirmedAt: new Date(now - HOUR),
    });
    const erste = await requestReviews([r1.id, ohneJa.id, nichtDa.id, kuenftig.id]);
    check(
      "nur mit Einverständnis, wahrgenommen und vorbei",
      [erste.sent, erste.noConsent, erste.notEligible],
      [1, 1, 2],
    );
    const zweite = await requestReviews([r2.id]);
    check("dieselbe Adresse wird nicht ein zweites Mal gefragt", [zweite.sent, zweite.alreadyAsked], [0, 1]);
    if (vorherUrl === undefined) delete process.env.GOOGLE_REVIEW_URL;
    else process.env.GOOGLE_REVIEW_URL = vorherUrl;
    const ohneLink = await requestReviews([r2.id]);
    check("ohne Bewertungslink geht nichts raus", ohneLink.sent, 0);
  } else {
    note("Bewertungsanfrage übersprungen", "SMTP_HOST nicht gesetzt — ohne Mailversand nicht prüfbar");
  }

  // ===================================================================
  console.log("\nSZENARIO O — Überwachung erkennt Stillstand");
  // ===================================================================
  // Den Zustand der Entwicklungsdatenbank sichern und am Ende zurückschreiben.
  const vorher = await db.select().from(systemChecks);
  try {
    await db.delete(systemChecks);
    const keys = async () => (await currentProblems()).map((problem) => problem.key).sort();

    await markOk("stuendlich");
    await markOk("aufraeumen");
    check("alles frisch: keine Probleme", await keys(), []);

    await markError("mail", new Error("Verbindung abgelehnt"));
    check("Mailfehler wird gemeldet", await keys(), ["mail"]);
    await markOk("mail");
    check("nach erfolgreicher Mail wieder in Ordnung", await keys(), []);

    await db
      .update(systemChecks)
      .set({ lastOkAt: new Date(Date.now() - 4 * HOUR) })
      .where(eq(systemChecks.key, "stuendlich"));
    check("stündlicher Lauf seit 4 h aus: gemeldet", await keys(), ["stuendlich"]);

    await markOk("stuendlich");
    await markError("aufraeumen", new Error("Datenbank weg"));
    check("fehlgeschlagener Aufräumlauf: gemeldet", await keys(), ["aufraeumen"]);
  } finally {
    await db.delete(systemChecks);
    if (vorher.length > 0) await db.insert(systemChecks).values(vorher);
  }

  console.log(`\n${failures === 0 ? "Alle Prüfungen bestanden." : `${failures} Prüfung(en) fehlgeschlagen.`}`);

  await cleanup();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exit(1);
});
