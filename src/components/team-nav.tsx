"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/team/actions";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import type { StaffRole } from "@/lib/db/schema";
import { BrandMark } from "./brand-mark";
import { TeamIcon, type TeamIconName } from "./team-icons";
import { site } from "@/lib/site";

type NavLink = { href: string; label: string; icon: TeamIconName };

/**
 * Navigation des Team-Bereichs.
 *
 * Ab 1024px eine helle Spalte links über die volle Höhe, darunter eine
 * schmale Leiste mit Aufklapper. Vorher war die Spalte dunkel und der
 * aktive Eintrag ein voller roter Balken — das lauteste Element jeder
 * Seite war damit die Navigation, nicht der Inhalt. Jetzt markiert eine
 * ruhige Fläche mit roter Kante, wo man ist; Rot bleibt für Aktionen und
 * Warnungen.
 *
 * Das Zeichen oben führt zur Übersicht, nicht auf die Website — wer im
 * Team-Bereich arbeitet, will dort bleiben. Zur Website geht es unten über
 * einen eigenen, benannten Link.
 */
export function TeamNav({
  groups,
  name,
  role,
}: {
  groups: NavLink[][];
  name: string;
  role: StaffRole;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Nach einem Seitenwechsel darf das Menü nicht offen bleiben.
  useEffect(() => setOpen(false), [pathname]);

  function isActive(href: string): boolean {
    return href === "/team" ? pathname === "/team" : pathname.startsWith(href);
  }

  const brand = (
    <Link href="/team" className="flex items-center gap-2.5 shrink-0" aria-label="Team-Bereich, zur Übersicht">
      <BrandMark className="w-8" />
      <span className="leading-tight">
        <span className="stretch-wide font-extrabold block">{site.name}</span>
        <span className="text-[0.75rem] text-slate block">Team-Bereich</span>
      </span>
    </Link>
  );

  const roleLabel = ROLE_LABEL[role];
  const account = (
    <div className="grid gap-3">
      <Link
        href="/team/konto"
        aria-current={isActive("/team/konto") ? "page" : undefined}
        className={`flex items-center gap-3 rounded-[var(--radius-control)] px-2.5 py-2 transition-colors ${
          isActive("/team/konto") ? "bg-concrete" : "hover:bg-concrete"
        }`}
      >
        <span className="grid place-items-center w-9 h-9 rounded-full bg-concrete-dim text-deep shrink-0">
          <TeamIcon name="konto" />
        </span>
        <span className="min-w-0 text-fine leading-tight">
          <span className="font-bold block truncate">{name}</span>
          {/* Heisst das Konto wie die Rolle (das erste Konto heisst
              "Administration"), stünde dasselbe Wort zweimal untereinander. */}
          <span className="text-slate block truncate">
            {roleLabel !== name ? `${roleLabel}, ` : ""}Mein Konto
          </span>
        </span>
      </Link>
      <div className="flex items-center justify-between gap-3 px-2.5 text-fine">
        <Link href="/" className="text-slate hover:text-deep underline-offset-4 hover:underline">
          Zur Website
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="font-semibold text-slate hover:text-deep underline-offset-4 hover:underline">
            Abmelden
          </button>
        </form>
      </div>
    </div>
  );

  const nav = (
    <nav aria-label="Team-Bereich" className="grid gap-4">
      {groups.map((group, index) => (
        <ul key={index} className={`grid gap-0.5 ${index > 0 ? "pt-4 border-t border-rule" : ""}`}>
          {group.map((link) => {
            const active = isActive(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-fine font-semibold transition-colors ${
                    active ? "bg-concrete text-deep" : "text-slate hover:text-deep hover:bg-concrete/70"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-signal" aria-hidden="true" />
                  )}
                  <TeamIcon name={link.icon} />
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );

  return (
    <>
      {/* Bis 1024px: Leiste mit Aufklapper */}
      <div className="lg:hidden sticky top-0 z-50 bg-paper border-b border-rule">
        <div className="shell py-2.5 flex items-center gap-4">
          {brand}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="team-menue"
            className="ml-auto btn btn-outline py-2 px-3.5 text-fine"
          >
            {open ? "Schliessen" : "Menü"}
          </button>
        </div>

        {open && (
          <div id="team-menue" className="shell pb-4 grid gap-4 border-t border-rule pt-4 max-h-[calc(100dvh-4rem)] overflow-y-auto">
            {nav}
            <div className="border-t border-rule pt-3">{account}</div>
          </div>
        )}
      </div>

      {/* Ab 1024px: Spalte links, über die volle Höhe, bleibt beim Blättern stehen */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 shrink-0 bg-paper border-r border-rule lg:sticky lg:top-0 lg:h-dvh">
        <div className="px-5 pt-5 pb-6">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3">{nav}</div>
        <div className="border-t border-rule px-3 py-3">{account}</div>
      </aside>
    </>
  );
}
