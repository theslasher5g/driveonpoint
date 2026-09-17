"use client";

import Image from "next/image";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  confirmMfaSetupAction,
  disableMfaAction,
  regenerateRecoveryCodesAction,
  startMfaSetupAction,
  type MfaConfirmState,
  type MfaSetupState,
} from "@/app/team/konto/actions";
import { RecoveryCodesNotice } from "./recovery-codes-notice";

const EMPTY_CONFIRM: MfaConfirmState = {};

export function MfaSetup({ enabled }: { enabled: boolean }) {
  if (enabled) return <MfaEnabled />;
  return <MfaDisabled />;
}

function MfaDisabled() {
  const [pending, startTransition] = useTransition();
  const [setup, setSetup] = useState<MfaSetupState | null>(null);
  const [confirmState, confirmAction] = useActionState(confirmMfaSetupAction, EMPTY_CONFIRM);

  if (confirmState.codes) {
    return (
      <div className="max-w-md space-y-5">
        <p className="notice notice-success">
          MFA ist eingerichtet.
        </p>
        <RecoveryCodesNotice codes={confirmState.codes} />
        <p className="text-fine text-slate">
          Diese Seite kannst du jetzt verlassen — die Codes werden kein zweites Mal angezeigt.
        </p>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="max-w-md">
        <p className="text-slate mb-5">
          Schützt dein Konto mit einem zusätzlichen Code aus einer Authenticator-App (Google
          Authenticator, Authy, 1Password oder ähnlich). Läuft vollständig lokal auf deinem
          Telefon — es wird nichts an einen fremden Dienst übertragen.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await startMfaSetupAction();
              setSetup(result);
            })
          }
          className="btn btn-primary"
        >
          {pending ? "Wird vorbereitet …" : "MFA einrichten"}
        </button>
      </div>
    );
  }

  if (setup.error) {
    return (
      <p role="alert" className="notice notice-error max-w-md">
        {setup.error}
      </p>
    );
  }

  return (
    <div className="max-w-md space-y-5">
      <ol className="space-y-4 text-slate">
        <li>
          <p className="font-bold text-deep">1. QR-Code scannen</p>
          <p className="mt-1">Öffne deine Authenticator-App und scanne diesen Code:</p>
          {setup.qrDataUrl && (
            <Image
              src={setup.qrDataUrl}
              alt="QR-Code für die Einrichtung der Zwei-Faktor-Authentifizierung"
              width={240}
              height={240}
              unoptimized
              className="surface border border-deep/12 mt-3"
            />
          )}
        </li>
        <li>
          <p className="font-bold text-deep">Geht der Scan nicht?</p>
          <p className="mt-1">Gib dieses Geheimnis stattdessen von Hand ein:</p>
          <p className="nums surface bg-concrete px-3 py-2 mt-2 font-bold tracking-wide break-all">
            {setup.secretDisplay}
          </p>
        </li>
      </ol>

      <form action={confirmAction} className="space-y-4">
        <p className="font-bold text-deep">2. Code bestätigen</p>
        {confirmState.error && (
          <p role="alert" className="notice notice-error">
            {confirmState.error}
          </p>
        )}
        <div>
          <label className="field-label" htmlFor="mfa-code">
            Code aus der App
          </label>
          <input
            id="mfa-code"
            name="code"
            className="field nums text-center text-xl tracking-[0.3em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            required
          />
        </div>
        <ConfirmButton />
      </form>
    </div>
  );
}

function MfaEnabled() {
  const [showDisable, setShowDisable] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [disableState, disableAction] = useActionState(disableMfaAction, {});
  const [regenState, regenAction] = useActionState(regenerateRecoveryCodesAction, {});

  if (regenState.codes) {
    return (
      <div className="max-w-md space-y-5">
        <p className="notice notice-success">
          Neue Wiederherstellungscodes erzeugt. Die alten gelten nicht mehr.
        </p>
        <RecoveryCodesNotice codes={regenState.codes} />
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-6">
      <p className="notice notice-success">
        MFA ist aktiv. Bei der Anmeldung wird zusätzlich zum Passwort ein Code verlangt.
      </p>

      <div>
        {showRegenerate ? (
          <form action={regenAction} className="space-y-3">
            <p className="text-fine text-slate">
              Erzeugt neue Wiederherstellungscodes und entwertet die alten. Bestätige mit einem
              aktuellen Code aus der App.
            </p>
            {regenState.error && (
              <p role="alert" className="text-fine font-semibold text-danger">
                {regenState.error}
              </p>
            )}
            <CodeInput />
            <div className="flex gap-3">
              <SmallSubmit label="Neue Codes erzeugen" busy="Wird erzeugt …" />
              <button
                type="button"
                onClick={() => setShowRegenerate(false)}
                className="text-fine font-semibold text-slate underline underline-offset-2"
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowRegenerate(true)}
            className="text-fine font-semibold text-signal-ink underline underline-offset-2"
          >
            Neue Wiederherstellungscodes erzeugen
          </button>
        )}
      </div>

      <div>
        {showDisable ? (
          <form action={disableAction} className="space-y-3">
            <p className="text-fine text-slate">
              Bestätige mit einem aktuellen Code aus der App, dass du MFA wirklich deaktivieren
              willst.
            </p>
            {disableState.error && (
              <p role="alert" className="text-fine font-semibold text-danger">
                {disableState.error}
              </p>
            )}
            <CodeInput />
            <div className="flex gap-3">
              <DangerSubmit />
              <button
                type="button"
                onClick={() => setShowDisable(false)}
                className="text-fine font-semibold text-slate underline underline-offset-2"
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowDisable(true)}
            className="text-fine font-semibold text-slate hover:text-danger underline underline-offset-2"
          >
            MFA deaktivieren
          </button>
        )}
      </div>
    </div>
  );
}

function CodeInput() {
  return (
    <input
      name="code"
      className="field nums text-center text-lg tracking-[0.3em] max-w-[10rem]"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="000000"
      required
    />
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Wird geprüft …" : "Bestätigen und aktivieren"}
    </button>
  );
}

function SmallSubmit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-outline py-2 px-4 text-fine">
      {pending ? busy : label}
    </button>
  );
}

function DangerSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-fine font-bold bg-danger text-paper px-3 py-2 rounded disabled:opacity-60"
    >
      {pending ? "Wird deaktiviert …" : "Wirklich deaktivieren"}
    </button>
  );
}
