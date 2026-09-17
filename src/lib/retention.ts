import "server-only";
import { and, isNull, lte } from "drizzle-orm";
import { db } from "./db";
import { auditLog, bookings } from "./db/schema";
import { pruneSessions } from "./auth/session";
import { pruneRateLimits } from "./rate-limit";

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
      cancelToken: `verfallen:${crypto.randomUUID()}`,
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
  await pruneSessions();
  await pruneRateLimits();
  return { bookings: count };
}
