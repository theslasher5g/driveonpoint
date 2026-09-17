import { NextResponse, type NextRequest } from "next/server";

/**
 * Setzt die Inhaltsrichtlinie und die Sicherheits-Kopfzeilen.
 *
 * Kernstück gegen XSS ist `script-src` mit Einmalkennung: eingeschleustes
 * Markup bringt keine gültige Kennung mit und wird vom Browser nicht
 * ausgeführt — selbst dann, wenn irgendwo eine Maskierung fehlt.
 *
 * Preis dafür: jede Seite muss pro Anfrage gerendert werden. Die Kennung
 * wechselt mit jeder Anfrage, eine beim Bauen vorgerenderte Seite trüge eine
 * veraltete — der Browser würde dann sämtliche Skripte der Seite blockieren.
 * Deshalb trägt jede Seite unter src/app ein `export const dynamic =
 * "force-dynamic"`. Im Layout allein wirkt das nicht. Kommt eine neue Seite
 * dazu, gehört die Zeile hinein, sonst bleibt sie im Browser tot.
 */
export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const dev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' lässt von uns geladene Skripte weitere nachladen und
    // entwertet gleichzeitig jede Pfad-Erlaubnis, die jemand später einträgt.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : ""}`,
    // Next fügt Stile zur Laufzeit ein; eine Kennung ist dafür nicht
    // vorgesehen. Stile allein führen keinen Code aus.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ]
    .filter(Boolean)
    .join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  // Next liest die Kennung für seine eigenen Startskripte aus dieser
  // Kopfzeile der Anfrage. Fehlt sie hier, blockiert der Browser die
  // gesamte Anwendung.
  headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  if (!dev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Statische Dateien brauchen die Kopfzeilen nicht und würden sonst bei
    // jedem Bild durch die Middleware laufen.
    {
      source: "/((?!_next/static|_next/image|fonts/|images/|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
