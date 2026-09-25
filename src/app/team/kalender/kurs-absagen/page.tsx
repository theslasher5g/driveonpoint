import Link from "next/link";
import { eq } from "drizzle-orm";
import { CourseCancelForm } from "@/components/course-cancel-form";
import { requirePermission } from "@/lib/auth/guard";
import { courseSession } from "@/lib/course-cancel";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { formatDayLong, zurichDay, zurichTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type Params = Promise<{ id?: string }>;

export default async function KursAbsagenPage({ searchParams }: { searchParams: Params }) {
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
    return <Message>Der Kurs hat schon begonnen und lässt sich nicht mehr absagen.</Message>;
  }

  const { lessonType, participants, waiting } = session;
  const day = zurichDay(entry.startsAt);
  const withoutMail = participants.filter((participant) => !participant.customerEmail);
  const recipients = participants.length - withoutMail.length + waiting.length;

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane max-w-2xl">
        <h1 className="text-title">Kurstermin absagen</h1>

        <div className="surface bg-paper p-5 md:p-6 mt-6">
          <p className="font-bold text-lg">{lessonType.name}</p>
          <p className="nums text-slate">
            {formatDayLong(day)}, {zurichTime(entry.startsAt)} Uhr
            {entry.secondStartsAt &&
              ` und ${formatDayLong(zurichDay(entry.secondStartsAt))}, ${zurichTime(entry.secondStartsAt)} Uhr`}
          </p>
          <p className="mt-3">
            {participants.length} {participants.length === 1 ? "Anmeldung" : "Anmeldungen"}
            {waiting.length > 0 && `, ${waiting.length} auf der Warteliste`}
          </p>
          {participants.length > 0 && (
            <ul className="text-fine text-slate mt-2 space-y-0.5">
              {participants.map((participant) => (
                <li key={participant.id}>
                  {participant.customerName ?? "Angaben gelöscht"}
                  {participant.status === "angefragt" && " (unbestätigt)"}
                  {!participant.customerEmail && participant.customerPhone && (
                    <>
                      {" · "}
                      <span className="text-danger font-semibold">keine Mail, anrufen: </span>
                      <a
                        href={`tel:${participant.customerPhone.replace(/\s+/g, "")}`}
                        className="nums text-signal-ink font-semibold"
                      >
                        {participant.customerPhone}
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-slate mt-6 max-w-[58ch]">
          Alle Anmeldungen werden abgesagt, ohne Kosten für die Kundschaft. Wer eine Mailadresse
          hinterlegt hat, bekommt eine Mail, ebenso alle auf der Warteliste. Der Kurstermin
          verschwindet aus der Verfügbarkeit und lässt sich nicht mehr buchen.
        </p>

        <div className="mt-7">
          <CourseCancelForm id={id} recipients={recipients} />
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
