import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { PageHeader } from "@/components/page-header";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kontakt",
  description: `${site.name} in ${site.contact.city} — Telefon, Mailadresse, Öffnungszeiten und Anfrageformular.`,
  alternates: { canonical: "/kontakt" },
};

export default function KontaktPage() {
  return (
    <>
      <PageHeader
        title="Schreib uns"
        lead="Einen Termin buchst du am einfachsten direkt im Kalender. Für alle anderen Fragen kannst du uns hier schreiben."
        action={{ href: "/buchen", label: "Lieber direkt buchen" }}
      />

      <section className="shell band">
        <div className="lane grid gap-12 lg:grid-cols-[1fr_0.8fr] lg:gap-16">
          <div>
            <h2 className="text-section mb-7">Anfrage stellen</h2>
            <ContactForm />
          </div>

          <div>
            <h2 className="text-section mb-7">Direkt erreichen</h2>

            <dl className="surface bg-paper divide-y divide-deep/10">
              <div className="px-5 py-4">
                <dt className="text-fine text-slate">Telefon</dt>
                <dd className="nums font-bold text-lg mt-0.5">
                  <a href={`tel:${site.contact.phoneHref}`} className="hover:text-signal-ink">
                    {site.contact.phone}
                  </a>
                </dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-fine text-slate">Mail</dt>
                <dd className="font-bold text-lg mt-0.5 break-all">
                  <a href={`mailto:${site.contact.email}`} className="hover:text-signal-ink">
                    {site.contact.email}
                  </a>
                </dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-fine text-slate">Adresse</dt>
                <dd className="mt-0.5">
                  <address className="not-italic font-bold text-lg leading-snug">
                    {site.contact.street}
                    <br />
                    {site.contact.zip} {site.contact.city}
                  </address>
                </dd>
              </div>
            </dl>

            <h3 className="text-lg mt-9 mb-3">Erreichbarkeit</h3>
            <dl className="text-slate space-y-1.5">
              {site.hours.map((entry) => (
                <div key={entry.days} className="flex justify-between gap-4 max-w-xs">
                  <dt>{entry.days}</dt>
                  <dd className="nums shrink-0">{entry.time}</dd>
                </div>
              ))}
            </dl>

            <p className="text-slate mt-7 max-w-[46ch]">
              Während einer Fahrstunde gehen wir nicht ans Telefon. Sprich auf die Combox oder
              schreib uns, wir melden uns innert zwei Werktagen.
            </p>

            <Link href="/ueber-uns" className="btn btn-outline mt-7">
              Wer wir sind
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
