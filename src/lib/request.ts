import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { env } from "./env";
import { ipFromHeaders, networkKey } from "./ip";

/**
 * Ermittelt die Adresse der Gegenstelle.
 *
 * X-Forwarded-For kann von aussen frei gesetzt werden. Vertrauenswürdig sind
 * nur die Einträge, die unsere eigenen Reverse-Proxys angehängt haben — das
 * sind die letzten TRUST_PROXY_HOPS. Wer selbst einen Header mitschickt,
 * landet weiter vorne in der Liste und wird ignoriert. Ohne diese Zählung
 * liesse sich jede Sperre durch eine erfundene Adresse umgehen. Die Regel
 * selbst steht in lib/ip.ts, die Middleware verwendet dieselbe.
 *
 * Geliefert wird der Anschluss: bei IPv4 die Adresse, bei IPv6 das /64-Netz.
 * Alle Zähler und Sperren hängen daran — mit einzelnen IPv6-Adressen könnte
 * ein Anschluss für jeden Versuch eine neue nehmen und etwa beim Anmelden
 * beliebig viele Passwörter durchprobieren.
 */
export async function clientIp(): Promise<string> {
  const store = await headers();
  const ip = ipFromHeaders(store.get("x-forwarded-for"), store.get("x-real-ip"), env.trustProxyHops);
  return ip ? networkKey(ip) : "unbekannt";
}

/**
 * Für Protokolle: die Adresse wird nur als Prüfsumme abgelegt. Damit lässt
 * sich noch erkennen, ob zwei Anfragen von derselben Stelle kamen, aber der
 * Datenbestand enthält keine Personendaten mehr.
 *
 * Geschlüsselt mit dem Server-Geheimnis, nicht bloss gehasht: der gesamte
 * IPv4-Raum liesse sich sonst in Minuten durchrechnen und die Zuordnung wäre
 * wiederhergestellt.
 */
export function hashIp(ip: string): string {
  return createHmac("sha256", env.sessionSecret).update(ip).digest("hex").slice(0, 32);
}
