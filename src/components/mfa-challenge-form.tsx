"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { verifyMfaAction, type MfaChallengeState } from "@/app/team/mfa/actions";

const EMPTY: MfaChallengeState = {};

export function MfaChallengeForm() {
  const [state, action] = useActionState(verifyMfaAction, EMPTY);

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <p role="alert" className="notice notice-error">
          {state.error}
        </p>
      )}

      <div>
        <label className="field-label" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          className="field nums text-center text-2xl tracking-[0.3em]"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          maxLength={11}
          placeholder="000000"
          required
        />
        <p className="field-hint">
          Sechsstelliger Code aus der App, oder ein Wiederherstellungscode im Format xxxxx-xxxxx.
        </p>
      </div>

      <label className="flex gap-3 items-start cursor-pointer">
        <input type="checkbox" name="merken" value="ja" className="mt-1 w-5 h-5 accent-signal shrink-0" />
        <span className="text-fine text-slate">
          <span className="font-semibold text-deep">Diesen Browser 30 Tage merken.</span> Hier genügt
          dann bei der Anmeldung das Passwort. Nur auf dem eigenen Gerät wählen.
        </span>
      </label>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Wird geprüft …" : "Bestätigen"}
    </button>
  );
}
