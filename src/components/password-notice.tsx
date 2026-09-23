"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Zeigt ein Startpasswort genau einmal an — als Dialog statt als Kasten
 * mitten im Formular. Der amberfarbene Hinweis ging vorher leicht unter,
 * gerade für Leute ohne IT-Hintergrund; ein Dialog erzwingt Aufmerksamkeit
 * und lässt sich nicht aus Versehen überlesen.
 *
 * Gespeichert wird nur der Hash. Wer den Dialog schliesst, ohne das
 * Passwort weiterzugeben, muss es zurücksetzen — das ist Absicht.
 */
export function PasswordNotice({ heading, password }: { heading: string; password: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [password]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Esc schliesst native Dialoge sonst stillschweigend — hier soll das
    // Passwort nur verschwinden, wenn jemand bewusst bestätigt, es notiert
    // zu haben.
    function onCancel(event: Event) {
      event.preventDefault();
    }
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] overflow-visible rounded-[var(--radius-surface)] border border-deep/20 bg-paper p-0 backdrop:bg-deep/60"
    >
      <div className="p-6 md:p-7">
        <span className="chip inline-block">Nur jetzt sichtbar</span>
        <h2 className="font-display text-xl font-bold mt-4">{heading}</h2>

        <p className="nums font-extrabold text-2xl mt-4 tracking-wide break-all select-all rounded-[var(--radius-control)] bg-concrete px-4 py-3.5">
          {password}
        </p>

        <button
          type="button"
          onClick={copy}
          className="btn btn-outline py-2 px-4 text-fine mt-4"
        >
          {copied ? "Kopiert" : "Passwort kopieren"}
        </button>

        <p className="text-fine text-slate mt-5">
          Gib es der Person persönlich oder am Telefon weiter. Es erscheint nur jetzt und wird
          beim ersten Anmelden geändert.
        </p>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="btn btn-primary mt-6 w-full sm:w-auto"
        >
          Weitergegeben — schliessen
        </button>
      </div>
    </dialog>
  );
}
