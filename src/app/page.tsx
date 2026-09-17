import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { NextSlotPanel, NextSlotSkeleton } from "@/components/next-slot";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <section className="bg-signal text-paper on-signal overflow-hidden">
        <div className="shell pt-14 pb-16 md:pt-24 md:pb-24">
          <div className="lane lane-draws text-paper">
            <div className="flex items-start justify-between gap-5 md:gap-8">
              <h1 className="text-display max-w-[14ch] min-w-0">
                {site.hero.headline[0]}
                <br />
                {site.hero.headline[1]}
              </h1>
              <span
                className="l-plate w-16 h-16 md:w-32 md:h-32 text-4xl md:text-7xl shrink-0"
                aria-hidden="true"
              >
                L
              </span>
            </div>

            <p className="text-lead text-paper/85 max-w-[52ch] mt-7 md:mt-9">{site.hero.lead}</p>

            <div className="mt-10 md:mt-12">
              <Suspense fallback={<NextSlotSkeleton />}>
                <NextSlotPanel />
              </Suspense>
            </div>

            <p className="text-fine text-paper/70 mt-5 max-w-[48ch]">
              Lieber zuerst reden? {site.contact.phone} — oder{" "}
              <Link href="/kontakt" className="underline underline-offset-4 hover:text-paper">
                schreib uns
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="shell py-16 md:py-24">
        <div className="lane">
          <h2 className="text-title max-w-[16ch]">Drei Dinge, die du brauchst.</h2>
          <p className="text-slate text-lead mt-5 max-w-[56ch]">
            Für den Führerausweis Kategorie B verlangt der Bund dreierlei. Bei uns bekommst du
            alles aus einer Hand — und musst nichts davon zweimal organisieren.
          </p>

          <div className="grid gap-px bg-deep/15 mt-10 md:mt-14 sm:grid-cols-3 border border-deep/15">
            <OfferBlock
              href="/fahrstunden"
              title="Fahrstunden"
              meta="45 Minuten je Lektion"
              body="Einzelunterricht im Schulfahrzeug, immer bei derselben Person. Abholung im Einzugsgebiet inbegriffen."
            />
            <OfferBlock
              href="/vku"
              title="Verkehrskunde"
              meta="8 Lektionen, 4 Abende"
              body="Der obligatorische VKU. Ohne ihn lässt dich das Strassenverkehrsamt nicht zur praktischen Prüfung antreten."
            />
            <OfferBlock
              href="/nothelfer"
              title="Nothelferkurs"
              meta="10 Stunden, 1 Wochenende"
              body="Lebensrettende Sofortmassnahmen. Der Ausweis gilt sechs Jahre und wird für den Lernfahrausweis verlangt."
            />
          </div>
        </div>
      </section>

      <section className="bg-paper">
        <div className="shell py-16 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:items-center">
            <div className="lane">
              <h2 className="text-title max-w-[18ch]">Warum es bei uns schneller geht.</h2>
              <dl className="mt-9 space-y-7">
                {site.reasons.map((reason) => (
                  <div key={reason.title}>
                    <dt className="font-bold text-lg leading-snug">{reason.title}</dt>
                    <dd className="text-slate mt-1.5 max-w-[54ch]">{reason.body}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <Image
              src={site.images.hero.src}
              alt={site.images.hero.alt}
              width={site.images.hero.width}
              height={site.images.hero.height}
              className="w-full h-auto"
              sizes="(min-width: 1024px) 44vw, 100vw"
              priority={false}
            />
          </div>
        </div>
      </section>

      <section className="shell py-16 md:py-24">
        <div className="lane">
          <h2 className="text-title max-w-[17ch]">Vom ersten Kurs bis zum Ausweis.</h2>
          <p className="text-slate text-lead mt-5 max-w-[56ch]">
            Sieben Schritte, in dieser Reihenfolge. Die meisten brauchen dafür sechs bis zwölf
            Monate.
          </p>

          <ol className="mt-10 md:mt-12 border-t border-deep/15">
            {site.path.slice(0, 4).map((step, index) => (
              <li
                key={step.title}
                className="border-b border-deep/15 py-5 flex gap-5 sm:gap-8 items-baseline"
              >
                <span className="nums stretch-wide font-extrabold text-signal text-xl sm:text-2xl w-8 shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg">{step.title}</h3>
                  <p className="text-slate mt-1 max-w-[58ch]">{step.body}</p>
                </div>
                <span className="text-fine text-slate ml-auto shrink-0 hidden md:block text-right max-w-[15ch]">
                  {step.meta}
                </span>
              </li>
            ))}
          </ol>

          <Link href="/ausbildungsweg" className="btn btn-outline mt-8">
            Alle sieben Schritte ansehen
          </Link>
        </div>
      </section>

      <section className="bg-deep text-paper on-signal">
        <div className="shell py-16 md:py-24">
          <div className="lane text-paper">
            <h2 className="text-title max-w-[15ch]">Such dir einen Termin aus.</h2>
            <p className="text-lead text-paper/80 mt-5 max-w-[52ch]">
              Du siehst direkt, wann welche Fahrlehrerin frei ist. Keine Rückrufe, keine
              Warteschleife — und absagen kannst du bis 24 Stunden vorher kostenlos.
            </p>
            <div className="flex flex-wrap gap-3 mt-9">
              <Link href="/buchen" className="btn btn-invert">
                Termin buchen
              </Link>
              <Link href="/preise" className="btn btn-outline border-paper/40 text-paper hover:bg-paper/10 hover:border-paper">
                Preise ansehen
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function OfferBlock({
  href,
  title,
  meta,
  body,
}: {
  href: string;
  title: string;
  meta: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-concrete hover:bg-paper transition-colors p-6 md:p-8 flex flex-col"
    >
      <h3 className="text-section stretch-wide font-extrabold leading-none">{title}</h3>
      <p className="nums text-fine text-slate mt-2">{meta}</p>
      <p className="text-slate mt-4 flex-1">{body}</p>
      <span className="font-bold text-signal mt-6 underline-offset-4 group-hover:underline">
        Mehr dazu
      </span>
    </Link>
  );
}
