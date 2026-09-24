import type { Metadata } from "next";
import Link from "next/link";
import { CONFIRM_WINDOW_MINUTES } from "@/lib/booking";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bitte Mail bestätigen",
  robots: { index: false, follow: false },
};

type Params = Promise<{ anzahl?: string; fehlgeschlagen?: string }>;

/**
 * Zwischenschritt nach dem Absenden des Buchungsformulars: der Termin ist
 * reserviert, aber erst verbindlich, wenn der Link in der Mail geklickt ist.
 * Die Mailadresse steht bewusst nicht in der Adresse dieser Seite — sie
 * landete sonst im Browserverlauf und in Zugriffsprotokollen.
 */
export default async function ReserviertPage({ searchParams }: { searchParams: Params }) {
  const { anzahl, fehlgeschlagen } = await searchParams;
  const count = Math.max(1, Math.min(10, Number(anzahl) || 1));
  const failedCount = Math.max(0, Math.min(10, Number(fehlgeschlagen) || 0));
  const several = count > 1;

  return (
    <>
      <section className="bg-concrete border-b border-deep/12">
        <div className="shell pt-24 pb-14 md:pt-32 md:pb-20">
          <div className="lane">
            <span className="block w-10 h-[3px] rounded-full bg-signal mb-5" aria-hidden="true" />
            <h1 className="text-title max-w-[18ch]">Noch ein Klick in deiner Mail.</h1>
            <p className="text-lead text-slate mt-4 max-w-[54ch]">
              Wir haben dir eine Mail mit einem Link geschickt. Erst wenn du darauf tippst,{" "}
              {several ? `sind deine ${count} Termine` : "ist dein Termin"} verbindlich gebucht.
              Bis dahin halten wir {several ? "sie" : "ihn"} {CONFIRM_WINDOW_MINUTES} Minuten
              für dich frei.
            </p>
            {failedCount > 0 && (
              <p className="notice notice-warn mt-4 max-w-[54ch]">
                {failedCount}{" "}
                {failedCount === 1 ? "der gewählten Termine war" : "der gewählten Termine waren"}{" "}
                leider nicht mehr frei und {failedCount === 1 ? "ist" : "sind"} nicht dabei.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="shell band">
        <div className="lane max-w-2xl">
          <h2 className="text-section">Keine Mail bekommen?</h2>
          <p className="text-slate mt-4">
            Schau im Spam-Ordner nach, die Mail kommt von {site.name}. Steht sie auch
            dort nicht, hast du dich vielleicht bei der Adresse vertippt. Nach{" "}
            {CONFIRM_WINDOW_MINUTES} Minuten wird der Termin wieder frei, und du kannst ihn neu
            buchen. Oder ruf uns an, dann tragen wir ihn direkt ein.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <a href={`tel:${site.contact.phoneHref}`} className="btn btn-primary">
              {site.contact.phone}
            </a>
            <Link href="/" className="btn btn-outline">
              Zur Startseite
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
