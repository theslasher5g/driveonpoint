import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { CONFIRM_WINDOW_MINUTES } from "@/lib/booking";
import { db } from "@/lib/db";
import { bookings, lessonTypes } from "@/lib/db/schema";
import { site } from "@/lib/site";
import { formatDayLong, zurichDay, zurichTime } from "@/lib/time";
import { confirmBookingAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termin bestätigen",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

/**
 * Ziel des Links aus der Mail. Bestätigt wird erst mit dem Knopf, nicht
 * schon beim Öffnen: Virenscanner und Vorschaudienste mancher Mailanbieter
 * rufen Links in eingehenden Mails selbständig auf — ein blosser Aufruf
 * würde so jeden Termin bestätigen, auch einen mit fremder Mailadresse.
 */
export default async function BestaetigenPage({ params }: { params: Params }) {
  const { token } = await params;

  const rows =
    token.length >= 20 && token.length <= 100
      ? await db
          .select({
            reference: bookings.reference,
            startsAt: bookings.startsAt,
            status: bookings.status,
            confirmExpiresAt: bookings.confirmExpiresAt,
            lessonName: lessonTypes.name,
          })
          .from(bookings)
          .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
          .where(eq(bookings.confirmToken, token))
          .orderBy(asc(bookings.startsAt))
      : [];

  const now = Date.now();
  const pending = rows.filter(
    (row) =>
      row.status === "angefragt" && row.confirmExpiresAt && row.confirmExpiresAt.getTime() > now,
  );
  const confirmed = rows.filter(
    (row) => row.status === "bestaetigt" || row.status === "erledigt",
  );
  const allCancelled = rows.length > 0 && rows.every((row) => row.status === "abgesagt");

  if (allCancelled) {
    return (
      <Shell title="Der Termin ist abgesagt">
        <p className="text-slate max-w-[54ch]">
          Du musst nichts weiter tun. Einen neuen Termin findest du im Kalender.
        </p>
        <Link href="/buchen" className="btn btn-primary mt-7">
          Neuen Termin buchen
        </Link>
      </Shell>
    );
  }

  if (pending.length === 0 && confirmed.length > 0) {
    return (
      <Shell title="Schon bestätigt">
        <p className="text-slate max-w-[54ch]">
          {confirmed.length > 1 ? "Deine Termine sind" : "Dein Termin ist"} verbindlich gebucht.
          Die Bestätigung mit dem Absagelink und der Kalenderdatei hast du per Mail bekommen.
        </p>
        <ul className="mt-6 space-y-2 max-w-xl">
          {confirmed.map((row) => (
            <li key={row.reference} className="surface bg-paper px-5 py-3">
              <span className="nums">
                {formatDayLong(zurichDay(row.startsAt))}, {zurichTime(row.startsAt)} Uhr
              </span>
              <span className="nums text-fine text-slate"> · {row.reference}</span>
            </li>
          ))}
        </ul>
        <Link href="/" className="btn btn-outline mt-7">
          Zur Startseite
        </Link>
      </Shell>
    );
  }

  if (pending.length === 0) {
    return (
      <Shell title="Dieser Link ist abgelaufen">
        <p className="text-slate max-w-[54ch]">
          Die Bestätigung war nur {CONFIRM_WINDOW_MINUTES} Minuten lang möglich, danach haben wir
          den Termin wieder freigegeben. Buch ihn einfach neu. Ist er noch frei, siehst du ihn im Kalender.
        </p>
        <div className="flex flex-wrap gap-3 mt-7">
          <Link href="/buchen" className="btn btn-primary">
            Neu buchen
          </Link>
          <a href={`tel:${site.contact.phoneHref}`} className="btn btn-outline">
            {site.contact.phone}
          </a>
        </div>
      </Shell>
    );
  }

  const several = pending.length > 1;

  return (
    <Shell title={several ? "Termine bestätigen" : "Termin bestätigen"}>
      <div className="surface bg-paper p-5 md:p-6 max-w-xl">
        <p className="font-bold text-lg">{pending[0].lessonName ?? "Termin"}</p>
        <ul className="mt-1 space-y-0.5">
          {pending.map((row) => (
            <li key={row.reference} className="nums text-slate">
              {formatDayLong(zurichDay(row.startsAt))}, {zurichTime(row.startsAt)} Uhr
            </li>
          ))}
        </ul>
      </div>

      <p className="text-slate mt-6 max-w-[54ch]">
        Mit der Bestätigung {several ? "sind die Termine" : "ist der Termin"} verbindlich. Du
        bekommst danach eine Mail mit dem Absagelink und einer Kalenderdatei.
      </p>

      <form action={confirmBookingAction} className="mt-7">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-primary">
          {several ? "Termine verbindlich buchen" : "Termin verbindlich buchen"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="shell pt-24 pb-14 md:pt-32 md:pb-20">
      <div className="lane">
        <span className="block w-10 h-[3px] rounded-full bg-signal mb-5" aria-hidden="true" />
        <h1 className="text-title max-w-[18ch]">{title}</h1>
        <div className="mt-7">{children}</div>
      </div>
    </section>
  );
}
