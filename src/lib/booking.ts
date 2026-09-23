import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, lt, lte, ne, or, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  lessonTypes,
  pricePackages,
  promotions,
  staff,
  staffLessonTypes,
  type LessonType,
  type PricePackage,
  type Promotion,
} from "./db/schema";
import { subtract, type Interval } from "./intervals";
import {
  addDays,
  fromMinutes,
  minutesSinceMidnight,
  todayInZurich,
  zurichDay,
  zurichToInstant,
  zurichWeekday,
} from "./time";

/** So weit im Voraus lässt sich online buchen — die Buchungsseite zeigt genau
 * diesen Zeitraum, und die Buchung selbst nimmt nichts ausserhalb an. */
export const BOOKING_HORIZON_DAYS = 28;

/** Liegt der Tag im online buchbaren Zeitraum ab heute? */
export function withinBookingHorizon(day: string): boolean {
  const today = todayInZurich();
  return day >= today && day < addDays(today, BOOKING_HORIZON_DAYS);
}

export type Slot = {
  day: string;
  time: string;
  startsAt: Date;
  endsAt: Date;
  /** Wer diesen Termin übernehmen kann. Mehrere bedeutet: freie Wahl. */
  staffIds: string[];
  seatsLeft: number;
};

export async function listLessonTypes(): Promise<LessonType[]> {
  return db
    .select()
    .from(lessonTypes)
    .where(eq(lessonTypes.active, true))
    .orderBy(asc(lessonTypes.sortOrder), asc(lessonTypes.name));
}

export async function lessonTypeBySlug(slug: string): Promise<LessonType | null> {
  const [row] = await db.select().from(lessonTypes).where(eq(lessonTypes.slug, slug)).limit(1);
  return row ?? null;
}

export async function listPackages(): Promise<PricePackage[]> {
  return db
    .select()
    .from(pricePackages)
    .where(eq(pricePackages.active, true))
    .orderBy(asc(pricePackages.sortOrder), asc(pricePackages.priceRappen));
}

export async function activePromotions(): Promise<Promotion[]> {
  const today = todayInZurich();
  return db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.active, true),
        lte(promotions.startsOn, today),
        gte(promotions.endsOn, today),
      ),
    )
    .orderBy(asc(promotions.endsOn));
}

export type PricedLesson = {
  lessonType: LessonType;
  finalRappen: number;
  promotion: Promotion | null;
};

/** Wendet die beste passende Aktion an. Nie unter null. */
export function applyPromotions(
  lessonType: LessonType,
  available: Promotion[],
): PricedLesson {
  const relevant = available.filter(
    (p) => p.lessonTypeId === null || p.lessonTypeId === lessonType.id,
  );

  let best: Promotion | null = null;
  let bestPrice = lessonType.priceRappen;

  for (const promotion of relevant) {
    const reduced =
      promotion.percentOff != null
        ? Math.round(lessonType.priceRappen * (1 - promotion.percentOff / 100))
        : lessonType.priceRappen - (promotion.amountOffRappen ?? 0);

    const clamped = Math.max(0, reduced);
    if (clamped < bestPrice) {
      bestPrice = clamped;
      best = promotion;
    }
  }

  return { lessonType, finalRappen: bestPrice, promotion: best };
}

type StaffDayPlan = Map<string, Interval[]>;

/**
 * Freie Termine für eine Lektionsart.
 *
 * Verfügbarkeit entsteht aus dem Wochenraster der Mitarbeitenden, ergänzt um
 * einzelne Zusatzblöcke und abzüglich Abwesenheiten und bereits vergebener
 * Termine. Die Vorlaufzeit der Lektionsart schneidet zu kurzfristige Termine weg.
 */
export async function findSlots(options: {
  lessonType: LessonType;
  fromDay?: string;
  days?: number;
  staffId?: string;
  /** Beim Verschieben: der eigene, bereits belegte Termin zählt nicht als Sperre. */
  excludeBookingId?: string;
}): Promise<Slot[]> {
  const { lessonType } = options;
  const fromDay = options.fromDay ?? todayInZurich();
  const days = Math.min(options.days ?? 21, 120);
  const untilDay = addDays(fromDay, days);

  const eligible = await db
    .select({ id: staff.id })
    .from(staff)
    .innerJoin(staffLessonTypes, eq(staffLessonTypes.staffId, staff.id))
    .where(
      and(
        eq(staff.active, true),
        eq(staffLessonTypes.lessonTypeId, lessonType.id),
        options.staffId ? eq(staff.id, options.staffId) : undefined,
      ),
    );

  const staffIds = eligible.map((row) => row.id);
  if (staffIds.length === 0) return [];

  const [rules, exceptions, taken] = await Promise.all([
    db
      .select()
      .from(availabilityRules)
      .where(
        and(
          inArray(availabilityRules.staffId, staffIds),
          eq(availabilityRules.lessonTypeId, lessonType.id),
          or(isNull(availabilityRules.validFrom), lte(availabilityRules.validFrom, untilDay)),
          or(isNull(availabilityRules.validUntil), gte(availabilityRules.validUntil, fromDay)),
        ),
      ),
    db
      .select()
      .from(availabilityExceptions)
      .where(
        and(
          inArray(availabilityExceptions.staffId, staffIds),
          or(
            isNull(availabilityExceptions.lessonTypeId),
            eq(availabilityExceptions.lessonTypeId, lessonType.id),
          ),
          gte(availabilityExceptions.day, fromDay),
          lte(availabilityExceptions.day, untilDay),
        ),
      ),
    db
      .select({
        staffId: bookings.staffId,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        lessonTypeId: bookings.lessonTypeId,
        // Die Pause gehört zum bereits gebuchten Termin, nicht zum gesuchten:
        // nach einer Fahrstunde braucht es die Fahrzeit zum Kursraum auch
        // dann, wenn das gesuchte Angebot selbst ohne Pause auskommt.
        bufferMinutes: lessonTypes.bufferMinutes,
      })
      .from(bookings)
      .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
      .where(
        and(
          inArray(bookings.staffId, staffIds),
          ne(bookings.status, "abgesagt"),
          gte(bookings.startsAt, zurichToInstant(fromDay, "00:00")),
          lte(bookings.startsAt, zurichToInstant(untilDay, "23:59")),
          options.excludeBookingId ? ne(bookings.id, options.excludeBookingId) : undefined,
        ),
      ),
  ]);

  const isGroupCourse = lessonType.capacity > 1;
  const earliest = new Date(Date.now() + lessonType.leadTimeHours * 60 * 60 * 1000);
  const result: Slot[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const day = addDays(fromDay, offset);
    const weekday = zurichWeekday(day);
    const plan: StaffDayPlan = new Map();

    for (const id of staffIds) plan.set(id, []);

    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      if (rule.validFrom && day < rule.validFrom) continue;
      if (rule.validUntil && day > rule.validUntil) continue;
      plan.get(rule.staffId)?.push({
        start: minutesSinceMidnight(rule.startTime),
        end: minutesSinceMidnight(rule.endTime),
      });
    }

    for (const exception of exceptions) {
      if (exception.day !== day || !exception.available) continue;
      plan.get(exception.staffId)?.push({
        start: minutesSinceMidnight(exception.startTime),
        end: minutesSinceMidnight(exception.endTime),
      });
    }

    for (const [id, blocks] of plan) {
      if (blocks.length === 0) continue;

      const cuts: Interval[] = [];

      for (const exception of exceptions) {
        if (exception.day !== day || exception.staffId !== id || exception.available) continue;
        cuts.push({
          start: minutesSinceMidnight(exception.startTime),
          end: minutesSinceMidnight(exception.endTime),
        });
      }

      // Bei Gruppenkursen zählen die Anmeldungen zum selben Kurs als belegte
      // Plätze, nicht als Sperre — mehrere Personen teilen sich denselben
      // Termin. Ein Termin eines anderen Angebots blockiert die Person aber
      // sehr wohl, sonst stünde sie zur selben Zeit im Kursraum und im Auto.
      cuts.push(
        ...bookingCutsFor(
          id,
          day,
          taken,
          lessonType.bufferMinutes,
          isGroupCourse ? lessonType.id : undefined,
        ),
      );

      const free = subtract(blocks, cuts);

      for (const window of free) {
        const step = lessonType.durationMinutes + lessonType.bufferMinutes;

        if (isGroupCourse) {
          if (window.end - window.start < lessonType.durationMinutes) continue;
          pushSlot(result, day, window.start, lessonType, [id], taken, earliest);
          continue;
        }

        for (
          let start = window.start;
          start + lessonType.durationMinutes <= window.end;
          start += step
        ) {
          pushSlot(result, day, start, lessonType, [id], taken, earliest);
        }
      }
    }
  }

  return mergeByStart(result);
}

/**
 * Belegte Zeiten einer Person an einem Tag, inklusive Pause davor und danach.
 *
 * `sharedLessonTypeId` nimmt die Anmeldungen zu genau diesem Angebot aus:
 * bei einem Gruppenkurs sind das die Mitfahrenden desselben Kurses, die
 * keinen zweiten Block belegen. Ihre Kapazität wird in `pushSlot` gezählt.
 */
function bookingCutsFor(
  staffId: string,
  day: string,
  taken: {
    staffId: string | null;
    startsAt: Date;
    endsAt: Date;
    lessonTypeId: string | null;
    bufferMinutes: number | null;
  }[],
  bufferMinutes: number,
  sharedLessonTypeId?: string,
): Interval[] {
  const cuts: Interval[] = [];
  for (const booking of taken) {
    if (booking.staffId !== staffId) continue;
    if (zurichDay(booking.startsAt) !== day) continue;
    if (sharedLessonTypeId && booking.lessonTypeId === sharedLessonTypeId) continue;

    // Die grössere der beiden Pausen gewinnt: die des bestehenden Termins
    // und die des gesuchten Angebots.
    const pause = Math.max(bufferMinutes, booking.bufferMinutes ?? 0);
    const start = minutesSinceMidnight(localTime(booking.startsAt));
    const end = minutesSinceMidnight(localTime(booking.endsAt));
    cuts.push({ start: start - pause, end: end + pause });
  }
  return cuts;
}

function localTime(instant: Date): string {
  const formatted = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
  return formatted.replace(/^24:/, "00:");
}

function pushSlot(
  into: Slot[],
  day: string,
  startMinutes: number,
  lessonType: LessonType,
  staffIds: string[],
  taken: {
    staffId: string | null;
    startsAt: Date;
    endsAt: Date;
    lessonTypeId: string | null;
  }[],
  earliest: Date,
): void {
  const time = fromMinutes(startMinutes);
  const startsAt = zurichToInstant(day, time);
  if (startsAt < earliest) return;

  const endsAt = new Date(startsAt.getTime() + lessonType.durationMinutes * 60_000);

  const sameOffering = taken.filter(
    (b) => b.lessonTypeId === lessonType.id && staffIds.includes(b.staffId ?? ""),
  );

  // Ein Kurs desselben Angebots zu einer anderen Zeit ist kein belegter Platz,
  // sondern ein überschneidender Termin — etwa ein zweiter VKU am selben Abend.
  const collides = sameOffering.some(
    (b) => b.startsAt.getTime() !== startsAt.getTime() && b.startsAt < endsAt && b.endsAt > startsAt,
  );
  if (collides) return;

  const alreadyBooked = sameOffering.filter(
    (b) => b.startsAt.getTime() === startsAt.getTime(),
  ).length;

  const seatsLeft = lessonType.capacity - alreadyBooked;
  if (seatsLeft <= 0) return;

  into.push({ day, time, startsAt, endsAt, staffIds, seatsLeft });
}

/** Gleiche Startzeit bei mehreren Personen zu einem Eintrag zusammenfassen. */
function mergeByStart(slots: Slot[]): Slot[] {
  const byKey = new Map<string, Slot>();

  for (const slot of slots) {
    const key = `${slot.day}T${slot.time}`;
    const existing = byKey.get(key);
    if (existing) {
      for (const id of slot.staffIds) {
        if (!existing.staffIds.includes(id)) existing.staffIds.push(id);
      }
      existing.seatsLeft += slot.seatsLeft;
    } else {
      byKey.set(key, { ...slot, staffIds: [...slot.staffIds] });
    }
  }

  return [...byKey.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Für den Aufmacher der Startseite: der nächste freie Termin überhaupt. */
export async function nextFreeSlot(): Promise<{ slot: Slot; lessonType: LessonType } | null> {
  const types = await listLessonTypes();
  let best: { slot: Slot; lessonType: LessonType } | null = null;

  for (const lessonType of types) {
    const slots = await findSlots({ lessonType, days: 21 });
    const first = slots[0];
    if (!first) continue;
    if (!best || first.startsAt < best.slot.startsAt) {
      best = { slot: first, lessonType };
    }
  }

  return best;
}

export function newReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(4);
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `DOP-${code}`;
}

export function newCancelToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Legt den Termin an. Die Prüfung auf Doppelbuchung passiert in derselben
 * Transaktion wie das Einfügen — sonst könnten zwei gleichzeitige Anfragen
 * beide den letzten freien Platz bekommen.
 */
export async function createBooking(input: {
  lessonType: LessonType;
  staffId: string;
  startsAt: Date;
  customerName: string;
  /** Leer bedeutet: keine Mailadresse bekannt, etwa bei einer telefonischen Buchung. */
  customerEmail: string;
  customerPhone: string;
  customerNote?: string;
  priceRappen: number;
  promotionLabel?: string | null;
  retentionDays: number;
}): Promise<{ reference: string; cancelToken: string } | { error: string }> {
  const endsAt = new Date(input.startsAt.getTime() + input.lessonType.durationMinutes * 60_000);
  const reference = newReference();
  const cancelToken = newCancelToken();
  const purgeAfter = new Date(
    Math.max(endsAt.getTime(), Date.now()) + input.retentionDays * 24 * 60 * 60 * 1000,
  );

  try {
    const created = await db.transaction(async (tx) => {
      // Sperrt die Zeile dieser Person, damit parallele Anfragen
      // nacheinander prüfen statt gleichzeitig.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.staffId}))`);

      const clash = await tx
        .select({
          id: bookings.id,
          startsAt: bookings.startsAt,
          lessonTypeId: bookings.lessonTypeId,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.staffId, input.staffId),
            ne(bookings.status, "abgesagt"),
            // Echte Überschneidung: ein Termin, der genau dann endet, wenn
            // dieser beginnt, ist keine — sonst liessen sich zwei Kurse nicht
            // hintereinander legen.
            lt(bookings.startsAt, endsAt),
            gt(bookings.endsAt, input.startsAt),
          ),
        );

      if (input.lessonType.capacity <= 1) {
        if (clash.length > 0) return null;
      } else {
        // Als Mitanmeldung zählt nur, wer denselben Kurs zur selben Zeit
        // besucht. Ein Termin eines anderen Angebots ist eine Überschneidung,
        // auch wenn er zufällig zur selben Minute beginnt.
        const sameCourse = clash.filter(
          (row) =>
            row.lessonTypeId === input.lessonType.id &&
            row.startsAt.getTime() === input.startsAt.getTime(),
        );
        if (clash.length > sameCourse.length) return null;
        if (sameCourse.length >= input.lessonType.capacity) return null;
      }

      await tx.insert(bookings).values({
        reference,
        cancelToken,
        staffId: input.staffId,
        lessonTypeId: input.lessonType.id,
        startsAt: input.startsAt,
        endsAt,
        status: "angefragt",
        customerName: input.customerName,
        customerEmail: input.customerEmail || null,
        customerPhone: input.customerPhone,
        customerNote: input.customerNote ?? null,
        priceRappen: input.priceRappen,
        appliedPromotionLabel: input.promotionLabel ?? null,
        purgeAfter,
      });

      return { reference, cancelToken };
    });

    if (!created) {
      return { error: "Dieser Termin wurde eben vergeben. Bitte wähle einen anderen." };
    }
    return created;
  } catch {
    return { error: "Der Termin konnte nicht gespeichert werden. Bitte versuche es erneut." };
  }
}
