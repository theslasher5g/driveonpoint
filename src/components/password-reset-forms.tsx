"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestResetAction, type RequestResetState } from "@/app/team/passwort-vergessen/actions";
import { setNewPasswordAction, type NewPasswordState } from "@/app/team/passwort-neu/[token]/actions";

const EMPTY_REQUEST: RequestResetState = {};
const EMPTY_NEW: NewPasswordState = {};

export function RequestResetForm() {
  const [state, action] = useActionState(requestResetAction, EMPTY_REQUEST);

  // Gleiche Meldung, ob es ein Konto gibt oder nicht.
  if (state.sent) {
    return (
      <div className="space-y-5">
        <p role="status" className="notice notice-success">
          Falls es zu dieser Adresse ein Konto gibt, ist jetzt eine Mail mit einem Link unterwegs.
        </p>
        <p className="text-slate text-fine">
          Der Link gilt 60 Minuten. Keine Mail nach ein paar Minuten? Schau im Spam-Ordner nach
          oder frag die Administration, sie kann dein Passwort im Team-Bereich zurücksetzen.
        </p>
        <Link href="/team/anmelden" className="btn btn-outline w-full">
          Zurück zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <p role="alert" className="notice notice-error">
          {state.error}
        </p>
      )}
      <div>
        <label className="field-label" htmlFor="email">
          Mailadresse
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          className="field"
          required
          autoFocus
        />
        <p className="field-hint">Die Adresse, mit der du dich anmeldest.</p>
      </div>
      <Submit idle="Link anfordern" busy="Wird gesendet …" />
      <p className="text-fine text-slate">
        <Link href="/team/anmelden" className="underline underline-offset-4 hover:text-deep">
          Zurück zur Anmeldung
        </Link>
      </p>
    </form>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(setNewPasswordAction, EMPTY_NEW);

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <p role="alert" className="notice notice-error">
          {state.error}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="field-label" htmlFor="neu">
          Neues Passwort
        </label>
        <input
          id="neu"
          name="neu"
          type="password"
          autoComplete="new-password"
          minLength={12}
          className="field"
          required
          autoFocus
        />
        <p className="field-hint">Mindestens 12 Zeichen. Ein Satz aus mehreren Wörtern ist sicher und gut zu merken.</p>
      </div>
      <div>
        <label className="field-label" htmlFor="wiederholung">
          Neues Passwort wiederholen
        </label>
        <input
          id="wiederholung"
          name="wiederholung"
          type="password"
          autoComplete="new-password"
          minLength={12}
          className="field"
          required
        />
      </div>
      <Submit idle="Passwort speichern" busy="Wird gespeichert …" />
    </form>
  );
}

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}
