import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

/*
 * Vorlage nach revDSG (Schweiz) und DSGVO. Sie beschreibt, was diese
 * Anwendung tatsächlich tut. Wird die Verarbeitung geändert — etwa ein
 * Zahlungsdienst oder eine Statistik eingebaut —, muss dieser Text
 * mitgeändert und von einer rechtskundigen Person geprüft werden.
 */

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description:
    "Welche Personendaten diese Website bearbeitet, wie lange sie gespeichert werden und welche Rechte betroffene Personen haben.",
  alternates: { canonical: "/datenschutz" },
};

export default function DatenschutzPage() {
  return (
    <>
      <PageHeader
        title="Datenschutz"
        lead="Kurz gesagt: Wir speichern nur, was für einen Termin nötig ist, geben nichts an Dritte weiter und löschen alles nach 30 Tagen automatisch."
      />

      <Section>
        <div className="prose-column space-y-8">
          <div>
            <h2 className="text-lg mb-2">Verantwortliche Stelle</h2>
            <address className="not-italic text-slate">
              {site.legalName}
              <br />
              {site.contact.street}, {site.contact.zip} {site.contact.city}
              <br />
              <a href={`mailto:${site.contact.email}`} className="underline underline-offset-4">
                {site.contact.email}
              </a>
            </address>
          </div>

          <div>
            <h2 className="text-lg mb-2">Welche Daten wir bearbeiten</h2>
            <p className="text-slate mb-3">
              Bei einer Buchung erheben wir Name, Mailadresse und Telefonnummer sowie die von dir
              gewählte Lektionsart und den Termin. Eine freiwillige Bemerkung wird mitgespeichert.
              Beim Kontaktformular erheben wir Name, Mailadresse, freiwillig die Telefonnummer und
              den Text deiner Nachricht.
            </p>
            <p className="text-slate">
              Der Webserver protokolliert technisch bedingt IP-Adresse, Zeitpunkt und
              aufgerufene Seite. Zur Abwehr von Missbrauch speichern wir zusätzlich Zeitstempel von
              Anmelde- und Formularversuchen; IP-Adressen werden dabei nur in verschlüsselter
              Prüfsumme abgelegt und lassen sich nicht zurückrechnen.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Wozu wir sie bearbeiten</h2>
            <ul className="text-slate space-y-2 list-disc pl-5">
              <li>Um deinen Termin durchzuführen und dich bei Änderungen zu erreichen.</li>
              <li>Um die Leistung abzurechnen und die gesetzlichen Aufbewahrungspflichten zu erfüllen.</li>
              <li>Um deine Anfrage zu beantworten.</li>
              <li>Um die Website vor automatisierten Angriffen und Spam zu schützen.</li>
            </ul>
            <p className="text-slate mt-3">
              Rechtsgrundlage ist die Erfüllung des Vertrags beziehungsweise dessen Anbahnung sowie
              unser überwiegendes Interesse am sicheren Betrieb der Website.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Wie lange wir sie aufbewahren</h2>
            <p className="text-slate">
              Name, Mailadresse, Telefonnummer und Bemerkung werden 30 Tage nach dem Termin
              automatisch aus der Datenbank gelöscht. Der Termin selbst bleibt danach ohne
              Personenbezug erhalten, damit Auslastung und Umsatz nachvollziehbar bleiben. Davon
              ausgenommen sind Belege, die wir nach Artikel 958f des Obligationenrechts zehn Jahre
              aufbewahren müssen; diese liegen in der Buchhaltung, nicht in dieser Website.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Keine Weitergabe</h2>
            <p className="text-slate">
              Deine Daten liegen auf einem Server in der Schweiz und werden nicht an Dritte
              verkauft oder für Werbung genutzt. Mailversand und Datenbank laufen auf derselben,
              von uns betriebenen Infrastruktur. Als Besucherin oder Besucher dieser Website und
              als buchende Kundschaft wird nichts an Dritte übermittelt.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Zwei-Faktor-Anmeldung unserer Mitarbeitenden</h2>
            <p className="text-slate">
              Mitarbeitende können ihr Konto zusätzlich mit einer Authenticator-App (zum Beispiel
              Google Authenticator) absichern. Dieses Verfahren läuft vollständig zwischen
              unserem Server und der App auf dem eigenen Gerät ab — es wird nichts an einen
              fremden Dienst übermittelt und keine Personendaten verlassen unsere
              Infrastruktur. Betroffen sind ausschliesslich Mitarbeitende, nicht die Kundschaft.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Cookies und Statistik</h2>
            <p className="text-slate">
              Diese Website setzt keine Cookies zu Werbe- oder Statistikzwecken und bindet keine
              Analysedienste ein. Ein technisch notwendiges Cookie wird ausschliesslich für die
              Anmeldung im internen Team-Bereich gesetzt. Schriften werden von unserem eigenen
              Server geladen, nicht von Google Fonts — beim Besuch dieser Seite wird deine
              IP-Adresse also an keinen fremden Dienst übertragen.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Sicherheitsprüfung der Formulare</h2>
            <p className="text-slate">
              Statt eines Bilderrätsels lösen unsere Formulare eine Rechenaufgabe im Hintergrund.
              Sie läuft vollständig auf unserem eigenen Server und in deinem Browser. Es wird kein
              fremder Dienst eingebunden, nichts gespeichert und kein Verhalten ausgewertet.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Deine Rechte</h2>
            <p className="text-slate mb-3">
              Du kannst jederzeit Auskunft über die zu dir gespeicherten Daten verlangen sowie
              deren Berichtigung, Löschung oder Herausgabe in einem gängigen Format. Eine
              Einwilligung kannst du jederzeit widerrufen. Eine Mail an{" "}
              <a href={`mailto:${site.contact.email}`} className="underline underline-offset-4">
                {site.contact.email}
              </a>{" "}
              genügt; wir antworten innert 30 Tagen.
            </p>
            <p className="text-slate">
              Du kannst dich ausserdem beim Eidgenössischen Datenschutz- und
              Öffentlichkeitsbeauftragten beschweren. Personen mit Wohnsitz in der EU können sich
              an ihre nationale Aufsichtsbehörde wenden.
            </p>
          </div>

          <div>
            <h2 className="text-lg mb-2">Termin selbst absagen</h2>
            <p className="text-slate">
              In jeder Bestätigungsmail steht ein Link, mit dem du deinen Termin ohne Konto und
              ohne Anruf absagen kannst. Danach verliert der Link seine Gültigkeit.
            </p>
          </div>

          <p className="text-fine text-slate pt-4 border-t border-deep/15">
            Siehe auch{" "}
            <Link href="/agb" className="underline underline-offset-4 font-semibold">
              die Bedingungen
            </Link>{" "}
            und das{" "}
            <Link href="/impressum" className="underline underline-offset-4 font-semibold">
              Impressum
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
