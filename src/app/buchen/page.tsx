import type { Metadata } from "next";
import Link from "next/link";
import { BookingForm } from "@/components/booking-form";
import { FahrstundeSlotSelector } from "@/components/fahrstunde-slot-selector";
import { MultiBookingForm } from "@/components/multi-booking-form";
import { PageHeader } from "@/components/page-header";
import {
  activePromotions,
  applyPromotions,
  BOOKING_HORIZON_DAYS,
  findSlots,
  lessonTypeBySlug,
  listLessonTypes,
  type Slot,
} from "@/lib/booking";
import { site } from "@/lib/site";
import { formatDayLong, formatPrice, todayInZurich } from "@/lib/time";
import { fullCourseSessions, type FullSession } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termin buchen",
  description:
    "Freie Termine für Fahrstunden, Verkehrskundeunterricht und Nothilfekurs direkt online auswählen.",
  alternates: { canonical: "/buchen" },
  robots: { index: true, follow: true },
};

type Params = Promise<{
  angebot?: string;
  tag?: string;
  zeit?: string;
  termin?: string | string[];
}>;

export default async function BuchenPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;

  if (!params.angebot) return <ChooseOffer />;

  const lessonType = await lessonTypeBySlug(params.angebot);
  if (!lessonType || !lessonType.active) return <ChooseOffer unknown={params.angebot} />;

  const promotions = await activePromotions();
  const priced = applyPromotions(lessonType, promotions);
  const slots = await findSlots({
    lessonType,
    fromDay: todayInZurich(),
    days: BOOKING_HORIZON_DAYS,
  });
  // Volle Kurstermine bleiben sichtbar, mit dem Weg auf die Warteliste.
  const full = lessonType.capacity > 1 ? await fullCourseSessions(lessonType) : [];

  // Mehrere Fahrstunden auf einmal: eine eigene Auswahl statt eines
  // einzelnen Termins, siehe FahrstundeSlotSelector. Nur für Fahrstunden —
  // bei Kursen bucht man ohnehin nur einen Kursstart, bei der Schnupperstunde
  // ist "mehrere auf einmal" dem Zweck der ersten Kennenlern-Lektion fremd.
  const allowsMulti = lessonType.slug === "fahrstunde";

  if (allowsMulti && params.termin) {
    const termine = Array.isArray(params.termin) ? params.termin : [params.termin];
    const chosen = [...new Set(termine)]
      .map((value) => {
        const [day, time] = value.split("T");
        return slots.find((slot) => slot.day === day && slot.time === time);
      })
      .filter((slot): slot is Slot => slot !== undefined);

    if (chosen.length > 0) {
      const sorted = [...chosen].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
      const totalRappen = priced.finalRappen * sorted.length;

      return (
        <>
          <PageHeader
            title="Deine Angaben"
            lead={`${sorted.length} ${sorted.length === 1 ? "Fahrstunde" : "Fahrstunden"}. Jetzt noch deine Angaben.`}
          />
          <section className="shell band">
            <div className="lane max-w-2xl">
              <div className="surface bg-paper p-5 md:p-6 mb-6">
                <ul className="divide-y divide-deep/12">
                  {sorted.map((slot) => (
                    <li
                      key={`${slot.day}T${slot.time}`}
                      className="py-2.5 first:pt-0 last:pb-0 flex items-baseline justify-between gap-4"
                    >
                      <p className="nums font-bold">
                        {formatDayLong(slot.day)}, {slot.time} Uhr
                      </p>
                      <p className="nums text-slate text-fine shrink-0">
                        {lessonType.durationMinutes} Minuten
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="flex items-baseline justify-between gap-4 mt-4 pt-4 border-t border-deep/12">
                  <p className="font-bold">Gesamtpreis</p>
                  <p className="nums font-display text-2xl font-bold text-signal-ink">
                    CHF {formatPrice(totalRappen)}
                  </p>
                </div>
                {priced.promotion && <p className="promo-tag mt-3">{priced.promotion.label}</p>}
                <Link
                  href={`/buchen?angebot=${lessonType.slug}`}
                  className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-4"
                >
                  Andere Termine wählen
                </Link>
              </div>

              <div className="surface bg-paper p-5 md:p-6">
                <MultiBookingForm
                  slug={lessonType.slug}
                  termine={sorted.map((slot) => `${slot.day}T${slot.time}`)}
                />
              </div>
            </div>
          </section>
        </>
      );
    }
  }

  // Dritter Schritt (alle anderen Angebote): Termin steht, jetzt die Angaben.
  if (params.tag && params.zeit) {
    const chosen = slots.find((slot) => slot.day === params.tag && slot.time === params.zeit);

    if (chosen) {
      return (
        <>
          <PageHeader
            title="Deine Angaben"
            lead={`${lessonType.name} am ${formatDayLong(chosen.day)} um ${chosen.time} Uhr. Jetzt noch deine Angaben.`}
          />
          <section className="shell band">
            <div className="lane max-w-2xl">
              <div className="surface bg-paper p-5 md:p-6 mb-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <div>
                    <p className="font-bold text-lg">{lessonType.name}</p>
                    <p className="nums text-slate">
                      {formatDayLong(chosen.day)}, {chosen.time} Uhr ·{" "}
                      {lessonType.durationMinutes} Minuten
                    </p>
                  </div>
                  <p className="nums font-display text-2xl font-bold text-signal-ink">
                    CHF {formatPrice(priced.finalRappen)}
                  </p>
                </div>
                {priced.promotion && <p className="promo-tag mt-3">{priced.promotion.label}</p>}
                <Link
                  href={`/buchen?angebot=${lessonType.slug}`}
                  className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-4"
                >
                  Anderen Termin wählen
                </Link>
              </div>

              <div className="surface bg-paper p-5 md:p-6">
                <BookingForm
                  slug={lessonType.slug}
                  day={chosen.day}
                  time={chosen.time}
                  pickup={lessonType.capacity <= 1}
                />
              </div>
            </div>
          </section>
        </>
      );
    }
  }

  // Zweiter Schritt: freie Termine zur Auswahl.
  return (
    <>
      <PageHeader
        title={lessonType.name}
        lead={
          slots.length > 0 || full.length > 0
            ? allowsMulti
              ? "Wähle einen oder mehrere Termine, hintereinander am selben Tag oder verteilt auf mehrere Tage. Alle Zeiten hier sind wirklich frei."
              : full.length > 0
                ? "Wähle einen Kurstermin. Ist einer ausgebucht, kannst du dich auf die Warteliste setzen und bekommst eine Mail, sobald ein Platz frei wird."
                : `Wähle einen Termin. Alle Zeiten hier sind wirklich frei, sie kommen direkt aus unserem Kalender.`
            : "Für die nächsten vier Wochen ist online nichts frei."
        }
      />
      <section className="shell band">
        <div className="lane">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-9">
            <p className="nums font-display text-3xl font-bold text-signal-ink">
              CHF {formatPrice(priced.finalRappen)}
            </p>
            {priced.promotion && <p className="promo-tag">{priced.promotion.label}</p>}
            <Link href="/buchen" className="btn btn-outline py-2.5 px-4 text-fine ml-auto">
              Anderes Angebot
            </Link>
          </div>

          {slots.length === 0 && full.length === 0 ? (
            <div className="surface bg-paper p-6 md:p-7 max-w-xl">
              <p className="font-display text-xl font-bold">Ruf uns an</p>
              <p className="text-slate mt-2">
                Online ist gerade nichts frei, aber oft finden wir trotzdem einen Termin. Ruf
                uns an oder schreib uns kurz.
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <a href={`tel:${site.contact.phoneHref}`} className="btn btn-primary">
                  {site.contact.phone}
                </a>
                <Link href="/kontakt" className="btn btn-outline">
                  Schreib uns
                </Link>
              </div>
            </div>
          ) : allowsMulti ? (
            <FahrstundeSlotSelector slots={slots} slug={lessonType.slug} />
          ) : (
            <SlotList
              slots={slots}
              full={full}
              slug={lessonType.slug}
              isCourse={lessonType.capacity > 1}
            />
          )}
        </div>
      </section>
    </>
  );
}

type ListEntry = { day: string; time: string; seatsLeft: number | null };

function SlotList({
  slots,
  full,
  slug,
  isCourse,
}: {
  slots: Slot[];
  full: FullSession[];
  slug: string;
  isCourse: boolean;
}) {
  if (slots.length === 0 && full.length === 0) {
    return (
      <p className="text-slate max-w-[52ch]">
        Sobald neue Zeiten eingetragen sind, erscheinen sie hier automatisch.
      </p>
    );
  }

  // Ausgebuchte Kurstermine (seatsLeft null) stehen zwischen den freien,
  // in zeitlicher Reihenfolge.
  const listed: ListEntry[] = [
    ...slots.map((slot) => ({ day: slot.day, time: slot.time, seatsLeft: slot.seatsLeft })),
    ...full.map((session) => ({ day: session.day, time: session.time, seatsLeft: null })),
  ].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));

  const byDay = new Map<string, ListEntry[]>();
  for (const entry of listed) {
    const list = byDay.get(entry.day) ?? [];
    list.push(entry);
    byDay.set(entry.day, list);
  }

  return (
    <div className="space-y-3">
      {[...byDay.entries()].map(([day, entries]) => (
        <div
          key={day}
          className="surface bg-paper p-5 grid gap-3 sm:grid-cols-[13rem_1fr] sm:items-center"
        >
          <h2 className="text-base font-bold">{formatDayLong(day)}</h2>
          <ul className="flex flex-wrap gap-2">
            {entries.map((slot) =>
              slot.seatsLeft === null ? (
                <li key={slot.time}>
                  <Link
                    href={`/buchen/warteliste?angebot=${slug}&tag=${slot.day}&zeit=${slot.time}`}
                    className="nums block rounded-[var(--radius-control)] border border-dashed border-deep/25 px-4 py-2.5 font-bold text-slate hover:border-deep hover:text-deep transition-colors"
                  >
                    {slot.time}
                    <span className="block text-fine font-normal">Ausgebucht, Warteliste</span>
                  </Link>
                </li>
              ) : (
              <li key={slot.time}>
                <Link
                  href={`/buchen?angebot=${slug}&tag=${slot.day}&zeit=${slot.time}`}
                  className="nums block rounded-[var(--radius-control)] bg-concrete px-4 py-2.5 font-bold hover:bg-signal hover:text-deep transition-colors"
                >
                  {slot.time}
                  {isCourse && (
                    <span className="block text-fine font-normal opacity-75">
                      {slot.seatsLeft} {slot.seatsLeft === 1 ? "Platz" : "Plätze"}
                    </span>
                  )}
                </Link>
              </li>
              ),
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

async function ChooseOffer({ unknown }: { unknown?: string } = {}) {
  const [types, promotions] = await Promise.all([listLessonTypes(), activePromotions()]);

  return (
    <>
      <PageHeader
        title="Was möchtest du buchen?"
        lead="Wähle dein Angebot. Danach siehst du sofort, welche Termine noch frei sind."
      />
      <section className="shell band">
        <div className="lane">
          {unknown && (
            <p className="notice notice-warn mb-8 max-w-[56ch]">
              Das Angebot „{unknown}“ gibt es nicht mehr. Hier sind die aktuellen.
            </p>
          )}

          {types.length === 0 ? (
            <p className="text-slate">Es sind gerade keine Angebote hinterlegt.</p>
          ) : (
            /* Rahmen an der Karte statt Rasterlinien über den Hintergrund
               des Behälters: bei vier Angeboten in drei Spalten blieb sonst
               eine leere graue Zelle stehen, die wie ein Fehler aussah. So
               stimmt das Bild bei jeder Anzahl. */
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {types.map((lessonType) => {
                const priced = applyPromotions(lessonType, promotions);
                return (
                  <li key={lessonType.id} className="flex">
                    <Link
                      href={`/buchen?angebot=${lessonType.slug}`}
                      className="group surface bg-paper border border-deep/15 hover:bg-signal-tint transition-colors p-5 w-full flex flex-col"
                    >
                      <h2 className="text-xl stretch-wide font-extrabold leading-tight">
                        {lessonType.name}
                      </h2>
                      <p className="text-slate text-fine mt-2 flex-1">
                        {lessonType.shortDescription ||
                          `${lessonType.durationMinutes} Minuten pro Termin`}
                      </p>
                      {priced.promotion && (
                        <p className="promo-tag mt-3 self-start">{priced.promotion.label}</p>
                      )}
                      <p className="nums font-display text-xl font-bold mt-3">
                        CHF {formatPrice(priced.finalRappen)}
                      </p>
                      <span className="text-fine font-bold text-signal-ink mt-3 underline-offset-4 group-hover:underline">
                        Freie Termine ansehen
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
