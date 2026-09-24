import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { systemChecks } from "./db/schema";

/**
 * Betriebsteile, die ihren letzten Erfolg und Fehler festhalten. Wer
 * nachsieht, ob etwas stillsteht, liest diese Zeilen — siehe monitoring.ts.
 */
export type CheckKey = "mail" | "stuendlich" | "aufraeumen";

/** Erfolg vermerken. Wirft nie: die eigentliche Arbeit ist schon getan. */
export async function markOk(key: CheckKey): Promise<void> {
  try {
    await db
      .insert(systemChecks)
      .values({ key, lastOkAt: new Date() })
      .onConflictDoUpdate({ target: systemChecks.key, set: { lastOkAt: new Date() } });
  } catch (error) {
    console.error(`Betriebsstatus "${key}" konnte nicht gespeichert werden:`, error);
  }
}

/** Fehler vermerken, mit einer kurzen Beschreibung für die Team-Übersicht. */
export async function markError(key: CheckKey, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  try {
    await db
      .insert(systemChecks)
      .values({ key, lastErrorAt: new Date(), lastError: message })
      .onConflictDoUpdate({
        target: systemChecks.key,
        set: { lastErrorAt: new Date(), lastError: message },
      });
  } catch (dbError) {
    console.error(`Betriebsstatus "${key}" konnte nicht gespeichert werden:`, dbError);
  }
}

export async function readChecks() {
  return db.select().from(systemChecks);
}

export async function setAlertedAt(at: Date | null): Promise<void> {
  await db
    .insert(systemChecks)
    .values({ key: "alarm", alertedAt: at })
    .onConflictDoUpdate({ target: systemChecks.key, set: { alertedAt: at } });
}

/** Nur für den Prüfstand: einen Zustand gezielt herstellen. */
export async function resetCheck(key: string): Promise<void> {
  await db.delete(systemChecks).where(eq(systemChecks.key, key));
}
