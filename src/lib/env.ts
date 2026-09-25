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
    return process.env.MAIL_FROM ?? "DriveOnPoint <inbox@driveonpoint.ch>";
  },
  get mailReplyTo(): string | undefined {
    return process.env.MAIL_REPLY_TO || undefined;
  },
  /**
   * Link zum Bewertungsformular im Google-Unternehmensprofil ("Rezensionen
   * anfordern" / g.page/r/…). Leer: keine Bewertungsanfragen, der Punkt ist
   * im Team-Bereich ausgeblendet.
   */
  get googleReviewUrl(): string | null {
    const value = process.env.GOOGLE_REVIEW_URL?.trim();
    return value && /^https:\/\//.test(value) ? value : null;
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  /**
   * Ob Sitzungs-Cookies als `Secure` gesetzt werden.
   *
   * Bewusst an die tatsächliche Adresse gekoppelt statt an NODE_ENV: beim
   * ersten Hochfahren, bevor Domain und Reverse Proxy mit TLS stehen, läuft
   * die Anwendung noch über reines HTTP — ein `Secure`-Cookie würde der
   * Browser dann gar nicht erst annehmen, und die Team-Anmeldung liesse sich
   * nicht einmal zum Testen aufrufen. Sobald APP_URL auf `https://` zeigt,
   * greift der Schutz automatisch, ohne dass irgendwo ein Schalter
   * umgestellt werden muss.
   */
  get isSecureUrl(): boolean {
    return env.appUrl.startsWith("https://");
  },
};

/** Einmal beim Serverstart aufgerufen, damit fehlende Werte sofort auffallen. */
export function assertEnvironment(): void {
  secret("SESSION_SECRET");
  secret("CAPTCHA_SECRET");
  secret("CRON_SECRET");
  required("DATABASE_URL");

  if (!env.isSecureUrl) {
    console.warn(
      "APP_URL zeigt nicht auf https:// — Sitzungs-Cookies laufen ohne " +
        "Secure-Schutz. In Ordnung zum ersten Testen, aber vor dem " +
        "öffentlichen Betrieb gehört ein Reverse Proxy mit TLS davor und " +
        "APP_URL auf https:// umgestellt.",
    );
  }
}
