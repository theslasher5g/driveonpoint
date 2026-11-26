/** Angemeldete Person für Team-Actions im Simulationslauf. */
import { can, type Permission } from "@/lib/auth/permissions";

type SimUser = { id: string; name: string; role: "admin" | "manager" | "bearbeiter"; mustChangePassword: boolean };
const state = globalThis as unknown as { __simUser?: SimUser };

export async function assertPermission(permission: Permission) {
  const user = state.__simUser;
  if (!user) throw new Error("Nicht angemeldet.");
  if (!can(user.role, permission)) throw new Error("Für diese Aktion fehlt die Berechtigung.");
  return user;
}
export const requireUser = assertPermission;
export const requirePermission = assertPermission;
export const PASSWORD_CHANGE_PAGE = "/team/konto";
