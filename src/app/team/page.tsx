import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, eq, gte, isNull, lte, or } from "drizzle-orm";
import { isConfirmed } from "@/lib/booking";
import { PASSWORD_CHANGE_PAGE, requireUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  lessonTypes,
  staff,
  staffLessonTypes,
} from "@/lib/db/schema";
import { currentProblems, type Problem } from "@/lib/monitoring";
import {
  addDays,
  formatDayLong,
  todayInZurich,
  zurichDay,
  zurichTime,
  zurichToInstant,
} from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Was bei einer Störung zu tun ist — die Meldung soll nicht nur sagen, was
 * klemmt, sondern auch, wo man ansetzt.
 */
const REMEDY: Record<Problem["key"], string> = {
  mail: "Zugangsdaten zum Mailserver in der .env prüfen (README, Abschnitt Mailversand).",
  stuendlich: "Auf dem Server prüfen, ob die Cron-Aufträge laufen (README, Wenn etwas stillsteht).",
  aufraeumen: "Auf dem Server prüfen, ob die Cron-Aufträge laufen (README, Wenn etwas stillsteht).",
};

export default async function TeamDashboard({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect(PASSWORD_CHANGE_PAGE);
  const { fehler } = await searchParams;

  const today = todayInZurich();
  const weekEnd = addDays(today, 6);
  const seesEveryone = can(user.role, "verfuegbarkeit.alle");

  // Dieselbe Bedingung für Liste und Zähler — die Liste ist begrenzt, damit
  // eine volle Woche die Seite nicht sprengt; gezählt wird trotzdem alles.
  const weekFilter = and(
    isConfirmed(),
    gte(bookings.startsAt, zurichToInstant(today, "00:00")),
    lte(bookings.startsAt, zurichToInstant(weekEnd, "23:59")),
    seesEveryone ? undefined : eq(bookings.staffId, user.id),
  );

  const [upcoming, weekTotal, ownOfferings, coveredOfferingIds, courseDateIds] = await Promise.all([
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        startsAt: bookings.startsAt,
        status: bookings.status,
        customerName: bookings.customerName,
        customerPhone: bookings.customerPhone,
        customerNote: bookings.customerNote,
        lessonName: lessonTypes.name,
        staffName: staff.name,
      })
      .from(bookings)
      .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
      .leftJoin(staff, eq(staff.id, bookings.staffId))
      .where(weekFilter)
      .orderBy(asc(bookings.startsAt))
      .limit(60),
    db
      .select({ total: count() })
      .from(bookings)
      .where(weekFilter)
      .then((rows) => rows[0]?.total ?? 0),
    // Die eigenen Angebote, um sie gegen die eingetragene Verfügbarkeit
    // abzugleichen — ohne Zeiten kann dort niemand buchen.
    db
      .select({ id: lessonTypes.id, name: lessonTypes.name, capacity: lessonTypes.capacity })
      .from(staffLessonTypes)
      .innerJoin(lessonTypes, eq(lessonTypes.id, staffLessonTypes.lessonTypeId))
      .where(and(eq(staffLessonTypes.staffId, user.id), eq(lessonTypes.active, true))),
    db
      .selectDistinct({ id: availabilityRules.lessonTypeId })
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.staffId, user.id),
          or(isNull(availabilityRules.validUntil), gte(availabilityRules.validUntil, today)),
        ),
      )
      .then((rows) => rows.map((row) => row.id)),
    // Künftige einzelne Daten: für Kurse die einzige Art, für Fahr- und
    // Schnupperstunden eine von zweien.
    db
      .selectDistinct({ id: availabilityExceptions.lessonTypeId })
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.staffId, user.id),
          eq(availabilityExceptions.available, true),
          gte(availabilityExceptions.day, today),
        ),
      )
      .then((rows) => rows.map((row) => row.id)),
  ]);

  // Gedeckt ist ein Angebot durch eine Serie oder ein künftiges Datum —
  // bei Kursen wie bei Fahrstunden.
  const uncovered = ownOfferings.filter(
    (offering) => !coveredOfferingIds.includes(offering.id) && !courseDateIds.includes(offering.id),
  );

  // Stillstand beim Mailversand oder bei den Cron-Läufen — nur für die, die
  // etwas dagegen tun können. Fällt die Abfrage aus, fehlt nur der Hinweis.
  let problems: Problem[] = [];
  if (seesEveryone) {
    try {
      problems = await currentProblems();
    } catch (error) {
      console.error("Betriebsstatus konnte nicht gelesen werden:", error);
    }
  }

  const todays = upcoming.filter((entry) => zurichDay(entry.startsAt) === today);
  const manages = can(user.role, "kalender.verwalten");

  // Nach Tagen gruppiert: "Heute", "Morgen", danach der Wochentag mit Datum.
  const byDay = new Map<string, typeof upcoming>();
  for (const entry of upcoming) {
    const day = zurichDay(entry.startsAt);
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }
  const dayLabel = (day: string) =>
    day === today ? "Heute" : day === addDays(today, 1) ? "Morgen" : formatDayLong(day).replace(/ \d{4}$/, "");

  const attention = problems.length + uncovered.length;

  return (
    <section className="shell band">
      <div className="lane max-w-5xl">
        {fehler === "keine-berechtigung" && (
          <p role="alert" className="notice notice-error mb-6">
            Für diesen Bereich fehlt dir die Berechtigung.
          </p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div>
            <h1 className="text-title">Guten Tag, {user.name.split(" ")[0]}.</h1>
            <p className="text-slate mt-2">
              {formatDayLong(today).replace(/ \d{4}$/, "")}.{" "}
              {todays.length === 0
                ? "Heute steht nichts an"
                : `Heute ${todays.length === 1 ? "ein Termin" : `${todays.length} Termine`}`}
              , in den nächsten 7 Tagen {weekTotal === 1 ? "einer" : weekTotal}
              {seesEveryone ? " im ganzen Team" : ""}.
            </p>
          </div>
          {manages && (
            <Link href="/team/kalender/erfassen" className="btn btn-primary py-2.5 px-4">
              Termin erfassen
            </Link>
          )}
        </div>

        {/* Alles, was eine Reaktion braucht, an einer Stelle und mit dem
            nächsten Schritt — statt mehrerer gleich lauter Banner
            untereinander. */}
        {attention > 0 && (
          <div role={problems.length > 0 ? "alert" : undefined} className="surface bg-paper mt-8">
            <h2 className="text-fine font-bold px-5 pt-4 pb-3 border-b border-rule">
              Braucht deine Aufmerksamkeit
            </h2>
            <ul className="divide-y divide-rule">
              {problems.map((problem) => (
                <li key={problem.key} className="px-5 py-3.5 flex gap-3">
                  <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-danger shrink-0" aria-hidden="true" />
                  <div className="min-w-0 text-fine">
                    <p className="font-bold text-danger">{problem.title}</p>
                    <p className="text-slate mt-0.5 max-w-[72ch] break-words">{problem.detail}</p>
                    <p className="mt-1 font-semibold">{REMEDY[problem.key]}</p>
                  </div>
                </li>
              ))}
              {uncovered.length > 0 && (
                <li className="px-5 py-3.5 flex gap-3 items-start">
                  <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-amber shrink-0" aria-hidden="true" />
                  <div className="min-w-0 text-fine flex-1 sm:flex sm:items-start sm:justify-between sm:gap-6">
                    <div>
                      <p className="font-bold">
                        {uncovered.length === 1 ? "Ein Angebot ist" : `${uncovered.length} Angebote sind`} nicht buchbar
                      </p>
                      <p className="text-slate mt-0.5">
                        Für {uncovered.map((offering) => offering.name).join(", ")} hast du keine Zeit
                        eingetragen, deshalb kann dich dort niemand buchen.
                      </p>
                    </div>
                    <Link
                      href="/team/verfuegbarkeit"
                      className="btn btn-outline py-2 px-3.5 text-fine mt-2.5 sm:mt-0 shrink-0"
                    >
                      Zeiten eintragen
                    </Link>
                  </div>
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="flex items-baseline justify-between gap-4 mt-10 mb-3">
          <h2 className="text-section">{seesEveryone ? "Die nächsten 7 Tage im Team" : "Deine nächsten 7 Tage"}</h2>
          <Link href="/team/kalender?ansicht=woche" className="text-fine font-semibold text-signal-ink underline-offset-4 hover:underline shrink-0">
            Zum Kalender
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="surface bg-paper px-5 py-8 text-center">
            <p className="font-bold">In den nächsten 7 Tagen ist nichts gebucht.</p>
            <p className="text-slate text-fine mt-1">
              Prüfe, ob deine Zeiten eingetragen sind, damit dich Kundinnen und Kunden finden.
            </p>
            <Link href="/team/verfuegbarkeit" className="btn btn-outline py-2 px-3.5 text-fine mt-4">
              Verfügbarkeit ansehen
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {[...byDay.entries()].map(([day, entries]) => (
              <section key={day} className="surface bg-paper" aria-label={dayLabel(day)}>
                <Link
                  href={`/team/kalender?ansicht=woche&woche=${day}`}
                  className="flex items-baseline justify-between gap-4 px-5 pt-3.5 pb-2.5 border-b border-rule hover:bg-concrete/60 transition-colors"
                >
                  <h3 className={`text-fine font-bold ${day === today ? "text-signal-ink" : ""}`}>{dayLabel(day)}</h3>
                  <span className="text-fine text-slate">
                    {entries.length === 1 ? "1 Termin" : `${entries.length} Termine`}
                  </span>
                </Link>
                <ul className="divide-y divide-rule">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="px-5 py-3 grid gap-x-5 gap-y-0.5 grid-cols-[3.5rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline"
                    >
                      <p className="nums font-bold">{zurichTime(entry.startsAt)}</p>
                      <div className="min-w-0">
                        <p className="font-semibold leading-snug">
                          {entry.customerName ?? "Angaben gelöscht"}
                          <span className="font-normal text-slate"> {entry.lessonName ?? "Termin"}</span>
                        </p>
                        {entry.customerPhone && (
                          <a
                            href={`tel:${entry.customerPhone.replace(/\s+/g, "")}`}
                            className="nums text-fine text-slate hover:text-signal-ink"
                          >
                            {entry.customerPhone}
                          </a>
                        )}
                        {entry.customerNote && (
                          <p className="text-fine text-slate mt-1 max-w-[60ch]">«{entry.customerNote}»</p>
                        )}
                      </div>
                      <p className="text-fine text-slate col-start-2 sm:col-start-auto sm:text-right">
                        {seesEveryone && entry.staffName ? entry.staffName : entry.reference}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {weekTotal > upcoming.length && (
          <p className="text-slate text-fine mt-4">
            Dazu kommen {weekTotal - upcoming.length} weitere,{" "}
            <Link href="/team/kalender?ansicht=woche" className="font-semibold underline underline-offset-4">
              im Kalender
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  );
}

