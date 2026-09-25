import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { occupiesTime } from "@/lib/booking";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  lessonTypes,
  staff,
  staffLessonTypes,
} from "@/lib/db/schema";
import { formatDayLong, formatDayShort, todayInZurich, zurichToInstant } from "@/lib/time";
import { AvailabilityExceptionForm, OfferingDateForm } from "@/components/availability-forms";
import { describeRule, describeRuleRange, nextOccurrences } from "@/lib/availability-rules";
import { DeleteRuleButton, DeleteExceptionButton } from "@/components/availability-delete";

export const dynamic = "force-dynamic";

const FREQUENCY_ORDER = { taeglich: 0, woechentlich: 1, monatlich: 2 } as const;

/** So viele nächste Termine je Serie bzw. einzelne Daten sind sofort sichtbar. */
const DATES_SHOWN = 4;

/**
 * Ein einzelnes Datum. Ein Kurstermin mit Anmeldungen lässt sich hier nicht
 * entfernen, nur im Kalender absagen — mit Mail an alle Angemeldeten.
 */
function DateRow({
  id,
  person,
  day,
  startTime,
  endTime,
  signups,
}: {
  id: string;
  person: string;
  day: string;
  startTime: string;
  endTime: string;
  signups: number;
}) {
  return (
    <li className="border-b border-deep/10 last:border-0 px-4 py-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="font-semibold hyphens-none">{formatDayLong(day)}</span>
      <span className="nums text-slate whitespace-nowrap">
        {startTime.slice(0, 5)} – {endTime.slice(0, 5)}
      </span>
      {signups > 0 ? (
        <>
          <span className="text-fine text-slate">{signups} angemeldet</span>
          <Link
            href={`/team/kalender?ansicht=woche&woche=${day}`}
            className="text-fine font-semibold text-slate underline underline-offset-2 hover:text-deep"
          >
            Im Kalender absagen
          </Link>
        </>
      ) : (
        <DeleteExceptionButton id={id} person={person} />
      )}
    </li>
  );
}

export default async function VerfuegbarkeitPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; kursBelegt?: string; tag?: string }>;
}) {
  const user = await requirePermission("verfuegbarkeit.eigene");
  const params = await searchParams;

  const managesOthers = can(user.role, "verfuegbarkeit.alle");

  const team = managesOthers
    ? await db
        .select({ id: staff.id, name: staff.name })
        .from(staff)
        .where(eq(staff.active, true))
        .orderBy(asc(staff.name))
    : [{ id: user.id, name: user.name }];

  const allowed = team.map((person) => person.id);
  const targetId = params.person && allowed.includes(params.person) ? params.person : user.id;
  const target = team.find((person) => person.id === targetId) ?? { id: user.id, name: user.name };

  const today = todayInZurich();

  const [offerings, rules, exceptions] = await Promise.all([
    db
      .select({
        id: lessonTypes.id,
        slug: lessonTypes.slug,
        name: lessonTypes.name,
        durationMinutes: lessonTypes.durationMinutes,
        capacity: lessonTypes.capacity,
      })
      .from(staffLessonTypes)
      .innerJoin(lessonTypes, eq(lessonTypes.id, staffLessonTypes.lessonTypeId))
      .where(and(eq(staffLessonTypes.staffId, targetId), eq(lessonTypes.active, true)))
      .orderBy(asc(lessonTypes.sortOrder), asc(lessonTypes.name)),
    db
      .select({
        id: availabilityRules.id,
        lessonTypeId: availabilityRules.lessonTypeId,
        frequency: availabilityRules.frequency,
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
        validFrom: availabilityRules.validFrom,
        validUntil: availabilityRules.validUntil,
      })
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.staffId, targetId),
          // Abgelaufene Regeln bieten nichts mehr an und würden nur stören.
          or(isNull(availabilityRules.validUntil), gte(availabilityRules.validUntil, today)),
        ),
      )
      .orderBy(asc(availabilityRules.startTime)),
    db
      .select({
        id: availabilityExceptions.id,
        lessonTypeId: availabilityExceptions.lessonTypeId,
        day: availabilityExceptions.day,
        startTime: availabilityExceptions.startTime,
        endTime: availabilityExceptions.endTime,
        available: availabilityExceptions.available,
        cancelledSession: availabilityExceptions.cancelledSession,
        note: availabilityExceptions.note,
        lessonName: lessonTypes.name,
      })
      .from(availabilityExceptions)
      .leftJoin(lessonTypes, eq(lessonTypes.id, availabilityExceptions.lessonTypeId))
      .where(
        and(
          eq(availabilityExceptions.staffId, targetId),
          gte(availabilityExceptions.day, today),
        ),
      )
      .orderBy(asc(availabilityExceptions.day), asc(availabilityExceptions.startTime)),
  ]);

  // Anmeldungen je künftigem Kurstermin dieser Person: wer angemeldet ist,
  // wird nicht über "Entfernen" abgesagt, sondern im Kalender.
  const courseIds = offerings.filter((offering) => offering.capacity > 1).map((offering) => offering.id);
  const signups = new Map(
    (courseIds.length === 0
      ? []
      : await db
          .select({
            lessonTypeId: bookings.lessonTypeId,
            startsAt: bookings.startsAt,
            count: sql<number>`count(*)::int`,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.staffId, targetId),
              inArray(bookings.lessonTypeId, courseIds),
              occupiesTime(),
              gte(bookings.startsAt, new Date()),
            ),
          )
          .groupBy(bookings.lessonTypeId, bookings.startsAt)
    ).map((row) => [`${row.lessonTypeId}|${row.startsAt.toISOString()}`, row.count]),
  );
  const signupsFor = (lessonTypeId: string, day: string, startTime: string) =>
    signups.get(`${lessonTypeId}|${zurichToInstant(day, startTime.slice(0, 5)).toISOString()}`) ?? 0;
  const blockedCount = Number(params.kursBelegt);

  // Zeiten für ein Angebot stehen oben beim jeweiligen Angebot — hier unten
  // bleiben Abwesenheiten, sonst stünde derselbe Eintrag zweimal auf der Seite.
  const offeringIds = new Set(offerings.map((offering) => offering.id));
  // Ausgefallene Termine einer Kursserie sind keine Abwesenheit.
  const generalExceptions = exceptions.filter(
    (entry) =>
      !entry.cancelledSession &&
      !(entry.available && entry.lessonTypeId && offeringIds.has(entry.lessonTypeId)),
  );

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <span className="block w-10 h-[3px] rounded-full bg-signal mb-5" aria-hidden="true" />
        <h1 className="font-display text-3xl md:text-4xl font-bold">Verfügbarkeit</h1>
        <p className="text-slate text-lead mt-4 max-w-[58ch]">
          Diese Zeiten sieht deine Kundschaft als buchbare Termine. Jedes Angebot hat seinen
          eigenen Plan.
        </p>

        {managesOthers && team.length > 1 && (
          <ul className="flex flex-wrap gap-2 mt-7" aria-label="Person wählen">
            {team.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/team/verfuegbarkeit?person=${person.id}`}
                  className={`block px-4 py-2 rounded-full text-fine font-semibold border ${
                    person.id === targetId
                      ? "border-signal bg-signal text-deep"
                      : "border-deep/15 bg-paper hover:border-deep/30"
                  }`}
                >
                  {person.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {blockedCount > 0 && (
          <p role="alert" className="notice notice-error mt-7">
            Dieser Kurstermin hat {blockedCount} {blockedCount === 1 ? "Anmeldung" : "Anmeldungen"} und
            lässt sich hier nicht entfernen. Sag ihn im{" "}
            <Link
              href={`/team/kalender?ansicht=woche${/^\d{4}-\d{2}-\d{2}$/.test(params.tag ?? "") ? `&woche=${params.tag}` : ""}`}
              className="font-semibold underline underline-offset-2"
            >
              Kalender
            </Link>{" "}
            über „Kurs absagen“ ab, dann bekommen alle eine Mail.
          </p>
        )}

        {offerings.length === 0 ? (
          <p className="text-slate mt-10">
            {target.name} ist noch keinem Angebot zugeteilt. Das lässt sich unter{" "}
            <Link href="/team/mitarbeiter" className="font-semibold underline underline-offset-4">
              Mitarbeitende
            </Link>{" "}
            einrichten.
          </p>
        ) : (
          <div className="mt-10 space-y-14">
            {offerings.map((offering) => {
              const isCourse = offering.capacity > 1;
              // Serien zuerst (täglich, wöchentlich nach Wochentag ab Montag,
              // monatlich), danach einzelne Daten der Reihe nach.
              const ownRules = rules
                .filter((rule) => rule.lessonTypeId === offering.id)
                .sort(
                  (a, b) =>
                    FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency] ||
                    ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) ||
                    a.startTime.localeCompare(b.startTime),
                );
              const ownDates = exceptions.filter(
                (entry) => entry.lessonTypeId === offering.id && entry.available,
              );
              const skipped = new Set(
                exceptions
                  .filter((entry) => entry.lessonTypeId === offering.id && entry.cancelledSession)
                  .map((entry) => `${entry.day}|${entry.startTime.slice(0, 5)}`),
              );
              // Nicht die ganze Zukunft auflisten: die nächsten paar Daten,
              // der Rest aufklappbar.
              const firstDates = ownDates.slice(0, DATES_SHOWN);
              const laterDates = ownDates.slice(DATES_SHOWN);
              const dateRow = (entry: (typeof ownDates)[number]) => (
                <DateRow
                  key={entry.id}
                  id={entry.id}
                  person={targetId}
                  day={entry.day}
                  startTime={entry.startTime}
                  endTime={entry.endTime}
                  signups={isCourse ? signupsFor(offering.id, entry.day, entry.startTime) : 0}
                />
              );

              return (
                <div key={offering.id} className="surface bg-paper p-5 md:p-6">
                  <h2 className="font-display text-xl font-bold">{offering.name}</h2>
                  <p className="text-fine text-slate mt-1 mb-4 max-w-[52ch]">
                    {isCourse
                      ? "Ein Datum wählen und bei Bedarf wiederholen. Einzelne Kurstermine lassen sich im Kalender absagen oder verschieben, auch aus einer Serie."
                      : "Ein Datum wählen und bei Bedarf wiederholen: jeden Tag, jede Woche oder jeden Monat."}
                  </p>

                  {/* Bestand links, Eingabe rechts. */}
                  <div className="grid gap-6 lg:grid-cols-2 lg:gap-10 items-start">
                    {ownRules.length === 0 && ownDates.length === 0 ? (
                      <p className="text-slate text-fine">
                        {isCourse ? "Noch kein Kurstermin eingetragen." : "Noch nichts eingetragen."}
                      </p>
                    ) : (
                      <div className="rounded-[var(--radius-control)] bg-concrete overflow-hidden">
                        <ul>
                          {ownRules.map((rule) => {
                            const range = describeRuleRange(rule, today);
                            const next = nextOccurrences(rule, today, DATES_SHOWN + skipped.size)
                              .filter((day) => !skipped.has(`${day}|${rule.startTime.slice(0, 5)}`))
                              .slice(0, DATES_SHOWN);
                            return (
                              <li key={rule.id} className="border-b border-deep/10 last:border-0 px-4 py-3">
                                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                                  <span className="font-semibold hyphens-none">{describeRule(rule)}</span>
                                  <span className="nums text-slate whitespace-nowrap">
                                    {rule.startTime.slice(0, 5)} – {rule.endTime.slice(0, 5)}
                                  </span>
                                  <DeleteRuleButton id={rule.id} person={targetId} />
                                </div>
                                {range && <p className="text-fine text-slate mt-0.5">{range}</p>}
                                {next.length > 0 && (
                                  <ul className="flex flex-wrap gap-1.5 mt-2" aria-label="Nächste Termine">
                                    {next.map((day) => {
                                      const count = isCourse
                                        ? signupsFor(offering.id, day, rule.startTime)
                                        : 0;
                                      return (
                                        <li
                                          key={day}
                                          className="nums text-fine rounded-full bg-paper px-2.5 py-0.5 whitespace-nowrap"
                                        >
                                          {formatDayShort(day)}
                                          {count > 0 && (
                                            <span className="text-slate"> · {count} angemeldet</span>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </li>
                            );
                          })}
                          {firstDates.map(dateRow)}
                        </ul>
                        {laterDates.length > 0 && (
                          <details className="border-t border-deep/10">
                            <summary className="cursor-pointer px-4 py-2.5 text-fine font-semibold text-slate hover:text-deep">
                              {laterDates.length} weitere {laterDates.length === 1 ? "Datum" : "Daten"}
                            </summary>
                            <ul className="border-t border-deep/10">{laterDates.map(dateRow)}</ul>
                          </details>
                        )}
                      </div>
                    )}

                    <OfferingDateForm
                      course={isCourse}
                      today={today}
                      person={targetId}
                      lessonTypeId={offering.id}
                      lessonTypeName={offering.name}
                      durationMinutes={offering.durationMinutes}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10">
          <span className="block w-10 h-[3px] rounded-full bg-signal mb-5" aria-hidden="true" />
          <h2 className="font-display text-2xl font-bold">Abwesenheiten</h2>
          <p className="text-slate text-fine mt-1.5 mb-5 max-w-[60ch]">
            Ferien, Arzttermin oder Weiterbildung. Für mehrere Tage am Stück auch den
            letzten Tag angeben. Zusätzliche Zeiten trägst du oben beim jeweiligen Angebot ein.
          </p>

          {generalExceptions.length === 0 ? (
            <p className="text-slate text-fine">Keine Abwesenheiten in den kommenden Tagen.</p>
          ) : (
            <ul className="surface bg-paper">
              {generalExceptions.map((entry) => (
                <li key={entry.id} className="border-b border-deep/10 last:border-0 px-5 py-3.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className={`text-fine font-bold px-2.5 py-0.5 rounded-full ${
                        entry.available ? "bg-success text-paper" : "bg-concrete-dim text-deep"
                      }`}
                    >
                      {entry.available ? "zusätzlich frei" : "abwesend"}
                    </span>
                    <span className="font-semibold">{formatDayLong(entry.day)}</span>
                    <span className="nums text-slate">
                      {entry.startTime.slice(0, 5)} – {entry.endTime.slice(0, 5)}
                    </span>
                    <span className="text-fine text-slate">
                      {entry.lessonName ?? "alle Angebote"}
                    </span>
                    <DeleteExceptionButton id={entry.id} person={targetId} />
                  </div>
                  {entry.note && <p className="text-fine text-slate mt-1">{entry.note}</p>}
                </li>
              ))}
            </ul>
          )}

          <AvailabilityExceptionForm person={targetId} offerings={offerings} />
        </div>
      </div>
    </section>
  );
}
