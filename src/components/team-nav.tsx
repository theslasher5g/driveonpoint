"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/team/actions";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import type { StaffRole } from "@/lib/db/schema";

export function TeamNav({
  links,
  name,
  role,
}: {
  links: { href: string; label: string }[];
  name: string;
  role: StaffRole;
}) {
  const pathname = usePathname();

  return (
    <div className="bg-deep text-paper on-signal">
      {/* Auf dem Telefon zwei Zeilen: oben Name und Abmelden, darunter die
          Navigation über die volle Breite. In einer Zeile bliebe für die
          Navigation ein Streifen von wenigen Zentimetern. */}
      <div className="shell py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className="text-fine shrink-0">
          <span className="font-bold">{name}</span>
          <span className="text-paper/55"> — {ROLE_LABEL[role]}</span>
        </p>

        <nav
          aria-label="Team-Bereich"
          className="-mx-1 order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1"
        >
          {/* Waagrecht scrollbar statt umbrechend: auf dem Telefon bleibt
              die Leiste damit eine Zeile hoch. */}
          <ul className="flex gap-1 overflow-x-auto py-0.5">
            {links.map((link) => {
              const active =
                link.href === "/team" ? pathname === "/team" : pathname.startsWith(link.href);
              return (
                <li key={link.href} className="shrink-0">
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`block px-3 py-1.5 text-fine font-semibold whitespace-nowrap transition-colors ${
                      active ? "bg-signal text-paper" : "text-paper/70 hover:text-paper"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <form action={logoutAction} className="ml-auto shrink-0 sm:ml-0">
          <button
            type="submit"
            className="text-fine font-semibold text-paper/70 hover:text-paper underline-offset-4 hover:underline"
          >
            Abmelden
          </button>
        </form>
      </div>
    </div>
  );
}
