import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { PublicOnly } from "@/components/public-chrome";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site } from "@/lib/site";
import "./globals.css";

// Beide Schriften werden beim Bauen als eigene Dateien mit ausgeliefert,
// nicht zur Laufzeit von Google nachgeladen — es entsteht keine Verbindung
// zu einem fremden Dienst, siehe Datenschutzerklärung.
const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display-loaded",
  display: "swap",
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
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#ff312e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <a href="#inhalt" className="skip-link">
          Zum Inhalt springen
        </a>
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
