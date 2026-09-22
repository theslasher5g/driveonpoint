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
    // Schwebende Kapsel statt voller Leiste: eigener Wrapper mit Abstand zum
    // Rand, damit "sticky" nicht die ganze Breite einnimmt. Bleibt beim
    // Laden an ihrem Platz im Textfluss (kein Überlappen der ersten
    // Bildschirmhöhe nötig) und hält diesen Abstand auch beim Scrollen.
    <div className="sticky top-3 md:top-4 z-50 px-3 md:px-6">
      <header className="glass mx-auto max-w-5xl rounded-full">
        <div className="flex items-center gap-2 md:gap-3 h-14 md:h-16 pl-4 pr-2 md:pl-6 md:pr-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0"
            aria-label={`${site.name} — zur Startseite`}
          >
            <BrandMark className="w-8 md:w-9" />
            <span className="stretch-wide font-extrabold text-base md:text-lg tracking-tight leading-none hidden sm:inline">
              {site.name}
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-0.5 ml-4" aria-label="Hauptnavigation">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`px-3 py-2 rounded-full text-[0.9rem] font-semibold transition-colors ${
                    active ? "bg-deep/8 text-signal-ink" : "text-deep/70 hover:text-deep"
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
            className="btn btn-primary ml-auto text-[0.9rem] py-2 px-4 md:px-5 whitespace-nowrap"
          >
            <span className="sm:hidden">Buchen</span>
            <span className="hidden sm:inline">Termin buchen</span>
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="hauptmenue"
            className="lg:hidden p-2 text-deep shrink-0"
          >
            <span className="sr-only">{open ? "Menü schliessen" : "Menü öffnen"}</span>
            <svg width="22" height="22" viewBox="0 0 26 26" aria-hidden="true" fill="none">
              {open ? (
                <path d="M5 5 L21 21 M21 5 L5 21" stroke="currentColor" strokeWidth="2.5" />
              ) : (
                <path d="M3 7h20M3 13h20M3 19h20" stroke="currentColor" strokeWidth="2.5" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {open && (
        <nav
          id="hauptmenue"
          className="glass lg:hidden mx-auto max-w-5xl mt-2 rounded-[28px] overflow-hidden"
          aria-label="Hauptnavigation"
        >
          <ul className="px-2 py-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={`block px-4 py-3 rounded-2xl font-semibold ${
                    pathname === item.href ? "bg-deep/8 text-signal-ink" : "text-deep"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
