import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termin gebucht",
  robots: { index: false, follow: false },
};

type Params = Promise<{ ref?: string }>;

export default async function BestaetigtPage({ searchParams }: { searchParams: Params }) {
  const { ref } = await searchParams;

  // Die Referenz wird nur angezeigt, nicht nachgeschlagen. Sonst liesse sich
  // durch Raten von Kürzeln fremden Terminen die Anzeige entlocken.
  const reference = typeof ref === "string" ? ref.replace(/[^A-Z0-9-]/gi, "").slice(0, 12) : "";

  return (
    <>
      <section className="bg-concrete border-b border-deep/12">
        <div className="shell py-10 md:py-14">
          <div className="lane sm:flex sm:items-start sm:justify-between sm:gap-10">
            <div>
              <h1 className="text-title max-w-[16ch]">Der Termin gehört dir.</h1>
              <p className="text-lead text-slate mt-4 max-w-[54ch]">
                Wir haben dir eine Bestätigung geschickt. Darin steht auch der Link, mit dem du
                bis 24 Stunden vorher kostenlos absagen kannst.
              </p>
            </div>

            {/* Der gestempelte Beleg. Die Referenz steht darin, nicht daneben —
                im Papierbetrieb stempelt man auf den Vorgang, nicht neben ihn. */}
            <p className="stamp shrink-0 mt-7 sm:mt-1">
              <span className="stamp-word">Bestätigt</span>
              {reference && <span className="stamp-line">{reference}</span>}
            </p>
          </div>
        </div>
      </section>

      <section className="shell band">
        <div className="lane max-w-2xl">
          <h2 className="text-section">Keine Mail bekommen?</h2>
          <p className="text-slate mt-4">
            Schau zuerst im Spam-Ordner nach. Kommt trotzdem nichts an, ruf uns an — der Termin
            steht auch ohne Mail, wir brauchen dann nur deine Referenz.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <a href={`tel:${site.contact.phoneHref}`} className="btn btn-primary">
              {site.contact.phone}
            </a>
            <Link href="/" className="btn btn-outline">
              Zur Startseite
            </Link>
          </div>

          <h2 className="text-section mt-14">Was du zum Termin mitbringst</h2>
          <ul className="border-t border-deep/15 mt-5">
            {[
              ["Lernfahrausweis", "Bei Fahrstunden zwingend. Ohne ihn dürfen wir nicht losfahren."],
              ["Identitätskarte oder Pass", "Bei Kursen zur Kontrolle der Anwesenheit."],
              ["Festes Schuhwerk", "Keine Flipflops, keine dicken Sohlen."],
            ].map(([title, body]) => (
              <li key={title} className="border-b border-deep/15 py-4">
                <h3 className="text-base">{title}</h3>
                <p className="text-slate mt-1">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
