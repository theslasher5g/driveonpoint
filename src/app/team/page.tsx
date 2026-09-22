import Link from "next/link";
import { and, asc, count, eq, gte, lte, ne } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { availabilityRules, bookings, lessonTypes, staff, staffLessonTypes } from "@/lib/db/schema";
import {
  addDays,
  formatDayLong,
  todayInZurich,
  zurichDay,
  zurichTime,
  zurichToInstant,
} from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function TeamDashboard({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const user = await requireUser();
  const { fehler } = await searchParams;

  const today = todayInZurich();
  const weekEnd = addDays(today, 6);
  const seesEveryone = can(user.role, "verfuegbarkeit.alle");

  // Dieselbe Bedingung für Liste und Zähler — die Liste ist begrenzt, damit
  // eine volle Woche die Seite nicht sprengt; gezählt wird trotzdem alles.
  const weekFilter = and(
    ne(bookings.status, "abgesagt"),
    gte(bookings.startsAt, zurichToInstant(today, "00:00")),
    lte(bookings.startsAt, zurichToInstant(weekEnd, "23:59")),
    seesEveryone ? undefined : eq(bookings.staffId, user.id),
  );

  const [upcoming, weekTotal, ownOfferings, coveredOfferingIds] = await Promise.all([
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
      .select({ id: lessonTypes.id, name: lessonTypes.name })
      .from(staffLessonTypes)
      .innerJoin(lessonTypes, eq(lessonTypes.id, staffLessonTypes.lessonTypeId))
      .where(and(eq(staffLessonTypes.staffId, user.id), eq(lessonTypes.active, true))),
    db
      .selectDistinct({ id: availabilityRules.lessonTypeId })
      .from(availabilityRules)
      .where(eq(availabilityRules.staffId, user.id))
      .then((rows) => rows.map((row) => row.id)),
  ]);

  const uncovered = ownOfferings.filter((offering) => !coveredOfferingIds.includes(offering.id));

  const todays = upcoming.filter((entry) => zurichDay(entry.startsAt) === today);

  return (
    <section className="shell band">
      <div className="lane">
        {fehler === "keine-berechtigung" && (
          <p role="alert" className="notice notice-error mb-6">
            Für diesen Bereich fehlt dir die Berechtigung.
          </p>
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h1 className="text-title">Guten Tag, {user.name.split(" ")[0]}.</h1>
          {user.mustChangePassword && (
            <Link
              href="/team/konto"
              className="text-fine font-bold text-signal-ink underline underline-offset-4"
            >
              Startpasswort noch nicht geändert
            </Link>
          )}
        </div>

        {/* Gelb trägt hier Bedeutung: nur die Kachel, die eine Reaktion
            braucht, ist eingefärbt. */}
        <dl className="grid gap-px bg-deep/12 border border-deep/12 rounded-[var(--radius-surface)] overflow-hidden grid-cols-2 sm:grid-cols-3 mt-7">
          <StatTile label="Heute" value={todays.length} />
          <StatTile label={seesEveryone ? "Diese Woche, alle" : "Diese Woche"} value={weekTotal} />
          <StatTile
            label="Ohne Verfügbarkeit"
            value={uncovered.length}
            tone={uncovered.length > 0 ? "warn" : undefined}
            className="col-span-2 sm:col-span-1"
          />
        </dl>

        {uncovered.length > 0 && (
          <p className="notice notice-warn mt-5 max-w-[62ch]">
            Für {uncovered.map((offering) => offering.name).join(", ")} fehlt deine Zeit — da
            kann dich niemand buchen.{" "}
            <Link href="/team/verfuegbarkeit" className="underline underline-offset-2">
              Eintragen
            </Link>
          </p>
        )}

        <h2 className="text-section mt-10 mb-4">
          {seesEveryone ? "Kommende Termine, alle" : "Deine kommenden Termine"}
        </h2>

        {upcoming.length === 0 ? (
          <p className="text-slate text-fine">
            Diese Woche ist nichts gebucht.{" "}
            <Link
              href="/team/verfuegbarkeit"
              className="font-semibold text-signal-ink underline underline-offset-4"
            >
              Verfügbarkeit prüfen
            </Link>
          </p>
        ) : (
          <div className="border-t border-deep/15">
            {upcoming.map((entry) => (
              <article
                key={entry.id}
                className="border-b border-deep/15 py-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-[8rem_1fr_auto] items-baseline"
              >
                <p className="nums text-fine font-bold">
                  {zurichTime(entry.startsAt)}
                  <span className="block font-normal text-slate">
                    {formatDayLong(zurichDay(entry.startsAt)).split(",")[0]},{" "}
                    {zurichDay(entry.startsAt).slice(8)}.{zurichDay(entry.startsAt).slice(5, 7)}.
                  </span>
                </p>

                <div className="min-w-0">
                  <h3 className="text-fine font-bold">
                    {entry.customerName ?? "Angaben gelöscht"}
                    <span className="font-normal text-slate"> — {entry.lessonName ?? "Termin"}</span>
                  </h3>
                  {entry.customerPhone && (
                    <p className="nums text-fine text-slate mt-0.5">
                      <a href={`tel:${entry.customerPhone}`} className="hover:text-signal-ink">
                        {entry.customerPhone}
                      </a>
                    </p>
                  )}
                  {entry.customerNote && (
                    <p className="text-fine text-slate mt-1 max-w-[52ch]">{entry.customerNote}</p>
                  )}
                </div>

                <p className="text-fine text-slate sm:text-right">
                  {seesEveryone && entry.staffName ? entry.staffName : entry.reference}
                </p>
              </article>
            ))}
          </div>
        )}

        {weekTotal > upcoming.length && (
          <p className="text-slate text-fine mt-4">
            Noch {weekTotal - upcoming.length} weitere diese Woche —{" "}
            <Link href="/team/kalender" className="font-semibold underline underline-offset-4">
              im Kalender
            </Link>
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-8">
          <Link href="/team/kalender" className="btn btn-primary sm:min-w-60">
            Zum Kalender
          </Link>
          <Link href="/team/verfuegbarkeit" className="btn btn-outline sm:min-w-60">
            Verfügbarkeit eintragen
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Kennzahl mit grosser Ziffer.
 *
 * Die Zahl steht in normalen, proportionalen Ziffern statt in `.nums`
 * (tabellarisch): Letzteres richtet Spalten aus, macht eine einzelne grosse
 * Zahl aber unnötig breit. Farbe trägt hier ausschliesslich Bedeutung — Gelb
 * ausschliesslich für die Kachel, die tatsächlich eine Reaktion braucht.
 */
function StatTile({
  label,
  value,
  tone,
  className = "",
}: {
  label: string;
  value: number;
  tone?: "warn";
  className?: string;
}) {
  return (
    <div className={`bg-paper p-4 ${className}`}>
      <p className="text-fine text-slate">{label}</p>
      <p className={`text-3xl font-semibold leading-none mt-2 ${tone === "warn" ? "text-amber-ink" : ""}`}>
        {value}
      </p>
    </div>
  );
}
