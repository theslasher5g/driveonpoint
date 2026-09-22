"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/team/actions";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import type { StaffRole } from "@/lib/db/schema";
import { BrandMark } from "./brand-mark";
import { site } from "@/lib/site";

type NavLink = { href: string; label: string };

/**
 * Navigation des Team-Bereichs.
 *
 * Steht ab 1024px als Spalte links: waagrecht wurde die Leiste mit jedem
 * weiteren Eintrag enger, bis sie scrollen musste — ein Menü, das man erst
 * scrollen muss, um es zu lesen, versteckt die Hälfte seiner Einträge.
 * Senkrecht wächst sie stattdessen nach unten, wo Platz ist.
 *
 * Darunter bleibt eine schmale Leiste mit Aufklapper: eine feste Spalte
 * nähme auf dem Telefon die halbe Breite weg.
 */
export function TeamNav({
  links,
  name,
  role,
}: {
  links: NavLink[];
  name: string;
  role: StaffRole;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string): boolean {
    return href === "/team" ? pathname === "/team" : pathname.startsWith(href);
  }

  const brand = (
    <Link
      href="/"
      className="flex items-center gap-2 shrink-0"
      aria-label={`${site.name} — zur Website`}
    >
      <BrandMark className="w-6" tone="invert" />
      <span className="stretch-wide font-extrabold leading-none">{site.name}</span>
    </Link>
  );

  const account = (
    <div className="flex items-center justify-between gap-4">
      <p className="text-fine min-w-0">
        <span className="font-bold block truncate">{name}</span>
        <span className="text-paper/55">{ROLE_LABEL[role]}</span>
      </p>
      <form action={logoutAction}>
        <button
          type="submit"
          className="text-fine font-semibold text-paper/70 hover:text-paper underline-offset-4 hover:underline"
        >
          Abmelden
        </button>
      </form>
    </div>
  );

  function itemClass(href: string): string {
    return `block px-3 py-2 text-fine font-semibold transition-colors ${
      isActive(href) ? "bg-signal text-deep" : "text-paper/70 hover:text-paper hover:bg-paper/10"
    }`;
  }

  return (
    <>
      {/* Bis 1024px: Leiste mit Aufklapper */}
      <div className="lg:hidden glass-deep text-paper on-signal sticky top-0 z-50">
        <div className="shell py-3 flex items-center gap-4">
          {brand}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="team-menue"
            className="ml-auto text-fine font-semibold px-3 py-1.5 border border-paper/30 hover:border-paper/70 transition-colors"
          >
            {open ? "Schliessen" : "Menü"}
          </button>
        </div>

        {open && (
          <div id="team-menue" className="shell pb-4">
            <nav aria-label="Team-Bereich">
              <ul className="grid gap-0.5 border-t border-paper/15 pt-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={isActive(link.href) ? "page" : undefined}
                      className={itemClass(link.href)}
                      onClick={() => setOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="border-t border-paper/15 mt-3 pt-3">{account}</div>
          </div>
        )}
      </div>

      {/* Ab 1024px: Spalte links, bleibt beim Blättern stehen */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 xl:w-60 shrink-0 glass-deep text-paper on-signal lg:sticky lg:top-0 lg:h-dvh">
        <div className="px-4 py-5">{brand}</div>

        <nav aria-label="Team-Bereich" className="flex-1 overflow-y-auto px-2">
          <ul className="grid gap-0.5">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={itemClass(link.href)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-paper/15 px-4 py-4">{account}</div>
      </aside>
    </>
  );
}
