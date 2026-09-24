import { currentProblems } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

/**
 * Für einen externen Monitor (z. B. UptimeRobot): 200, solange Datenbank,
 * Mailversand und Cron-Läufe arbeiten, sonst 503. Anders als /api/health,
 * das nur die Datenbank prüft und Docker als Lebenszeichen dient — ein
 * hängender Cron soll den Container nicht als krank markieren.
 *
 * Nennt nur, welcher Teil klemmt, keine Fehlertexte: die Adresse ist
 * öffentlich. Einzelheiten stehen in der Team-Übersicht.
 */
export async function GET() {
  try {
    const problems = await currentProblems();
    if (problems.length === 0) return Response.json({ status: "ok" });
    return Response.json(
      { status: "gestört", teile: problems.map((problem) => problem.key) },
      { status: 503 },
    );
  } catch {
    return Response.json({ status: "gestört", teile: ["datenbank"] }, { status: 503 });
  }
}
