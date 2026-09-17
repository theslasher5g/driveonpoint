import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { PriceTable } from "@/components/price-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nothelferkurs",
  description:
    "Zehn Stunden lebensrettende Sofortmassnahmen an einem Wochenende. Der Ausweis gilt sechs Jahre und wird für den Lernfahrausweis verlangt.",
  alternates: { canonical: "/nothelfer" },
};

export default function NothelferPage() {
  return (
    <>
      <PageHeader
        title="Nothelferkurs"
        lead="Zehn Stunden an einem Wochenende. Der Ausweis gilt sechs Jahre und ist die erste Hürde auf dem Weg zum Lernfahrausweis — ohne ihn nimmt das Strassenverkehrsamt dein Gesuch nicht entgegen."
        action={{ href: "/buchen?angebot=nothelfer", label: "Kursdaten ansehen" }}
      />

      <Section title="Was geübt wird">
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 max-w-4xl">
          {[
            ["Unfallstelle sichern", "Warnblinker, Weste, Pannendreieck — und wie du dich selbst nicht zum zweiten Opfer machst."],
            ["Notruf richtig absetzen", "144, 117, 118. Welche Angaben die Leitstelle braucht und in welcher Reihenfolge."],
            ["Bewusstlose Person", "Atmung prüfen, stabile Seitenlage, Atemwege freihalten."],
            ["Wiederbelebung", "Herzdruckmassage und Beatmung an der Puppe, bis der Ablauf sitzt."],
            ["Defibrillator", "Wie ein AED bedient wird. Er spricht mit dir und lässt sich nicht falsch anwenden."],
            ["Blutungen und Schock", "Druckverband anlegen, Lagerung, Wärmeerhalt bis der Rettungsdienst da ist."],
          ].map(([title, body]) => (
            <div key={title}>
              <h3 className="text-base">{title}</h3>
              <p className="text-slate mt-1">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Organisatorisches" tone="paper">
        <ul className="border-t border-deep/15 max-w-2xl">
          {[
            ["Ab welchem Alter?", "Ab 16 Jahren. Jünger geht auch, der Ausweis wird aber erst mit dem Gesuch gebraucht."],
            ["Prüfung?", "Keine. Wer durchgehend anwesend ist und mitmacht, bekommt den Ausweis am Ende des Kurses."],
            ["Kleidung", "Bequem. Es wird auf dem Boden gearbeitet."],
            ["Anerkennung", "Der Ausweis wird in der ganzen Schweiz anerkannt, auch bei anderen Fahrschulen."],
            ["Abwesenheit", "Wer einen Teil verpasst, muss ihn nachholen — die Stundenzahl ist vorgeschrieben."],
          ].map(([q, a]) => (
            <li key={q} className="border-b border-deep/15 py-4">
              <h3 className="text-base">{q}</h3>
              <p className="text-slate mt-1">{a}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Preis">
        <div className="max-w-2xl">
          <PriceTable onlySlug="nothelfer" />
          <p className="text-fine text-slate mt-5">
            Inklusive Kursunterlagen und Ausweis. Zahlbar vor Kursbeginn.
          </p>
          <Link href="/buchen?angebot=nothelfer" className="btn btn-primary mt-7">
            Zu den Kursdaten
          </Link>
        </div>
      </Section>
    </>
  );
}
