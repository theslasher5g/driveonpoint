"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateLessonTypeAction, type PriceState } from "@/app/team/preise/actions";
import type { LessonType } from "@/lib/db/schema";
import { formatPrice } from "@/lib/time";

const EMPTY: PriceState = {};

export function LessonTypeEditor({ lessonType }: { lessonType: LessonType }) {
  const [state, action] = useActionState(updateLessonTypeAction, EMPTY);

  return (
    <form action={action} className="surface bg-paper">
      <input type="hidden" name="id" value={lessonType.id} />

      {/* Eingeklappt, damit vier bis fünf Angebote nicht sofort den ganzen
          Bildschirm mit Feldern füllen — Name und Preis reichen für den
          Überblick, die Bearbeitung ist einen Klick entfernt. */}
      <details className="group">
        <summary className="list-none cursor-pointer flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-5 md:p-6 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold leading-tight">{lessonType.name}</h2>
            {!lessonType.active && (
              <span className="inline-block mt-2 text-fine font-bold bg-concrete-dim text-slate px-2.5 py-0.5 rounded-full">
                nicht buchbar
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <p className="nums font-display text-2xl md:text-3xl font-bold leading-none text-signal-ink">
              CHF {formatPrice(lessonType.priceRappen)}
            </p>
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="text-slate shrink-0 transition-transform group-open:rotate-180"
            >
              <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </summary>

        <div className="px-5 pb-5 md:px-6 md:pb-6 pt-1 border-t border-deep/10">
          {state.error && (
            <p role="alert" className="notice notice-error my-5">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p role="status" className="notice notice-success my-5">
              {state.ok}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 mt-5">
            <Text
              id={`${lessonType.id}-name`}
              name="name"
              label="Name"
              defaultValue={lessonType.name}
              required
            />
            <Text
              id={`${lessonType.id}-beschreibung`}
              name="beschreibung"
              label="Kurzbeschreibung"
              hint="Steht in der Preisliste unter dem Namen."
              defaultValue={lessonType.shortDescription}
            />
            <Num
              id={`${lessonType.id}-preis`}
              name="preis"
              label="Preis in Franken"
              step="0.05"
              defaultValue={formatPrice(lessonType.priceRappen)}
              required
            />
            <Num
              id={`${lessonType.id}-dauer`}
              name="dauer"
              label="Dauer in Minuten"
              step="5"
              defaultValue={String(lessonType.durationMinutes)}
              required
            />
            <Num
              id={`${lessonType.id}-pause`}
              name="pause"
              label="Pause danach in Minuten"
              hint="Zeit für die Fahrt zum nächsten Treffpunkt."
              step="5"
              defaultValue={String(lessonType.bufferMinutes)}
              required
            />
            <Num
              id={`${lessonType.id}-plaetze`}
              name="plaetze"
              label="Plätze pro Termin"
              hint="1 für Fahrstunden, mehr für Kurse."
              step="1"
              defaultValue={String(lessonType.capacity)}
              required
            />
            <Num
              id={`${lessonType.id}-vorlauf`}
              name="vorlauf"
              label="Vorlauf in Stunden"
              hint="So kurzfristig darf frühestens gebucht werden."
              step="1"
              defaultValue={String(lessonType.leadTimeHours)}
              required
            />
            <div>
              <label className="field-label" htmlFor={`aktiv-${lessonType.id}`}>
                Online buchbar
              </label>
              <select
                id={`aktiv-${lessonType.id}`}
                name="aktiv"
                className="field"
                defaultValue={lessonType.active ? "ja" : "nein"}
              >
                <option value="ja">Ja, auf der Website anbieten</option>
                <option value="nein">Nein, ausblenden</option>
              </select>
            </div>
          </div>

          <SaveButton />
        </div>
      </details>
    </form>
  );
}

function Text({
  id,
  name,
  label,
  hint,
  defaultValue,
  required,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} name={name} className="field" defaultValue={defaultValue} required={required} />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function Num({
  id,
  name,
  label,
  hint,
  step,
  defaultValue,
  required,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  step: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        className="field nums"
        defaultValue={defaultValue}
        required={required}
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary mt-6" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Speichern"}
    </button>
  );
}
