import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { PriceTable } from "@/components/price-table";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const offer = site.offers.vku;

export const metadata: Metadata = {
  title: "Verkehrskundeunterricht (VKU)",
  description: offer.lead,
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
        title="Verkehrskundeunterricht"
        lead={offer.lead}
        action={{ href: "/buchen?angebot=vku", label: "Kursdaten ansehen" }}
      />

      <Section title="Die vier Abende" tone="paper">
        <ol className="border-t border-deep/12 max-w-3xl">
          {EVENINGS.map(([title, body], index) => (
            <li key={title} className="border-b border-deep/12 py-5 flex gap-5 sm:gap-8">
              <span className="nums stretch-wide font-extrabold text-signal-ink text-xl w-7 shrink-0">
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
        <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-start">
          <ul className="border-t border-deep/12">
            {[
              ["Lernfahrausweis nötig?", "Nein. Du kannst den VKU schon vorher besuchen. Viele machen ihn parallel zu den ersten Fahrstunden."],
              ["Wie lange gültig?", "Die Bescheinigung verfällt nicht. Du kannst dir mit der Prüfung also Zeit lassen."],
              ["Wie gross sind die Gruppen?", "Höchstens zwölf Personen, damit Fragen auch wirklich drankommen."],
              ["Was mitbringen?", "Nur den Ausweis. Kursunterlagen bekommst du am ersten Abend."],
            ].map(([q, a]) => (
              <li key={q} className="border-b border-deep/12 py-4">
                <h3 className="text-base">{q}</h3>
                <p className="text-slate mt-1">{a}</p>
              </li>
            ))}
          </ul>

          <Image
            src={site.images.course.src}
            alt={site.images.course.alt}
            width={site.images.course.width}
            height={site.images.course.height}
            className="w-full h-auto surface"
            sizes="(min-width: 1024px) 40vw, 100vw"
          />
        </div>
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
