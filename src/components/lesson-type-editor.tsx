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
    <form action={action} className="bg-paper border border-deep/15 p-5 md:p-6">
      <input type="hidden" name="id" value={lessonType.id} />

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-5">
        <h2 className="text-section stretch-wide leading-none">{lessonType.name}</h2>
        <p className="nums text-slate">
          aktuell CHF {formatPrice(lessonType.priceRappen)}
          {!lessonType.active && " · nicht buchbar"}
        </p>
      </div>

      {state.error && (
        <p role="alert" className="notice notice-error mb-5">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="notice notice-success mb-5">
          {state.ok}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
