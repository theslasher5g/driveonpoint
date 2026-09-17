import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Prüft, ob die Anwendung ihre Datenbank erreicht. Für Docker und Monitoring. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "datenbank nicht erreichbar" }, { status: 503 });
  }
}
