import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleButton } from "@/components/google-button";
import { LoginForm } from "@/components/login-form";
import { googleConfigured } from "@/lib/auth/google";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anmeldung",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Die Meldungen sagen bewusst nicht, ob es zu einer Adresse ein Konto gibt.
 * Eine Ausnahme ist „kein Konto“ nach der Google-Anmeldung: dort hat die
 * Person ihre eigene Adresse bereits bei Google bestätigt, und ohne diesen
 * Hinweis suchte sie den Fehler bei sich.
 */
const REASONS: Record<string, string> = {
  "google-aus": "Die Anmeldung über Google ist auf diesem Server nicht eingerichtet.",
  "zu-viele-versuche": "Zu viele Versuche. Bitte in einer Viertelstunde erneut.",
  gesperrt: "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut.",
  "google-abgelaufen": "Der Anmeldevorgang hat zu lange gedauert. Bitte erneut versuchen.",
  "google-abgebrochen": "Die Anmeldung über Google wurde abgebrochen.",
  "google-ungueltig": "Die Antwort von Google liess sich nicht überprüfen. Bitte erneut versuchen.",
  "google-unbestaetigt":
    "Diese Google-Adresse ist bei Google nicht bestätigt. Bestätige sie dort und versuche es erneut.",
  "google-kein-konto":
    "Für diese Google-Adresse gibt es hier kein Konto. Die Administration muss dich zuerst anlegen — mit genau dieser Mailadresse.",
};

export default async function AnmeldenPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  if (await currentUser()) redirect("/team");

  const { fehler } = await searchParams;
  const message = fehler ? REASONS[fehler] : undefined;
  const withGoogle = googleConfigured();

  return (
    <section className="shell py-14 md:py-24">
      <div className="lane max-w-md">
        <h1 className="text-title">Team-Anmeldung</h1>
        <p className="text-slate mt-4 mb-9">
          Dieser Bereich ist für Mitarbeitende. Kundinnen und Kunden buchen ohne Konto.
        </p>

        {message && (
          <p
            role="alert"
            className="surface bg-paper border-l-4 border-[#B3261E] px-5 py-4 font-semibold mb-6"
          >
            {message}
          </p>
        )}

        {withGoogle && (
          <>
            <GoogleButton />
            <div className="flex items-center gap-4 my-7" aria-hidden="true">
              <span className="h-px flex-1 bg-deep/15" />
              <span className="text-fine text-slate">oder mit Passwort</span>
              <span className="h-px flex-1 bg-deep/15" />
            </div>
          </>
        )}

        <LoginForm />
      </div>
    </section>
  );
}
