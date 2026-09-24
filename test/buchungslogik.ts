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
  availabilityRules,
  bookings,
  lessonTypes,
  staff,
  staffLessonTypes,
} from "@/lib/db/schema";
import { createBooking, findSlots, lessonTypeBySlug } from "@/lib/booking";
import { addDays, todayInZurich, zurichWeekday } from "@/lib/time";

const MARK = "PRUEFSTAND";
let failures = 0;

/** Alles, was der Lauf angelegt hat — auch auf bestehenden Konten. */
const createdRules: string[] = [];
const createdOfferings: { staffId: string; lessonTypeId: string }[] = [];

async function addRule(staffId: string, lessonTypeId: string, weekday: number, from: string, to: string) {
  const [row] = await db
    .insert(availabilityRules)
    .values({ staffId, lessonTypeId, weekday, startTime: from, endTime: to })
    .returning({ id: availabilityRules.id });
  createdRules.push(row.id);
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

  // Regeln und Zuordnungen, die der Lauf auf bestehenden Konten angelegt hat.
  if (createdRules.length > 0) {
    await db.delete(availabilityRules).where(inArray(availabilityRules.id, createdRules));
    createdRules.length = 0;
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
  const [personA] = await db.select({ id: staff.id }).from(staff).limit(1);
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
  const day = addDays(todayInZurich(), 10);
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
  await addRule(personA.id, vku.id, weekday, "18:00", "21:00");

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
  await addRule(personB.id, vku.id, weekday, "18:00", "21:00");

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
  await addRule(personB.id, nothilfe.id, weekday, "08:00", "13:00");

  const tagZwei = addDays(day, 7);
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

  console.log(`\n${failures === 0 ? "Alle Prüfungen bestanden." : `${failures} Prüfung(en) fehlgeschlagen.`}`);

  await cleanup();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exit(1);
});
