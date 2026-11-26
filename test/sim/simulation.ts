/**
 * Simulation des Buchungsbetriebs über die echten Server Actions.
 *
 * Aufruf: npm run pruefen:simulation
 *
 * Anders als der Prüfstand (test/buchungslogik.ts), der einzelne Fälle der
 * Bibliothek abklopft, spielt dieser Lauf den Alltag nach: Kundschaft bucht
 * online, bestätigt oder lässt verfallen, sagt ab, verschiebt selbst; das
 * Team erfasst, verschiebt und sagt ab, ganze Kurse ziehen um. Nach jedem
 * Schritt wird geprüft, dass niemand doppelt belegt ist, kein Kurs
 * überbucht und kein Termin ausserhalb der Arbeitszeit liegt.
 *
 * Next.js-Laufzeit, Anmeldung und Captcha sind durch Attrappen ersetzt
 * (tsconfig.sim.json); Mails gehen an einen kleinen SMTP-Empfänger in
 * diesem Prozess.
 *
 * ACHTUNG: schreibt in die Datenbank unter DATABASE_URL und räumt am Ende
 * auf. Nur gegen eine Entwicklungsdatenbank laufen lassen.
 */
import { createServer, type Socket } from "node:net";
import { and, eq, inArray, like, ne } from "drizzle-orm";

import { db, pool } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  ipBlocks,
  lessonTypes,
  rateLimitHits,
  staff,
  staffLessonTypes,
  waitlistEntries,
} from "@/lib/db/schema";
import { createBooking, findSlots, horizonDays, lessonTypeBySlug, occupiesTime } from "@/lib/booking";
import { courseWindows } from "@/lib/course-dates";
import { ruleAppliesOn } from "@/lib/availability-rules";
import { deleteExpiredRequests } from "@/lib/reminders";
import { bookingForToken, movableSlots } from "@/lib/self-reschedule";
import { addDays, minutesSinceMidnight, todayInZurich, zurichDay, zurichTime, zurichToInstant, zurichWeekday } from "@/lib/time";
import * as buchen from "@/app/buchen/actions";
import * as bestaetigen from "@/app/bestaetigen/[token]/actions";
import * as absagen from "@/app/absagen/[token]/actions";
import * as verschieben from "@/app/verschieben/[token]/actions";
import * as kalender from "@/app/team/kalender/actions";
import * as erfassen from "@/app/team/kalender/erfassen/actions";
import * as warteliste from "@/app/buchen/warteliste/actions";
import * as verfuegbarkeit from "@/app/team/verfuegbarkeit/actions";
import { RedirectSignal } from "./stubs/next-navigation";

// Mailversand an den Empfänger unten. Gelesen wird die Umgebung erst beim
// ersten Versand (lib/mail baut den Transport dann), deshalb genügt es hier.
const SMTP_PORT = 2526;
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(SMTP_PORT);
process.env.SMTP_SECURE = "false";

const MARK = "SIMULATION";
let failures = 0;
const findings: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    failures += 1;
    findings.push(label);
  }
  console.log(`${ok ? "  OK  " : " FEHL "} ${label}${!ok && detail !== undefined ? `\n         ${JSON.stringify(detail)}` : ""}`);
}

// --- Zufall, reproduzierbar ----------------------------------------------
let seed = Number(process.env.SIM_SEED ?? 20261126);
function random(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];

// --- SMTP-Empfänger --------------------------------------------------------
const mails: { to: string; data: string }[] = [];
let failMail = false;
const smtp = createServer((socket: Socket) => {
  let inData = false;
  let buffer = "";
  let rcpt = "";
  let body = "";
  socket.write("220 sim ESMTP\r\n");
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let index: number;
    while ((index = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (inData) {
        if (line === ".") {
          inData = false;
          mails.push({ to: rcpt, data: body });
          body = "";
          socket.write("250 OK\r\n");
        } else body += `${line}\n`;
        continue;
      }
      const verb = line.slice(0, 4).toUpperCase();
      if (verb === "EHLO" || verb === "HELO") socket.write("250 sim\r\n");
      else if (verb === "MAIL") socket.write(failMail ? "451 simulierter Ausfall\r\n" : "250 OK\r\n");
      else if (verb === "RCPT") {
        rcpt = line.replace(/^RCPT TO:\s*/i, "").replace(/[<>]/g, "");
        socket.write("250 OK\r\n");
      } else if (verb === "DATA") {
        inData = true;
        socket.write("354 go\r\n");
      } else if (verb === "QUIT") {
        socket.write("221 bye\r\n");
        socket.end();
      } else if (verb === "RSET" || verb === "NOOP") socket.write("250 OK\r\n");
      else socket.write("250 OK\r\n");
    }
  });
  socket.on("error", () => {});
});

// --- Hilfen für die Actions ----------------------------------------------
const g = globalThis as unknown as {
  __simIp?: string;
  __simUser?: { id: string; name: string; role: "admin" | "manager" | "bearbeiter"; mustChangePassword: boolean };
};

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) for (const entry of value) data.append(key, entry);
    else data.set(key, value);
  }
  return data;
}

/** Führt eine Action aus; Weiterleitung = Erfolg mit Ziel, sonst Rückgabewert. */
async function run<T>(action: () => Promise<T>): Promise<{ redirect?: string; result?: T; thrown?: string }> {
  try {
    return { result: await action() };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.url };
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

const fromMinutesSim = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

let customerCounter = 0;
function newCustomer() {
  customerCounter += 1;
  return {
    name: `${MARK} Kunde ${customerCounter}`,
    email: `sim-${customerCounter}@example.invalid`,
    telefon: "079 123 45 67",
    // Jede Person kommt von einer eigenen Adresse, wie im echten Betrieb.
    ip: `10.${Math.floor(customerCounter / 250) % 250}.${customerCounter % 250}.${1 + Math.floor(random() * 250)}`,
  };
}

async function bookOnline(slug: string, day: string, time: string, customer = newCustomer()) {
  g.__simIp = customer.ip;
  const outcome = await run(() =>
    buchen.createBookingAction({}, form({
      angebot: slug,
      tag: day,
      zeit: time,
      name: customer.name,
      email: customer.email,
      telefon: customer.telefon,
      agb: "ja",
      captcha: "x",
    })),
  );
  return { outcome, customer };
}

async function pendingFor(email: string) {
  return db.select().from(bookings).where(eq(bookings.customerEmail, email));
}

let helperIp = 0;
const freshIp = () => `10.250.${Math.floor(++helperIp / 250) % 250}.${helperIp % 250}`;

async function confirm(token: string, ip = freshIp()) {
  g.__simIp = ip;
  return run(() => bestaetigen.confirmBookingAction(form({ token })));
}

async function cancelByCustomer(token: string, ip = freshIp()) {
  g.__simIp = ip;
  return run(() => absagen.cancelBookingAction(form({ token })));
}

// --- Invarianten ---------------------------------------------------------
type Row = typeof bookings.$inferSelect & { buffer: number | null; capacity: number | null };

let staffIds: string[] = [];

async function occupying(): Promise<Row[]> {
  const rows = await db
    .select({ booking: bookings, buffer: lessonTypes.bufferMinutes, capacity: lessonTypes.capacity })
    .from(bookings)
    .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(and(inArray(bookings.staffId, staffIds), occupiesTime()));
  return rows.map((row) => ({ ...row.booking, buffer: row.buffer, capacity: row.capacity }));
}

function parts(row: Row): [number, number][] {
  const list: [number, number][] = [[row.startsAt.getTime(), row.endsAt.getTime()]];
  if (row.secondStartsAt && row.secondEndsAt) list.push([row.secondStartsAt.getTime(), row.secondEndsAt.getTime()]);
  return list;
}

/** Niemand doppelt belegt (mit Pause), kein Kurs überbucht. */
async function checkInvariants(context: string): Promise<boolean> {
  const rows = await occupying();
  const problems: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (a.staffId !== b.staffId) continue;
      const sameCourse = (a.capacity ?? 1) > 1 && a.lessonTypeId === b.lessonTypeId;
      if (sameCourse && a.startsAt.getTime() === b.startsAt.getTime()) continue;
      const pause = sameCourse ? 0 : Math.max(a.buffer ?? 0, b.buffer ?? 0) * 60_000;
      for (const [as, ae] of parts(a)) {
        for (const [bs, be] of parts(b)) {
          if (as < be + pause && ae > bs - pause) {
            problems.push(`${a.reference} ${zurichDay(a.startsAt)} ${zurichTime(a.startsAt)} ↔ ${b.reference} ${zurichTime(b.startsAt)}`);
          }
        }
      }
    }
  }
  const seats = new Map<string, number>();
  for (const row of rows) {
    if ((row.capacity ?? 1) <= 1) continue;
    const key = `${row.staffId}|${row.lessonTypeId}|${row.startsAt.toISOString()}`;
    seats.set(key, (seats.get(key) ?? 0) + 1);
    if ((seats.get(key) ?? 0) > (row.capacity ?? 1)) problems.push(`überbucht: ${key}`);
  }
  if (problems.length > 0) {
    check(`Invarianten nach ${context}`, false, problems.slice(0, 5));
    return false;
  }
  return true;
}

/** Liegt eine Einzellektion in der eingetragenen Arbeitszeit und nicht in einer Abwesenheit? */
async function insideWorkingHours(row: Row): Promise<boolean> {
  if (!row.staffId || !row.lessonTypeId) return false;
  const day = zurichDay(row.startsAt);
  const weekday = zurichWeekday(day);
  const start = minutesSinceMidnight(zurichTime(row.startsAt));
  const end = minutesSinceMidnight(zurichTime(row.endsAt));
  const rules = await db
    .select()
    .from(availabilityRules)
    .where(and(eq(availabilityRules.staffId, row.staffId), eq(availabilityRules.lessonTypeId, row.lessonTypeId)));
  const exceptions = await db
    .select()
    .from(availabilityExceptions)
    .where(and(eq(availabilityExceptions.staffId, row.staffId), eq(availabilityExceptions.day, day)));
  const relevant = exceptions.filter((e) => e.lessonTypeId === null || e.lessonTypeId === row.lessonTypeId);
  const inBlock =
    rules.some(
      (rule) =>
        ruleAppliesOn(rule, day, weekday) &&
        minutesSinceMidnight(rule.startTime) <= start &&
        minutesSinceMidnight(rule.endTime) >= end,
    ) ||
    relevant.some(
      (e) => e.available && minutesSinceMidnight(e.startTime) <= start && minutesSinceMidnight(e.endTime) >= end,
    );
  const absent = relevant.some(
    (e) => !e.available && minutesSinceMidnight(e.startTime) < end && minutesSinceMidnight(e.endTime) > start,
  );
  // Andere Kurse dieser Person samt Pause.
  const courses = await courseWindows({ fromDay: addDays(day, -14), untilDay: day, staffIds: [row.staffId], excludeLessonTypeId: row.lessonTypeId });
  const inCourse = courses.some((course) =>
    [{ day: course.day, startTime: course.startTime, endTime: course.endTime }, course.second].some((part) => {
      if (!part || part.day !== day) return false;
      const pause = Math.max(course.bufferMinutes, row.buffer ?? 0);
      return minutesSinceMidnight(part.startTime) - pause < end && minutesSinceMidnight(part.endTime) + pause > start;
    }),
  );
  return inBlock && !absent && !inCourse;
}

// --- Aufräumen -----------------------------------------------------------
async function cleanup() {
  await db.delete(bookings).where(like(bookings.customerName, `${MARK}%`));
  await db.delete(waitlistEntries).where(like(waitlistEntries.name, `${MARK}%`));
  const ids = (await db.select({ id: staff.id }).from(staff).where(like(staff.name, `${MARK}%`))).map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(bookings).where(inArray(bookings.staffId, ids));
    await db.delete(availabilityRules).where(inArray(availabilityRules.staffId, ids));
    await db.delete(availabilityExceptions).where(inArray(availabilityExceptions.staffId, ids));
    await db.delete(staffLessonTypes).where(inArray(staffLessonTypes.staffId, ids));
    await db.delete(staff).where(inArray(staff.id, ids));
  }
  await db.delete(rateLimitHits).where(like(rateLimitHits.bucket, "%10.%"));
  await db.delete(ipBlocks).where(like(ipBlocks.ip, "10.%"));
}

// =========================================================================
async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Die Simulation legt Testdaten an und läuft nicht mit NODE_ENV=production.");
    process.exit(1);
  }
  await new Promise<void>((resolve) => smtp.listen(SMTP_PORT, "127.0.0.1", resolve));
  await cleanup();

  const fahrstunde = (await lessonTypeBySlug("fahrstunde"))!;
  const schnupper = (await lessonTypeBySlug("schnupperstunde"))!;
  const vku = (await lessonTypeBySlug("vku"))!;
  const nothilfe = (await lessonTypeBySlug("nothilfekurs"))!;

  const makeStaff = async (key: string, role: "admin" | "manager" | "bearbeiter" = "bearbeiter") => {
    const [row] = await db
      .insert(staff)
      .values({ name: `${MARK} ${key}`, email: `sim-${key.toLowerCase()}@example.invalid`, passwordHash: "x", calendarToken: `${MARK}-${key}`, role, mustChangePassword: false })
      .returning();
    return row;
  };
  const A = await makeStaff("Anna");
  const B = await makeStaff("Beat");
  const C = await makeStaff("Carla");
  const M = await makeStaff("Leitung", "manager");
  staffIds = [A.id, B.id, C.id];
  g.__simUser = { id: M.id, name: M.name, role: "manager", mustChangePassword: false };

  const offer = async (staffId: string, lessonTypeId: string) =>
    db.insert(staffLessonTypes).values({ staffId, lessonTypeId }).onConflictDoNothing();
  for (const id of [A.id, B.id, C.id]) await offer(id, fahrstunde.id);
  await offer(A.id, schnupper.id);
  await offer(C.id, vku.id);
  await offer(C.id, nothilfe.id);

  const rule = async (staffId: string, lessonTypeId: string, weekday: number, from: string, to: string, extra: Partial<typeof availabilityRules.$inferInsert> = {}) =>
    db.insert(availabilityRules).values({ staffId, lessonTypeId, weekday, startTime: from, endTime: to, ...extra });
  const exception = async (values: typeof availabilityExceptions.$inferInsert) => db.insert(availabilityExceptions).values(values);

  for (const wd of [1, 2, 3, 4, 5]) {
    await rule(A.id, fahrstunde.id, wd, "08:00", "12:00");
    await rule(A.id, fahrstunde.id, wd, "13:30", "18:00");
    await rule(C.id, fahrstunde.id, wd, "08:00", "17:00");
  }
  for (const wd of [2, 3, 4, 5, 6]) await rule(B.id, fahrstunde.id, wd, "07:30", "11:30");
  // Schnupperstunde liegt im selben Fenster wie die Fahrstunden von Anna.
  await rule(A.id, schnupper.id, 3, "14:00", "16:00");

  const today = todayInZurich();
  // VKU-Serie montags 16–19 Uhr, 2. Kurstag mittwochs gleich: schneidet
  // Carlas Fahrstunden am Nachmittag.
  let firstMonday = addDays(today, 3);
  while (zurichWeekday(firstMonday) !== 1) firstMonday = addDays(firstMonday, 1);
  await rule(C.id, vku.id, 1, "16:00", "19:00", { secondDayOffset: 2, secondStartTime: "16:00", secondEndTime: "19:00", validFrom: firstMonday });
  // Nothilfekurs als einzelnes Datum, Freitag und Samstag.
  let friday = addDays(today, 8);
  while (zurichWeekday(friday) !== 5) friday = addDays(friday, 1);
  await exception({ staffId: C.id, lessonTypeId: nothilfe.id, day: friday, startTime: "08:00", endTime: "13:00", secondDayOffset: 1, secondStartTime: "08:00", secondEndTime: "13:00", available: true });
  // Anna an einem Tag mittags beim Arzt, Carla einen Montag in den Ferien.
  const doctorDay = addDays(firstMonday, 1);
  await exception({ staffId: A.id, day: doctorDay, startTime: "10:00", endTime: "14:00", available: false, note: "Arzt" });
  const vacationMonday = addDays(firstMonday, 7);
  await exception({ staffId: C.id, day: vacationMonday, startTime: "00:00", endTime: "23:59", available: false, note: "Ferien" });
  // Anna zusätzlich an einem Samstag, für alle Angebote.
  const extraSaturday = addDays(firstMonday, 5);
  await exception({ staffId: A.id, day: extraSaturday, startTime: "09:00", endTime: "12:00", available: true });

  console.log(`\nHeute ${today}, erster Montag ${firstMonday}, Nothilfe ${friday}\n`);

  // =====================================================================
  console.log("TEIL 1 — Gleichzeitig auf denselben Platz");
  // =====================================================================
  {
    const slots = await findSlots({ lessonType: fahrstunde, fromDay: addDays(today, 3), days: 7, staffId: B.id });
    const target = slots[0];
    const customers = Array.from({ length: 8 }, () => newCustomer());
    // Alle gleichzeitig: dieselbe Zeit, jede Person eigene Adresse.
    const results = await Promise.all(
      customers.map(async (customer) => {
        return createBooking({
          lessonType: fahrstunde,
          staffId: B.id,
          startsAt: target.startsAt,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.telefon,
          priceRappen: 100,
          retentionDays: 30,
        });
      }),
    );
    check("8 gleichzeitige Buchungen auf eine Fahrstunde: genau eine gelingt", results.filter((r) => !("error" in r)).length === 1, results.map((r) => ("error" in r ? "x" : "ok")));

    const vkuSlots = await findSlots({ lessonType: vku, fromDay: today, days: 30 });
    const session = vkuSlots[0];
    const many = Array.from({ length: vku.capacity + 6 }, () => newCustomer());
    const seatResults = await Promise.all(
      many.map((customer) =>
        createBooking({
          lessonType: vku,
          staffId: session.staffIds[0],
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          second: session.second,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.telefon,
          priceRappen: 100,
          retentionDays: 30,
        }),
      ),
    );
    check(`${many.length} gleichzeitige VKU-Anmeldungen: genau ${vku.capacity} Plätze vergeben`, seatResults.filter((r) => !("error" in r)).length === vku.capacity);
    await checkInvariants("Gleichzeitigkeit");
    await db.delete(bookings).where(like(bookings.customerName, `${MARK}%`));
  }

  // =====================================================================
  console.log("\nTEIL 2 — Alltag über vier Wochen (≈10 Buchungen pro Tag)");
  // =====================================================================
  const stats = { attempts: 0, booked: 0, phantom: 0, confirmed: 0, expired: 0, cancelled: 0, moved: 0, staffCancelled: 0, staffMoved: 0, manual: 0, outside: 0, mailCount: 0 };
  const phantomCases: string[] = [];
  for (let simDay = 0; simDay < 28; simDay += 1) {
    for (let n = 0; n < 10; n += 1) {
      stats.attempts += 1;
      const roll = random();
      const lessonType = roll < 0.7 ? fahrstunde : roll < 0.8 ? schnupper : roll < 0.95 ? vku : nothilfe;
      // Wie die Buchungsseite: alles im buchbaren Zeitraum.
      const offered = await findSlots({ lessonType, fromDay: today, days: horizonDays(lessonType), enough: 400 });
      if (offered.length === 0) continue;
      const slot = pick(offered.slice(0, 120));
      const { outcome, customer } = await bookOnline(lessonType.slug, slot.day, slot.time);
      if (!outcome.redirect?.startsWith("/buchen/reserviert")) {
        stats.phantom += 1;
        phantomCases.push(`${lessonType.slug} ${slot.day} ${slot.time}: ${JSON.stringify(outcome.result ?? outcome.thrown)}`);
        continue;
      }
      stats.booked += 1;
      const [row] = await pendingFor(customer.email);
      const fate = random();
      if (fate < 0.12) {
        // Nie bestätigt: Frist abgelaufen (und Luft vorbei), Aufräumlauf.
        await db.update(bookings).set({ confirmExpiresAt: new Date(Date.now() - 6 * 60_000) }).where(eq(bookings.id, row.id));
        await deleteExpiredRequests();
        stats.expired += 1;
      } else {
        const confirmed = await confirm(row.confirmToken!);
        if (confirmed.redirect?.startsWith("/buchen/bestaetigt")) stats.confirmed += 1;
        const [after] = await db.select().from(bookings).where(eq(bookings.id, row.id));
        if (lessonType.capacity <= 1) {
          const full = { ...after, buffer: lessonType.bufferMinutes, capacity: lessonType.capacity } as Row;
          if (!(await insideWorkingHours(full))) {
            stats.outside += 1;
            check(`Termin ausserhalb Arbeitszeit: ${after.reference} ${zurichDay(after.startsAt)} ${zurichTime(after.startsAt)}`, false);
          }
        }
        if (fate < 0.22) {
          await cancelByCustomer(after.cancelToken);
          stats.cancelled += 1;
        } else if (fate < 0.32) {
          g.__simIp = customer.ip;
          const tokenBooking = await bookingForToken(after.cancelToken);
          if (tokenBooking) {
            const options = await movableSlots(tokenBooking);
            if (options.length > 0) {
              const target = pick(options.slice(0, 60));
              const moved = await run(() => verschieben.selfRescheduleAction({}, form({ token: after.cancelToken, tag: target.day, zeit: target.time })));
              if (moved.redirect) stats.moved += 1;
              else if (!(moved.result as { error?: string })?.error?.includes("24 Stunden")) {
                phantomCases.push(`verschieben ${target.day} ${target.time}: ${JSON.stringify(moved.result ?? moved.thrown)}`);
                stats.phantom += 1;
              }
            }
          }
        } else if (fate < 0.36) {
          await run(() => kalender.cancelByStaffAction(form({ id: after.id })));
          stats.staffCancelled += 1;
        } else if (fate < 0.42 && lessonType.capacity <= 1) {
          const options = await findSlots({ lessonType, fromDay: today, days: 14, staffId: after.staffId!, excludeBookingId: after.id, ignoreLeadTime: true });
          const target = options.find((s) => s.startsAt.getTime() !== after.startsAt.getTime());
          if (target) {
            const moved = await run(() => kalender.rescheduleBookingAction({}, form({ id: after.id, tag: target.day, zeit: target.time })));
            if (moved.redirect) stats.staffMoved += 1;
            else phantomCases.push(`Team verschiebt ${target.day} ${target.time}: ${JSON.stringify(moved.result ?? moved.thrown)}`);
          }
        }
      }
      if (!(await checkInvariants(`Buchung ${stats.attempts}`))) break;
    }
    // Ein Anruf pro Tag, im Team erfasst (ohne Vorlaufzeit).
    const person = pick([A, B, C]);
    const options = await findSlots({ lessonType: fahrstunde, fromDay: today, days: 21, staffId: person.id, ignoreLeadTime: true });
    if (options.length > 0) {
      const slot = pick(options.slice(0, 80));
      const manual = await run(() =>
        erfassen.createManualBookingAction({}, form({ angebot: "fahrstunde", person: person.id, tag: slot.day, zeit: slot.time, name: `${MARK} Telefon ${simDay}`, telefon: "079 000 00 00", wiederholen: String(1 + Math.floor(random() * 3)) })),
      );
      if (manual.redirect) stats.manual += 1;
      else phantomCases.push(`Team erfasst ${slot.day} ${slot.time}: ${JSON.stringify(manual.result ?? manual.thrown)}`);
      await checkInvariants(`Erfassung Tag ${simDay}`);
    }
  }
  stats.mailCount = mails.length;
  console.log("  ..    ", JSON.stringify(stats));
  check("kein angebotener Termin scheitert beim Buchen/Verschieben (ohne Gleichzeitigkeit)", stats.phantom === 0 && phantomCases.length === 0, phantomCases.slice(0, 6));
  check("kein Termin ausserhalb der Arbeitszeit", stats.outside === 0);
  check("Invarianten am Ende des Alltags", await checkInvariants("Alltag"));

  // =====================================================================
  console.log("\nTEIL 3 — Sonderfälle");
  // =====================================================================
  await db.delete(bookings).where(like(bookings.customerName, `${MARK}%`));

  // 3a — Absage durch die Fahrschule, danach klickt die Kundschaft den alten Absagelink.
  {
    const slot = (await findSlots({ lessonType: fahrstunde, fromDay: addDays(today, 1), days: 3, staffId: A.id }))[0];
    const { customer } = await bookOnline("fahrstunde", slot.day, slot.time);
    const [row] = await pendingFor(customer.email);
    await confirm(row.confirmToken!);
    await run(() => kalender.cancelByStaffAction(form({ id: row.id })));
    await cancelByCustomer(row.cancelToken);
    const [after] = await db.select().from(bookings).where(eq(bookings.id, row.id));
    check("Absage der Fahrschule bleibt Absage der Fahrschule, auch nach Klick auf alten Link", after.cancelledBy === "fahrschule", { cancelledBy: after.cancelledBy });
  }

  // 3b — Unbestätigte Anfrage hält den Platz bis Frist + 5 Minuten Luft.
  {
    const slot = (await findSlots({ lessonType: fahrstunde, fromDay: addDays(today, 3), days: 3, staffId: B.id }))[0];
    const { customer } = await bookOnline("fahrstunde", slot.day, slot.time);
    const [row] = await pendingFor(customer.email);
    const stillFree = async () => (await findSlots({ lessonType: fahrstunde, fromDay: slot.day, days: 1, staffId: B.id })).some((s) => s.time === slot.time);
    check("angefragt: Platz ist belegt", !(await stillFree()));
    await db.update(bookings).set({ confirmExpiresAt: new Date(Date.now() - 2 * 60_000) }).where(eq(bookings.id, row.id));
    check("Frist seit 2 Min. abgelaufen: Platz noch gehalten (Luft)", !(await stillFree()));
    const late = await confirm(row.confirmToken!);
    check("Bestätigen nach Fristablauf geht nicht mehr", !late.redirect?.startsWith("/buchen/bestaetigt"), late);
    await db.update(bookings).set({ confirmExpiresAt: new Date(Date.now() - 6 * 60_000) }).where(eq(bookings.id, row.id));
    check("Frist seit 6 Min. abgelaufen: Platz wieder frei", await stillFree());
  }

  // 3c — Bestätigungslink zweimal: zweiter Klick ändert nichts, keine zweite Mail.
  {
    const slot = (await findSlots({ lessonType: fahrstunde, fromDay: addDays(today, 4), days: 3, staffId: C.id }))[0];
    const { customer } = await bookOnline("fahrstunde", slot.day, slot.time);
    const [row] = await pendingFor(customer.email);
    const before = mails.length;
    await confirm(row.confirmToken!);
    const afterFirst = mails.length;
    await confirm(row.confirmToken!);
    check("zweiter Klick auf Bestätigen verschickt nichts mehr", mails.length === afterFirst && afterFirst > before);
  }

  // 3d — Mailausfall bei der Buchung: Anfrage wird sofort gelöscht, Platz frei.
  {
    const slot = (await findSlots({ lessonType: fahrstunde, fromDay: addDays(today, 5), days: 3, staffId: A.id }))[0];
    failMail = true;
    const { outcome, customer } = await bookOnline("fahrstunde", slot.day, slot.time);
    failMail = false;
    const rows = await pendingFor(customer.email);
    check("Mailausfall: Fehlermeldung statt Weiterleitung", !outcome.redirect && !!(outcome.result as { error?: string })?.error);
    check("Mailausfall: keine hängende Anfrage", rows.length === 0);
  }

  // 3e — Mehrere Fahrstunden auf einmal, eine davon überschneidet sich.
  {
    const day = addDays(today, 6);
    const all = await findSlots({ lessonType: fahrstunde, fromDay: day, days: 1 });
    const customer = newCustomer();
    g.__simIp = customer.ip;
    const times = all.map((s) => s.time);
    // Versetzte Zeiten zweier Personen (08:00 bei Anna, 07:30 bei Beat …)
    const overlapping = times.find((t, i) => i > 0 && minutesSinceMidnight(t) - minutesSinceMidnight(times[i - 1]) < 45);
    if (overlapping) {
      const prev = times[times.indexOf(overlapping) - 1];
      const res = await run(() => buchen.createMultiBookingAction({}, form({ angebot: "fahrstunde", termin: [`${day}T${prev}`, `${day}T${overlapping}`], name: customer.name, email: customer.email, telefon: customer.telefon, agb: "ja", captcha: "x" })));
      check("Mehrfachbuchung: sich überschneidende Zeiten werden abgewiesen", !res.redirect, res);
    }
    const three = all.filter((s, i, arr) => i === 0 || minutesSinceMidnight(s.time) - minutesSinceMidnight(arr[0].time) >= 60 * i).slice(0, 3);
    const res = await run(() => buchen.createMultiBookingAction({}, form({ angebot: "fahrstunde", termin: three.map((s) => `${day}T${s.time}`), name: customer.name, email: customer.email, telefon: customer.telefon, agb: "ja", captcha: "x" })));
    const rows = await pendingFor(customer.email);
    check("Mehrfachbuchung: drei Fahrstunden reserviert, ein Bestätigungslink", rows.length === three.length && new Set(rows.map((r) => r.confirmToken)).size === 1, { res, n: rows.length });
    const staffUsed = new Set(rows.map((r) => r.staffId));
    console.log(`  ..    Mehrfachbuchung verteilt auf ${staffUsed.size} Person(en)`);
    // Kurs über Mehrfachformular: abgewiesen.
    const vkuSlot = (await findSlots({ lessonType: vku, fromDay: today, days: 40 }))[0];
    const viaMulti = await run(() => buchen.createMultiBookingAction({}, form({ angebot: "vku", termin: [`${vkuSlot.day}T${vkuSlot.time}`], name: customer.name, email: customer.email, telefon: customer.telefon, agb: "ja", captcha: "x" })));
    check("Mehrfachformular nimmt keine Kurse an", !viaMulti.redirect);
  }

  // 3f — Manipulierte Formulare: Zeit ausserhalb, Vergangenheit, Horizont, Abwesenheit.
  {
    const absurd = [
      ["fahrstunde", addDays(today, 3), "03:00", "mitten in der Nacht"],
      ["fahrstunde", addDays(today, -1), "09:00", "gestern"],
      ["fahrstunde", today, zurichTime(new Date(Date.now() + 2 * 3600_000)).slice(0, 3) + "00", "innerhalb der Vorlaufzeit"],
      ["fahrstunde", addDays(today, 40), "09:00", "jenseits des Horizonts"],
      ["fahrstunde", doctorDay, "10:00", "während Annas Arzttermin (nur Anna frei?)"],
      ["fahrstunde", addDays(today, 3), "08:10", "krumme Zeit, nicht im Raster"],
      ["vku", firstMonday, "17:00", "VKU zu erfundener Zeit"],
      ["gibtsnicht", addDays(today, 3), "09:00", "unbekanntes Angebot"],
    ] as const;
    for (const [slug, day, time, label] of absurd) {
      const offered = (await findSlots({ lessonType: (await lessonTypeBySlug(slug)) ?? fahrstunde, fromDay: day, days: 1 }).catch(() => [])).some((s) => s.time === time);
      if (offered) {
        console.log(`  ..    ${label}: ist tatsächlich frei, übersprungen`);
        continue;
      }
      const { outcome } = await bookOnline(slug, day, time);
      check(`manipuliert (${label}) wird abgewiesen`, !outcome.redirect, outcome);
    }
  }

  // 3g — VKU über zwei Tage: Fahrstunde am 2. Kurstag sperrt den Kurs und umgekehrt.
  {
    const vkuDay = addDays(firstMonday, 14);
    const wednesday = addDays(vkuDay, 2);
    const vkuBefore = (await findSlots({ lessonType: vku, fromDay: vkuDay, days: 1 })).length;
    const fahrWed = await findSlots({ lessonType: fahrstunde, fromDay: wednesday, days: 1, staffId: C.id, ignoreLeadTime: true });
    const lateAfternoon = fahrWed.filter((s) => minutesSinceMidnight(s.time) + 45 > 16 * 60 - 15);
    check("Fahrstunde bei Carla am 2. Kurstag nicht in den Kurs (mit Pause)", lateAfternoon.length === 0, lateAfternoon.map((s) => s.time));
    check("VKU-Termin vorhanden", vkuBefore === 1);
  }

  // 3h — Kurs mit Absage/Verschieben durch die Leitung, Warteliste.
  {
    const vkuDay = addDays(firstMonday, 21);
    const session = (await findSlots({ lessonType: vku, fromDay: vkuDay, days: 1 }))[0];
    const participants: { email: string; cancelToken: string; id: string }[] = [];
    for (let i = 0; i < vku.capacity; i += 1) {
      const { customer } = await bookOnline("vku", session.day, session.time);
      const [row] = await pendingFor(customer.email);
      if (!row) continue;
      await confirm(row.confirmToken!);
      participants.push({ email: customer.email, cancelToken: row.cancelToken, id: row.id });
    }
    check("VKU voll gebucht", participants.length === vku.capacity, participants.length);
    const extra = await bookOnline("vku", session.day, session.time);
    check("13. Anmeldung wird abgewiesen", !extra.outcome.redirect);
    g.__simIp = "10.249.1.1";
    const wait = await run(() => warteliste.joinWaitlistAction({}, form({ angebot: "vku", tag: session.day, zeit: session.time, name: `${MARK} Wartend`, email: "sim-wait@example.invalid", telefon: "079 111 11 11", captcha: "x" })));
    check("Eintrag auf Warteliste", (wait.result as { ok?: boolean })?.ok === true, wait);
    const beforeMails = mails.length;
    await cancelByCustomer(participants[0].cancelToken);
    check("Absage im vollen Kurs: Warteliste bekommt Mail", mails.slice(beforeMails).some((m) => m.to === "sim-wait@example.invalid"));

    // Kurs verschieben auf Dienstag gleiche Zeit — Carla hat dort Fahrstunden-Zeit bis 17 Uhr.
    const target = addDays(vkuDay, 1);
    const movedCourse = await run(() => kalender.moveCourseAction({}, form({ id: participants[1].id, tag: target, zeit: "16:00" })));
    console.log(`  ..    Kurs verschieben auf ${target} 16:00: ${JSON.stringify(movedCourse.redirect ?? movedCourse.result ?? movedCourse.thrown)}`);
    await checkInvariants("Kurs verschoben");
    const [p1] = await db.select().from(bookings).where(eq(bookings.id, participants[1].id));
    if (movedCourse.redirect) {
      check("verschobener Kurs: 2. Kurstag wandert mit (Do)", p1.secondStartsAt ? zurichDay(p1.secondStartsAt) === addDays(target, 2) : false, p1.secondStartsAt);
      // Fahrstunden am Donnerstag nach 15:45 bei Carla dürfen jetzt nicht mehr angeboten werden.
      const thu = await findSlots({ lessonType: fahrstunde, fromDay: addDays(target, 2), days: 1, staffId: C.id, ignoreLeadTime: true });
      check("nach Kursumzug: keine Fahrstunde in Carlas neuem 2. Kurstag", !thu.some((s) => minutesSinceMidnight(s.time) + 45 > 16 * 60 - 15 && minutesSinceMidnight(s.time) < 19 * 60), thu.map((s) => s.time));
    }
    const cancelledCourse = await run(() => kalender.cancelCourseAction({}, form({ id: participants[1].id })));
    check("ganzen Kurs absagen", !!cancelledCourse.redirect, cancelledCourse);
    const remaining = await db.select().from(bookings).where(and(inArray(bookings.id, participants.map((p) => p.id)), ne(bookings.status, "abgesagt")));
    check("nach Kursabsage: niemand mehr angemeldet", remaining.length === 0, remaining.length);
    // Kundschaft klickt danach ihren Absagelink: Abrechnung darf nicht kippen.
    await cancelByCustomer(participants[2].cancelToken);
    const [p2] = await db.select().from(bookings).where(eq(bookings.id, participants[2].id));
    check("Kursabsage bleibt Absage der Fahrschule nach Klick auf alten Link", p2.cancelledBy === "fahrschule", p2.cancelledBy);
  }

  // 3i — 2-tägiger Kurs: Kurs zu einer Zeit, deren 2. Tag mit dem 1. Tag
  // eines anderen Termins desselben Kurses zusammenfällt.
  {
    const mon = addDays(firstMonday, 7 * 5);
    const wed = addDays(mon, 2);
    // Zusätzlicher VKU-Termin am Mittwoch 16:00 (1. Tag) bei Carla.
    await exception({ staffId: C.id, lessonTypeId: vku.id, day: wed, startTime: "16:00", endTime: "19:00", available: true });
    const monSlot = (await findSlots({ lessonType: vku, fromDay: mon, days: 1 }))[0];
    if (monSlot) {
      const { outcome } = await bookOnline("vku", monSlot.day, monSlot.time);
      check("Montags-VKU gebucht", !!outcome.redirect, outcome);
    }
    const wedSlots = await findSlots({ lessonType: vku, fromDay: wed, days: 1 });
    if (wedSlots.length > 0) {
      const { outcome } = await bookOnline("vku", wed, wedSlots[0].time);
      check("Mittwochs-VKU (gleiche Zeit wie 2. Tag vom Montag): angeboten ⇒ auch buchbar", !!outcome.redirect, outcome);
    } else {
      console.log("  ..    Mittwochs-VKU wird nicht angeboten (Kollision mit 2. Kurstag erkannt)");
    }
    await checkInvariants("überlappende Kurstage");
  }

  // 3j — Absage-/Verschiebelink nach Beginn, Verschieben unter 24 h.
  {
    const soon = (await findSlots({ lessonType: fahrstunde, fromDay: today, days: 3, staffId: A.id, ignoreLeadTime: true })).find((s) => s.startsAt.getTime() - Date.now() < 24 * 3600_000 && s.startsAt.getTime() > Date.now() + 3600_000);
    if (soon) {
      const res = await run(() => erfassen.createManualBookingAction({}, form({ angebot: "fahrstunde", person: A.id, tag: soon.day, zeit: soon.time, name: `${MARK} Kurzfristig`, telefon: "079 000 00 00", email: "sim-kurz@example.invalid" })));
      const [row] = await pendingFor("sim-kurz@example.invalid");
      check("Team erfasst innert 24 h (ohne Vorlaufzeit)", !!res.redirect && !!row, res);
      if (row) {
        const target = (await findSlots({ lessonType: fahrstunde, fromDay: addDays(today, 3), days: 5, staffId: A.id }))[0];
        g.__simIp = "10.248.0.1";
        const moved = await run(() => verschieben.selfRescheduleAction({}, form({ token: row.cancelToken, tag: target.day, zeit: target.time })));
        check("Selbst verschieben unter 24 h wird abgewiesen", !moved.redirect, moved);
        await cancelByCustomer(row.cancelToken);
        const [after] = await db.select().from(bookings).where(eq(bookings.id, row.id));
        check("kurzfristige Absage durch Kundschaft als solche erfasst", after.status === "abgesagt" && after.cancelledBy === "kundschaft");
      }
    } else console.log("  ..    kein Termin in den nächsten 24 h frei, übersprungen");
  }

  // 3k — Rate-Limit: 6. Buchung derselben Adresse in einer Stunde wird abgewiesen.
  {
    const ip = "10.247.0.1";
    const day = addDays(today, 12);
    const free = await findSlots({ lessonType: fahrstunde, fromDay: day, days: 3 });
    let ok = 0;
    let lastError = "";
    for (let i = 0; i < 6 && i < free.length; i += 1) {
      const customer = { ...newCustomer(), ip };
      const { outcome } = await bookOnline("fahrstunde", free[i * 2]?.day ?? free[i].day, free[i * 2]?.time ?? free[i].time, customer);
      if (outcome.redirect) ok += 1;
      else lastError = (outcome.result as { error?: string })?.error ?? "";
    }
    check("höchstens 5 Buchungen pro Stunde und Adresse", ok === 5 && lastError.includes("Zu viele"), { ok, lastError });
  }

  // 3l — Zeitumstellung: Kurstermine an den Umstellungstagen liegen auf der Wanduhrzeit.
  {
    const spring = zurichToInstant("2027-03-28", "09:00");
    const autumn = zurichToInstant("2027-10-31", "09:00");
    check("Sommerzeit: 09:00 Zürich = 07:00 UTC", spring.toISOString() === "2027-03-28T07:00:00.000Z", spring.toISOString());
    check("Winterzeit: 09:00 Zürich = 08:00 UTC", autumn.toISOString() === "2027-10-31T08:00:00.000Z", autumn.toISOString());
    const gap = zurichToInstant("2027-03-28", "02:30");
    console.log(`  ..    nicht existierende Zeit 02:30 am 28.3.2027 → ${gap.toISOString()} (${zurichTime(gap)})`);
  }

  // 3m — Schnupperstunde und Fahrstunde bei derselben Person: keine Überlappung.
  {
    let wed = addDays(today, 2);
    while (zurichWeekday(wed) !== 3) wed = addDays(wed, 1);
    const sch = (await findSlots({ lessonType: schnupper, fromDay: wed, days: 1 }))[0];
    if (sch) {
      const { outcome } = await bookOnline("schnupperstunde", sch.day, sch.time);
      check("Schnupperstunde gebucht", !!outcome.redirect, outcome);
      const fahr = await findSlots({ lessonType: fahrstunde, fromDay: wed, days: 1, staffId: A.id });
      const s = minutesSinceMidnight(sch.time);
      const clash = fahr.filter((f) => minutesSinceMidnight(f.time) < s + 45 + 15 && minutesSinceMidnight(f.time) + 45 + 15 > s);
      check("keine Fahrstunde bei Anna in/an der Schnupperstunde (mit Pause)", clash.length === 0, clash.map((c) => c.time));
    }
  }

  // 3n — Kurs verschieben: dieselben Hürden wie eine Buchung.
  {
    const base = addDays(firstMonday, 7 * 6);
    const session = (await findSlots({ lessonType: vku, fromDay: base, days: 1 }))[0];
    const { customer } = await bookOnline("vku", session.day, session.time);
    const [participant] = await pendingFor(customer.email);
    await confirm(participant.confirmToken!);
    const tryMove = async (day: string, time: string) =>
      run(() => kalender.moveCourseAction({}, form({ id: participant.id, tag: day, zeit: time })));

    // (a) Fahrstunde endet um 15:55 am neuen Tag — die 15 Min. Pause fehlt.
    const tue = addDays(base, 1);
    const before = await createBooking({
      lessonType: fahrstunde,
      staffId: C.id,
      startsAt: zurichToInstant(tue, "15:10"),
      customerName: `${MARK} Vor Kurs`,
      customerEmail: "",
      customerPhone: "079 000 00 00",
      priceRappen: 0,
      retentionDays: 30,
    });
    check("Fahrstunde 15:10 am Dienstag angelegt", !("error" in before), before);
    const res1 = await tryMove(tue, "16:00");
    check("Kursumzug direkt nach Fahrstunde (bis 15:55) ohne Pause wird abgewiesen", !res1.redirect, res1.redirect ?? res1.result);
    await checkInvariants("Kursumzug Pause");
    // (b) Abwesenheit am neuen 2. Kurstag.
    const fri = addDays(base, 4);
    const sun = addDays(base, 6);
    await exception({ staffId: C.id, day: sun, startTime: "00:00", endTime: "23:59", available: false, note: "Ferien" });
    const res2 = await tryMove(fri, "16:00");
    check("Kursumzug mit 2. Kurstag in Carlas Abwesenheit wird abgewiesen", !res2.redirect, res2.redirect ?? res2.result);
    // (c) Neuer Termin fällt in einen (leeren) Nothilfekurs derselben Person.
    const nhDay = addDays(base, 11);
    await exception({ staffId: C.id, lessonTypeId: nothilfe.id, day: nhDay, startTime: "08:00", endTime: "13:00", available: true });
    const res3 = await tryMove(nhDay, "10:00");
    check("Kursumzug in einen anderen Kurstermin derselben Person wird abgewiesen", !res3.redirect, res3.redirect ?? res3.result);
    // (d) Überlappend mit einem anderen Termin desselben Kurses (17:00 statt 16:00).
    const nextMon = addDays(base, 7);
    const res4 = await tryMove(nextMon, "17:00");
    check("Kursumzug halb über einen anderen VKU-Termin wird abgewiesen", !res4.redirect, res4.redirect ?? res4.result);
    // (e) Ein freier Donnerstag (2. Kurstag Samstag) ohne Hindernisse klappt.
    // Samstag ginge nicht: dessen 2. Kurstag fiele auf den Montagskurs.
    const thu = addDays(base, 10);
    const res5 = await tryMove(thu, "16:00");
    check("Kursumzug auf einen freien Donnerstag gelingt", !!res5.redirect, res5.result ?? res5.thrown);
    await checkInvariants("Kursumzug");
  }

  // 3o — Abwesenheit über schon gebuchte Termine: eingetragen, aber mit Warnung.
  {
    const absence = async (person: string, day: string, von: string, bis: string, extra: Record<string, string> = {}) =>
      run(() => verfuegbarkeit.addExceptionAction({}, form({ person, tag: day, von, bis, art: "abwesend", ...extra })));
    type State = Awaited<ReturnType<typeof verfuegbarkeit.addExceptionAction>>;

    // Fahrstunde bei Beat, bestätigt.
    const day = addDays(today, 15);
    const slot = (await findSlots({ lessonType: fahrstunde, fromDay: day, days: 5, staffId: B.id }))[0];
    const { customer } = await bookOnline("fahrstunde", slot.day, slot.time);
    const [row] = await pendingFor(customer.email);
    await confirm(row.confirmToken!);
    const startMin = minutesSinceMidnight(slot.time);

    const hit = (await absence(B.id, slot.day, "06:00", "20:00")).result as State;
    check("Abwesenheit über Fahrstunde: trotzdem eingetragen", !!hit?.ok, hit);
    check(
      "Abwesenheit über Fahrstunde: Termin mit Name in der Warnung",
      hit?.conflicts?.length === 1 && hit.conflicts[0].customerName === customer.name && hit.conflicts[0].time === slot.time,
      hit?.conflicts,
    );
    const touching = (await absence(B.id, slot.day, slot.time === "07:30" ? "06:00" : "05:00", slot.time)).result as State;
    check("Abwesenheit endet genau bei Terminbeginn: keine Warnung", !touching?.conflicts, touching?.conflicts);
    const partial = (await absence(B.id, slot.day, fromMinutesSim(startMin + 30), fromMinutesSim(startMin + 60))).result as State;
    check("Abwesenheit über das Ende der Fahrstunde: Warnung", partial?.conflicts?.length === 1, partial?.conflicts);
    const range = (await absence(B.id, addDays(slot.day, -2), "00:00", "23:59", { tagBis: addDays(slot.day, 2) })).result as State;
    check("Ferien über mehrere Tage: Termin gefunden", range?.conflicts?.some((c) => c.bookingId === row.id) === true, range?.conflicts);
    await run(() => kalender.cancelByStaffAction(form({ id: row.id })));
    const afterCancel = (await absence(B.id, slot.day, "06:00", "20:00")).result as State;
    check("abgesagter Termin: keine Warnung mehr", !afterCancel?.conflicts, afterCancel?.conflicts);

    // VKU mit zwei Anmeldungen, Abwesenheit nur am 2. Kurstag.
    const vkuDay = addDays(firstMonday, 7 * 8);
    const session = (await findSlots({ lessonType: vku, fromDay: vkuDay, days: 1 }))[0];
    for (let i = 0; i < 2; i += 1) {
      const booked = await bookOnline("vku", session.day, session.time);
      const [p] = await pendingFor(booked.customer.email);
      await confirm(p.confirmToken!);
    }
    const secondDay = session.second!.day;
    const course = (await absence(C.id, secondDay, "15:00", "22:00")).result as State;
    check(
      "Abwesenheit am 2. Kurstag: Kurs einmal gelistet, 2 Anmeldungen, als 2. Kurstag markiert",
      course?.conflicts?.length === 1 && course.conflicts[0].participants === 2 && course.conflicts[0].secondDayOnly,
      course?.conflicts,
    );
    const onlyDriving = (await absence(C.id, secondDay, "15:00", "22:00", { lessonTypeId: fahrstunde.id })).result as State;
    check("Abwesenheit nur für Fahrstunden: Kurs nicht in der Warnung", !!onlyDriving?.ok && !onlyDriving.conflicts, onlyDriving);
  }

  await checkInvariants("Sonderfälle");

  console.log(`\n${failures === 0 ? "Alle Prüfungen bestanden." : `${failures} Prüfung(en) fehlgeschlagen:\n - ${findings.join("\n - ")}`}`);
  await cleanup();
  smtp.close();
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => {});
  process.exit(1);
});
