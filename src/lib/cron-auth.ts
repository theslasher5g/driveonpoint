import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Prüft das Geheimnis der Cron-Aufrufe. Es kommt im Authorization-Header,
 * nicht in der Adresse — sonst stünde es in jedem Zugriffsprotokoll des
 * Reverse Proxy.
 */
export function isAuthorizedCron(request: Request): boolean {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(provided);
  const right = Buffer.from(env.cronSecret);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
