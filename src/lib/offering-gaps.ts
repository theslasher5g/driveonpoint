import "server-only";
import { and, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { ruleAppliesOn } from "./availability-rules";
import { BOOKING_HORIZON_DAYS, findSlots, horizonDays, listLessonTypes } from "./booking";
import { courseWindows } from "./course-dates";
import { db } from "./db";
import {
  availabilityExceptions,
  availabilityRules,
  staff,
  staffLessonTypes,
  systemChecks,
  waitlistEntries,
  type LessonType,
} from "./db/schema";
import { env } from "./env";
import { escapeHtml, mailLayout, sendMail } from "./mail";
import { alertRecipient } from "./monitoring";
import { addDays, todayInZurich, zurichDay, zurichWeekday } from "./time";

/**
 * Meldet, wenn ein Angebot online nicht mehr buchbar ist: kein einziger
 * freier Termin in den Wochen, die die Kundschaft sieht. Sonst merkt das
 * niemand, bis sich jemand beschwert oder einfach woanders bucht.
 */

export type GapReason = "niemand" | "keine-zeiten" | "ausgebucht";

export type OfferingGap = {
  lessonType: LessonType;
  reason: GapReason;
  /** Nur bei Kursen: wie viele auf einer Warteliste stehen. */
  waiting: number;
};

const DAY = 24 * 60 * 60 * 1000;
/** Nach einer Entwarnung frühestens wieder melden, damit ein einzelner frei
 * werdender und gleich wieder gebuchter Termin nicht zwei Mails auslöst. */
const QUIET_AFTER_ALERT = DAY;
/** Solange die Lücke bleibt, höchstens einmal pro Woche erinnern. */
const REMIND_AFTER = 7 * DAY;

/** Warum ist dieses Angebot nicht buchbar? Null, wenn es buchbar ist. */
export async function offeringGap(lessonType: LessonType, now: Date = new Date()): Promise<OfferingGap | null> {
  const horizon = horizonDays(lessonType);
  const slots = await findSlots({ lessonType, days: horizon });
  if (slots.length > 0) return null;

  const isCourse = lessonType.capacity > 1;
  const waiting = isCourse ? await waitingFor(lessonType.id, now) : 0;

  const eligible = await db
    .select({ id: staff.id })
    .from(staff)
    .innerJoin(staffLessonTypes, eq(staffLessonTypes.staffId, staff.id))
    .where(and(eq(staff.active, true), eq(staffLessonTypes.lessonTypeId, lessonType.id)));
  const staffIds = eligible.map((row) => row.id);
  if (staffIds.length === 0) return { lessonType, reason: "niemand", waiting };

  // Zeiten innerhalb der Vorlaufzeit lassen sich ohnehin nicht buchen und
  // zählen darum nicht als eingetragen.
  const fromDay = zurichDay(new Date(now.getTime() + lessonType.leadTimeHours * 60 * 60 * 1000));
  const untilDay = addDays(todayInZurich(), horizon);
  if (fromDay > untilDay) return { lessonType, reason: "keine-zeiten", waiting };

  // Kurse: einzelne Daten und Serien, ohne ausgefallene Termine.
  if (isCourse) {
    const windows = await courseWindows({
      fromDay,
      untilDay,
      lessonTypeId: lessonType.id,
      staffIds,
    });
    return { lessonType, reason: windows.length > 0 ? "ausgebucht" : "keine-zeiten", waiting };
  }

  const [dates, rules] = await Promise.all([
    db
      .select({ id: availabilityExceptions.id })
      .from(availabilityExceptions)
      .where(
        and(
          inArray(availabilityExceptions.staffId, staffIds),
          eq(availabilityExceptions.available, true),
          or(isNull(availabilityExceptions.lessonTypeId), eq(availabilityExceptions.lessonTypeId, lessonType.id)),
          gte(availabilityExceptions.day, fromDay),
          lte(availabilityExceptions.day, untilDay),
        ),
      )
      .limit(1),
    db
      .select()
      .from(availabilityRules)
      .where(
        and(
          inArray(availabilityRules.staffId, staffIds),
          eq(availabilityRules.lessonTypeId, lessonType.id),
        ),
      ),
  ]);

  let hasTimes = dates.length > 0;
  for (let day = fromDay; !hasTimes && day <= untilDay; day = addDays(day, 1)) {
    const weekday = zurichWeekday(day);
    hasTimes = rules.some((rule) => ruleAppliesOn(rule, day, weekday));
  }

  return { lessonType, reason: hasTimes ? "ausgebucht" : "keine-zeiten", waiting };
}

async function waitingFor(lessonTypeId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.lessonTypeId, lessonTypeId), gt(waitlistEntries.startsAt, now)));
  return row?.count ?? 0;
}

type GapState = { lastOkAt: Date | null; alertedAt: Date | null } | undefined;

/**
 * Einmal pro Lücke melden, nicht bei jedem Lauf. Eine neue Lücke kurz nach
 * der letzten Meldung wartet einen Tag; eine bestehende wird wöchentlich
 * wiederholt.
 */
export function shouldAlert(state: GapState, now: Date): boolean {
  const alertedAt = state?.alertedAt;
  if (!alertedAt) return true;
  const since = now.getTime() - alertedAt.getTime();
  const resolvedSinceAlert = !!state.lastOkAt && state.lastOkAt > alertedAt;
  return since >= (resolvedSinceAlert ? QUIET_AFTER_ALERT : REMIND_AFTER);
}

const stateKey = (lessonType: LessonType) => `angebot:${lessonType.slug}`;

function describe(gap: OfferingGap): { title: string; detail: string } {
  const name = gap.lessonType.name;
  const isCourse = gap.lessonType.capacity > 1;
  // Kurse sind ein Jahr voraus buchbar, Fahrstunden 4 Wochen.
  const weeks = Math.round(BOOKING_HORIZON_DAYS / 7);
  const within = isCourse ? "In den nächsten 12 Monaten" : `In den nächsten ${weeks} Wochen`;
  const of = isCourse ? "der nächsten 12 Monate" : `der nächsten ${weeks} Wochen`;
  const waiting =
    gap.waiting > 0
      ? ` ${gap.waiting} ${gap.waiting === 1 ? "Person steht" : "Personen stehen"} auf einer Warteliste.`
      : "";
  switch (gap.reason) {
    case "niemand":
      return {
        title: `${name}: niemand zugeteilt`,
        detail: `Keine aktive Fahrlehrperson bietet ${name} an. Unter Mitarbeitende ein Angebot zuteilen.`,
      };
    case "keine-zeiten":
      return {
        title: isCourse ? `${name}: kein Kurstermin eingetragen` : `${name}: keine Zeiten eingetragen`,
        detail: `${within} ist ${isCourse ? "kein Kurstermin" : "keine Zeit"} eingetragen, online lässt sich nichts buchen. Unter Verfügbarkeit ${isCourse ? "neue Kurstermine" : "neue Zeiten"} eintragen.${waiting}`,
      };
    default:
      return {
        title: `${name}: ausgebucht`,
        detail: `${isCourse ? "Alle Kurstermine" : "Alle eingetragenen Zeiten"} ${of} sind gebucht oder durch Abwesenheiten blockiert. Unter Verfügbarkeit ${isCourse ? "einen weiteren Kurstermin" : "mehr Zeiten"} eintragen.${waiting}`,
      };
  }
}

/**
 * Stündlich: alle aktiven Angebote prüfen und neue Lücken in einer Mail
 * melden. Wirft nicht bei einem Mailproblem, damit der Rest des Laufs
 * weitergeht; der Fehler steht dann im Log und der Zustand bleibt, sodass
 * der nächste Lauf es erneut versucht.
 */
export async function alertOfferingGaps(now: Date = new Date()): Promise<{ gaps: string[]; alerted: string[] }> {
  const states = new Map(
    (await db.select().from(systemChecks)).map((row) => [row.key, row]),
  );
  const gaps: OfferingGap[] = [];

  for (const lessonType of await listLessonTypes()) {
    const gap = await offeringGap(lessonType, now);
    if (gap) {
      gaps.push(gap);
    } else {
      await db
        .insert(systemChecks)
        .values({ key: stateKey(lessonType), lastOkAt: now })
        .onConflictDoUpdate({ target: systemChecks.key, set: { lastOkAt: now } });
    }
  }

  const due = gaps.filter((gap) => shouldAlert(states.get(stateKey(gap.lessonType)), now));
  if (due.length > 0) {
    const items = due.map(describe);
    const link = `${env.appUrl}/team/verfuegbarkeit`;
    try {
      await sendMail({
        to: alertRecipient(),
        subject:
          items.length === 1
            ? `Online-Buchung: ${items[0].title}`
            : `Online-Buchung: ${due.map((gap) => gap.lessonType.name).join(", ")} nicht buchbar`,
        text: [
          "Bei diesen Angeboten findet die Kundschaft online gerade keinen freien Termin:",
          "",
          ...items.flatMap((item) => [item.title, item.detail, ""]),
          `Verfügbarkeit: ${link}`,
          "",
          "Solange es so bleibt, kommt diese Mail höchstens einmal pro Woche.",
        ].join("\n"),
        html: mailLayout(
          "Online gerade nicht buchbar",
          `<p style="margin:0 0 16px;">Bei diesen Angeboten findet die Kundschaft online gerade keinen freien Termin:</p>
${items
  .map(
    (item) =>
      `<p style="margin:0 0 16px;"><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.detail)}</p>`,
  )
  .join("\n")}
<p style="margin:0 0 16px;"><a href="${escapeHtml(link)}">Verfügbarkeit öffnen</a></p>
<p style="margin:0;color:#515052;font-size:14px;">Solange es so bleibt, kommt diese Mail höchstens einmal pro Woche.</p>`,
        ),
      });
    } catch (error) {
      console.error("Hinweis auf nicht buchbare Angebote konnte nicht verschickt werden:", error);
      return { gaps: gaps.map((gap) => gap.lessonType.slug), alerted: [] };
    }
    for (const gap of due) {
      await db
        .insert(systemChecks)
        .values({ key: stateKey(gap.lessonType), alertedAt: now })
        .onConflictDoUpdate({ target: systemChecks.key, set: { alertedAt: now } });
    }
  }

  return {
    gaps: gaps.map((gap) => gap.lessonType.slug),
    alerted: due.map((gap) => gap.lessonType.slug),
  };
}
