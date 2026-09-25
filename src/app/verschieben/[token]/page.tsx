import type { Metadata } from "next";
import Link from "next/link";
import { SelfRescheduleForm } from "@/components/self-reschedule-form";
import type { Slot } from "@/lib/booking";
import { bookingForToken, movableSlots, stillMovable } from "@/lib/self-reschedule";
import { site } from "@/lib/site";
import { formatDayLong, formatDayShort, zurichDay, zurichTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termin verschieben",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;
type Search = Promise<{ tag?: string; zeit?: string; verschoben?: string }>;

export default async function VerschiebenPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { token } = await params;
  const query = await searchParams;
  const booking = await bookingForToken(token);

  if (!booking || booking.status === "abgesagt") {
    return (
      <Shell title="Dieser Link führt ins Leere">
        <p className="text-slate max-w-[54ch]">
          Der Termin ist entweder schon vorbei, abgesagt, oder der Link stimmt nicht mehr. Ruf
          uns an, dann klären wir das in einer Minute.
        </p>
        <Call />
      </Shell>
    );
  }

  const current = (
    <div className="surface bg-paper p-5 md:p-6 max-w-xl">
      <p className="font-bold text-lg">{booking.lessonType.name}</p>
      <p className="nums text-slate mt-1">
        {formatDayLong(zurichDay(booking.startsAt))}, {zurichTime(booking.startsAt)} Uhr
      </p>
      {booking.secondStartsAt && booking.secondEndsAt && (
        <p className="nums text-slate">
          und {formatDayLong(zurichDay(booking.secondStartsAt))}, {zurichTime(booking.secondStartsAt)} Uhr
        </p>
      )}
      <p className="nums text-fine text-slate mt-3">Referenz {booking.reference}</p>
    </div>
  );

  if (query.verschoben) {
    return (
      <Shell title="Dein Termin ist verschoben">
        {current}
        <p className="text-slate mt-6 max-w-[54ch]">
          {booking.customerEmail
            ? "Eine Bestätigung mit dem neuen Kalendereintrag ist unterwegs in dein Postfach."
            : "Die neue Zeit steht bei uns im Kalender."}
        </p>
      </Shell>
    );
  }

  if (booking.status === "angefragt") {
    return (
      <Shell title="Bitte zuerst bestätigen">
        {current}
        <p className="text-slate mt-6 max-w-[54ch]">
          Diese Buchung ist noch nicht bestätigt. Klick zuerst auf den Link in der Mail, die wir
          dir nach der Buchung geschickt haben. Danach lässt sich der Termin verschieben.
        </p>
      </Shell>
    );
  }

  if (!stillMovable(booking.startsAt)) {
    return (
      <Shell title="Zu kurzfristig zum Verschieben">
        {current}
        <p className="text-slate mt-6 max-w-[54ch]">
          Weniger als 24 Stunden vor dem Termin geht das nur noch telefonisch. Ruf uns an, oft
          finden wir trotzdem eine Lösung.
        </p>
        <Call />
      </Shell>
    );
  }

  const slots = await movableSlots(booking);
  const chosen =
    query.tag && query.zeit
      ? slots.find((slot) => slot.day === query.tag && slot.time === query.zeit)
      : undefined;
  const isCourse = booking.lessonType.capacity > 1;

  if (chosen) {
    return (
      <Shell title="Neue Zeit bestätigen">
        {current}
        <p className="text-slate mt-6 max-w-[54ch]">
          Neu:{" "}
          <strong className="text-deep">
            {formatDayLong(chosen.day)}, {chosen.time} Uhr
            {chosen.second && ` und ${formatDayLong(chosen.second.day)}, ${chosen.second.time} Uhr`}
          </strong>
          . Die bisherige Zeit wird dabei frei. Verschieben kostet nichts.
        </p>
        <div className="mt-6">
          <SelfRescheduleForm token={token} day={chosen.day} time={chosen.time} />
        </div>
        <Link
          href={`/verschieben/${token}`}
          className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-5"
        >
          Andere Zeit wählen
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="Termin verschieben">
      {current}
      {slots.length === 0 ? (
        <>
          <p className="text-slate mt-6 max-w-[54ch]">
            In den nächsten vier Wochen ist online keine andere Zeit frei. Ruf uns an, oft finden
            wir trotzdem etwas.
          </p>
          <Call />
        </>
      ) : (
        <>
          <p className="text-slate mt-8 mb-4 max-w-[58ch]">
            {isCourse
              ? "Wähle einen anderen Kurstermin."
              : `Wähle eine neue Zeit${booking.staffName ? ` bei ${booking.staffName.split(" ")[0]}` : ""}. Alle Zeiten hier sind wirklich frei.`}
          </p>
          <SlotList slots={slots} token={token} isCourse={isCourse} />
        </>
      )}
      <p className="text-fine text-slate mt-8 max-w-[58ch]">
        Doch lieber absagen?{" "}
        <Link href={`/absagen/${token}`} className="font-semibold underline underline-offset-4">
          Termin absagen
        </Link>
      </p>
    </Shell>
  );
}

function SlotList({ slots, token, isCourse }: { slots: Slot[]; token: string; isCourse: boolean }) {
  const byDay = new Map<string, Slot[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.day) ?? [];
    list.push(slot);
    byDay.set(slot.day, list);
  }

  return (
    <div className="space-y-3 max-w-3xl">
      {[...byDay.entries()].map(([day, entries]) => (
        <div
          key={day}
          className="surface bg-paper p-5 grid gap-3 sm:grid-cols-[15rem_1fr] sm:items-center"
        >
          <h2 className="text-base font-bold hyphens-none">{formatDayLong(day)}</h2>
          <ul className="flex flex-wrap gap-2">
            {entries.map((slot) => (
              <li key={slot.time}>
                <Link
                  href={`/verschieben/${token}?tag=${slot.day}&zeit=${slot.time}`}
                  className="nums block rounded-[var(--radius-control)] bg-concrete px-4 py-2.5 font-bold hover:bg-signal hover:text-deep transition-colors"
                >
                  {slot.time}
                  {slot.second && (
                    <span className="block text-fine font-semibold">
                      und {formatDayShort(slot.second.day)}, {slot.second.time}
                    </span>
                  )}
                  {isCourse && (
                    <span className="block text-fine font-normal opacity-75">
                      {slot.seatsLeft} {slot.seatsLeft === 1 ? "Platz" : "Plätze"}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Call() {
  return (
    <a href={`tel:${site.contact.phoneHref}`} className="btn btn-primary mt-7">
      {site.contact.phone}
    </a>
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
