import { and, eq, isNull, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { record } from "@/lib/audit";
import {
  exchangeCode,
  googleConfigured,
  openPending,
  PENDING_COOKIE,
  PENDING_COOKIE_PATH,
  safeCompare,
} from "@/lib/auth/google";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { blockIp, blockedUntil, consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

function back(reason: string) {
  return NextResponse.redirect(`${env.appUrl}/team/anmelden?fehler=${reason}`);
}

export async function GET(request: Request) {
  if (!googleConfigured()) return back("google-aus");

  const ip = await clientIp();
  if (await blockedUntil(ip)) return back("gesperrt");

  const verdict = await consume(`google-callback:${ip}`, 20, 900);
  if (!verdict.ok) return back("zu-viele-versuche");

  const store = await cookies();
  const pending = openPending(store.get(PENDING_COOKIE)?.value);
  // Der Zwischenstand wird in jedem Fall entwertet, auch wenn es schiefgeht:
  // ein einmal begonnener Anmeldeversuch darf nicht zweimal gelten.
  store.delete({ name: PENDING_COOKIE, path: PENDING_COOKIE_PATH });

  if (!pending) return back("google-abgelaufen");

  const params = new URL(request.url).searchParams;
  if (params.get("error")) return back("google-abgebrochen");

  const state = params.get("state");
  const code = params.get("code");
  // Ohne diese Prüfung könnte jemand eine fremde Anmeldung in den Browser
  // eines Opfers einschleusen.
  if (!state || !safeCompare(state, pending.state)) return back("google-ungueltig");
  if (!code) return back("google-ungueltig");

  const identity = await exchangeCode(code, pending);
  if (!identity) return back("google-ungueltig");
  if (!identity.emailVerified) return back("google-unbestaetigt");

  // Zuerst über die unveränderliche Google-Kennung suchen, erst dann über die
  // Adresse. Wer seine Google-Adresse ändert, behält so seinen Zugang.
  const [account] = await db
    .select({
      id: staff.id,
      name: staff.name,
      active: staff.active,
      googleSub: staff.googleSub,
    })
    .from(staff)
    .where(
      or(
        eq(staff.googleSub, identity.sub),
        and(eq(staff.email, identity.email), isNull(staff.googleSub)),
      ),
    )
    .limit(1);

  // Kein Konto? Dann bleibt die Tür zu. Es wird bewusst keines angelegt —
  // sonst käme jeder mit einem Google-Konto in den Team-Bereich.
  if (!account || !account.active) {
    await record("anmeldung.google-abgelehnt", { label: "System" }, { grund: "kein Konto" });

    // Wer es wiederholt mit fremden Konten versucht, probiert Adressen durch.
    const abuse = await consume(`google-unbekannt:${ip}`, 5, 900);
    if (!abuse.ok) await blockIp(ip, 30, "Wiederholte Google-Anmeldung ohne Konto");

    return back("google-kein-konto");
  }

  if (!account.googleSub) {
    await db
      .update(staff)
      .set({ googleSub: identity.sub, googleLinkedAt: new Date(), updatedAt: new Date() })
      .where(eq(staff.id, account.id));
    await record("konto.google-verknuepft", { id: account.id, label: account.name });
  }

  const headerStore = await headers();
  await createSession(account.id, { userAgent: headerStore.get("user-agent"), ip });
  await db.update(staff).set({ lastLoginAt: new Date() }).where(eq(staff.id, account.id));
  await record("anmeldung.erfolgreich", { id: account.id, label: account.name }, { weg: "google" });

  return NextResponse.redirect(`${env.appUrl}/team`);
}
