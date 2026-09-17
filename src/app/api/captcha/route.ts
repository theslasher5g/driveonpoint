import { NextResponse } from "next/server";
import { createChallenge } from "@/lib/captcha";
import { clientIp } from "@/lib/request";
import { consume } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const SCOPES = new Set(["buchung", "kontakt"]);

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("zweck") ?? "";
  if (!SCOPES.has(scope)) {
    return NextResponse.json({ error: "Unbekannter Zweck." }, { status: 400 });
  }

  // Ohne Begrenzung liesse sich hier beliebig Rechenlast erzeugen.
  const ip = await clientIp();
  const verdict = await consume(`captcha:${ip}`, 60, 300);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }

  return NextResponse.json(createChallenge(scope), {
    headers: { "Cache-Control": "no-store" },
  });
}
