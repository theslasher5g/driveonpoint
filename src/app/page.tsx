import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { NextSlotPanel, NextSlotSkeleton } from "@/components/next-slot";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Die drei Stufen sind durchnummeriert, weil sie tatsächlich aufeinander
 * folgen: ohne Nothilfekurs keine Theorieprüfung, ohne VKU keine praktische
 * Prüfung. Bei den Gründen weiter unten wird nicht nummeriert — die sind
 * keine Reihenfolge.
 */
/*
 * `body` ist bewusst nicht der lange Einleitungstext der jeweiligen
 * Unterseite: drei Absätze unterschiedlicher Länge nebeneinander ergeben drei
 * verschieden tiefe Karten, durch die man liest statt sie zu überfliegen. Hier
 * steht je ein Satz, der sagt, worum es geht — alles Weitere auf der Seite
 * dahinter.
 */
const STAGES = [
  {
    href: "/nothilfekurs",
    step: site.offers.nothilfekurs.step,
    title: site.offers.nothilfekurs.title,
    meta: `${site.offers.nothilfekurs.duration}, ab ${site.offers.nothilfekurs.minAge}`,
    body: "Richtig handeln, bis der Rettungsdienst da ist. Pflicht vor der Theorieprüfung.",
  },
  {
    href: "/vku",
    step: site.offers.vku.step,
    // In der schmalen Karte passt das ganze Wort nicht in eine Zeile und
    // bräche ohne Trennstrich mitten im Wort um.
    title: "Verkehrskunde",
    meta: "8 Lektionen an 4 Abenden",
    body: "Gefahren früh erkennen und einschätzen. Pflicht vor der praktischen Prüfung.",
  },
  {
    href: "/fahrstunden",
    step: site.offers.fahrstunden.step,
    title: site.offers.fahrstunden.title,
    meta: "45 Minuten je Lektion",
    body: "Einzeln oder im Abo, in deinem Tempo — von der ersten Stunde bis zur Prüfung.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Aufmacher und der nächste freie Termin stehen ab 1024px nebeneinander.
          Vorher lagen Schlagzeile, Einleitung, Terminkarte und Telefonzeile
          untereinander — zusammen mehr als ein Bildschirm, bevor überhaupt
          etwas Buchbares zu sehen war. */}
      <section
        className="relative text-paper on-signal overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 140% at 82% 8%, #ff5a4f 0%, #c81e1e 32%, #341f1d 62%, #1c1a19 100%)",
        }}
      >
        {/* Weicher zweiter Lichtpunkt unten links, rein dekorativ — damit
            die Glasfläche der Terminkarte etwas zum Brechen hat, auch wenn
            das Fenster schmal ist und der erste Verlauf dort ausläuft. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-24 w-96 h-96 rounded-full opacity-40 blur-3xl"
          style={{ background: "#ff847a" }}
        />
        <div className="shell pt-24 pb-14 md:pt-32 md:pb-20 lg:pt-36 lg:pb-24">
          <div className="lane text-paper lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14 lg:items-center">
            <div className="min-w-0">
              {/* Keine zweite Marke neben der Schlagzeile: seit die Kopfzeile
                  schwebt, steht das Zeichen direkt darüber schon einmal. */}
              <h1 className="text-display max-w-[15ch] min-w-0">
                {site.hero.headline[0]}
                <br />
                {site.hero.headline[1]}
              </h1>

              <p className="text-lead text-paper/80 max-w-[46ch] mt-6 md:mt-8">
                {site.hero.lead}
              </p>

              <p className="text-fine text-paper/70 mt-6 max-w-[48ch]">
                Lieber zuerst reden? {site.contact.phone} — oder{" "}
                <Link href="/kontakt" className="underline underline-offset-4 hover:text-paper">
                  schreib uns
                </Link>
                .
              </p>
            </div>

            <div className="mt-10 lg:mt-0">
              <Suspense fallback={<NextSlotSkeleton />}>
                <NextSlotPanel />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      {/* Statt drei gleich grosser Karten nebeneinander: eine Zeile pro
          Stufe, volle Breite, mit der Zahl riesig und blass im Hintergrund.
          Das zeigt dieselbe Reihenfolge, aber jede Stufe bekommt für einen
          Moment die ganze Aufmerksamkeit statt ein Drittel der Zeile. */}
      <section className="shell band">
        <div className="lane">
          <h2 className="text-title max-w-[16ch]">Drei Stufen zum Ausweis.</h2>
          <p className="text-slate text-lead mt-3 max-w-[46ch]">
            Sie bauen aufeinander auf, und bei uns bekommst du alle drei aus einer Hand — du
            musst nichts davon zweimal organisieren.
          </p>

          <ol className="mt-10 md:mt-14 border-t border-deep/10">
            {STAGES.map((stage, index) => (
              <li key={stage.href} className="border-b border-deep/10">
                <Link
                  href={stage.href}
                  className="group relative grid md:grid-cols-[1fr_auto] items-center gap-3 md:gap-8 py-8 md:py-12 overflow-hidden"
                >
                  <span
                    aria-hidden="true"
                    className="font-display pointer-events-none select-none absolute -top-2 right-0 md:right-4 text-[5.5rem] md:text-[9rem] leading-none font-bold text-signal/[0.08] group-hover:text-signal/[0.14] transition-colors"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="relative min-w-0">
                    <span className="chip chip-quiet">{stage.step}</span>
                    <h3 className="font-display text-2xl md:text-4xl font-bold leading-tight mt-3">
                      {stage.title}
                    </h3>
                    <p className="text-slate mt-2 max-w-[48ch]">{stage.body}</p>
                  </div>

                  <div className="relative flex items-center gap-5 md:gap-8 shrink-0">
                    <span className="nums text-fine text-slate whitespace-nowrap">
                      {stage.meta}
                    </span>
                    <span
                      aria-hidden="true"
                      className="grid place-items-center w-11 h-11 rounded-full border border-deep/15 text-deep shrink-0 group-hover:bg-signal group-hover:border-signal group-hover:text-deep transition-colors"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path
                          d="M4 9h10M9 4l5 5-5 5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-paper">
        <div className="shell band">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:items-center">
            <div className="lane">
              <h2 className="text-title max-w-[16ch]">{site.philosophy.title}</h2>
              <p className="text-slate mt-4 max-w-[52ch]">{site.philosophy.body}</p>
              <ul className="flex flex-wrap gap-2 mt-5">
                {site.philosophy.tags.map((tag) => (
                  <li key={tag} className="chip chip-quiet">
                    {tag}
                  </li>
                ))}
              </ul>

              <dl className="mt-7 space-y-4">
                {site.reasons.map((reason) => (
                  <div key={reason.title}>
                    <dt className="font-bold leading-snug">{reason.title}</dt>
                    <dd className="text-slate text-fine mt-1 max-w-[54ch]">{reason.body}</dd>
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

      <section className="shell band">
        <div className="lane split">
          <div className="split-head-sticky">
            <h2 className="text-title max-w-[15ch]">Vom ersten Kurs bis zum Ausweis.</h2>
            <p className="text-slate text-fine mt-3 max-w-[38ch]">
              Sieben Schritte, in dieser Reihenfolge. Die meisten brauchen dafür sechs bis zwölf
              Monate — bei dir so lange, wie du brauchst.
            </p>
            <Link href="/ausbildungsweg" className="btn btn-outline mt-5 py-2.5 px-4 text-fine">
              Alle sieben Schritte
            </Link>
          </div>

          <ol className="border-t border-deep/12 min-w-0">
            {site.path.slice(0, 4).map((step, index) => (
              <li
                key={step.title}
                className="border-b border-deep/12 py-3.5 flex gap-4 sm:gap-6 items-baseline"
              >
                <span className="nums stretch-wide font-extrabold text-signal-ink text-lg w-6 shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base">{step.title}</h3>
                  <p className="text-slate text-fine mt-0.5 max-w-[58ch]">{step.body}</p>
                </div>
                {/* break-normal, weil die Grundregeln der Seite lange
                    Komposita notfalls mitten im Wort trennen — in dieser
                    schmalen rechten Spalte sähe das nach einem Fehler aus. */}
                <span className="text-fine text-slate ml-auto shrink-0 hidden md:block text-right max-w-[19ch] break-normal">
                  {step.meta}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Abschlussaufruf: Text links, Knöpfe rechts — zusammen ein flaches
          Band statt einer weiteren gestapelten Seitenhöhe. */}
      <section className="bg-deep text-paper on-signal">
        <div className="shell band">
          <div className="lane text-paper md:flex md:items-end md:justify-between md:gap-10">
            <div>
              <h2 className="text-title max-w-[15ch]">Such dir einen Termin aus.</h2>
              <p className="text-paper/80 mt-3 max-w-[50ch]">
                Du siehst direkt, wann Christina und Jolanda frei sind. Keine Rückrufe, keine
                Warteschleife — und absagen kannst du bis 24 Stunden vorher kostenlos.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 mt-6 md:mt-0 shrink-0">
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
