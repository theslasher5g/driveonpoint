/**
 * Adresse der Gegenstelle aus den Kopfzeilen — ohne "server-only", damit
 * die Middleware dieselbe Regel verwendet wie lib/request.ts.
 *
 * X-Forwarded-For kann von aussen frei gesetzt werden. Vertrauenswürdig sind
 * nur die Einträge, die unsere eigenen Reverse-Proxys angehängt haben — das
 * sind die letzten `hops`. Wer selbst einen Header mitschickt, landet weiter
 * vorne in der Liste und wird ignoriert.
 *
 * Ist die Kette kürzer als erwartet (TRUST_PROXY_HOPS zu hoch eingestellt),
 * stammen alle Einträge von unseren Proxys; genommen wird dann der vorderste.
 * X-Real-IP zählt nur, wenn X-Forwarded-For ganz fehlt — Caddy reicht diese
 * Kopfzeile unverändert durch, sie liesse sich sonst frei wählen.
 */
export function ipFromHeaders(
  forwarded: string | null,
  realIp: string | null,
  hops: number,
): string | null {
  const chain = (forwarded ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (chain.length > 0) {
    return normaliseIp(chain[Math.max(0, chain.length - Math.max(1, hops))]);
  }
  return realIp ? normaliseIp(realIp) : null;
}

export function normaliseIp(raw: string): string {
  let value = raw.trim();
  // IPv4-Adressen kommen hinter manchen Proxys als "::ffff:192.0.2.1".
  if (value.startsWith("::ffff:")) value = value.slice(7);
  // Portangaben abschneiden, aber nur bei IPv4.
  if (value.includes(".") && value.includes(":")) value = value.split(":")[0];
  if (value.startsWith("[")) value = value.slice(1, value.indexOf("]"));
  return value.slice(0, 45);
}

/**
 * Schlüssel für Zähler pro Anschluss: bei IPv6 das /64-Netz statt der
 * einzelnen Adresse. Ein Anschluss bekommt ein ganzes /64 und könnte sonst
 * für jede Anfrage eine neue Adresse nehmen.
 */
export function networkKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail !== undefined && tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? front : [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, "") || "0")
    .join(":")}::/64`;
}
