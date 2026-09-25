"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createMultiBookingAction, type BookingState } from "@/app/buchen/actions";
import { CaptchaField } from "./captcha-field";
import { Honeypot } from "./honeypot";
import { PhoneField } from "./phone-field";
import { ReviewConsent } from "./review-consent";

const EMPTY: BookingState = {};

export function MultiBookingForm({ slug, termine }: { slug: string; termine: string[] }) {
  const [state, action] = useActionState(createMultiBookingAction, EMPTY);

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="angebot" value={slug} />
      {termine.map((termin) => (
        <input key={termin} type="hidden" name="termin" value={termin} />
      ))}
      <Honeypot />

      {state.error && (
        <p role="alert" className="notice notice-error">
          {state.error}
        </p>
      )}

      <Field
        name="name"
        label="Vor- und Nachname"
        autoComplete="name"
        error={state.fieldErrors?.name}
        defaultValue={state.values?.name}
        required
      />
      <Field
        name="email"
        type="email"
        label="Mailadresse"
        hint="Hierhin geht ein Link, mit dem du die Buchung bestätigst."
        autoComplete="email"
        inputMode="email"
        error={state.fieldErrors?.email}
        defaultValue={state.values?.email}
        required
      />
      {/* Mehrfachbuchungen gibt es nur für Fahrstunden — immer Abholung. */}
      <PhoneField error={state.fieldErrors?.telefon} defaultValue={state.values?.telefon} />
      <p className="notice notice-quiet">
        Deine Fahrlehrperson meldet sich vor der Lektion telefonisch, um den Treffpunkt zu
        vereinbaren.
      </p>

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
          defaultValue={state.values?.bemerkung}
        />
        {state.fieldErrors?.bemerkung && (
          <p className="field-hint text-danger">{state.fieldErrors.bemerkung}</p>
        )}
      </div>

      <CaptchaField scope="buchung" refreshOn={state} />

      <div>
        <label className="flex gap-3 items-start cursor-pointer">
          <input
            type="checkbox"
            name="agb"
            value="ja"
            className="mt-1 w-5 h-5 accent-signal shrink-0"
            defaultChecked={state.values?.agb === "ja"}
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
          <p className="field-hint text-danger">{state.fieldErrors.agb}</p>
        )}
      </div>

      <ReviewConsent checked={state.values?.bewertung === "ja"} />

      <SubmitButton count={termine.length} />
    </form>
  );
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending}>
      {pending
        ? "Wird eingetragen …"
        : count === 1
          ? "Termin verbindlich buchen"
          : `${count} Termine verbindlich buchen`}
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
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel";
  defaultValue?: string;
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
        defaultValue={defaultValue}
        className="field"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={hintId}
      />
      {(hint || error) && (
        <p id={hintId} className={`field-hint ${error ? "text-danger font-semibold" : ""}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
