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

      <section className="shell band">
        {/*
          Hier wird die durchlaufende Markierung zur Zeitachse: dieselbe
          Linie wie überall, nur trägt sie jetzt die Schrittnummern.
          Nummeriert ist das, weil es tatsächlich eine Reihenfolge ist.

          Dauer und Ort stehen ab 640px rechts auf der Höhe des Titels statt
          auf einer eigenen Zeile darunter — wie in der Kurzfassung auf der
          Startseite. Auf dem Telefon bleibt dafür kein Platz: "Verkehrs-
          kundeunterricht" neben "8 Lektionen an 4 Abenden" brach mitten im
          Wort um, weil beide sich eine viel zu schmale Zeile teilen mussten
          — nicht nur bei diesem Titel, sondern bei praktisch jedem.
        */}
        <ol className="timeline">
          {site.path.map((step, index) => (
            <li key={step.title}>
              <span className="timeline-mark nums text-base md:text-lg" aria-hidden="true">
                {index + 1}
              </span>
              <div className="max-w-3xl">
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-1 sm:items-baseline">
                  <h2 className="text-section stretch-wide leading-tight sm:flex-1 sm:min-w-0">
                    <span className="sr-only">Schritt {index + 1}: </span>
                    {step.title}
                  </h2>
                  <p className="nums text-fine text-slate sm:shrink-0 break-normal">{step.meta}</p>
                </div>
                <p className="text-slate text-fine mt-1.5 max-w-[62ch]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-paper">
        <div className="shell band">
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
