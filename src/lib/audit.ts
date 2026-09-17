import "server-only";
import { db } from "./db";
import { auditLog } from "./db/schema";

/**
 * Hält fest, wer was geändert hat. Wichtig, sobald mehrere Personen Preise
 * und Konten anfassen können — und bei einem Vorfall der einzige Weg,
 * nachzuvollziehen, was passiert ist.
 */
export async function record(
  action: string,
  actor: { id?: string | null; label?: string | null },
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      action,
      actorId: actor.id ?? null,
      actorLabel: actor.label ?? null,
      detail: detail ?? null,
    });
  } catch (error) {
    // Ein fehlgeschlagener Protokolleintrag darf die eigentliche Aktion
    // nicht rückgängig machen.
    console.error("Protokolleintrag fehlgeschlagen:", error);
  }
}
