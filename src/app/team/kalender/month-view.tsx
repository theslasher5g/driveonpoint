import Link from "next/link";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { isConfirmed } from "@/lib/booking";
import { customerHistories, describeHistory } from "@/lib/customer-history";
import { env } from "@/lib/env";
import { reviewAskable } from "@/lib/reviews";
import { db } from "@/lib/db";
import { availabilityExceptions, bookings, lessonTypes, staff } from "@/lib/db/schema";
import { monthName, todayInZurich, weekdayName, zurichDay, zurichTime, zurichToInstant, zurichWeekday } from "@/lib/time";
import { DayEntries, type DayAbsence, type DayBooking } from "./day-entries";
import { monthGridDays, yearMonthOf } from "./dates";

const MAX_CHIPS_PER_DAY = 4;

export async function MonthView({
  yearMonth,
  visibleIds,
  focus,
  seesEveryone,
  manages,
  userId,
  mayEditAvailability,
}: {
  yearMonth: string;
  visibleIds: string[];
  focus?: string;
  seesEveryone: boolean;
  manages: boolean;
  userId: string;
  mayEditAvailability: boolean;
}) {
  const days = monthGridDays(yearMonth);
  const gridStart = days[0];
  const gridEnd = days[days.length - 1];
  const today = todayInZurich();
  const now = Date.now();

  const [entries, absenceRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        customerName: bookings.customerName,
        customerEmail: bookings.customerEmail,
        customerPhone: bookings.customerPhone,
        customerNote: bookings.customerNote,
        staffId: bookings.staffId,
        staffName: staff.name,
        lessonName: lessonTypes.name,
        lessonCapacity: lessonTypes.capacity,
        noShowAt: bookings.noShowAt,
        status: bookings.status,
        reviewConsent: bookings.reviewConsent,
        reviewRequestedAt: bookings.reviewRequestedAt,
      })
      .from(bookings)
      .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
      .leftJoin(staff, eq(staff.id, bookings.staffId))
      .where(
        and(
          inArray(bookings.staffId, visibleIds),
          isConfirmed(),
          gte(bookings.startsAt, zurichToInstant(gridStart, "00:00")),
          lte(bookings.startsAt, zurichToInstant(gridEnd, "23:59")),
        ),
      )
      .orderBy(asc(bookings.startsAt)),
    db
      .select({
        id: availabilityExceptions.id,
        day: availabilityExceptions.day,
        staffId: availabilityExceptions.staffId,
        startTime: availabilityExceptions.startTime,
        endTime: availabilityExceptions.endTime,
        note: availabilityExceptions.note,
        staffName: staff.name,
        lessonName: lessonTypes.name,
      })
      .from(availabilityExceptions)
      .leftJoin(staff, eq(staff.id, availabilityExceptions.staffId))
      .leftJoin(lessonTypes, eq(lessonTypes.id, availabilityExceptions.lessonTypeId))
      .where(
        and(
          inArray(availabilityExceptions.staffId, visibleIds),
          eq(availabilityExceptions.available, false),
          // Ein ausgefallener Kurstermin ist keine Abwesenheit der Person.
          eq(availabilityExceptions.cancelledSession, false),
          gte(availabilityExceptions.day, gridStart),
          lte(availabilityExceptions.day, gridEnd),
        ),
      )
      .orderBy(asc(availabilityExceptions.startTime)),
  ]);

  const histories = await customerHistories(entries);

  return (
    <div className="rounded-[var(--radius-surface)] border border-deep/12 bg-deep/12 overflow-hidden" style={{ display: "grid", gap: "1px" }}>
      {/* Wochentagsköpfe, nur einmal statt in jeder Zeile. */}
      <div className="grid grid-cols-7 gap-px bg-deep/12">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="bg-deep text-paper text-center py-2.5">
            <span className="text-fine font-bold hidden sm:inline">{weekdayName(index === 6 ? 0 : index + 1, false)}</span>
            <span className="text-fine font-bold sm:hidden">{weekdayName(index === 6 ? 0 : index + 1, true)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-deep/12">
        {days.map((day) => {
          const inMonth = yearMonthOf(day) === yearMonth;
          const isToday = day === today;
          const dayEntries = entries.filter((entry) => zurichDay(entry.startsAt) === day);
          const shown = dayEntries.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = dayEntries.length - shown.length;
          const dayHref = `/team/kalender?ansicht=woche&woche=${day}${focus ? `&person=${focus}` : ""}`;

          const shownEntries: DayBooking[] = shown.map((entry) => ({
            id: entry.id,
            timeLabel: `${zurichTime(entry.startsAt)}–${zurichTime(entry.endsAt)}`,
            customerName: entry.customerName ?? "Angaben gelöscht",
            customerPhone: entry.customerPhone,
            customerNote: entry.customerNote,
            lessonName: entry.lessonName,
            staffName: seesEveryone && !focus ? entry.staffName : null,
            history: describeHistory(histories.get(entry.id), {
              course: (entry.lessonCapacity ?? 1) > 1,
            }),
            cancellableCourse: (entry.lessonCapacity ?? 1) > 1 && entry.startsAt.getTime() > now,
            review: {
              single: reviewAskable(entry) && (manages || entry.staffId === userId),
              course:
                !!env.googleReviewUrl &&
                manages &&
                (entry.lessonCapacity ?? 1) > 1 &&
                entry.startsAt.getTime() <= now,
            },
            // Begonnene Termine: Leitung für alle, Fahrlehrperson für die eigenen.
            noShow:
              entry.startsAt.getTime() <= now && (manages || entry.staffId === userId)
                ? entry.noShowAt
                  ? "markiert"
                  : "offen"
                : null,
          }));

          const dayAbsences: DayAbsence[] = absenceRows
            .filter((row) => row.day === day)
            .map((row) => ({
              id: row.id,
              staffId: row.staffId,
              timeLabel: `${row.startTime.slice(0, 5)}–${row.endTime.slice(0, 5)}`,
              note: row.note,
              lessonName: row.lessonName,
              staffName: seesEveryone && !focus ? row.staffName : null,
            }));

          return (
            <div
              key={day}
              className={`min-h-28 sm:min-h-36 p-1.5 sm:p-2.5 flex flex-col rounded-[10px] ${
                isToday ? "bg-paper ring-1 ring-inset ring-signal/40" : inMonth ? "bg-concrete" : "bg-concrete-dim"
              }`}
            >
              <Link
                href={dayHref}
                className={`nums text-fine sm:text-base font-bold self-start grid place-items-center w-6 h-6 sm:w-7 sm:h-7 rounded-full ${
                  isToday
                    ? "bg-signal text-deep"
                    : inMonth
                      ? "text-deep hover:bg-deep/8"
                      : "text-deep/35"
                }`}
              >
                {Number(day.slice(8))}
              </Link>

              <DayEntries
                bookings={shownEntries}
                absences={dayAbsences}
                manages={manages}
                mayEditAvailability={mayEditAvailability}
              />

              {overflow > 0 && (
                <Link
                  href={dayHref}
                  className="text-[0.65rem] sm:text-[0.72rem] font-semibold text-signal-ink mt-1 self-start"
                >
                  +{overflow} mehr
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return `${monthName(month)} ${year}`;
}
