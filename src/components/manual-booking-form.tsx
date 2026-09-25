"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createManualBookingAction, type ManualBookingState } from "@/app/team/kalender/erfassen/actions";
import { PhoneField } from "./phone-field";

const EMPTY: ManualBookingState = {};

export function ManualBookingForm({
  angebot,
  person,
  day,
  time,
  pickup,
  repeatable = false,
  weekdayLabel,
}: {
  angebot: string;
  person: string;
  day: string;
  time: string;
  /** Abholung statt fester Kursort — nur als Hinweistext relevant. */
  pickup: boolean;
  /** Fahrstunden lassen sich als Serie erfassen: jede Woche zur selben Zeit. */
  repeatable?: boolean;
  /** Zum Beispiel "Montag" — für die Beschriftung der Serie. */
  weekdayLabel?: string;
}) {
  const [state, action] = useActionState(createManualBookingAction, EMPTY);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="angebot" value={angebot} />
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="tag" value={day} />
      <input type="hidden" name="zeit" value={time} />

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
      <PhoneField
        hint={pickup ? "Die Fahrlehrperson meldet sich telefonisch, um den Treffpunkt zu vereinbaren." : undefined}
        error={state.fieldErrors?.telefon}
        defaultValue={state.values?.telefon}
      />
      <Field
        name="email"
        type="email"
        label="Mailadresse"
        hint="Freiwillig — ohne sie geht keine Bestätigung raus, der Termin steht trotzdem."
        autoComplete="email"
        inputMode="email"
        error={state.fieldErrors?.email}
        defaultValue={state.values?.email}
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
          defaultValue={state.values?.bemerkung}
        />
        {state.fieldErrors?.bemerkung && (
          <p className="field-hint text-danger">{state.fieldErrors.bemerkung}</p>
        )}
      </div>

      {repeatable && (
        <div>
          <label className="field-label" htmlFor="wiederholen">
            Wiederholen
          </label>
          <select
            id="wiederholen"
            name="wiederholen"
            className="field"
            defaultValue={state.values?.wiederholen ?? "1"}
          >
            <option value="1">Nur dieser Termin</option>
            {Array.from({ length: 11 }, (_, index) => index + 2).map((count) => (
              <option key={count} value={count}>
                {count} Termine, jeden {weekdayLabel ?? "gleichen Wochentag"} um {time} Uhr
              </option>
            ))}
          </select>
          <p className="field-hint">
            Wochen, in denen die Zeit schon belegt oder keine Verfügbarkeit eingetragen ist, werden
            übersprungen. Du siehst danach, welche.
          </p>
        </div>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? "Wird eingetragen …" : "Termin erfassen"}
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
