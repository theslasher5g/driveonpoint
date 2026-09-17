import Link from "next/link";
import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { bookings, lessonTypes, staff } from "@/lib/db/schema";
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
  const seesEveryone = can(user.role, "verfuegbarkeit.alle");

  const upcoming = await db
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
    .where(
      and(
        ne(bookings.status, "abgesagt"),
        gte(bookings.startsAt, zurichToInstant(today, "00:00")),
        lte(bookings.startsAt, zurichToInstant(addDays(today, 7), "23:59")),
        seesEveryone ? undefined : eq(bookings.staffId, user.id),
      ),
    )
    .orderBy(asc(bookings.startsAt))
    .limit(60);

  const todays = upcoming.filter((entry) => zurichDay(entry.startsAt) === today);

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        {fehler === "keine-berechtigung" && (
          <p role="alert" className="bg-paper border-l-4 border-[#B3261E] px-5 py-4 font-semibold mb-8">
            Für diesen Bereich fehlt dir die Berechtigung.
          </p>
        )}

        <h1 className="text-title">Guten Tag, {user.name.split(" ")[0]}.</h1>
        <p className="text-slate text-lead mt-4 max-w-[54ch]">
          {todays.length === 0
            ? "Heute stehen keine Termine an."
            : `Heute ${todays.length === 1 ? "steht ein Termin" : `stehen ${todays.length} Termine`} an.`}
        </p>

        {user.mustChangePassword && (
          <p className="bg-amber text-deep px-5 py-4 font-semibold mt-7 max-w-xl">
            Dein Passwort ist noch das vergebene.{" "}
            <Link href="/team/konto" className="underline underline-offset-4">
              Jetzt ändern
            </Link>
            .
          </p>
        )}

        <h2 className="text-section mt-12 mb-5">
          {seesEveryone ? "Nächste sieben Tage, alle" : "Deine nächsten sieben Tage"}
        </h2>

        {upcoming.length === 0 ? (
          <p className="text-slate max-w-[54ch]">
            Keine Termine eingetragen. Prüf deine{" "}
            <Link href="/team/verfuegbarkeit" className="font-semibold text-signal underline underline-offset-4">
              Verfügbarkeit
            </Link>{" "}
            — ohne eingetragene Zeiten kann niemand bei dir buchen.
          </p>
        ) : (
          <div className="border-t border-deep/15">
            {upcoming.map((entry) => (
              <article
                key={entry.id}
                className="border-b border-deep/15 py-4 grid gap-x-6 gap-y-1 sm:grid-cols-[9rem_1fr_auto] items-baseline"
              >
                <p className="nums font-bold">
                  {zurichTime(entry.startsAt)}
                  <span className="block text-fine font-normal text-slate">
                    {formatDayLong(zurichDay(entry.startsAt)).split(",")[0]},{" "}
                    {zurichDay(entry.startsAt).slice(8)}.{zurichDay(entry.startsAt).slice(5, 7)}.
                  </span>
                </p>

                <div className="min-w-0">
                  <h3 className="text-base">
                    {entry.customerName ?? "Angaben gelöscht"}
                    <span className="font-normal text-slate"> — {entry.lessonName ?? "Termin"}</span>
                  </h3>
                  {entry.customerPhone && (
                    <p className="nums text-fine text-slate mt-0.5">
                      <a href={`tel:${entry.customerPhone}`} className="hover:text-signal">
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

        <div className="flex flex-wrap gap-3 mt-10">
          <Link href="/team/kalender" className="btn btn-primary">
            Zum Kalender
          </Link>
          <Link href="/team/verfuegbarkeit" className="btn btn-outline">
            Verfügbarkeit eintragen
          </Link>
        </div>
      </div>
    </section>
  );
}
