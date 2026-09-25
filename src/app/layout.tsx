import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { PublicOnly } from "@/components/public-chrome";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StructuredData } from "@/components/structured-data";
import { site } from "@/lib/site";
import "./globals.css";

// Beide Schriften werden beim Bauen als eigene Dateien mit ausgeliefert,
// nicht zur Laufzeit von Google nachgeladen — es entsteht keine Verbindung
// zu einem fremden Dienst, siehe Datenschutzerklärung.
//
// "optional" statt "swap": die Schrift wird vorab geladen und genommen, wenn
// sie gleich zu Beginn da ist; sonst bleibt es für diesen Aufruf bei der
// angepassten Ersatzschrift. Mit "swap" wechselte die Schrift mitten im
// Aufbau, die grosse Schlagzeile brach anders um, und alles darunter
// rutschte nach (Lighthouse: Layoutverschiebung 0,15).
const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "optional",
});

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display-loaded",
  display: "optional",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://driveonpoint.ch"),
  title: {
    default: `${site.name} — Fahrschule in ${site.contact.city}`,
    template: `%s — ${site.name}`,
  },
  description: site.hero.lead,
  openGraph: {
    type: "website",
    locale: "de_CH",
    siteName: site.name,
    images: [
      {
        url: site.images.hero.src,
        width: site.images.hero.width,
        height: site.images.hero.height,
        alt: site.images.hero.alt,
      },
    ],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#ff312e",
  width: "device-width",
  initialScale: 1,
};

/**
 * Standard-Richtlinie für Trusted Types (siehe require-trusted-types-for in
 * src/middleware.ts). Die CSP verbietet, Zeichenketten direkt in innerHTML &
 * Co. zu schreiben; React tut das aber an wenigen Stellen selbst, etwa beim
 * Anlegen eines <script>-Elements im Browser. Ohne Richtlinie stürzte die
 * Seite dann ab (beim Wechsel vom Team-Bereich zur Startseite).
 *
 * Durchgelassen wird nur, was kein HTML-Element erzeugen kann: Text ohne
 * "<" und Reacts leeres "<script></script>" (per innerHTML eingefügte
 * Skripte laufen nie). Skript-Adressen nur von der eigenen Domain. Alles
 * andere bleibt blockiert wie bisher.
 *
 * Im Skript selbst steht kein "<", nur "\x3c": ein wörtliches "</script>"
 * beendete das Element vorzeitig, und React schreibt den Skripttext bei
 * manchen Übergängen (etwa nach der Anmeldung) neu — dann prüft die
 * Richtlinie ihren eigenen Text und hätte ihn mit "<" abgewiesen.
 */
const TRUSTED_TYPES_POLICY = `(function(){if(!window.trustedTypes||!trustedTypes.createPolicy)return;try{trustedTypes.createPolicy("default",{createHTML:function(s){return s==="\\x3cscript>\\x3c/script>"||String(s).indexOf("\\x3c")===-1?s:null},createScriptURL:function(s){try{return new URL(s,location.href).origin===location.origin?s:null}catch(e){return null}}})}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="de-CH" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <head>
        {/* Muss vor jedem anderen Skript laufen; steht nur im Grundgerüst,
            das beim Seitenwechsel nie neu aufgebaut wird. */}
        {/* suppressHydrationWarning: Browser blenden das nonce-Attribut aus,
            React sähe sonst beim Abgleich einen Unterschied. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: TRUSTED_TYPES_POLICY }}
        />
      </head>
      <body className="min-h-dvh flex flex-col">
        <a href="#inhalt" className="skip-link">
          Zum Inhalt springen
        </a>
        {/* Nicht in PublicOnly: sonst fehlte das Skript im Team-Bereich und
            würde beim Wechsel zur Website im Browser neu angelegt — genau
            das, was die Trusted-Types-Regel blockiert. Im Grundgerüst kommt
            es nur einmal vom Server und bleibt stehen. Im Team-Bereich
            schadet es nicht; der ist ohnehin nicht indexiert. */}
        <StructuredData />
        <PublicOnly>
          <SiteHeader />
        </PublicOnly>
        <main id="inhalt" className="flex-1">
          {children}
        </main>
        <PublicOnly>
          <SiteFooter />
        </PublicOnly>
      </body>
    </html>
  );
}
