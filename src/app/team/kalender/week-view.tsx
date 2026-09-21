import Link from "next/link";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { availabilityExceptions, availabilityRules, bookings, lessonTypes, staff } from "@/lib/db/schema";
import {
  addDays,
  minutesSinceMidnight,
  todayInZurich,
  weekdayName,
  zurichDay,
  zurichTime,
  zurichToInstant,
  zurichWeekday,
} from "@/lib/time";
import { CancelBookingButton } from "@/components/cancel-booking-button";

export async function WeekView({
  start,
  visibleIds,
  focus,
  seesEveryone,
  manages,
}: {
  start: string;
  visibleIds: string[];
  focus?: string;
  seesEveryone: boolean;
  manages: boolean;
}) {
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const today = todayInZurich();

  const [entries, rules, exceptions] = await Promise.all([
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        status: bookings.status,
        customerName: bookings.customerName,
        customerPhone: bookings.customerPhone,
        customerNote: bookings.customerNote,
        staffId: bookings.staffId,
        staffName: staff.name,
        lessonName: lessonTypes.name,
      })
      .from(bookings)
      .leftJoin(staff, eq(staff.id, bookings.staffId))
      .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
      .where(
        and(
          inArray(bookings.staffId, visibleIds),
          gte(bookings.startsAt, zurichToInstant(start, "00:00")),
          lte(bookings.startsAt, zurichToInstant(end, "23:59")),
        ),
      ),
    db
      .select({
        staffId: availabilityRules.staffId,
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
        validFrom: availabilityRules.validFrom,
        validUntil: availabilityRules.validUntil,
        lessonName: lessonTypes.name,
      })
      .from(availabilityRules)
      .innerJoin(lessonTypes, eq(lessonTypes.id, availabilityRules.lessonTypeId))
      .where(inArray(availabilityRules.staffId, visibleIds)),
    db
      .select({
        id: availabilityExceptions.id,
        staffId: availabilityExceptions.staffId,
        day: availabilityExceptions.day,
        startTime: availabilityExceptions.startTime,
        endTime: availabilityExceptions.endTime,
        available: availabilityExceptions.available,
        note: availabilityExceptions.note,
        lessonName: lessonTypes.name,
      })
      .from(availabilityExceptions)
      .leftJoin(lessonTypes, eq(lessonTypes.id, availabilityExceptions.lessonTypeId))
      .where(
        and(
          inArray(availabilityExceptions.staffId, visibleIds),
          gte(availabilityExceptions.day, start),
          lte(availabilityExceptions.day, end),
        ),
      ),
  ]);

  return (
    <div className="grid gap-px bg-deep/15 border border-deep/15 md:grid-cols-7">
      {days.map((day) => {
        const weekday = zurichWeekday(day);
        const isToday = day === today;

        const dayEntries = entries
          .filter((entry) => zurichDay(entry.startsAt) === day)
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

        const openBlocks = [
          ...rules
            .filter((rule) => {
              if (rule.weekday !== weekday) return false;
              if (rule.validFrom && day < rule.validFrom) return false;
              if (rule.validUntil && day > rule.validUntil) return false;
              return true;
            })
            .map((rule) => ({
              from: rule.startTime.slice(0, 5),
              to: rule.endTime.slice(0, 5),
              lessonName: rule.lessonName,
            })),
          ...exceptions
            .filter((entry) => entry.day === day && entry.available)
            .map((entry) => ({
              from: entry.startTime.slice(0, 5),
              to: entry.endTime.slice(0, 5),
              lessonName: entry.lessonName ?? "alle Angebote",
            })),
        ].sort((a, b) => minutesSinceMidnight(a.from) - minutesSinceMidnight(b.from));

        const absences = exceptions.filter((entry) => entry.day === day && !entry.available);

        return (
          // Feste Mindesthöhe nur im Wochenraster. Untereinander gestapelt
          // würden sieben leere Kästen das Telefon vollständig füllen.
          <div key={day} className={`p-3.5 md:min-h-52 ${isToday ? "bg-paper" : "bg-concrete"}`}>
            <h2 className={`text-base font-bold ${isToday ? "text-signal-ink" : ""}`}>
              {weekdayName(weekday, true)}
              <span className="nums font-normal text-slate">
                {" "}
                {Number(day.slice(8))}.{Number(day.slice(5, 7))}.
              </span>
            </h2>

            {openBlocks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {openBlocks.map((block, index) => (
                  <li key={index} className="nums text-fine text-slate">
                    {block.from}–{block.to} <span className="text-deep/70">{block.lessonName}</span>
                  </li>
                ))}
              </ul>
            )}

            {absences.map((absence) => (
              <p key={absence.id} className="nums text-fine bg-concrete-dim px-2 py-1.5 mt-2">
                Abwesend {absence.startTime.slice(0, 5)}–{absence.endTime.slice(0, 5)}
                {absence.note ? ` · ${absence.note}` : ""}
              </p>
            ))}

            <ul className="mt-3 space-y-2">
              {dayEntries.map((entry) => {
                const cancelled = entry.status === "abgesagt";
                return (
                  <li
                    key={entry.id}
                    className={`px-2.5 py-2 border-l-[3px] ${
                      cancelled
                        ? "bg-concrete-dim border-slate text-slate line-through"
                        : "bg-deep/5 border-deep"
                    }`}
                  >
                    <p className="nums text-fine font-bold">
                      {zurichTime(entry.startsAt)}–{zurichTime(entry.endsAt)}
                    </p>
                    <p className="text-[0.85rem] leading-snug">
                      {entry.customerName ?? "Angaben gelöscht"}
                    </p>
                    <p className="text-fine text-slate leading-snug">
                      {entry.lessonName}
                      {seesEveryone && !focus && entry.staffName ? ` · ${entry.staffName}` : ""}
                    </p>
                    {entry.customerPhone && (
                      <a
                        href={`tel:${entry.customerPhone}`}
                        className="nums text-fine text-signal-ink font-semibold block mt-0.5"
                      >
                        {entry.customerPhone}
                      </a>
                    )}
                    {entry.customerNote && (
                      <p className="text-fine text-slate mt-1">{entry.customerNote}</p>
                    )}
                    {manages && !cancelled && (
                      <div className="flex flex-wrap gap-3 items-center mt-1.5">
                        <Link
                          href={`/team/kalender/verschieben?id=${entry.id}`}
                          className="text-fine font-semibold text-slate hover:text-signal-ink underline underline-offset-2"
                        >
                          Verschieben
                        </Link>
                        <CancelBookingButton bookingId={entry.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
