import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runRetention } from "@/lib/retention";

export const dynamic = "force-dynamic";

/**
 * Täglicher Aufräumlauf: löscht Kundendaten nach Ablauf der Frist, entfernt
 * abgelaufene Sitzungen und alte Zähler.
 *
 * Wird von einem Cron-Eintrag auf dem Server aufgerufen. Das Geheimnis kommt
 * im Authorization-Header, nicht in der Adresse — sonst stünde es in jedem
 * Zugriffsprotokoll des Reverse Proxy.
 */
export async function POST(request: Request) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (!constantTimeEqual(provided, env.cronSecret)) {
    return new Response("Nicht berechtigt", { status: 401 });
  }

  try {
    const result = await runRetention();
    return Response.json({ status: "ok", anonymisierteBuchungen: result.bookings });
  } catch (error) {
    console.error("Aufräumlauf fehlgeschlagen:", error);
    return Response.json({ status: "fehlgeschlagen" }, { status: 500 });
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
