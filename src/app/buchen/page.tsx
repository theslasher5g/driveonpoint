import type { Metadata } from "next";
import Link from "next/link";
import { BookingForm } from "@/components/booking-form";
import { PageHeader } from "@/components/page-header";
import {
  activePromotions,
  applyPromotions,
  findSlots,
  lessonTypeBySlug,
  listLessonTypes,
  type Slot,
} from "@/lib/booking";
import { formatDayLong, formatPrice, todayInZurich } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termin buchen",
  description:
    "Freie Termine für Fahrstunden, Verkehrskundeunterricht und Nothilfekurs direkt online auswählen.",
  alternates: { canonical: "/buchen" },
  robots: { index: true, follow: true },
};

type Params = Promise<{ angebot?: string; tag?: string; zeit?: string }>;

export default async function BuchenPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;

  if (!params.angebot) return <ChooseOffer />;

  const lessonType = await lessonTypeBySlug(params.angebot);
  if (!lessonType || !lessonType.active) return <ChooseOffer unknown={params.angebot} />;

  const promotions = await activePromotions();
  const priced = applyPromotions(lessonType, promotions);
  const slots = await findSlots({ lessonType, fromDay: todayInZurich(), days: 28 });

  // Dritter Schritt: Termin steht, jetzt die Angaben.
  if (params.tag && params.zeit) {
    const chosen = slots.find((slot) => slot.day === params.tag && slot.time === params.zeit);

    if (chosen) {
      return (
        <>
          <PageHeader
            title="Deine Angaben"
            lead={`${lessonType.name} am ${formatDayLong(chosen.day)} um ${chosen.time} Uhr. Noch drei Felder, dann ist der Termin dir.`}
          />
          <section className="shell band">
            <div className="lane max-w-2xl">
              <div className="bg-paper border border-deep/15 p-5 mb-8">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <div>
                    <p className="font-bold text-lg">{lessonType.name}</p>
                    <p className="nums text-slate">
                      {formatDayLong(chosen.day)}, {chosen.time} Uhr ·{" "}
                      {lessonType.durationMinutes} Minuten
                    </p>
                  </div>
                  <p className="nums stretch-wide font-extrabold text-xl">
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

              <BookingForm slug={lessonType.slug} day={chosen.day} time={chosen.time} />
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
          slots.length > 0
            ? `Wähle einen Termin. Alles, was hier steht, ist tatsächlich frei — die Liste kommt direkt aus dem Kalender der Fahrlehrerinnen und Fahrlehrer.`
            : "Für die nächsten vier Wochen ist gerade nichts frei. Ruf uns an, oft lässt sich trotzdem etwas einrichten."
        }
      />
      <section className="shell band">
        <div className="lane">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-9">
            <p className="nums stretch-wide font-extrabold text-2xl">
              CHF {formatPrice(priced.finalRappen)}
            </p>
            {priced.promotion && <p className="promo-tag">{priced.promotion.label}</p>}
            <Link
              href="/buchen"
              className="text-fine font-bold text-signal-ink underline underline-offset-4 ml-auto"
            >
              Anderes Angebot
            </Link>
          </div>

          <SlotList slots={slots} slug={lessonType.slug} isCourse={lessonType.capacity > 1} />
        </div>
      </section>
    </>
  );
}

function SlotList({
  slots,
  slug,
  isCourse,
}: {
  slots: Slot[];
  slug: string;
  isCourse: boolean;
}) {
  if (slots.length === 0) {
    return (
      <p className="text-slate max-w-[52ch]">
        Sobald neue Zeiten eingetragen sind, erscheinen sie hier automatisch.
      </p>
    );
  }

  const byDay = new Map<string, Slot[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.day) ?? [];
    list.push(slot);
    byDay.set(slot.day, list);
  }

  return (
    <div className="border-t border-deep/15">
      {[...byDay.entries()].map(([day, entries]) => (
        <div key={day} className="border-b border-deep/15 py-5 grid gap-3 sm:grid-cols-[13rem_1fr]">
          <h2 className="text-base font-bold pt-1.5">{formatDayLong(day)}</h2>
          <ul className="flex flex-wrap gap-2">
            {entries.map((slot) => (
              <li key={slot.time}>
                <Link
                  href={`/buchen?angebot=${slug}&tag=${slot.day}&zeit=${slot.time}`}
                  className="nums block bg-paper border border-deep/20 px-4 py-2.5 font-bold hover:bg-signal hover:text-paper hover:border-signal transition-colors"
                >
                  {slot.time}
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

async function ChooseOffer({ unknown }: { unknown?: string } = {}) {
  const [types, promotions] = await Promise.all([listLessonTypes(), activePromotions()]);

  return (
    <>
      <PageHeader
        title="Was möchtest du buchen?"
        lead="Wähle dein Angebot. Danach siehst du sofort, welche Termine frei sind — ohne Anruf und ohne Warten auf eine Antwort."
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
                      <p className="nums stretch-wide font-extrabold text-xl mt-3">
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
