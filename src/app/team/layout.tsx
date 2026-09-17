import type { Metadata } from "next";
import { TeamNav } from "@/components/team-nav";
import { currentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Der interne Bereich gehört nicht in Suchmaschinen.
  robots: { index: false, follow: false, nocache: true },
};

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  // Kein Zwang zur Anmeldung an dieser Stelle: die Anmeldeseite liegt selbst
  // unter /team und käme sonst in eine Endlosschleife. Jede geschützte Seite
  // prüft für sich, und die Navigation erscheint nur mit gültiger Sitzung.
  const user = await currentUser();

  const links = user
    ? [
        { href: "/team", label: "Übersicht", show: true },
        { href: "/team/kalender", label: "Kalender", show: can(user.role, "kalender.ansehen") },
        {
          href: "/team/verfuegbarkeit",
          label: "Verfügbarkeit",
          show: can(user.role, "verfuegbarkeit.eigene"),
        },
        { href: "/team/preise", label: "Preise", show: can(user.role, "preise.verwalten") },
        { href: "/team/aktionen", label: "Aktionen", show: can(user.role, "aktionen.verwalten") },
        {
          href: "/team/mitarbeiter",
          label: "Mitarbeitende",
          show: can(user.role, "mitarbeiter.verwalten"),
        },
        { href: "/team/konto", label: "Mein Konto", show: true },
      ].filter((link) => link.show)
    : [];

  return (
    <>
      {user && <TeamNav links={links} name={user.name} role={user.role} />}
      {children}
    </>
  );
}
