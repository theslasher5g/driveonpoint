"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createStaffAction, type StaffState } from "@/app/team/mitarbeiter/actions";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/permissions";
import { staffRole } from "@/lib/db/schema";
import { PasswordNotice } from "./password-notice";

const EMPTY: StaffState = {};

export function CreateStaffForm() {
  const [state, action] = useActionState(createStaffAction, EMPTY);

  return (
    <form action={action} className="surface bg-paper p-5 md:p-6 max-w-2xl space-y-4">
      {state.error && (
        <p role="alert" className="notice notice-error">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="notice notice-success">
          {state.ok} Das Startpasswort wurde in einem Fenster angezeigt.
        </p>
      )}
      {state.ok && state.password && (
        <PasswordNotice heading={state.ok} password={state.password} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="neu-name">
            Vor- und Nachname
          </label>
          <input id="neu-name" name="name" className="field" required />
        </div>
        <div>
          <label className="field-label" htmlFor="neu-email">
            Mailadresse
          </label>
          <input id="neu-email" name="email" type="email" className="field" required />
          <p className="field-hint">Damit meldet sich die Person an.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="neu-telefon">
            Telefon <span className="font-normal text-slate">(freiwillig)</span>
          </label>
          <input id="neu-telefon" name="telefon" type="tel" className="field" />
        </div>
        <div>
          <label className="field-label" htmlFor="neu-rolle">
            Rolle
          </label>
          <select id="neu-rolle" name="rolle" className="field" defaultValue="bearbeiter">
            {staffRole.enumValues.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
          <p className="field-hint">{ROLE_DESCRIPTION.bearbeiter}</p>
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Wird angelegt …" : "Konto anlegen"}
    </button>
  );
}
