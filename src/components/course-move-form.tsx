"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { moveCourseAction, type CourseMoveState } from "@/app/team/kalender/actions";

const EMPTY: CourseMoveState = {};

export function CourseMoveForm({
  id,
  day,
  time,
  minDay,
  recipients,
}: {
  id: string;
  day: string;
  time: string;
  minDay: string;
  recipients: number;
}) {
  const [state, action] = useActionState(moveCourseAction, EMPTY);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={id} />

      {state.error && (
        <p role="alert" className="notice notice-error">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 max-w-md">
        <div>
          <label className="field-label" htmlFor="tag">
            Neues Datum
          </label>
          <input id="tag" name="tag" type="date" min={minDay} defaultValue={day} className="field" required />
        </div>
        <div>
          <label className="field-label" htmlFor="zeit">
            Beginn
          </label>
          <input id="zeit" name="zeit" type="time" step={900} defaultValue={time} className="field" required />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="nachricht">
          Nachricht an alle <span className="font-normal text-slate">(freiwillig)</span>
        </label>
        <textarea
          id="nachricht"
          name="nachricht"
          rows={3}
          maxLength={500}
          className="field resize-y"
          placeholder="Zum Beispiel: Der Kursraum ist an diesem Abend belegt."
        />
        <p className="field-hint">
          Geht mit der neuen Zeit an {recipients === 1 ? "die eine Person" : `alle ${recipients} Personen`}.
        </p>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm("Den ganzen Kurstermin auf die neue Zeit verschieben? Alle werden per Mail informiert.")) {
          event.preventDefault();
        }
      }}
    >
      {pending ? "Wird verschoben …" : "Kurstermin verschieben"}
    </button>
  );
}
