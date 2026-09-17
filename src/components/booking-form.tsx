"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createBookingAction, type BookingState } from "@/app/buchen/actions";
import { CaptchaField } from "./captcha-field";
import { Honeypot } from "./honeypot";

const EMPTY: BookingState = {};

export function BookingForm({
  slug,
  day,
  time,
}: {
  slug: string;
  day: string;
  time: string;
}) {
  const [state, action] = useActionState(createBookingAction, EMPTY);

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="angebot" value={slug} />
      <input type="hidden" name="tag" value={day} />
      <input type="hidden" name="zeit" value={time} />
      <Honeypot />

      {state.error && (
        <p
          role="alert"
          className="bg-paper border-l-4 border-[#B3261E] px-5 py-4 font-semibold"
        >
          {state.error}
        </p>
      )}

      <Field
        name="name"
        label="Vor- und Nachname"
        autoComplete="name"
        error={state.fieldErrors?.name}
        required
      />
      <Field
        name="email"
        type="email"
        label="Mailadresse"
        hint="Hierhin geht die Bestätigung mit dem Absage-Link."
        autoComplete="email"
        inputMode="email"
        error={state.fieldErrors?.email}
        required
      />
      <Field
        name="telefon"
        type="tel"
        label="Telefonnummer"
        hint="Falls wir kurzfristig etwas verschieben müssen."
        autoComplete="tel"
        inputMode="tel"
        error={state.fieldErrors?.telefon}
        required
      />

      <div>
        <label className="field-label" htmlFor="bemerkung">
          Bemerkung <span className="font-normal text-slate">(freiwillig)</span>
        </label>
        <textarea
          id="bemerkung"
          name="bemerkung"
          rows={3}
          maxLength={500}
          className="field resize-y"
          aria-invalid={state.fieldErrors?.bemerkung ? "true" : undefined}
          placeholder="Zum Beispiel ein abweichender Treffpunkt."
        />
        {state.fieldErrors?.bemerkung && (
          <p className="field-hint text-[#B3261E]">{state.fieldErrors.bemerkung}</p>
        )}
      </div>

      <CaptchaField scope="buchung" />

      <div>
        <label className="flex gap-3 items-start cursor-pointer">
          <input
            type="checkbox"
            name="agb"
            value="ja"
            className="mt-1 w-5 h-5 accent-[#D33F2C] shrink-0"
            aria-invalid={state.fieldErrors?.agb ? "true" : undefined}
          />
          <span className="text-fine">
            Ich habe die{" "}
            <Link href="/agb" className="font-semibold underline underline-offset-4">
              Bedingungen
            </Link>{" "}
            und die{" "}
            <Link href="/datenschutz" className="font-semibold underline underline-offset-4">
              Datenschutzerklärung
            </Link>{" "}
            gelesen. Meine Angaben werden 30 Tage nach dem Termin gelöscht.
          </span>
        </label>
        {state.fieldErrors?.agb && (
          <p className="field-hint text-[#B3261E]">{state.fieldErrors.agb}</p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? "Wird eingetragen …" : "Termin verbindlich buchen"}
    </button>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  type = "text",
  required,
  autoComplete,
  inputMode,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel";
}) {
  const hintId = hint || error ? `${name}-hinweis` : undefined;

  return (
    <div>
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="field"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={hintId}
      />
      {(hint || error) && (
        <p id={hintId} className={`field-hint ${error ? "text-[#B3261E] font-semibold" : ""}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
