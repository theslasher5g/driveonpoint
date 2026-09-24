import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { PriceTable } from "@/components/price-table";
import { activePromotions } from "@/lib/booking";
import { site } from "@/lib/site";
import { formatDayLong } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Preise — Fahrschule in ${site.contact.city}`,
  description: `Alle Preise für Fahrstunden, Verkehrskundeunterricht und Nothilfekurs in ${site.contact.city} — ohne Anmeldegebühr und ohne Kleingedrucktes.`,
  alternates: { canonical: "/preise" },
};

export default async function PreisePage() {
  let promotions: Awaited<ReturnType<typeof activePromotions>> = [];
  try {
    promotions = await activePromotions();
  } catch {
    promotions = [];
  }

  return (
    <>
      <PageHeader
        title="Preise"
        lead={`Fahrstunden, VKU und Nothilfekurs in ${site.contact.city} — ohne Anmeldegebühr, ohne Verwaltungspauschale und ohne Aufschlag für die Abholung im Einzugsgebiet. Du zahlst, was du fährst.`}
        action={{ href: "/buchen", label: "Termin buchen" }}
      />

      {promotions.length > 0 && (
        <section className="bg-amber text-deep">
          <div className="shell py-8 md:py-10">
            <div className="lane">
              <h2 className="text-section stretch-wide leading-none">
                {promotions.length === 1 ? "Aktion läuft" : "Aktionen laufen"}
              </h2>
              <ul className="mt-4 space-y-2">
                {promotions.map((promotion) => (
                  <li key={promotion.id} className="font-semibold">
                    {promotion.label}
                    <span className="font-normal text-deep/70">
                      {" "}
                      — noch bis {formatDayLong(promotion.endsOn)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <Section title="Alle Angebote">
        <div className="max-w-3xl">
          <PriceTable />
          <p className="text-fine text-slate mt-6">
            Alle Beträge in Schweizer Franken. Als Kleinunternehmen weisen wir keine
            Mehrwertsteuer aus.
          </p>
        </div>
      </Section>

      <Section title="Bezahlen und absagen" tone="paper">
        <ul className="border-t border-deep/15 max-w-2xl">
          {[
            ["Fahrstunden", "Nach der Lektion per TWINT oder Karte, oder gesammelt auf Rechnung mit 30 Tagen Zahlungsfrist."],
            ["Kurse", "Vor Kursbeginn. Der Platz ist erst mit der Zahlung verbindlich reserviert."],
            ["Absagen", "Bis 24 Stunden vor Beginn kostenlos, über den Link in deiner Bestätigungsmail. Danach wird der volle Betrag verrechnet."],
            ["Prüfungsfahrzeug", "Die Miete für die praktische Prüfung ist im Stundenansatz nicht enthalten und wird separat ausgewiesen."],
          ].map(([title, body]) => (
            <li key={title} className="border-b border-deep/15 py-4">
              <h3 className="text-base">{title}</h3>
              <p className="text-slate mt-1 max-w-[58ch]">{body}</p>
            </li>
          ))}
        </ul>

        <Link href="/buchen" className="btn btn-primary mt-9">
          Freie Termine ansehen
        </Link>
      </Section>
    </>
  );
}
