import "server-only";

/**
 * Zugriff auf die Umgebung.
 *
 * Die Geheimnisse werden erst beim ersten Lesen geprüft, nicht beim Laden des
 * Moduls. Grund: Next lädt beim Bauen sämtliche Seiten- und Routenmodule ein,
 * um sie zu untersuchen — zu diesem Zeitpunkt gibt es noch keine Geheimnisse,
 * und ein Fehler hier würde jeden Docker-Build zum Scheitern bringen.
 *
 * Damit ein fehlender Wert trotzdem früh auffällt und nicht erst beim ersten
 * Kundenkontakt, prüft src/instrumentation.ts beim Serverstart einmal alles
 * durch.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Umgebungsvariable ${name} fehlt.`);
  }
  return value;
}

function secret(name: string): string {
  const value = required(name);
  // Ein zu kurzes Geheimnis lässt sich durchprobieren. Lieber laut scheitern
  // als monatelang mit einer schwachen Signatur laufen.
  if (value.length < 32) {
    throw new Error(`Umgebungsvariable ${name} muss mindestens 32 Zeichen lang sein.`);
  }
  return value;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  get appUrl(): string {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get sessionSecret(): string {
    return secret("SESSION_SECRET");
  },
  get captchaSecret(): string {
    return secret("CAPTCHA_SECRET");
  },
  get cronSecret(): string {
    return secret("CRON_SECRET");
  },
  get retentionDays(): number {
    return number("RETENTION_DAYS", 30);
  },
  get trustProxyHops(): number {
    return number("TRUST_PROXY_HOPS", 1);
  },
  get smtp() {
    return {
      host: process.env.SMTP_HOST ?? "mail",
      port: number("SMTP_PORT", 587),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
    };
  },
  get mailFrom(): string {
    return process.env.MAIL_FROM ?? "Drive on Point <noreply@driveonpoint.ch>";
  },
  get mailReplyTo(): string | undefined {
    return process.env.MAIL_REPLY_TO || undefined;
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};

/** Einmal beim Serverstart aufgerufen, damit fehlende Werte sofort auffallen. */
export function assertEnvironment(): void {
  secret("SESSION_SECRET");
  secret("CAPTCHA_SECRET");
  secret("CRON_SECRET");
  required("DATABASE_URL");

  if (env.isProduction && !process.env.APP_URL) {
    throw new Error("Umgebungsvariable APP_URL fehlt.");
  }
}
