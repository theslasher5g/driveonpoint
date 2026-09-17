import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, lessonTypes, staff } from "@/lib/db/schema";
import { buildCalendar, type CalendarEntry } from "@/lib/ics";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Kalender-Abonnement für Google, Apple und Outlook.
 *
 * Diese Adresse muss ohne Anmeldung erreichbar sein — Kalenderdienste
 * bringen keine Cookies mit. Der lange Zufallstoken im Pfad ist deshalb der
 * einzige Nachweis; er lässt sich im Team-Bereich jederzeit erneuern.
 *
 * Personendaten der Kundschaft bleiben bewusst aussen vor: im Kalender steht
 * die Lektionsart mit Kürzel, nicht Name und Telefonnummer. Sonst lägen diese
 * Daten bei Google.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const raw = token.replace(/\.ics$/i, "");

  if (raw.length < 20 || raw.length > 100) {
    return new Response("Nicht gefunden", { status: 404 });
  }

  // Bremst das Durchprobieren von Token.
  const ip = await clientIp();
  const verdict = await consume(`kalender:${ip}`, 120, 3600);
  if (!verdict.ok) {
    return new Response("Zu viele Anfragen", {
      status: 429,
      headers: { "Retry-After": String(verdict.retryAfterSeconds) },
    });
  }

  const [owner] = await db
    .select({ id: staff.id, name: staff.name, active: staff.active })
    .from(staff)
    .where(eq(staff.calendarToken, raw))
    .limit(1);

  if (!owner || !owner.active) {
    return new Response("Nicht gefunden", { status: 404 });
  }

  // Vergangenes interessiert im Abonnement nicht und bläht die Datei auf.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
      updatedAt: bookings.updatedAt,
      lessonName: lessonTypes.name,
    })
    .from(bookings)
    .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(and(eq(bookings.staffId, owner.id), gte(bookings.startsAt, since)));

  const entries: CalendarEntry[] = rows.map((row) => ({
    uid: `${row.id}@${site.domain}`,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    title: `${row.lessonName ?? "Termin"} — ${row.reference}`,
    description: `Details und Kontaktangaben im Team-Bereich von ${site.name}.`,
    cancelled: row.status === "abgesagt",
    updatedAt: row.updatedAt,
  }));

  return new Response(buildCalendar(`${site.name} — ${owner.name}`, entries), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="driveonpoint.ics"`,
      "Cache-Control": "private, max-age=600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
