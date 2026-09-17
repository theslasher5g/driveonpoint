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
