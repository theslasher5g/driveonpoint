import "server-only";
import { and, isNull, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { auditLog, bookings } from "./db/schema";
import { pruneSessions } from "./auth/session";
import { pruneRateLimits } from "./rate-limit";
import { deleteExpiredRequests } from "./reminders";
import { pruneWaitlist } from "./waitlist";

/**
 * Löscht die Personendaten der Kundschaft nach Ablauf der Aufbewahrungsfrist.
 *
 * Name, Mailadresse, Telefonnummer und Bemerkung werden geleert, der Termin
 * selbst bleibt als anonyme Zeile bestehen. Damit verschwinden die
 * Personendaten fristgerecht, während Auslastung und Umsatz nachvollziehbar
 * bleiben — ein vollständiges Löschen würde die Buchhaltung zerreissen.
 *
 * Auch der Absage-Token wird entwertet: ein alter Link aus einer Mail darf
 * nach der Frist nichts mehr auslösen.
 */
export async function purgeExpiredCustomerData(): Promise<number> {
  const now = new Date();

  const purged = await db
    .update(bookings)
    .set({
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      customerNote: null,
      // Nicht crypto.randomUUID() in JavaScript: das würde für alle
      // betroffenen Zeilen denselben Wert liefern, weil er nur einmal beim
      // Aufbau dieser einen UPDATE-Anweisung berechnet wird, nicht je Zeile.
      // Das verletzt den eindeutigen Index, sobald an einem Lauf mehr als
      // eine Buchung fällig ist — gen_random_uuid() läuft dagegen in
      // Postgres selbst, einmal pro betroffener Zeile.
      cancelToken: sql`'verfallen:' || gen_random_uuid()`,
      confirmToken: null,
      anonymisedAt: now,
      updatedAt: now,
    })
    .where(and(lte(bookings.purgeAfter, now), isNull(bookings.anonymisedAt)))
    .returning({ id: bookings.id });

  if (purged.length > 0) {
    await db.insert(auditLog).values({
      action: "aufbewahrung.geloescht",
      actorLabel: "System",
      detail: { anzahl: purged.length },
    });
  }

  return purged.length;
}

/** Vollständiger Aufräumlauf, täglich angestossen. */
export async function runRetention(): Promise<{ bookings: number }> {
  const count = await purgeExpiredCustomerData();
  // Eigentlich Sache des stündlichen Laufs; hier nochmals, falls der auf
  // einem Server (noch) nicht eingerichtet ist.
  await deleteExpiredRequests();
  await pruneWaitlist();
  await pruneSessions();
  await pruneRateLimits();
  return { bookings: count };
}
