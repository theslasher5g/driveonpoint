import type { Metadata, Viewport } from "next";
import { PublicOnly } from "@/components/public-chrome";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://driveonpoint.com"),
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
  themeColor: "#D33F2C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH">
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
