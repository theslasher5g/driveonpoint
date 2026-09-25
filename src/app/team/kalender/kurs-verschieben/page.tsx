import Link from "next/link";
import { eq } from "drizzle-orm";
import { CourseMoveForm } from "@/components/course-move-form";
import { requirePermission } from "@/lib/auth/guard";
import { courseSession } from "@/lib/course-cancel";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { daysBetween, formatDayLong, todayInZurich, zurichDay, zurichTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type Params = Promise<{ id?: string }>;

export default async function KursVerschiebenPage({ searchParams }: { searchParams: Params }) {
  await requirePermission("kalender.verwalten");
  const { id = "" } = await searchParams;

  const [entry] = /^[0-9a-f-]{36}$/i.test(id)
    ? await db
        .select({
          lessonTypeId: bookings.lessonTypeId,
          startsAt: bookings.startsAt,
          secondStartsAt: bookings.secondStartsAt,
        })
        .from(bookings)
        .where(eq(bookings.id, id))
        .limit(1)
    : [];

  const session = entry?.lessonTypeId ? await courseSession(entry.lessonTypeId, entry.startsAt) : null;

  if (!entry || !session?.lessonType || session.lessonType.capacity <= 1) {
    return <Message>Das ist kein Kurstermin.</Message>;
  }
  if (entry.startsAt.getTime() <= Date.now()) {
    return <Message>Der Kurs hat schon begonnen und lässt sich nicht mehr verschieben.</Message>;
  }

  const { lessonType, participants, waiting } = session;
  const day = zurichDay(entry.startsAt);
  const time = zurichTime(entry.startsAt);
  const withoutMail = participants.filter((participant) => !participant.customerEmail);
  const recipients = participants.length - withoutMail.length + waiting.length;

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane max-w-2xl">
        <h1 className="text-title">Kurstermin verschieben</h1>

        <div className="surface bg-paper p-5 md:p-6 mt-6">
          <p className="font-bold text-lg">{lessonType.name}</p>
          <p className="nums text-slate">
            Bisher: {formatDayLong(day)}, {time} Uhr
            {entry.secondStartsAt &&
              ` und ${formatDayLong(zurichDay(entry.secondStartsAt))}, ${zurichTime(entry.secondStartsAt)} Uhr`}
          </p>
          {entry.secondStartsAt && (
            <p className="text-fine text-slate mt-1">
              Der 2. Kurstag wandert im selben Abstand mit (
              {daysBetween(day, zurichDay(entry.secondStartsAt))}{" "}
              {daysBetween(day, zurichDay(entry.secondStartsAt)) === 1 ? "Tag" : "Tage"} später).
            </p>
          )}
          <p className="mt-3">
            {participants.length} {participants.length === 1 ? "Anmeldung" : "Anmeldungen"}
            {waiting.length > 0 && `, ${waiting.length} auf der Warteliste`}
          </p>
          {withoutMail.length > 0 && (
            <ul className="text-fine mt-2 space-y-0.5">
              {withoutMail.map((participant) => (
                <li key={participant.id}>
                  {participant.customerName ?? "Angaben gelöscht"} ·{" "}
                  <span className="text-danger font-semibold">keine Mail, anrufen: </span>
                  {participant.customerPhone && (
                    <a
                      href={`tel:${participant.customerPhone.replace(/\s+/g, "")}`}
                      className="nums text-signal-ink font-semibold"
                    >
                      {participant.customerPhone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-slate mt-6 max-w-[58ch]">
          Der Kurstermin, alle Anmeldungen und die Warteliste ziehen auf die neue Zeit um. Wer
          eine Mailadresse hinterlegt hat, bekommt eine Mail mit neuem Kalendereintrag und kann
          kostenlos absagen, falls die neue Zeit nicht passt. Das Zeitfenster des Kurstermins
          bleibt gleich lang.
        </p>

        <div className="mt-7">
          <CourseMoveForm id={id} day={day} time={time} minDay={todayInZurich()} recipients={recipients} />
        </div>

        <Link
          href={`/team/kalender?ansicht=woche&woche=${day}`}
          className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-6"
        >
          Zurück zum Kalender
        </Link>
      </div>
    </section>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <section className="shell py-10 md:py-14">
      <div className="lane max-w-2xl">
        <p className="notice notice-error">{children}</p>
        <Link
          href="/team/kalender"
          className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-4"
        >
          Zurück zum Kalender
        </Link>
      </div>
    </section>
  );
}
