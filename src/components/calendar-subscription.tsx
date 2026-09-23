"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { rotateCalendarTokenAction } from "@/app/team/konto/actions";

export function CalendarSubscription({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ohne Zwischenablage-Rechte bleibt das Feld zum Markieren da.
      setCopied(false);
    }
  }

  return (
    <div>
      <p className="text-slate mb-5 max-w-[62ch]">
        Deine Termine erscheinen automatisch in Google Kalender, Apple Kalender oder Outlook.
        Einmal einrichten, danach aktualisiert es sich von selbst.
      </p>

      <label className="field-label" htmlFor="kalender-link">
        Dein persönlicher Kalender-Link
      </label>
      <input
        id="kalender-link"
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="field text-fine break-all"
      />

      <div className="flex flex-wrap items-center gap-4 mt-3">
        <button type="button" onClick={copy} className="btn btn-outline py-2 px-4 text-fine">
          {copied ? "Kopiert" : "Link kopieren"}
        </button>
        <form action={rotateCalendarTokenAction}>
          <RotateButton />
        </form>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3 mt-7">
        <li className="rounded-[var(--radius-control)] bg-concrete p-4">
          <p className="font-bold text-deep">Google Kalender</p>
          <p className="text-fine text-slate mt-1">
            Einstellungen öffnen, „Kalender hinzufügen“, dann „Per URL“ — Link einfügen.
          </p>
        </li>
        <li className="rounded-[var(--radius-control)] bg-concrete p-4">
          <p className="font-bold text-deep">Apple Kalender</p>
          <p className="text-fine text-slate mt-1">
            Ablage, „Neues Kalenderabonnement“ — Link einfügen.
          </p>
        </li>
        <li className="rounded-[var(--radius-control)] bg-concrete p-4">
          <p className="font-bold text-deep">Outlook</p>
          <p className="text-fine text-slate mt-1">
            Kalender hinzufügen, „Aus dem Internet abonnieren“ — Link einfügen.
          </p>
        </li>
      </ol>

      <div className="max-w-[62ch] space-y-3 mt-6">
        <p className="text-fine text-slate">
          Der Link enthält kein Passwort und ist trotzdem geheim: Wer ihn hat, sieht deine
          Termine. Gib ihn nicht weiter. Ist er versehentlich abhandengekommen, erzeuge einen
          neuen — der alte hört dann sofort auf zu funktionieren, und du richtest das Abonnement
          neu ein.
        </p>
        <p className="text-fine text-slate">
          Google fragt abonnierte Kalender nur alle paar Stunden ab. Neue Buchungen erscheinen
          deshalb dort verzögert, im Team-Kalender dieser Seite sofort.
        </p>
      </div>
    </div>
  );
}

function RotateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-fine font-semibold text-slate hover:text-danger underline underline-offset-2 disabled:opacity-50"
    >
      {pending ? "Wird erneuert …" : "Neuen Link erzeugen"}
    </button>
  );
}
