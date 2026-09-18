import type { Metadata } from "next";
import Link from "next/link";
import { TeamNav } from "@/components/team-nav";
import { BrandMark } from "@/components/brand-mark";
import { currentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { site } from "@/lib/site";

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
        {
          href: "/team/buchhaltung",
          label: "Buchhaltung",
          show: can(user.role, "buchhaltung.ansehen"),
        },
        { href: "/team/protokoll", label: "Protokoll", show: can(user.role, "protokoll.ansehen") },
        { href: "/team/konto", label: "Mein Konto", show: true },
      ].filter((link) => link.show)
    : [];

  if (user) {
    // Ab 1024px steht die Navigation als Spalte links, darunter als Leiste
    // oben — beides liefert TeamNav, hier zählt nur, dass der Inhalt daneben
    // und nicht darunter landet.
    return (
      <div className="lg:flex lg:items-start">
        <TeamNav links={links} name={user.name} role={user.role} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }

  // Anmeldung und Bestätigungscode liegen unter /team und bekommen deshalb
  // weder die öffentliche Kopfzeile noch die Navigation des Team-Bereichs —
  // ohne das hier gäbe es von dort keinen Weg zurück auf die Website.
  return (
    <>
      <div className="bg-deep text-paper">
        <div className="shell py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2"
            aria-label={`${site.name} — zur Website`}
          >
            <BrandMark className="w-6" tone="invert" />
            <span className="stretch-wide font-extrabold leading-none">{site.name}</span>
          </Link>
        </div>
      </div>
      {children}
    </>
  );
}
