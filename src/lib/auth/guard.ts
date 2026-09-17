import "server-only";
import { redirect } from "next/navigation";
import { can, type Permission } from "./permissions";
import { currentUser, type SessionUser } from "./session";

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/team/anmelden");
  return user;
}

/**
 * Jede geschützte Seite und jede Server Action ruft das selbst auf.
 *
 * Die Prüfung findet bewusst nicht nur in der Middleware statt: die kennt die
 * Rolle nicht und schützt keine Server Actions. Wer eine Berechtigungsprüfung
 * hier vergisst, hat ein Loch — nicht die Navigation ausblenden, sondern hier
 * prüfen.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/team?fehler=keine-berechtigung");
  return user;
}

/** Für Server Actions: wirft, statt weiterzuleiten. */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error("Nicht angemeldet.");
  if (!can(user.role, permission)) throw new Error("Für diese Aktion fehlt die Berechtigung.");
  return user;
}
