import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/page-header";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

/*
 * Vorlage für ein Einzelunternehmen ohne Handelsregistereintrag — passend,
 * solange die Fahrschule nicht als GmbH oder AG geführt wird und der
 * Jahresumsatz unter der Eintragungspflicht (aktuell CHF 100'000) liegt.
 * Wird daraus einmal eine eingetragene Firma oder kommt die Umsatzgrenze
 * in Sicht, gehören eine UID-Nummer und ein Handelsregisterabschnitt hier
 * wieder hinein — vorher würde eine erfundene Nummer nur eine Eintragung
 * vortäuschen, die es nicht gibt.
 *
 * Vor dem Aufschalten müssen die mit ### markierten Angaben in
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
            <h2 className="text-lg mb-2">Verantwortliche Person</h2>
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
            <h2 className="text-lg mb-2">Rechtsform</h2>
            <p className="text-slate">
              Einzelunternehmen. Kein Eintrag im Handelsregister.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Bewilligung</h2>
            <p className="text-slate">
              Die Fahrlehrertätigkeit setzt eine kantonale Bewilligung nach der eidgenössischen
              Fahrlehrerverordnung voraus.
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
              Zustimmung.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
