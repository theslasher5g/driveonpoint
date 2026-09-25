import { NextResponse, type NextRequest } from "next/server";

/**
 * Grobe Bremse gegen Dauerabrufe: höchstens so viele Seitenaufrufe pro
 * Minute und Verbindung. Jede Seite wird pro Anfrage gerendert und rechnet
 * freie Termine aus; eine einzelne Verbindung könnte die Anwendung sonst mit
 * Dauerabrufen auslasten. Ein Mensch kommt nie in die Nähe — Vorabladen
 * zählt nicht (siehe matcher), statische Dateien auch nicht.
 *
 * Im Speicher des Prozesses statt in der Datenbank: es geht um Tempo, nicht
 * um Genauigkeit, und die Anwendung läuft als ein einzelner Prozess. Die
 * genauen Limits für Buchen, Anmelden & Co. bleiben in lib/rate-limit.
 */
const LIMIT_PER_MINUTE = 300;
const WINDOW_MS = 60_000;
const windows = new Map<string, { start: number; count: number }>();
/** Maschinen-Endpunkte, die intern oder zeitgesteuert aufgerufen werden. */
const UNLIMITED = ["/api/health", "/api/cron/", "/api/betrieb"];

function overLimit(request: NextRequest): boolean {
  const path = request.nextUrl.pathname;
  if (UNLIMITED.some((prefix) => path.startsWith(prefix))) return false;

  const now = Date.now();
  const ip = requestIp(request);
  const current = windows.get(ip);
  if (!current || now - current.start > WINDOW_MS) {
    // Alte Einträge gelegentlich wegräumen, damit die Liste nicht wächst.
    if (windows.size > 10_000) {
      for (const [key, value] of windows) if (now - value.start > WINDOW_MS) windows.delete(key);
    }
    windows.set(ip, { start: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > LIMIT_PER_MINUTE;
}

/**
 * Dieselbe Regel wie clientIp() in lib/request.ts: nur die Einträge, die
 * unsere eigenen Proxys angehängt haben, zählen — eine selbst gesetzte
 * Kopfzeile landet weiter vorne und wird ignoriert.
 */
function requestIp(request: NextRequest): string {
  const hops = Math.max(1, Number(process.env.TRUST_PROXY_HOPS) || 1);
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return chain[chain.length - hops] ?? request.headers.get("x-real-ip") ?? "direkt";
}

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

  if (!dev && overLimit(request)) {
    return new NextResponse("Zu viele Anfragen. Bitte warte einen Moment.", {
      status: 429,
      headers: { "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' lässt von uns geladene Skripte weitere nachladen und
    // entwertet gleichzeitig jede Pfad-Erlaubnis, die jemand später einträgt.
    // 'unsafe-inline' und https: sind nur Rückfall für sehr alte Browser:
    // wer Kennungen versteht, ignoriert 'unsafe-inline', und wer
    // 'strict-dynamic' versteht, ignoriert 'self' und https:.
    ["script-src 'self'", `'nonce-${nonce}'`, "'strict-dynamic' 'unsafe-inline' https:", dev ? "'unsafe-eval'" : ""]
      .filter(Boolean)
      .join(" "),
    // Trusted Types: Zeichenketten dürfen nicht mehr direkt in gefährliche
    // DOM-Stellen (innerHTML, script.src …) — nur noch über eine Richtlinie.
    // Schliesst DOM-basiertes XSS aus, auch in Code von Drittpaketen.
    ...(dev ? [] : ["require-trusted-types-for 'script'"]),
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
