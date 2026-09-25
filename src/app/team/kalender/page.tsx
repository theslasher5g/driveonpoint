import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { addDays, formatDayLong, formatDayShort, todayInZurich } from "@/lib/time";
import { mondayOf, shiftMonth, yearMonthOf } from "./dates";
import { MonthView, monthLabel } from "./month-view";
import { WeekView } from "./week-view";

export const dynamic = "force-dynamic";

type Params = {
  ansicht?: string;
  monat?: string;
  woche?: string;
  person?: string;
  erfasst?: string;
  serie?: string;
  uebersprungen?: string;
  verschoben?: string;
  kursAbgesagt?: string;
  kursVerschoben?: string;
  mailFehler?: string;
};

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requirePermission("kalender.ansehen");
  const params = await searchParams;

  const seesEveryone = can(user.role, "verfuegbarkeit.alle");
  const manages = can(user.role, "kalender.verwalten");
  // Wer nicht alle Kalender sieht, bekommt ohnehin nur die eigenen Einträge
  // zu sehen — für die reicht `verfuegbarkeit.eigene`.
  const mayEditAvailability = can(user.role, "verfuegbarkeit.eigene");

  const view = params.ansicht === "woche" ? "woche" : "monat";
  const today = todayInZurich();

  const yearMonth = /^\d{4}-\d{2}$/.test(params.monat ?? "") ? params.monat! : yearMonthOf(today);
  const weekStart = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(params.woche ?? "") ? params.woche! : today);
  const weekEnd = addDays(weekStart, 6);

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

  const focusQuery = focus ? `&person=${focus}` : "";
  // Der jeweils andere Modus bekommt einen sinnvollen Ausgangspunkt statt
  // stur beim heutigen Tag zu landen: von der Woche in den Monat wechselt
  // man in den Monat der gerade betrachteten Woche, umgekehrt auf die
  // aktuelle Woche — die Browsing-Position bleibt so weitgehend erhalten.
  const monthHref = `/team/kalender?ansicht=monat&monat=${view === "woche" ? yearMonthOf(weekStart) : yearMonth}${focusQuery}`;
  const weekHref = `/team/kalender?ansicht=woche&woche=${view === "monat" ? today : weekStart}${focusQuery}`;

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        {params.erfasst && (
          <p role="status" className="notice notice-success mb-6">
            {params.serie && /^\d+$/.test(params.serie) && params.serie !== "1"
              ? `${params.serie} Termine eingetragen, jede Woche zur selben Zeit (ab ${params.erfasst}).`
              : `Termin ${params.erfasst} eingetragen.`}
          </p>
        )}
        {params.uebersprungen && (
          <p role="status" className="notice notice-warn mb-6">
            Übersprungen, weil schon belegt oder keine Zeit eingetragen:{" "}
            {params.uebersprungen
              .split(",")
              .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
              .map((day) => formatDayLong(day))
              .join("; ")}
            . Diese Wochen bei Bedarf von Hand erfassen.
          </p>
        )}
        {params.verschoben && (
          <p role="status" className="notice notice-success mb-6">
            Termin {params.verschoben} verschoben.
          </p>
        )}
        {params.kursVerschoben && /^\d+$/.test(params.kursVerschoben) && (
          <p role="status" className="notice notice-success mb-6">
            Kurstermin verschoben ({params.kursVerschoben}{" "}
            {params.kursVerschoben === "1" ? "Anmeldung" : "Anmeldungen"}). Wer eine Mailadresse
            hinterlegt hat, ist informiert.
            {params.mailFehler && /^\d+$/.test(params.mailFehler) &&
              ` ${params.mailFehler} Mail${params.mailFehler === "1" ? "" : "s"} konnte${params.mailFehler === "1" ? "" : "n"} nicht verschickt werden — bitte diese Personen anrufen.`}
          </p>
        )}
        {params.kursAbgesagt && /^\d+$/.test(params.kursAbgesagt) && (
          <p role="status" className="notice notice-success mb-6">
            Kurstermin abgesagt ({params.kursAbgesagt}{" "}
            {params.kursAbgesagt === "1" ? "Anmeldung" : "Anmeldungen"}). Wer eine Mailadresse
            hinterlegt hat, ist informiert.
            {params.mailFehler && /^\d+$/.test(params.mailFehler) &&
              ` ${params.mailFehler} Mail${params.mailFehler === "1" ? "" : "s"} konnte${params.mailFehler === "1" ? "" : "n"} nicht verschickt werden — bitte diese Personen anrufen.`}
          </p>
        )}

        <span className="block w-10 h-[3px] rounded-full bg-signal mb-5" aria-hidden="true" />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold">Kalender</h1>
            <p className="nums text-slate mt-2">
              {view === "monat"
                ? monthLabel(yearMonth)
                : `Woche vom ${formatDayShort(weekStart)} bis ${formatDayShort(weekEnd)}`}
            </p>
          </div>

          {manages && (
            <Link href="/team/kalender/erfassen" className="btn btn-primary py-2.5 px-4">
              + Termin erfassen
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
          {/* Monat/Woche — ein Formular, keine zwei Kalender: wer die
              Übersicht will, bleibt im Monat; wer einen Termin verschieben
              oder absagen will, wechselt für die Einzelheiten in die Woche. */}
          <div className="inline-flex rounded-full bg-concrete-dim p-1" role="group" aria-label="Ansicht wählen">
            <Link
              href={monthHref}
              aria-current={view === "monat" ? "page" : undefined}
              className={`px-4 py-1.5 rounded-full text-fine font-semibold transition-colors ${
                view === "monat" ? "bg-signal text-deep" : "text-deep/70 hover:text-deep"
              }`}
            >
              Monat
            </Link>
            <Link
              href={weekHref}
              aria-current={view === "woche" ? "page" : undefined}
              className={`px-4 py-1.5 rounded-full text-fine font-semibold transition-colors ${
                view === "woche" ? "bg-signal text-deep" : "text-deep/70 hover:text-deep"
              }`}
            >
              Woche
            </Link>
          </div>

          <nav className="flex flex-wrap gap-2" aria-label={view === "monat" ? "Monat wechseln" : "Woche wechseln"}>
            {view === "monat" ? (
              <>
                <Link
                  href={`/team/kalender?ansicht=monat&monat=${shiftMonth(yearMonth, -1)}${focusQuery}`}
                  className="btn btn-outline py-2 px-3.5"
                  aria-label="Vorheriger Monat"
                >
                  ‹ Vorheriger
                </Link>
                <Link
                  href={`/team/kalender?ansicht=monat${focusQuery}`}
                  className="btn btn-outline py-2 px-3.5"
                >
                  Heute
                </Link>
                <Link
                  href={`/team/kalender?ansicht=monat&monat=${shiftMonth(yearMonth, 1)}${focusQuery}`}
                  className="btn btn-outline py-2 px-3.5"
                  aria-label="Nächster Monat"
                >
                  Nächster ›
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={`/team/kalender?ansicht=woche&woche=${addDays(weekStart, -7)}${focusQuery}`}
                  className="btn btn-outline py-2 px-3.5"
                >
                  ‹ Vorherige
                </Link>
                <Link
                  href={`/team/kalender?ansicht=woche${focusQuery}`}
                  className="btn btn-outline py-2 px-3.5"
                >
                  Heute
                </Link>
                <Link
                  href={`/team/kalender?ansicht=woche&woche=${addDays(weekStart, 7)}${focusQuery}`}
                  className="btn btn-outline py-2 px-3.5"
                >
                  Nächste ›
                </Link>
              </>
            )}
          </nav>
        </div>

        {seesEveryone && team.length > 1 && (
          <ul className="flex flex-wrap gap-2 mt-6" aria-label="Person filtern">
            <li>
              <Link
                href={`/team/kalender?ansicht=${view}&${view === "monat" ? `monat=${yearMonth}` : `woche=${weekStart}`}`}
                className={focus ? "chip chip-quiet" : "chip"}
              >
                Alle
              </Link>
            </li>
            {team.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/team/kalender?ansicht=${view}&${view === "monat" ? `monat=${yearMonth}` : `woche=${weekStart}`}&person=${person.id}`}
                  className={focus === person.id ? "chip" : "chip chip-quiet"}
                >
                  {person.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8">
          {view === "monat" ? (
            <MonthView
              yearMonth={yearMonth}
              visibleIds={visibleIds}
              focus={focus}
              seesEveryone={seesEveryone}
              manages={manages}
              userId={user.id}
              mayEditAvailability={mayEditAvailability}
            />
          ) : (
            <WeekView
              start={weekStart}
              visibleIds={visibleIds}
              focus={focus}
              seesEveryone={seesEveryone}
              manages={manages}
              userId={user.id}
              mayEditAvailability={mayEditAvailability}
            />
          )}
        </div>
      </div>
    </section>
  );
}
