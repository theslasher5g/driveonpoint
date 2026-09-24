import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { PriceTable } from "@/components/price-table";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const offer = site.offers.vku;

export const metadata: Metadata = {
  title: `Verkehrskundeunterricht (VKU) in ${site.contact.city}`,
  description: `${offer.lead} Kursort ${site.contact.city}.`,
  alternates: { canonical: "/vku" },
};

const EVENINGS = [
  [
    "Wahrnehmung und Blicktechnik",
    "Warum man Dinge übersieht, die eigentlich sichtbar sind — und wie man den Blick systematisch führt.",
  ],
  [
    "Physikalische Grundlagen",
    "Reaktionsweg, Bremsweg, Fliehkraft. Was die Physik im Strassenverkehr erzwingt und was nicht verhandelbar ist.",
  ],
  [
    "Partnerkunde",
    "Wie sich Velofahrende, Kinder, ältere Menschen und Lastwagen verhalten — und wo sie dich nicht sehen können.",
  ],
  [
    "Umwelt und Verantwortung",
    "Vorausschauend fahren, Treibstoff sparen, Alkohol und Medikamente, Verhalten nach einem Unfall.",
  ],
];

export default function VkuPage() {
  return (
    <>
      <PageHeader
        title={`Verkehrskundeunterricht in ${site.contact.city}`}
        lead={offer.lead}
        action={{ href: "/buchen?angebot=vku", label: "Kursdaten ansehen" }}
      />

      <Section title="Die vier Abende" tone="paper">
        <ol className="timeline max-w-3xl">
          {EVENINGS.map(([title, body], index) => (
            <li key={title}>
              <span className="timeline-mark nums text-base md:text-lg" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3 className="text-lg">{title}</h3>
                <p className="text-slate mt-1.5 max-w-[58ch]">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-fine text-slate mt-6 max-w-[58ch]">
          Die Abende bauen aufeinander auf. Wer einen verpasst, holt ihn im nächsten Kurs nach —
          die Bescheinigung gibt es erst, wenn alle vier besucht sind.
        </p>
      </Section>

      <Section title="Gut zu wissen">
        <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2 max-w-3xl">
          {[
            ["Lernfahrausweis nötig?", "Nein. Du kannst den VKU schon vorher besuchen. Viele machen ihn parallel zu den ersten Fahrstunden."],
            ["Wie lange gültig?", "Die Bescheinigung verfällt nicht. Du kannst dir mit der Prüfung also Zeit lassen."],
            ["Wie gross sind die Gruppen?", "Höchstens zwölf Personen, damit Fragen auch wirklich drankommen."],
            ["Was mitbringen?", "Nur den Ausweis. Kursunterlagen bekommst du am ersten Abend."],
          ].map(([q, a]) => (
            <li key={q}>
              <h3 className="text-base">{q}</h3>
              <p className="text-slate mt-1">{a}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Preis" tone="paper">
        <div className="max-w-2xl">
          <PriceTable onlySlug="vku" />
          <p className="text-fine text-slate mt-5">
            Der Betrag gilt für alle vier Abende inklusive Unterlagen und wird vor Kursbeginn
            bezahlt.
          </p>
          <Link href="/buchen?angebot=vku" className="btn btn-primary mt-7">
            Zu den Kursdaten
          </Link>
        </div>
      </Section>
    </>
  );
}
