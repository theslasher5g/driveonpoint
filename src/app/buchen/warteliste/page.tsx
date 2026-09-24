import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { WaitlistForm } from "@/components/waitlist-form";
import {
  findSlots,
  lessonTypeBySlug,
  withinBookingHorizon,
} from "@/lib/booking";
import { formatDayLong } from "@/lib/time";
import { isSessionFull } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Warteliste",
  robots: { index: false, follow: false },
};

type Params = Promise<{ angebot?: string; tag?: string; zeit?: string }>;

export default async function WartelistePage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const { angebot, tag, zeit } = await searchParams;
  if (
    !angebot ||
    !tag ||
    !zeit ||
    !/^\d{4}-\d{2}-\d{2}$/.test(tag) ||
    !/^\d{2}:\d{2}$/.test(zeit)
  ) {
    redirect("/buchen");
  }

  const lessonType = await lessonTypeBySlug(angebot);
  if (!lessonType || !lessonType.active || lessonType.capacity <= 1)
    redirect("/buchen");
  const back = `/buchen?angebot=${lessonType.slug}`;
  if (!withinBookingHorizon(tag)) redirect(back);

  // Ist doch ein Platz frei, gleich zur Buchung.
  if (!(await isSessionFull(lessonType, tag, zeit))) {
    const slots = await findSlots({ lessonType, fromDay: tag, days: 1 });
    redirect(
      slots.some((slot) => slot.time === zeit)
        ? `${back}&tag=${tag}&zeit=${zeit}`
        : back,
    );
  }

  return (
    <>
      <PageHeader
        title="Warteliste"
        lead={`${lessonType.name} am ${formatDayLong(tag)} um ${zeit} Uhr ist ausgebucht. Trag dich ein, dann melden wir uns, sobald ein Platz frei wird.`}
      />
      <section className="shell band">
        <div className="lane max-w-2xl">
          <div className="surface bg-paper p-5 md:p-6 mb-6">
            <p className="font-bold text-lg">{lessonType.name}</p>
            <p className="nums text-slate">
              {formatDayLong(tag)}, {zeit} Uhr
            </p>
            <p className="text-fine text-slate mt-3 max-w-[56ch]">
              Sagt jemand ab, bekommen alle auf der Warteliste gleichzeitig eine
              Mail. Wer zuerst bucht, hat den Platz. Die Warteliste ist keine
              Reservation.
            </p>
            <Link
              href={back}
              className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-4"
            >
              Anderen Kurstermin wählen
            </Link>
          </div>

          <div className="surface bg-paper p-5 md:p-6">
            <WaitlistForm slug={lessonType.slug} day={tag} time={zeit} />
          </div>
        </div>
      </section>
    </>
  );
}
