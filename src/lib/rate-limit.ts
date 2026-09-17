import "server-only";
import { and, count, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { ipBlocks, rateLimitHits } from "./db/schema";

export type RateVerdict = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Gleitendes Zeitfenster. Zählt die Treffer der letzten `windowSeconds` und
 * verweigert, sobald `limit` erreicht ist.
 *
 * Bewusst in Postgres statt im Arbeitsspeicher: bei mehreren App-Containern
 * hätte jeder sein eigenes Zählwerk, und ein Neustart würde jede Sperre
 * aufheben — beides macht die Begrenzung wirkungslos.
 *
 * Zählen und Eintragen laufen in einer Transaktion mit einer Sperre je
 * Bucket: ohne sie könnten mehrere gleichzeitige Anfragen alle noch unter
 * dem Limit lesen, bevor eine von ihnen ihren Treffer einträgt, und so
 * gemeinsam über das Limit hinaus durchkommen — bei automatisiertem
 * Durchprobieren keine bloss theoretische Lücke.
 */
export async function consume(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateVerdict> {
  const since = new Date(Date.now() - windowSeconds * 1000);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${bucket}))`);

    const [existing] = await tx
      .select({ hits: count() })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.bucket, bucket), gt(rateLimitHits.occurredAt, since)));

    if ((existing?.hits ?? 0) >= limit) {
      return { ok: false, retryAfterSeconds: windowSeconds };
    }

    await tx.insert(rateLimitHits).values({ bucket });
    return { ok: true };
  });
}

/** Trägt einen Treffer ein, ohne eine Obergrenze zu prüfen. */
export async function hit(bucket: string): Promise<void> {
  await db.insert(rateLimitHits).values({ bucket });
}

/** Zählt die Treffer, ohne einen neuen einzutragen. */
export async function currentHits(bucket: string, windowSeconds: number): Promise<number> {
  const since = new Date(Date.now() - windowSeconds * 1000);
  const [row] = await db
    .select({ hits: count() })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.bucket, bucket), gt(rateLimitHits.occurredAt, since)));
  return row?.hits ?? 0;
}

export async function clearBucket(bucket: string): Promise<void> {
  await db.delete(rateLimitHits).where(eq(rateLimitHits.bucket, bucket));
}

/**
 * Sperrt eine Adresse für eine bestimmte Dauer.
 *
 * Gesperrt wird ausschliesslich die IP-Adresse. Eine MAC-Adresse steht dem
 * Server nicht zur Verfügung: sie wird beim ersten Router ersetzt und
 * erreicht das Internet nie.
 */
export async function blockIp(ip: string, minutes: number, reason: string): Promise<void> {
  if (ip === "unbekannt") return;
  const blockedUntil = new Date(Date.now() + minutes * 60_000);

  await db
    .insert(ipBlocks)
    .values({ ip, reason, blockedUntil })
    .onConflictDoUpdate({
      target: ipBlocks.ip,
      // Eine laufende, längere Sperre soll nicht verkürzt werden.
      set: {
        reason,
        blockedUntil: sql`greatest(${ipBlocks.blockedUntil}, ${blockedUntil.toISOString()}::timestamptz)`,
      },
    });
}

export async function blockedUntil(ip: string): Promise<Date | null> {
  if (ip === "unbekannt") return null;
  const [row] = await db
    .select({ until: ipBlocks.blockedUntil })
    .from(ipBlocks)
    .where(and(eq(ipBlocks.ip, ip), gt(ipBlocks.blockedUntil, new Date())))
    .limit(1);
  return row?.until ?? null;
}

/** Entfernt abgelaufene Sperren und alte Zähler. */
export async function pruneRateLimits(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(rateLimitHits).where(lt(rateLimitHits.occurredAt, cutoff));
  await db.delete(ipBlocks).where(lt(ipBlocks.blockedUntil, new Date()));
}
