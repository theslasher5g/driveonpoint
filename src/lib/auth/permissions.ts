import type { StaffRole } from "../db/schema";

export const PERMISSIONS = [
  "kalender.ansehen",
  "kalender.verwalten",
  "verfuegbarkeit.eigene",
  "verfuegbarkeit.alle",
  "preise.verwalten",
  "aktionen.verwalten",
  "mitarbeiter.verwalten",
  "protokoll.ansehen",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const BY_ROLE: Record<StaffRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  manager: [
    "kalender.ansehen",
    "kalender.verwalten",
    "verfuegbarkeit.eigene",
    "verfuegbarkeit.alle",
    "preise.verwalten",
    "aktionen.verwalten",
  ],
  bearbeiter: ["kalender.ansehen", "verfuegbarkeit.eigene"],
};

export function can(role: StaffRole, permission: Permission): boolean {
  return BY_ROLE[role].includes(permission);
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Administration",
  manager: "Leitung",
  bearbeiter: "Fahrlehrer",
};

export const ROLE_DESCRIPTION: Record<StaffRole, string> = {
  admin: "Sieht und ändert alles, inklusive Konten und Rollen der anderen.",
  manager: "Kalender aller Mitarbeitenden, Preise und Rabattaktionen.",
  bearbeiter: "Sieht den Kalender und trägt die eigene Verfügbarkeit ein.",
};
