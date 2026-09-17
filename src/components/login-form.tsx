"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/app/team/anmelden/actions";

const EMPTY: LoginState = {};

export function LoginForm() {
  const [state, action] = useActionState(loginAction, EMPTY);

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
        />
      </div>

      <div>
        <label className="field-label" htmlFor="passwort">
          Passwort
        </label>
        <input
          id="passwort"
          name="passwort"
          type="password"
          autoComplete="current-password"
          className="field"
          required
        />
      </div>

      <SubmitButton />

      <p className="text-fine text-slate">
        Passwort vergessen? Die Administration setzt es dir im Team-Bereich zurück.
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Wird geprüft …" : "Anmelden"}
    </button>
  );
}
