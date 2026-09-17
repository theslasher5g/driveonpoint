import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Kein Abbruch bei fehlendem Wert: Next lädt dieses Modul auch beim Bauen,
// wo es noch keine Datenbank gibt. Der Pool baut die Verbindung ohnehin erst
// bei der ersten Abfrage auf, und src/instrumentation.ts prüft beim
// Serverstart, dass DATABASE_URL gesetzt ist.
const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/driveonpoint";

// Next.js lädt Module im Dev-Modus mehrfach neu; ohne Zwischenspeicher
// entstünde bei jedem Neuladen ein weiterer Verbindungspool.
const globalForDb = globalThis as unknown as { __dopPool?: Pool };

const pool =
  globalForDb.__dopPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dopPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };
