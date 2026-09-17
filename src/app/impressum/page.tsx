import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/page-header";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

/*
 * Vorlage. Vor dem Aufschalten müssen die mit ### markierten Angaben in
 * src/lib/site.ts durch die echten ersetzt und der Text von einer
 * rechtskundigen Person geprüft werden.
 */

export const metadata: Metadata = {
  title: "Impressum",
  description: `Impressum und Kontaktangaben von ${site.legalName}.`,
  alternates: { canonical: "/impressum" },
};

export default function ImpressumPage() {
  return (
    <>
      <PageHeader
        title="Impressum"
        lead="Verantwortlich für diese Website und die hier angebotenen Leistungen."
      />

      <Section>
        <div className="prose-column space-y-8">
          <div>
            <h2 className="text-lg mb-2">Betreiberin</h2>
            <address className="not-italic text-slate">
              {site.legalName}
              <br />
              {site.contact.street}
              <br />
              {site.contact.zip} {site.contact.city}
              <br />
              Schweiz
            </address>
          </div>

          <div>
            <h2 className="text-lg mb-2">Kontakt</h2>
            <p className="text-slate">
              Telefon{" "}
              <a href={`tel:${site.contact.phoneHref}`} className="underline underline-offset-4">
                {site.contact.phone}
              </a>
              <br />
              Mail{" "}
              <a href={`mailto:${site.contact.email}`} className="underline underline-offset-4">
                {site.contact.email}
              </a>
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Handelsregister</h2>
            <p className="text-slate">
              Unternehmens-Identifikationsnummer {site.contact.uid}
              <br />
              Eingetragen im Handelsregister des Kantons Zürich.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Bewilligung</h2>
            <p className="text-slate">
              Die Fahrlehrertätigkeit wird aufgrund einer kantonalen Bewilligung nach der
              Fahrlehrerverordnung des Bundes ausgeübt. Die Bewilligung liegt am Geschäftssitz zur
              Einsicht auf.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Haftung für Inhalte</h2>
            <p className="text-slate">
              Die Inhalte dieser Website werden mit Sorgfalt erstellt. Für Richtigkeit,
              Vollständigkeit und Aktualität wird keine Gewähr übernommen. Verbindlich sind die
              Auskünfte der zuständigen Strassenverkehrsämter und die jeweils geltenden
              eidgenössischen Vorschriften.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Haftung für Links</h2>
            <p className="text-slate">
              Verweise auf Websites Dritter liegen ausserhalb unseres Verantwortungsbereichs. Für
              deren Inhalte wird jede Verantwortung abgelehnt.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Urheberrecht</h2>
            <p className="text-slate">
              Texte, Bilder und Gestaltung dieser Website sind urheberrechtlich geschützt. Eine
              Verwendung ausserhalb der gesetzlichen Schranken bedarf der vorgängigen schriftlichen
              Zustimmung der Betreiberin.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
