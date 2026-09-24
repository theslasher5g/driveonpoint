import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/page-header";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

/*
 * Vorlage. Absage- und Zahlungsfristen müssen mit der tatsächlichen Praxis
 * der Fahrschule übereinstimmen und von einer rechtskundigen Person geprüft
 * werden, bevor die Seite online geht.
 */

export const metadata: Metadata = {
  title: "Allgemeine Geschäftsbedingungen",
  description: `Bedingungen für Fahrstunden, Kurse und Buchungen bei ${site.legalName}.`,
  alternates: { canonical: "/agb" },
};

const CLAUSES = [
  {
    title: "Geltungsbereich",
    body: `Diese Bedingungen gelten für alle Fahrstunden, Kurse und Buchungen bei ${site.legalName}. Mit der Buchung erklärst du dich damit einverstanden. Abweichungen bedürfen der schriftlichen Bestätigung.`,
  },
  {
    title: "Zustandekommen der Buchung",
    body: "Nach einer Buchung über die Website schicken wir dir eine Mail mit einem Link. Verbindlich wird die Buchung, sobald du sie über diesen Link bestätigt und daraufhin die Bestätigungsmail erhalten hast. Bestätigst du nicht innert einer Stunde, verfällt die Buchung. Kommt keine Bestätigung an, ist der Termin nicht zustande gekommen — melde dich in diesem Fall telefonisch.",
  },
  {
    title: "Voraussetzungen für Fahrstunden",
    body: "Für Fahrstunden ist ein gültiger Lernfahrausweis zwingend. Fehlt er, kann die Lektion nicht stattfinden und wird verrechnet. Wer unter dem Einfluss von Alkohol, Medikamenten oder anderen Substanzen steht, wird nicht ans Steuer gelassen; die Lektion gilt als bezogen.",
  },
  {
    title: "Absage und Verschiebung",
    body: "Termine können bis 24 Stunden vor Beginn kostenlos abgesagt oder verschoben werden, online über den Link in der Bestätigungsmail oder telefonisch. Bei späterer Absage oder Nichterscheinen wird der volle Betrag verrechnet. Bei Krankheit mit Arztzeugnis verzichten wir auf die Verrechnung.",
  },
  {
    title: "Absage durch die Fahrschule",
    body: "Müssen wir einen Termin absagen — etwa wegen Krankheit, Unfall oder untauglicher Witterung —, informieren wir dich so früh wie möglich und bieten einen Ersatztermin an. Weitergehende Ansprüche bestehen nicht.",
  },
  {
    title: "Verspätung",
    body: "Bei Verspätung verkürzt sich die Lektion entsprechend; der volle Ansatz bleibt geschuldet. Erscheinst du mehr als 15 Minuten zu spät ohne Nachricht, gilt der Termin als nicht wahrgenommen.",
  },
  {
    title: "Preise und Zahlung",
    body: "Es gelten die zum Zeitpunkt der Buchung auf der Website ausgewiesenen Preise in Schweizer Franken. Als Kleinunternehmen ohne Eintrag im Mehrwertsteuerregister wird keine Mehrwertsteuer ausgewiesen. Fahrstunden sind nach der Lektion oder gesammelt auf Rechnung innert 30 Tagen zu bezahlen. Kurse sind vor Kursbeginn zu bezahlen; der Platz ist erst mit der Zahlung verbindlich reserviert.",
  },
  {
    title: "Rabattaktionen",
    body: "Aktionen gelten nur für Buchungen, die innerhalb des angegebenen Zeitraums getätigt werden, und lassen sich nicht kumulieren. Laufen mehrere Aktionen, gilt automatisch die für dich günstigste. Eine Barauszahlung ist ausgeschlossen.",
  },
  {
    title: "Kurse",
    body: "Nothilfekurs und Verkehrskundeunterricht setzen die vollständige Anwesenheit voraus; die Stundenzahl ist eidgenössisch vorgeschrieben. Wer Teile verpasst, holt sie in einem späteren Kurs nach. Erreicht ein Kurs die Mindestteilnehmerzahl nicht, kann er abgesagt werden; bereits bezahlte Beträge werden vollständig zurückerstattet.",
  },
  {
    title: "Prüfungsanmeldung und Prüfungsfahrzeug",
    body: "Die Anmeldung zur praktischen Prüfung erfolgt in Absprache. Wir melden dich an, wenn wir dich für bereit halten. Die Miete des Schulfahrzeugs für die Prüfung inklusive Vorbereitungszeit wird separat verrechnet und ist im Stundenansatz nicht enthalten.",
  },
  {
    title: "Haftung",
    body: "Während der Fahrstunden besteht die gesetzlich vorgeschriebene Versicherungsdeckung für das Schulfahrzeug. Für Schäden, die vorsätzlich oder grobfahrlässig verursacht werden, haftet die verursachende Person. Für Wertsachen im Fahrzeug wird keine Haftung übernommen.",
  },
  {
    title: "Datenschutz",
    body: "Personendaten werden ausschliesslich zur Abwicklung der Buchung bearbeitet und nach 30 Tagen automatisch gelöscht. Einzelheiten stehen in der Datenschutzerklärung.",
  },
  {
    title: "Anwendbares Recht und Gerichtsstand",
    body: `Es gilt schweizerisches Recht. Gerichtsstand ist ${site.contact.city}, soweit nicht zwingende gesetzliche Bestimmungen einen anderen Gerichtsstand vorschreiben.`,
  },
];

export default function AgbPage() {
  return (
    <>
      <PageHeader
        title="Bedingungen"
        lead="Was gilt, wenn du bei uns buchst. Kurz gehalten und ohne Kleingedrucktes — die wichtigste Regel ist: absagen bis 24 Stunden vorher kostet nichts."
      />

      <Section>
        <ol className="border-t border-deep/15 max-w-3xl">
          {CLAUSES.map((clause, index) => (
            <li key={clause.title} className="border-b border-deep/15 py-5 flex gap-5 sm:gap-8">
              <span className="nums stretch-wide font-extrabold text-signal-ink text-lg w-7 shrink-0">
                {index + 1}
              </span>
              <div>
                <h2 className="text-lg">{clause.title}</h2>
                <p className="text-slate mt-1.5 max-w-[62ch]">{clause.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-fine text-slate mt-8">
          Stand dieser Fassung: {new Date().getFullYear()}. Änderungen bleiben vorbehalten; für
          eine Buchung gilt die zum Zeitpunkt der Buchung veröffentlichte Fassung.
        </p>
      </Section>
    </>
  );
}
