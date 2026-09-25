import { markError, markOk } from "@/lib/checks";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { alertOfferingGaps } from "@/lib/offering-gaps";
import { deleteExpiredRequests, sendDueReminders } from "@/lib/reminders";
import { pruneWaitlist } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

/**
 * Stündlicher Lauf: verschickt die Erinnerungen vor dem Termin, löscht
 * Online-Buchungen, die nie per Mail bestätigt wurden, und Wartelisten
 * vergangener Kurse. Meldet ausserdem Angebote, die online gerade nicht
 * buchbar sind (ausgebucht oder ohne Zeiten).
 *
 * Wird von einem Cron-Eintrag auf dem Server aufgerufen (deploy/stuendlich.sh).
 * Die beiden Schritte laufen unabhängig: scheitert der Mailversand, wird
 * trotzdem aufgeräumt.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response("Nicht berechtigt", { status: 401 });
  }

  const [reminders, expired, waitlist] = await Promise.allSettled([
    sendDueReminders(),
    deleteExpiredRequests(),
    pruneWaitlist(),
  ]);
  // Danach, nicht parallel: verfallene Anfragen geben Plätze frei, die hier
  // schon wieder als buchbar zählen sollen.
  const [gaps] = await Promise.allSettled([alertOfferingGaps()]);

  for (const outcome of [reminders, expired, waitlist, gaps]) {
    if (outcome.status === "rejected") console.error("Stündlicher Lauf:", outcome.reason);
  }

  const ok = reminders.status === "fulfilled" && expired.status === "fulfilled";
  if (ok) {
    await markOk("stuendlich");
  } else {
    const failed = [reminders, expired].find((outcome) => outcome.status === "rejected");
    await markError("stuendlich", failed?.status === "rejected" ? failed.reason : "unbekannt");
  }
  return Response.json(
    {
      status: ok ? "ok" : "fehlgeschlagen",
      erinnerungen: reminders.status === "fulfilled" ? reminders.value : null,
      verfalleneAnfragen: expired.status === "fulfilled" ? expired.value : null,
      vergangeneWartelisten: waitlist.status === "fulfilled" ? waitlist.value : null,
      nichtBuchbar: gaps.status === "fulfilled" ? gaps.value : null,
    },
    { status: ok ? 200 : 500 },
  );
}
