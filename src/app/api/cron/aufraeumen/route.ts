import { isAuthorizedCron } from "@/lib/cron-auth";
import { runRetention } from "@/lib/retention";

export const dynamic = "force-dynamic";

/**
 * Täglicher Aufräumlauf: löscht Kundendaten nach Ablauf der Frist, entfernt
 * abgelaufene Sitzungen und alte Zähler.
 *
 * Wird von einem Cron-Eintrag auf dem Server aufgerufen (deploy/aufraeumen.sh).
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response("Nicht berechtigt", { status: 401 });
  }

  try {
    const result = await runRetention();
    return Response.json({ status: "ok", anonymisierteBuchungen: result.bookings });
  } catch (error) {
    console.error("Aufräumlauf fehlgeschlagen:", error);
    return Response.json({ status: "fehlgeschlagen" }, { status: 500 });
  }
}
