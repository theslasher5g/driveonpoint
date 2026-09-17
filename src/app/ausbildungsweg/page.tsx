import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weg zum Führerausweis",
  description:
    "Nothilfekurs, Sehtest, Theorieprüfung, VKU, Fahrstunden, praktische Prüfung, WAB — die sieben Schritte zum Führerausweis Kategorie B in der Schweiz.",
  alternates: { canonical: "/ausbildungsweg" },
};

export default function AusbildungswegPage() {
  return (
    <>
      <PageHeader
        title="Der Weg zum Führerausweis"
        lead="Sieben Schritte, und sie bauen aufeinander auf. Wer die Reihenfolge kennt, spart sich Monate — der häufigste Fehler ist, den VKU zu spät zu buchen."
        action={{ href: "/buchen", label: "Mit Schritt eins beginnen" }}
      />

      <section className="shell py-14 md:py-20">
        {/*
          Hier wird die durchlaufende Markierung zur Zeitachse: dieselbe
          Linie wie überall, nur trägt sie jetzt die Schrittnummern.
          Nummeriert ist das, weil es tatsächlich eine Reihenfolge ist.
        */}
        <ol className="timeline">
          {site.path.map((step, index) => (
            <li key={step.title}>
              <span className="timeline-mark nums text-base md:text-lg" aria-hidden="true">
                {index + 1}
              </span>
              <h2 className="text-section stretch-wide leading-none pt-1">
                <span className="sr-only">Schritt {index + 1}: </span>
                {step.title}
              </h2>
              <p className="nums text-fine text-slate mt-2">{step.meta}</p>
              <p className="text-slate mt-3 max-w-[58ch]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-paper">
        <div className="shell py-14 md:py-20">
          <div className="lane">
            <h2 className="text-section max-w-[22ch]">Zwei Dinge, die oft schiefgehen</h2>
            <div className="mt-7 grid gap-8 sm:grid-cols-2 max-w-4xl">
              <div>
                <h3 className="text-lg">Der Lernfahrausweis läuft ab</h3>
                <p className="text-slate mt-2">
                  Er gilt zwei Jahre. Wer die praktische Prüfung bis dahin nicht bestanden hat,
                  muss die Theorieprüfung wiederholen. Plane die Fahrstunden also nicht ans Ende.
                </p>
              </div>
              <div>
                <h3 className="text-lg">Der VKU ist ausgebucht</h3>
                <p className="text-slate mt-2">
                  Kurse sind besonders vor den Sommerferien früh voll. Buche den VKU, sobald du
                  den Lernfahrausweis beantragt hast — nicht erst, wenn die Fahrstunden laufen.
                </p>
              </div>
            </div>

            <Link href="/buchen" className="btn btn-primary mt-10">
              Termin buchen
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
