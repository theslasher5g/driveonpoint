import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["drizzle-orm"],
  },
  serverExternalPackages: ["@node-rs/argon2", "pg", "nodemailer"],

  /**
   * @react-pdf/renderer lädt über pdfkit die Standardschriften erst zur
   * Laufzeit per require() mit einem zusammengesetzten Pfad nach. Der
   * Abhängigkeits-Tracer von `output: "standalone"` findet solche
   * dynamischen Pfade nicht und liesse die Dateien im ausgelieferten
   * Container weg — das PDF bricht dann erst beim ersten echten Download
   * mit einem MODULE_NOT_FOUND-Fehler ab. Hier stehen sie deshalb von Hand.
   */
  outputFileTracingIncludes: {
    "/team/buchhaltung/export/pdf": [
      "./node_modules/pdfkit/js/data/**",
      "./node_modules/pdfkit/js/standard-fonts/**",
    ],
  },

  async headers() {
    return [
      {
        // Schriften und Bilder unter /public bekommen sonst keine
        // Zwischenspeicherung und werden bei jedem Seitenwechsel neu geladen.
        // Bei einem Austausch ändert sich der Dateiname nicht — deshalb beim
        // Ersetzen eines Bildes einen neuen Namen vergeben.
        source: "/:pfad(fonts|images)/:datei*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default config;
