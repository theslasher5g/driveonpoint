"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "./brand-mark";
import { site } from "@/lib/site";

const NAV = [
  { href: "/fahrstunden", label: "Fahrstunden" },
  { href: "/vku", label: "VKU" },
  { href: "/nothilfekurs", label: "Nothilfe" },
  { href: "/preise", label: "Preise" },
  { href: "/ausbildungsweg", label: "Ablauf" },
  { href: "/ueber-uns", label: "Über uns" },
  { href: "/kontakt", label: "Kontakt" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Nach einem Seitenwechsel darf das Menü nicht offen bleiben.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="bg-paper border-b border-deep/15 sticky top-0 z-50">
      <div className="shell flex items-center gap-4 h-16 md:h-20">
        <Link
          href="/"
          className="flex items-center gap-3 shrink-0 self-stretch"
          aria-label={`${site.name} — zur Startseite`}
        >
          <BrandMark className="w-9 md:w-10" />
          <span className="stretch-wide font-extrabold text-lg md:text-xl tracking-tight leading-none">
            {site.name}
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 ml-auto" aria-label="Hauptnavigation">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-2 text-[0.95rem] font-semibold transition-colors ${
                  active ? "text-signal-ink" : "text-deep/75 hover:text-deep"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Auf schmalen Geräten nur „Buchen“ — die lange Beschriftung bricht
            sonst um und drückt das Logo zusammen. */}
        <Link
          href="/buchen"
          className="btn btn-primary ml-auto lg:ml-3 text-[0.95rem] py-2.5 px-4 whitespace-nowrap"
        >
          <span className="sm:hidden">Buchen</span>
          <span className="hidden sm:inline">Termin buchen</span>
        </Link>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="hauptmenue"
          className="lg:hidden -mr-2 p-2.5 text-deep shrink-0"
        >
          <span className="sr-only">{open ? "Menü schliessen" : "Menü öffnen"}</span>
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" fill="none">
            {open ? (
              <path d="M5 5 L21 21 M21 5 L5 21" stroke="currentColor" strokeWidth="2.5" />
            ) : (
              <path d="M3 7h20M3 13h20M3 19h20" stroke="currentColor" strokeWidth="2.5" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="hauptmenue"
          className="lg:hidden border-t border-deep/15 bg-paper"
          aria-label="Hauptnavigation"
        >
          <ul className="shell py-2">
            {NAV.map((item) => (
              <li key={item.href} className="border-b border-deep/10 last:border-0">
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={`block py-3.5 font-semibold ${
                    pathname === item.href ? "text-signal-ink" : "text-deep"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
