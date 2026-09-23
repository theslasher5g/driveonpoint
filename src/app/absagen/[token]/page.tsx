import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, lessonTypes } from "@/lib/db/schema";
import { site } from "@/lib/site";
import { formatDayLong, zurichDay, zurichTime } from "@/lib/time";
import { cancelBookingAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termin absagen",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

export default async function AbsagenPage({ params }: { params: Params }) {
  const { token } = await params;

  const [booking] = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      startsAt: bookings.startsAt,
      status: bookings.status,
      lessonName: lessonTypes.name,
      durationMinutes: lessonTypes.durationMinutes,
    })
    .from(bookings)
    .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(and(eq(bookings.cancelToken, token), gt(bookings.startsAt, new Date())))
    .limit(1);

  if (!booking) {
    return (
      <Shell title="Dieser Link führt ins Leere">
        <p className="text-slate max-w-[54ch]">
          Der Termin ist entweder schon vorbei, bereits abgesagt, oder der Link stimmt nicht mehr.
          Ruf uns an, dann klären wir das in einer Minute.
        </p>
        <a href={`tel:${site.contact.phoneHref}`} className="btn btn-primary mt-7">
          {site.contact.phone}
        </a>
      </Shell>
    );
  }

  if (booking.status === "abgesagt") {
    return (
      <Shell title="Der Termin ist bereits abgesagt">
        <p className="text-slate max-w-[54ch]">
          Referenz {booking.reference}. Du musst nichts weiter tun.
        </p>
        <Link href="/buchen" className="btn btn-primary mt-7">
          Neuen Termin buchen
        </Link>
      </Shell>
    );
  }

  const hoursLeft = (booking.startsAt.getTime() - Date.now()) / 3_600_000;
  const chargeable = hoursLeft < 24;

  return (
    <Shell title="Termin absagen?">
      <div className="surface bg-paper p-5 md:p-6 max-w-xl">
        <p className="font-bold text-lg">{booking.lessonName ?? "Termin"}</p>
        <p className="nums text-slate mt-1">
          {formatDayLong(zurichDay(booking.startsAt))}, {zurichTime(booking.startsAt)} Uhr
        </p>
        <p className="nums text-fine text-slate mt-3">Referenz {booking.reference}</p>
      </div>

      {chargeable && (
        <p className="notice notice-warn max-w-xl mt-6">
          Bis zum Termin sind es weniger als 24 Stunden. Eine Absage jetzt wird verrechnet.
        </p>
      )}

      <form action={cancelBookingAction} className="mt-7 flex flex-wrap gap-3">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-primary">
          Ja, Termin absagen
        </button>
        <Link href="/" className="btn btn-outline">
          Nein, Termin behalten
        </Link>
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
