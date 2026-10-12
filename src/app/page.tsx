import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { NextSlotPanel, NextSlotSkeleton } from "@/components/next-slot";
import { activePromotions, applyPromotions, listLessonTypes } from "@/lib/booking";
import { site } from "@/lib/site";
import { formatChf, formatDayShort } from "@/lib/time";

export const dynamic = "force-dynamic";

/*
 * Die drei Angebote, je ein Satz — alles Weitere auf der Seite dahinter.
 * Nicht nummeriert: die Reihenfolge zeigt weiter unten die Strasse zum
 * Ausweis, hier geht es darum, was es gibt und was es kostet.
 */
const OFFERS = [
  {
    href: "/fahrstunden",
    slug: "fahrstunde",
    title: site.offers.fahrstunden.title,
    meta: "45 Minuten, mit Abholung",
    body: "Einzeln oder im Abo, von der ersten Stunde bis zur Prüfung.",
  },
  {
    href: "/vku",
    slug: "vku",
    title: site.offers.vku.title,
    meta: "8 Lektionen an 2 Abenden",
    body: "Gefahren früh erkennen und einschätzen. Pflicht vor der praktischen Prüfung.",
  },
  {
    href: "/nothilfekurs",
    slug: "nothilfekurs",
    title: site.offers.nothilfekurs.title,
    meta: `${site.offers.nothilfekurs.duration}, ab ${site.offers.nothilfekurs.minAge}`,
    body: "Richtig handeln, bis der Rettungsdienst da ist. Pflicht vor der Theorieprüfung.",
  },
];

export default async function HomePage() {
  // Preise und eine laufende Aktion kommen aus der Datenbank. Fällt sie kurz
  // aus, fehlen nur die Preise, nicht die Seite.
  let promotions: Awaited<ReturnType<typeof activePromotions>> = [];
  const prices = new Map<string, { final: number; regular: number }>();
  try {
    const [found, types] = await Promise.all([activePromotions(), listLessonTypes()]);
    promotions = found;
    for (const type of types) {
      prices.set(type.slug, { final: applyPromotions(type, found).finalRappen, regular: type.priceRappen });
    }
  } catch (error) {
    console.error("Preise und Aktionen konnten nicht geladen werden:", error);
  }
  const promotion = promotions[0];

  return (
    <>
      {/* Aufmacher: links, worum es geht; rechts das echte Schulfahrzeug und
          darunter, an derselben Karte, der nächste freie Termin. Vorher lag
          hier ein Verlauf von Rot nach Schwarz mit einer Glaskarte — laut,
          aber ohne etwas aus dieser Fahrschule zu zeigen. */}
      <section className="shell pt-24 pb-12 md:pt-32 md:pb-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-14 lg:items-center">
          <div className="min-w-0">
            {promotion && (
              <Link href="/preise" className="promo-tag mb-6 hover:brightness-105 transition-[filter]">
                {promotion.label}, bis {formatDayShort(promotion.endsOn)}
                {promotions.length > 1 && ` (und ${promotions.length - 1} weitere)`}
              </Link>
            )}
            <h1 className="text-display">
              {site.hero.headline[0]}
              <br />
              {site.hero.headline[1]}
            </h1>
            <p className="text-lead text-slate max-w-[44ch] mt-6 md:mt-8">{site.hero.lead}</p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/buchen" className="btn btn-primary">
                Termin buchen
              </Link>
              <Link href="/preise" className="btn btn-outline">
                Preise ansehen
              </Link>
            </div>
            <p className="text-fine text-slate mt-6 max-w-[48ch]">
              Lieber zuerst reden? Ruf an unter{" "}
              <a href={`tel:${site.contact.phoneHref}`} className="nums font-semibold text-deep whitespace-nowrap">
                {site.contact.phone}
              </a>{" "}
              oder{" "}
              <Link href="/kontakt" className="underline underline-offset-4 hover:text-deep">
                schreib uns
              </Link>
              .
            </p>
          </div>

          <figure className="surface bg-paper m-0">
            <Image
              src={site.images.hero.src}
              alt={site.images.hero.alt}
              width={site.images.hero.width}
              height={site.images.hero.height}
              priority
              className="w-full h-auto"
              style={{ aspectRatio: `${site.images.hero.width} / ${site.images.hero.height}` }}
              sizes="(min-width: 1024px) 34rem, 100vw"
            />
            <div className="border-t border-rule">
              <Suspense fallback={<NextSlotSkeleton />}>
                <NextSlotPanel />
              </Suspense>
            </div>
          </figure>
        </div>
      </section>

      <section className="bg-paper border-y border-rule">
        <div className="shell band">
          <div className="md:flex md:items-end md:justify-between md:gap-10">
            <h2 className="text-title max-w-[22ch]">Kurse und Fahrstunden, alles an einem Ort.</h2>
            <p className="text-slate mt-3 md:mt-0 max-w-[40ch]">
              Du meldest dich einmal an und machst alles bei denselben Leuten in {site.contact.city}.
            </p>
          </div>

          <ul className="mt-8 md:mt-12 border-t border-rule">
            {OFFERS.map((offer) => {
              const price = prices.get(offer.slug);
              return (
                <li key={offer.href} className="border-b border-rule">
                  <Link
                    href={offer.href}
                    className="group grid gap-x-8 gap-y-2 py-6 md:py-8 md:grid-cols-[minmax(0,1fr)_14rem_9rem] md:items-baseline"
                  >
                    <div className="min-w-0">
                      <h3 className="font-display text-2xl md:text-3xl font-bold leading-tight group-hover:text-signal-ink transition-colors">
                        {offer.title}
                      </h3>
                      <p className="text-slate mt-1.5 max-w-[52ch]">{offer.body}</p>
                    </div>
                    <p className="text-fine text-slate">{offer.meta}</p>
                    {price && (
                      <p className="md:text-right">
                        {price.final < price.regular && (
                          <span className="nums text-fine text-slate line-through mr-2">
                            {formatChf(price.regular)}
                          </span>
                        )}
                        <span className="nums font-display font-bold text-xl">CHF {formatChf(price.final)}</span>
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="text-fine text-slate mt-5">
            Noch unsicher? Die{" "}
            <Link href="/buchen?angebot=schnupperstunde" className="font-semibold text-deep underline underline-offset-4">
              Schnupperstunde
            </Link>{" "}
            ist eine einzelne Lektion zum Kennenlernen, ohne Verpflichtung.
          </p>
        </div>
      </section>

      {/* Der Weg zum Ausweis als Fahrbahn: die Reihenfolge ist die
          Mittellinie, die Schritte sind Halte. Rot heisst: machst du mit
          uns. */}
      <section className="bg-deep text-paper on-signal">
        <div className="shell band">
          <div className="md:flex md:items-end md:justify-between md:gap-10">
            <div>
              <h2 className="text-title max-w-[18ch]">Vom ersten Kurs bis zum Ausweis.</h2>
              <p className="text-paper/75 mt-3 max-w-[50ch]">
                Sieben Schritte, in dieser Reihenfolge. Die meisten brauchen dafür sechs bis zwölf
                Monate. Die roten machst du mit uns.
              </p>
            </div>
            <Link
              href="/ausbildungsweg"
              className="btn btn-outline border-paper/40 text-paper hover:bg-paper/10 hover:border-paper mt-6 md:mt-0 shrink-0"
            >
              Alle Schritte im Detail
            </Link>
          </div>

          <ol className="road mt-10 md:mt-14">
            {site.path.map((step) => (
              <li key={step.title}>
                <span className={`road-stop ${step.withUs ? "road-stop-us" : ""}`} aria-hidden="true" />
                <h3 className="text-base leading-snug break-normal">
                  {"short" in step ? step.short : step.title}
                  {step.withUs && <span className="sr-only"> (mit uns)</span>}
                </h3>
                <p className="text-fine text-paper/65 mt-1">{step.meta}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="shell band">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14">
          <div>
            <h2 className="text-title max-w-[14ch]">{site.philosophy.title}</h2>
            <p className="text-slate mt-4 max-w-[46ch]">{site.philosophy.body}</p>
          </div>
          <dl className="grid gap-6 sm:grid-cols-3 sm:gap-8 content-start">
            {site.reasons.map((reason) => (
              <div key={reason.title} className="border-t-2 border-deep pt-4">
                <dt className="font-bold leading-snug">{reason.title}</dt>
                <dd className="text-slate text-fine mt-2 m-0">{reason.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-paper border-t border-rule">
        <div className="shell py-10 md:py-12">
          <div className="md:flex md:items-center md:justify-between md:gap-10">
            <div>
              <h2 className="text-title max-w-[18ch]">Such dir einen Termin aus.</h2>
              <p className="text-slate mt-2 max-w-[52ch]">
                Im Kalender siehst du, wann Christina frei ist, und buchst gleich selbst. Absagen
                kannst du bis 24 Stunden vorher kostenlos.
              </p>
            </div>
            <Link href="/buchen" className="btn btn-primary mt-6 md:mt-0 shrink-0">
              Termin buchen
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
