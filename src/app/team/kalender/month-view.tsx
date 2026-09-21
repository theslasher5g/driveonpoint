import Link from "next/link";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { availabilityExceptions, bookings, lessonTypes } from "@/lib/db/schema";
import { monthName, todayInZurich, weekdayName, zurichDay, zurichTime, zurichToInstant, zurichWeekday } from "@/lib/time";
import { monthGridDays, yearMonthOf } from "./dates";

const MAX_CHIPS_PER_DAY = 3;

export async function MonthView({
  yearMonth,
  visibleIds,
  focus,
}: {
  yearMonth: string;
  visibleIds: string[];
  focus?: string;
}) {
  const days = monthGridDays(yearMonth);
  const gridStart = days[0];
  const gridEnd = days[days.length - 1];
  const today = todayInZurich();

  const [entries, absenceRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        customerName: bookings.customerName,
        staffId: bookings.staffId,
        lessonName: lessonTypes.name,
      })
      .from(bookings)
      .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
      .where(
        and(
          inArray(bookings.staffId, visibleIds),
          ne(bookings.status, "abgesagt"),
          gte(bookings.startsAt, zurichToInstant(gridStart, "00:00")),
          lte(bookings.startsAt, zurichToInstant(gridEnd, "23:59")),
        ),
      )
      .orderBy(asc(bookings.startsAt)),
    db
      .select({ day: availabilityExceptions.day, staffId: availabilityExceptions.staffId })
      .from(availabilityExceptions)
      .where(
        and(
          inArray(availabilityExceptions.staffId, visibleIds),
          eq(availabilityExceptions.available, false),
          gte(availabilityExceptions.day, gridStart),
          lte(availabilityExceptions.day, gridEnd),
        ),
      ),
  ]);

  const absentDays = new Set(absenceRows.map((row) => row.day));

  return (
    <div className="border border-deep/15 bg-deep/15" style={{ display: "grid", gap: "1px" }}>
      {/* Wochentagsköpfe, nur einmal statt in jeder Zeile. */}
      <div className="grid grid-cols-7 gap-px bg-deep/15">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="bg-deep text-paper text-center py-2.5">
            <span className="text-fine font-bold hidden sm:inline">{weekdayName(index === 6 ? 0 : index + 1, false)}</span>
            <span className="text-fine font-bold sm:hidden">{weekdayName(index === 6 ? 0 : index + 1, true)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-deep/15">
        {days.map((day) => {
          const inMonth = yearMonthOf(day) === yearMonth;
          const isToday = day === today;
          const dayEntries = entries.filter((entry) => zurichDay(entry.startsAt) === day);
          const shown = dayEntries.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = dayEntries.length - shown.length;
          const isAbsent = absentDays.has(day);
          const dayHref = `/team/kalender?ansicht=woche&woche=${day}${focus ? `&person=${focus}` : ""}`;

          return (
            <div
              key={day}
              className={`min-h-28 sm:min-h-36 p-1.5 sm:p-2.5 flex flex-col ${
                inMonth ? (isToday ? "bg-paper" : "bg-concrete") : "bg-concrete-dim"
              }`}
            >
              <Link
                href={dayHref}
                className={`nums text-fine sm:text-base font-bold self-start px-1.5 -mx-1.5 ${
                  isToday
                    ? "bg-signal text-deep px-2 -mx-0.5"
                    : inMonth
                      ? "text-deep hover:text-signal-ink"
                      : "text-deep/35"
                }`}
              >
                {Number(day.slice(8))}
              </Link>

              {isAbsent && (
                <span className="text-[0.65rem] sm:text-[0.72rem] text-slate mt-1">Abwesend</span>
              )}

              <ul className="mt-1 space-y-1 flex-1">
                {shown.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={dayHref}
                      className="block bg-deep/5 hover:bg-signal-tint border-l-2 border-deep px-1.5 py-1 text-[0.65rem] sm:text-[0.72rem] leading-tight transition-colors"
                    >
                      <span className="nums font-bold">{zurichTime(entry.startsAt)}</span>{" "}
                      <span className="hidden sm:inline">
                        {entry.customerName ?? "Angaben gelöscht"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

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
