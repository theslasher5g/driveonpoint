"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { togglePasswordLoginAction, unlinkGoogleAction } from "@/app/team/konto/actions";

export function GoogleAccount({
  linked,
  passwordLoginEnabled,
  configured,
}: {
  linked: boolean;
  passwordLoginEnabled: boolean;
  configured: boolean;
}) {
  const [asking, setAsking] = useState(false);

  if (!configured) {
    return (
      <p className="text-slate max-w-md">
        Die Anmeldung über Google ist auf diesem Server nicht eingerichtet. Du meldest dich mit
        Mailadresse und Passwort an.
      </p>
    );
  }

  return (
    <div className="max-w-md space-y-5">
      {linked ? (
        <p className="surface bg-signal-tint border-l-4 border-signal px-4 py-3">
          <span className="font-bold">Google ist verknüpft.</span> Du kannst dich auf der
          Anmeldeseite mit einem Klick anmelden.
        </p>
      ) : (
        <p className="text-slate">
          Noch nicht verknüpft. Melde dich einmal über den Google-Knopf auf der Anmeldeseite an —
          dabei wird dein Google-Konto automatisch mit diesem Konto verbunden. Die Mailadresse
          muss dieselbe sein.
        </p>
      )}

      {linked && (
        <>
          <form action={togglePasswordLoginAction}>
            <input type="hidden" name="aktiv" value={passwordLoginEnabled ? "nein" : "ja"} />
            <p className="text-fine text-slate mb-2">
              {passwordLoginEnabled
                ? "Solange die Passwortanmeldung an ist, bleibt auch ein altes Passwort gültig. Abschalten ist sicherer, wenn du ohnehin nur noch Google nutzt."
                : "Die Passwortanmeldung ist abgeschaltet. Nur noch Google öffnet dieses Konto."}
            </p>
            <ToggleButton enabled={passwordLoginEnabled} />
          </form>

          <div>
            {asking ? (
              <form action={unlinkGoogleAction} className="flex flex-wrap items-center gap-3">
                <UnlinkButton />
                <button
                  type="button"
                  onClick={() => setAsking(false)}
                  className="text-fine font-semibold text-slate underline underline-offset-2"
                >
                  Abbrechen
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAsking(true)}
                disabled={!passwordLoginEnabled}
                className="text-fine font-semibold text-slate hover:text-[#B3261E] underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
              >
                Google-Verknüpfung lösen
              </button>
            )}
            {!passwordLoginEnabled && (
              <p className="field-hint">
                Nicht möglich, solange Google der einzige Weg in dieses Konto ist. Schalte zuerst
                die Passwortanmeldung wieder an.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ToggleButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-outline py-2 px-4 text-fine" disabled={pending}>
      {pending
        ? "Wird geändert …"
        : enabled
          ? "Passwortanmeldung abschalten"
          : "Passwortanmeldung wieder einschalten"}
    </button>
  );
}

function UnlinkButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-fine font-bold bg-[#B3261E] text-paper px-2.5 py-1 rounded disabled:opacity-60"
    >
      {pending ? "Wird gelöst …" : "Wirklich lösen"}
    </button>
  );
}
