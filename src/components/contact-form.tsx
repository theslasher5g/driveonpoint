"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendContactAction, type ContactState } from "@/app/kontakt/actions";
import { CaptchaField } from "./captcha-field";
import { Honeypot } from "./honeypot";
import { PhoneField } from "./phone-field";

const EMPTY: ContactState = {};

export function ContactForm() {
  const [state, action] = useActionState(sendContactAction, EMPTY);

  if (state.ok) {
    return (
      <div className="notice notice-success max-w-xl" role="status">
        <h2 className="text-lg font-bold">Nachricht ist angekommen</h2>
        <p className="text-slate mt-2">
          Wir melden uns innert eines Werktags. Eine Kopie deiner Nachricht liegt in deinem
          Postfach.
        </p>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="space-y-5 max-w-xl">
      <Honeypot />

      {state.error && (
        <p role="alert" className="notice notice-error">
          {state.error}
        </p>
      )}

      <div>
        <label className="field-label" htmlFor="name">
          Vor- und Nachname
        </label>
        <input
          id="name"
          name="name"
          className="field"
          autoComplete="name"
          required
          aria-invalid={state.fieldErrors?.name ? "true" : undefined}
          defaultValue={state.values?.name}
        />
        {state.fieldErrors?.name && (
          <p className="field-hint text-danger font-semibold">{state.fieldErrors.name}</p>
        )}
      </div>

      <div>
        <label className="field-label" htmlFor="email">
          Mailadresse
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          className="field"
          autoComplete="email"
          required
          aria-invalid={state.fieldErrors?.email ? "true" : undefined}
          defaultValue={state.values?.email}
        />
        {state.fieldErrors?.email && (
          <p className="field-hint text-danger font-semibold">{state.fieldErrors.email}</p>
        )}
      </div>

      <PhoneField
        hint="Falls wir dich für eine Antwort lieber kurz anrufen."
        error={state.fieldErrors?.telefon}
        defaultValue={state.values?.telefon}
      />

      <div>
        <label className="field-label" htmlFor="nachricht">
          Deine Nachricht
        </label>
        <textarea
          id="nachricht"
          name="nachricht"
          rows={6}
          maxLength={2000}
          className="field resize-y"
          required
          aria-invalid={state.fieldErrors?.nachricht ? "true" : undefined}
          defaultValue={state.values?.nachricht}
        />
        {state.fieldErrors?.nachricht && (
          <p className="field-hint text-danger font-semibold">{state.fieldErrors.nachricht}</p>
        )}
      </div>

      <CaptchaField scope="kontakt" refreshOn={state} />

      <p className="text-fine text-slate">
        Deine Angaben werden ausschliesslich zur Beantwortung dieser Anfrage verwendet und
        spätestens nach 30 Tagen gelöscht.
      </p>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? "Wird gesendet …" : "Nachricht senden"}
    </button>
  );
}
