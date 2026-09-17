import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { env } from "./env";

/**
 * Ermittelt die Adresse der Gegenstelle.
 *
 * X-Forwarded-For kann von aussen frei gesetzt werden. Vertrauenswürdig sind
 * nur die Einträge, die unsere eigenen Reverse-Proxys angehängt haben — das
 * sind die letzten TRUST_PROXY_HOPS. Wer selbst einen Header mitschickt,
 * landet weiter vorne in der Liste und wird ignoriert. Ohne diese Zählung
 * liesse sich jede Sperre durch eine erfundene Adresse umgehen.
 */
export async function clientIp(): Promise<string> {
  const store = await headers();
  const hops = Math.max(1, env.trustProxyHops);

  const forwarded = store.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const candidate = chain[chain.length - hops];
    if (candidate) return normaliseIp(candidate);
  }

  const real = store.get("x-real-ip");
  if (real) return normaliseIp(real);

  return "unbekannt";
}

function normaliseIp(raw: string): string {
  let value = raw.trim();
  // IPv4-Adressen kommen hinter manchen Proxys als "::ffff:192.0.2.1".
  if (value.startsWith("::ffff:")) value = value.slice(7);
  // Portangaben abschneiden, aber nur bei IPv4.
  if (value.includes(".") && value.includes(":")) value = value.split(":")[0];
  if (value.startsWith("[")) value = value.slice(1, value.indexOf("]"));
  return value.slice(0, 45);
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
