"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Das Drei-Punkte-Menü für Aktionen an einer Zeile oder Karte — Passwort
 * zurücksetzen, Zugang abschalten, Termin verschieben und Ähnliches. Bündelt
 * mehrere gleichrangige, selten gebrauchte Aktionen hinter einem Knopf statt
 * sie als Reihe von Textlinks auszubreiten, die bei jeder Zeile neu gelesen
 * werden müssen.
 */
export function ActionMenu({
  label = "Aktionen",
  align = "right",
  children,
}: {
  label?: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid place-items-center w-8 h-8 rounded-full text-slate hover:bg-concrete-dim hover:text-deep transition-colors"
      >
        <span className="sr-only">{label}</span>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="3.5" r="1.6" fill="currentColor" />
          <circle cx="9" cy="9" r="1.6" fill="currentColor" />
          <circle cx="9" cy="14.5" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          onClick={() => {
            // Erst nach dem aktuellen Klick schliessen: ein Submit-Knopf
            // löst beim Klicken selbst noch das Absenden des umgebenden
            // Formulars aus — würde das Menü synchron schliessen, verliert
            // React den Knopf aus dem DOM, bevor der Browser das Formular
            // überhaupt abschickt, und die Aktion verpufft stillschweigend.
            window.setTimeout(() => setOpen(false), 0);
          }}
          className={`glass absolute z-30 top-full mt-2 min-w-[13rem] rounded-[var(--radius-control)] p-1.5 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Eine Zeile im Menü — als Knopf für einen sofortigen Klick, als Submit
 * innerhalb eines eigenen `<form>` für eine Server-Aktion, oder als Link für
 * eine Aktion auf einer eigenen Seite (z. B. „Verschieben“). `danger`
 * markiert zerstörerische Aktionen (löschen, abschalten, absagen) in Rot.
 */
export function ActionMenuItem({
  children,
  href,
  onClick,
  danger,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const className = `block w-full text-left px-3 py-2 rounded-[calc(var(--radius-control)-6px)] text-fine font-semibold transition-colors disabled:opacity-50 ${
    danger ? "text-danger hover:bg-danger-tint" : "text-deep hover:bg-deep/6"
  }`;

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}
