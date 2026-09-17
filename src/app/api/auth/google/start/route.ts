import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  googleConfigured,
  PENDING_COOKIE,
  PENDING_COOKIE_PATH,
  sealPending,
  startLogin,
} from "@/lib/auth/google";
import { env } from "@/lib/env";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.redirect(`${env.appUrl}/team/anmelden?fehler=google-aus`);
  }

  const ip = await clientIp();
  const verdict = await consume(`google-start:${ip}`, 20, 900);
  if (!verdict.ok) {
    return NextResponse.redirect(`${env.appUrl}/team/anmelden?fehler=zu-viele-versuche`);
  }

  const { url, pending } = startLogin();

  const store = await cookies();
  store.set(PENDING_COOKIE, sealPending(pending), {
    httpOnly: true,
    // Der Rückruf von Google ist eine gewöhnliche Navigation von einer
    // fremden Domain her. Bei "strict" käme das Cookie dabei nicht mit und
    // jede Anmeldung schlüge fehl.
    sameSite: "lax",
    secure: env.isProduction,
    path: PENDING_COOKIE_PATH,
    maxAge: 300,
  });

  return NextResponse.redirect(url);
}
