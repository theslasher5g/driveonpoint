import { headers } from "next/headers";
import { site } from "@/lib/site";

/**
 * Bildet die drei Öffnungszeiten-Zeilen aus site.ts auf das Format ab, das
 * schema.org für Öffnungszeiten erwartet. "geschlossen" fällt weg — ein
 * geschlossener Tag wird durch Abwesenheit ausgedrückt, nicht eingetragen.
 */
const WEEKDAYS: Record<string, string[]> = {
  "Montag bis Freitag": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  Samstag: ["Saturday"],
  Sonntag: ["Sunday"],
};

function openingHours() {
  return site.hours.flatMap((entry) => {
    const dayOfWeek = WEEKDAYS[entry.days];
    if (!dayOfWeek || entry.time === "geschlossen") return [];
    const [opens, closes] = entry.time.split("–").map((value) => value.trim());
    return [{ "@type": "OpeningHoursSpecification", dayOfWeek, opens, closes }];
  });
}

/**
 * Strukturierte Daten (schema.org/DrivingSchool) für Suchmaschinen — Adresse,
 * Telefon, Öffnungszeiten und Einzugsgebiet maschinenlesbar, damit Google die
 * Seite bei Suchen wie "Fahrschule Basel" als lokalen Betrieb erkennt und
 * nicht nur als Website. Nichts davon ist hier sichtbar, es steht bereits
 * überall auf der Seite (Kontakt, Impressum, Fussbereich).
 *
 * dangerouslySetInnerHTML ist hier unbedenklich: der Inhalt kommt
 * ausschliesslich aus den festen Angaben in site.ts, nie aus einer
 * Nutzereingabe. Die Einmalkennung ist trotzdem nötig — sonst blockiert die
 * Inhaltsrichtlinie (script-src) dieses eingebettete Skript wie jedes andere,
 * siehe src/middleware.ts.
 */
export async function StructuredData() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DrivingSchool",
    name: site.name,
    url: `https://${site.domain}`,
    telephone: site.contact.phone,
    email: site.contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.contact.street,
      postalCode: site.contact.zip,
      addressLocality: site.contact.city,
      addressCountry: "CH",
    },
    areaServed: site.region.map((ort) => ({ "@type": "City", name: ort })),
    openingHoursSpecification: openingHours(),
    image: `https://${site.domain}${site.images.hero.src}`,
  };

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // Der Browser liest die Einmalkennung einmal beim Einfügen und leert
      // das Attribut danach aus Sicherheitsgründen wieder (verhindert, dass
      // eine eingeschleuste Skriptzeile sie sich per DOM-Zugriff besorgt).
      // React vergleicht sie beim Hydrieren trotzdem und meldet einen
      // Unterschied, obwohl das Skript zu dem Zeitpunkt längst ausgeführt
      // ist — reine Konsolenwarnung, keine Funktionsänderung.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
