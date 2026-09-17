import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { NextSlotPanel, NextSlotSkeleton } from "@/components/next-slot";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Die drei Stufen sind durchnummeriert, weil sie tatsächlich aufeinander
 * folgen: ohne Nothilfekurs keine Theorieprüfung, ohne VKU keine praktische
 * Prüfung. Bei den Gründen weiter unten wird nicht nummeriert — die sind
 * keine Reihenfolge.
 */
const STAGES = [
  {
    href: "/nothilfekurs",
    step: site.offers.nothilfekurs.step,
    title: site.offers.nothilfekurs.title,
    meta: `${site.offers.nothilfekurs.duration}, ab ${site.offers.nothilfekurs.minAge}`,
    body: site.offers.nothilfekurs.lead,
  },
  {
    href: "/vku",
    step: site.offers.vku.step,
    // In der schmalen Karte passt das ganze Wort nicht in eine Zeile und
    // bräche ohne Trennstrich mitten im Wort um.
    title: "Verkehrskunde",
    meta: "8 Lektionen an 4 Abenden",
    body: site.offers.vku.lead,
  },
  {
    href: "/fahrstunden",
    step: site.offers.fahrstunden.step,
    title: site.offers.fahrstunden.title,
    meta: "45 Minuten je Lektion",
    body: site.offers.fahrstunden.lead,
  },
];

export default function HomePage() {
  return (
    <>
      <section className="bg-deep text-paper on-signal overflow-hidden">
        <div className="shell pt-14 pb-16 md:pt-24 md:pb-24">
          <div className="lane lane-draws text-paper">
            <div className="flex items-start justify-between gap-5 md:gap-8">
              <h1 className="text-display max-w-[14ch] min-w-0">
                {site.hero.headline[0]}
                <br />
                {site.hero.headline[1]}
              </h1>
              <BrandMark className="w-16 md:w-28" tone="invert" />
            </div>

            <p className="text-lead text-paper/80 max-w-[54ch] mt-7 md:mt-9">{site.hero.lead}</p>

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
          <h2 className="text-title max-w-[16ch]">Drei Stufen zum Ausweis.</h2>
          <p className="text-slate text-lead mt-5 max-w-[56ch]">
            Sie bauen aufeinander auf, und bei uns bekommst du alle drei aus einer Hand — du
            musst nichts davon zweimal organisieren.
          </p>

          <ol className="grid gap-4 mt-10 md:mt-14 sm:grid-cols-3">
            {STAGES.map((stage, index) => (
              <li key={stage.href} className="flex">
                <Link
                  href={stage.href}
                  className="group surface bg-paper hover:bg-signal-tint transition-colors p-6 md:p-7 flex flex-col w-full"
                >
                  <span className="chip chip-quiet self-start nums">
                    {String(index + 1).padStart(2, "0")} · {stage.step}
                  </span>
                  <h3 className="text-section stretch-wide font-extrabold leading-none mt-4">
                    {stage.title}
                  </h3>
                  <p className="nums text-fine text-slate mt-2">{stage.meta}</p>
                  <p className="text-slate mt-4 flex-1">{stage.body}</p>
                  <span className="font-bold text-signal-ink mt-6 underline-offset-4 group-hover:underline">
                    Mehr dazu
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-paper">
        <div className="shell py-16 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:items-center">
            <div className="lane">
              <h2 className="text-title max-w-[16ch]">{site.philosophy.title}</h2>
              <p className="text-lead text-slate mt-6 max-w-[54ch]">{site.philosophy.body}</p>
              <ul className="flex flex-wrap gap-2 mt-7">
                {site.philosophy.tags.map((tag) => (
                  <li key={tag} className="chip chip-quiet">
                    {tag}
                  </li>
                ))}
              </ul>

              <dl className="mt-11 space-y-7">
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
              className="w-full h-auto surface"
              sizes="(min-width: 1024px) 44vw, 100vw"
            />
          </div>
        </div>
      </section>

      <section className="shell py-16 md:py-24">
        <div className="lane">
          <h2 className="text-title max-w-[17ch]">Vom ersten Kurs bis zum Ausweis.</h2>
          <p className="text-slate text-lead mt-5 max-w-[56ch]">
            Sieben Schritte, in dieser Reihenfolge. Die meisten brauchen dafür sechs bis zwölf
            Monate — bei dir so lange, wie du brauchst.
          </p>

          <ol className="mt-10 md:mt-12 border-t border-deep/12">
            {site.path.slice(0, 4).map((step, index) => (
              <li
                key={step.title}
                className="border-b border-deep/12 py-5 flex gap-5 sm:gap-8 items-baseline"
              >
                <span className="nums stretch-wide font-extrabold text-signal-ink text-xl sm:text-2xl w-8 shrink-0">
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
              Du siehst direkt, wann Christina und Jolanda frei sind. Keine Rückrufe, keine
              Warteschleife — und absagen kannst du bis 24 Stunden vorher kostenlos.
            </p>
            <div className="flex flex-wrap gap-3 mt-9">
              <Link href="/buchen" className="btn btn-primary">
                Termin buchen
              </Link>
              <Link
                href="/preise"
                className="btn btn-outline border-paper/40 text-paper hover:bg-paper/10 hover:border-paper"
              >
                Preise ansehen
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
