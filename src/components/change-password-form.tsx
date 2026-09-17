"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction, type AccountState } from "@/app/team/konto/actions";

const EMPTY: AccountState = {};

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, EMPTY);

  return (
    <form action={action} className="space-y-4 max-w-md">
      {state.error && (
        <p role="alert" className="notice notice-error">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="notice notice-success">
          {state.ok}
        </p>
      )}

      <div>
        <label className="field-label" htmlFor="aktuell">
          Aktuelles Passwort
        </label>
        <input
          id="aktuell"
          name="aktuell"
          type="password"
          autoComplete="current-password"
          className="field"
          required
        />
      </div>

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
        />
        <p className="field-hint">
          Mindestens 12 Zeichen. Drei zufällige Wörter sind sicherer und leichter zu merken als
          ein kurzes Passwort mit Sonderzeichen.
        </p>
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

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Wird geändert …" : "Passwort ändern"}
    </button>
  );
}
