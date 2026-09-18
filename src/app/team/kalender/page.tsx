import Link from "next/link";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  lessonTypes,
  staff,
} from "@/lib/db/schema";
import {
  addDays,
  formatDayShort,
  minutesSinceMidnight,
  todayInZurich,
  weekdayName,
  zurichDay,
  zurichTime,
  zurichToInstant,
  zurichWeekday,
} from "@/lib/time";
import { CancelBookingButton } from "@/components/cancel-booking-button";

export const dynamic = "force-dynamic";

/** Montag der Woche, in der `day` liegt. */
function mondayOf(day: string): string {
  const weekday = zurichWeekday(day);
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ woche?: string; person?: string; erfasst?: string; verschoben?: string }>;
}) {
  const user = await requirePermission("kalender.ansehen");
  const params = await searchParams;

  const seesEveryone = can(user.role, "verfuegbarkeit.alle");
  const manages = can(user.role, "kalender.verwalten");

  const start = mondayOf(
    /^\d{4}-\d{2}-\d{2}$/.test(params.woche ?? "") ? params.woche! : todayInZurich(),
  );
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  const team = seesEveryone
    ? await db
        .select({ id: staff.id, name: staff.name })
        .from(staff)
        .where(eq(staff.active, true))
        .orderBy(asc(staff.name))
    : [{ id: user.id, name: user.name }];

  // Wer nur den eigenen Kalender sehen darf, kann die Auswahl nicht
  // umgehen: die Liste der erlaubten Personen wird serverseitig gesetzt.
  const allowedIds = team.map((person) => person.id);
  const focus =
    params.person && allowedIds.includes(params.person) ? params.person : undefined;
  const visibleIds = focus ? [focus] : allowedIds;

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
      )
      .orderBy(asc(bookings.startsAt)),
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
    <section className="shell py-10 md:py-14">
      <div className="lane">
        {params.erfasst && (
          <p role="status" className="notice notice-success mb-6">
            Termin {params.erfasst} eingetragen.
          </p>
        )}
        {params.verschoben && (
          <p role="status" className="notice notice-success mb-6">
            Termin {params.verschoben} verschoben.
          </p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-title">Kalender</h1>
            <p className="nums text-slate mt-2">
              Woche vom {formatDayShort(start)} bis {formatDayShort(end)}
            </p>
          </div>

          <nav className="flex flex-wrap gap-2" aria-label="Woche wechseln">
            <Link
              href={`/team/kalender?woche=${addDays(start, -7)}${focus ? `&person=${focus}` : ""}`}
              className="btn btn-outline py-2 px-3.5"
            >
              Vorherige
            </Link>
            <Link
              href={`/team/kalender${focus ? `?person=${focus}` : ""}`}
              className="btn btn-outline py-2 px-3.5"
            >
              Diese Woche
            </Link>
            <Link
              href={`/team/kalender?woche=${addDays(start, 7)}${focus ? `&person=${focus}` : ""}`}
              className="btn btn-outline py-2 px-3.5"
            >
              Nächste
            </Link>
            {manages && (
              <Link href="/team/kalender/erfassen" className="btn btn-primary py-2 px-3.5">
                + Termin erfassen
              </Link>
            )}
          </nav>
        </div>

        {seesEveryone && team.length > 1 && (
          <ul className="flex flex-wrap gap-2 mt-6" aria-label="Person filtern">
            <li>
              <Link
                href={`/team/kalender?woche=${start}`}
                className={`block px-3.5 py-2 text-fine font-semibold border ${
                  focus ? "border-deep/20 bg-paper" : "border-signal bg-signal text-deep"
                }`}
              >
                Alle
              </Link>
            </li>
            {team.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/team/kalender?woche=${start}&person=${person.id}`}
                  className={`block px-3.5 py-2 text-fine font-semibold border ${
                    focus === person.id
                      ? "border-signal bg-signal text-deep"
                      : "border-deep/20 bg-paper"
                  }`}
                >
                  {person.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 grid gap-px bg-deep/15 border border-deep/15 md:grid-cols-7">
          {days.map((day) => {
            const weekday = zurichWeekday(day);
            const isToday = day === todayInZurich();

            const dayEntries = entries.filter((entry) => zurichDay(entry.startsAt) === day);

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
              <div
                key={day}
                className={`p-3 md:min-h-40 ${isToday ? "bg-paper" : "bg-concrete"}`}
              >
                <h2 className={`text-fine font-bold ${isToday ? "text-signal-ink" : ""}`}>
                  {weekdayName(weekday, true)}
                  <span className="nums font-normal text-slate">
                    {" "}
                    {Number(day.slice(8))}.{Number(day.slice(5, 7))}.
                  </span>
                </h2>

                {openBlocks.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {openBlocks.map((block, index) => (
                      <li key={index} className="nums text-[0.72rem] text-slate">
                        {block.from}–{block.to} <span className="text-deep/70">{block.lessonName}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {absences.map((absence) => (
                  <p
                    key={absence.id}
                    className="nums text-[0.72rem] bg-concrete-dim px-1.5 py-1 mt-1.5"
                  >
                    Abwesend {absence.startTime.slice(0, 5)}–{absence.endTime.slice(0, 5)}
                    {absence.note ? ` · ${absence.note}` : ""}
                  </p>
                ))}

                <ul className="mt-2 space-y-1.5">
                  {dayEntries.map((entry) => {
                    const cancelled = entry.status === "abgesagt";
                    return (
                      <li
                        key={entry.id}
                        className={`px-2 py-1.5 border-l-[3px] ${
                          cancelled
                            ? "bg-concrete-dim border-slate text-slate line-through"
                            : "bg-deep/5 border-deep"
                        }`}
                      >
                        <p className="nums text-fine font-bold">
                          {zurichTime(entry.startsAt)}–{zurichTime(entry.endsAt)}
                        </p>
                        <p className="text-[0.8rem] leading-snug">
                          {entry.customerName ?? "Angaben gelöscht"}
                        </p>
                        <p className="text-[0.72rem] text-slate leading-snug">
                          {entry.lessonName}
                          {seesEveryone && !focus && entry.staffName ? ` · ${entry.staffName}` : ""}
                        </p>
                        {entry.customerPhone && (
                          <a
                            href={`tel:${entry.customerPhone}`}
                            className="nums text-[0.72rem] text-signal-ink font-semibold block mt-0.5"
                          >
                            {entry.customerPhone}
                          </a>
                        )}
                        {entry.customerNote && (
                          <p className="text-[0.72rem] text-slate mt-1">{entry.customerNote}</p>
                        )}
                        {manages && !cancelled && (
                          <div className="flex flex-wrap gap-3 items-center">
                            <Link
                              href={`/team/kalender/verschieben?id=${entry.id}`}
                              className="text-[0.72rem] font-semibold text-slate hover:text-signal-ink underline underline-offset-2 mt-1.5"
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

      </div>
    </section>
  );
}
