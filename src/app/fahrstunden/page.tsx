import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { PriceTable } from "@/components/price-table";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const offer = site.offers.fahrstunden;

export const metadata: Metadata = {
  title: "Fahrstunden Kategorie B",
  description:
    "Einzelunterricht im Schulfahrzeug, 45 Minuten pro Lektion, in deinem eigenen Lerntempo. Schnupperstunde, Einzelstunden und Abos.",
  alternates: { canonical: "/fahrstunden" },
};

export default function FahrstundenPage() {
  return (
    <>
      <PageHeader
        title="Fahrstunden"
        lead={`${offer.lead} Du fährst immer bei derselben Person, und wir melden dich erst zur Prüfung an, wenn du sie bestehst.`}
        action={{ href: "/buchen?angebot=schnupperstunde", label: "Schnupperstunde buchen" }}
      />

      <Section title="Wie eine Lektion abläuft">
        <div className="prose-column space-y-4 text-slate">
          <p>
            Eine Lektion dauert 45 Minuten. Wir holen dich dort ab, wo du gerade bist — zuhause,
            an der Schule oder am Arbeitsplatz, solange es im Einzugsgebiet liegt. Die Zeit für
            die Anfahrt zählt nicht zur Lektion.
          </p>
          <p>
            Die erste Stunde beginnt auf ruhigem Gelände: sitzen, kuppeln, anfahren. Danach
            steigern wir Schritt für Schritt — Quartierstrassen, Hauptachsen, Kreisel, Autobahn,
            Nachtfahrt. Vor der Prüfung fahren wir die Strecken, die im Prüfungsgebiet
            tatsächlich vorkommen.
          </p>
          <p>
            Nach jeder Lektion sagen wir dir, woran du arbeiten musst und wo du stehst. Wie
            schnell das geht, bestimmst du — wir arbeiten in deinem Lerntempo, ganz ohne Druck.
          </p>
        </div>
      </Section>

      <Section title="Erst schnuppern, dann entscheiden" tone="paper">
        <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
          <div className="surface bg-concrete p-6">
            <h3 className="text-lg">Schnupperstunde</h3>
            <p className="text-slate mt-2">
              Eine einzelne Lektion zum Kennenlernen. Danach weisst du, ob es zwischen euch
              passt — ohne dass du dich auf irgendetwas festgelegt hast.
            </p>
            <Link
              href="/buchen?angebot=schnupperstunde"
              className="inline-block font-bold text-signal-ink mt-4 underline-offset-4 hover:underline"
            >
              Schnupperstunde buchen
            </Link>
          </div>
          <div className="surface bg-concrete p-6">
            <h3 className="text-lg">Abo statt Einzelstunden</h3>
            <p className="text-slate mt-2">
              Wer regelmässig fährt, fährt mit einem Abo günstiger. Bezahlt wird einmal, die
              einzelnen Lektionen buchst du danach ganz normal im Kalender.
            </p>
            <Link
              href="/kontakt"
              className="inline-block font-bold text-signal-ink mt-4 underline-offset-4 hover:underline"
            >
              Abo anfragen
            </Link>
          </div>
        </div>
      </Section>

      <Section title="Was du mitbringen musst">
        <ul className="border-t border-deep/12 max-w-2xl">
          {[
            ["Lernfahrausweis", "Ohne ihn dürfen wir nicht losfahren. Er kommt vom Strassenverkehrsamt."],
            ["Brille oder Linsen", "Falls im Lernfahrausweis vermerkt. Der Experte prüft das."],
            ["Festes Schuhwerk", "Keine Flipflops und keine Schuhe mit dicker Sohle."],
            ["Pünktlichkeit", "Bei Verspätung verkürzt sich die Lektion, sie fällt aber nicht aus."],
          ].map(([title, body]) => (
            <li key={title} className="border-b border-deep/12 py-4">
              <h3 className="text-base">{title}</h3>
              <p className="text-slate mt-1">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Preise" tone="paper">
        <div className="max-w-2xl">
          <PriceTable onlySlug={["fahrstunde", "schnupperstunde"]} />
          <p className="text-fine text-slate mt-6">
            {offer.note} Absagen bis 24 Stunden vor Beginn sind kostenlos, danach wird die
            Lektion verrechnet. Bezahlt wird nach der Lektion per TWINT oder Karte, oder
            gesammelt auf Rechnung.
          </p>
          <Link href="/buchen?angebot=fahrstunde" className="btn btn-primary mt-7">
            Freie Termine ansehen
          </Link>
        </div>
      </Section>

      {/* Aufklappbar statt sechs offener Antworten untereinander: die Fragen
          sind so auf einen Blick zu überfliegen, und wer eine davon hat,
          klappt sie auf. <details> kann das von sich aus — mit Tastatur,
          ohne JavaScript und auch dann, wenn die Seite noch lädt. */}
      <Section title="Häufige Fragen">
        <div className="border-t border-deep/12 max-w-3xl">
          {site.faq.map((entry) => (
            <details key={entry.q} className="group border-b border-deep/12">
              <summary className="flex items-baseline gap-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="flex-1 font-bold">{entry.q}</span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-xl leading-none text-slate transition-transform duration-150 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="text-slate text-fine pb-4 max-w-[62ch]">{entry.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
