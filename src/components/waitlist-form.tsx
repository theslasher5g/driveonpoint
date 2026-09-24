"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  joinWaitlistAction,
  type WaitlistState,
} from "@/app/buchen/warteliste/actions";
import { CaptchaField } from "./captcha-field";
import { Honeypot } from "./honeypot";
import { PhoneField } from "./phone-field";

const EMPTY: WaitlistState = {};

export function WaitlistForm({
  slug,
  day,
  time,
}: {
  slug: string;
  day: string;
  time: string;
}) {
  const [state, action] = useActionState(joinWaitlistAction, EMPTY);

  if (state.ok) {
    return (
      <div className="notice notice-success" role="status">
        <h2 className="text-lg font-bold">Du stehst auf der Warteliste</h2>
        <p className="text-slate mt-2">
          Wird ein Platz frei, bekommst du sofort eine Mail. Wer dann zuerst
          bucht, hat den Platz. Eine Bestätigung liegt in deinem Postfach.
        </p>
      </div>
    );
  }

  if (state.bookable) {
    return (
      <div className="notice notice-success" role="status">
        <h2 className="text-lg font-bold">
          Gerade ist ein Platz frei geworden
        </h2>
        <p className="text-slate mt-2">
          Du musst nicht warten, du kannst ihn direkt buchen.
        </p>
        <Link
          href={`/buchen?angebot=${slug}&tag=${day}&zeit=${time}`}
          className="btn btn-primary mt-4"
        >
          Diesen Termin buchen
        </Link>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="angebot" value={slug} />
      <input type="hidden" name="tag" value={day} />
      <input type="hidden" name="zeit" value={time} />
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
          <p className="field-hint text-danger font-semibold">
            {state.fieldErrors.name}
          </p>
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
        <p className="field-hint">
          Hierhin schicken wir die Nachricht, sobald ein Platz frei ist.
        </p>
        {state.fieldErrors?.email && (
          <p className="field-hint text-danger font-semibold">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <PhoneField
        error={state.fieldErrors?.telefon}
        defaultValue={state.values?.telefon}
      />

      <CaptchaField scope="warteliste" refreshOn={state} />

      <p className="text-fine text-slate">
        Deine Angaben brauchen wir nur für diese Warteliste. Nach dem Kurstermin
        werden sie gelöscht, austragen kannst du dich jederzeit über den Link in
        der Mail. Mehr dazu in der{" "}
        <Link
          href="/datenschutz"
          className="font-semibold underline underline-offset-4"
        >
          Datenschutzerklärung
        </Link>
        .
      </p>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary w-full sm:w-auto"
      disabled={pending}
    >
      {pending ? "Wird eingetragen …" : "Auf die Warteliste"}
    </button>
  );
}
