import { isAuthorizedCron } from "@/lib/cron-auth";
import { deleteExpiredRequests, sendDueReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

/**
 * Stündlicher Lauf: verschickt die Erinnerungen vor dem Termin und löscht
 * Online-Buchungen, die nie per Mail bestätigt wurden.
 *
 * Wird von einem Cron-Eintrag auf dem Server aufgerufen (deploy/stuendlich.sh).
 * Die beiden Schritte laufen unabhängig: scheitert der Mailversand, wird
 * trotzdem aufgeräumt.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new Response("Nicht berechtigt", { status: 401 });
  }

  const [reminders, expired] = await Promise.allSettled([
    sendDueReminders(),
    deleteExpiredRequests(),
  ]);

  for (const outcome of [reminders, expired]) {
    if (outcome.status === "rejected") console.error("Stündlicher Lauf:", outcome.reason);
  }

  const ok = reminders.status === "fulfilled" && expired.status === "fulfilled";
  return Response.json(
    {
      status: ok ? "ok" : "fehlgeschlagen",
      erinnerungen: reminders.status === "fulfilled" ? reminders.value : null,
      verfalleneAnfragen: expired.status === "fulfilled" ? expired.value : null,
    },
    { status: ok ? 200 : 500 },
  );
}
