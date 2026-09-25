import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["drizzle-orm"],
    // Das Stylesheet (rund 11 KB komprimiert) steht direkt im HTML statt als
    // eigene Datei: der Browser muss vor dem ersten Bild nicht erst auf eine
    // zweite Anfrage warten. Lighthouse zählte die Datei als "blockierend".
    // Erlaubt, weil die CSP Stile ohnehin mit 'unsafe-inline' zulässt.
    inlineCss: true,
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

  /**
   * Next liefert jedem Browser ein Polyfill-Modul mit (Array.prototype.at,
   * Object.hasOwn, flat, trimStart …). Diese Funktionen hat jeder Browser
   * seit 2022 selbst — Safari ab 15.4, und jedes iPhone mit iOS 15 lässt
   * sich auf 15.8 bringen. Lighthouse meldet das Modul als "veraltetes
   * JavaScript"; hier fällt es weg.
   */
  webpack(webpackConfig, { isServer }) {
    if (!isServer) {
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        "../build/polyfills/polyfill-module": false,
        "next/dist/build/polyfills/polyfill-module": false,
      };
    }
    return webpackConfig;
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
