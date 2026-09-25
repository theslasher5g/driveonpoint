import type { MetadataRoute } from "next";

// Nicht über lib/env: diese Datei wird beim Bauen ausgewertet, und dort
// stehen die Laufzeit-Geheimnisse noch nicht zur Verfügung.
const appUrl = (process.env.APP_URL ?? "https://driveonpoint.ch").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Interner Bereich, persönliche Links und Einzeltermine gehören nicht
      // in einen Suchindex.
      disallow: ["/team", "/api/", "/absagen/", "/verschieben/", "/bestaetigen/", "/buchen/bestaetigt", "/buchen/reserviert", "/buchen/warteliste", "/warteliste/"],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
