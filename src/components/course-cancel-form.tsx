"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cancelCourseAction, type CourseCancelState } from "@/app/team/kalender/actions";

const EMPTY: CourseCancelState = {};

export function CourseCancelForm({ id, recipients }: { id: string; recipients: number }) {
  const [state, action] = useActionState(cancelCourseAction, EMPTY);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={id} />

      {state.error && (
        <p role="alert" className="notice notice-error">
          {state.error}
        </p>
      )}

      <div>
        <label className="field-label" htmlFor="nachricht">
          Nachricht an alle <span className="font-normal text-slate">(freiwillig)</span>
        </label>
        <textarea
          id="nachricht"
          name="nachricht"
          rows={4}
          maxLength={500}
          className="field resize-y"
          placeholder="Zum Beispiel: Die Kursleiterin ist krank. Wir melden uns mit einem Ersatztermin."
        />
        <p className="field-hint">
          Steht in der Mail an {recipients === 1 ? "die eine Person" : `alle ${recipients} Personen`}{" "}
          über dem Link zu den nächsten Kursdaten.
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
        if (!window.confirm("Den ganzen Kurstermin wirklich absagen? Das lässt sich nicht rückgängig machen.")) {
          event.preventDefault();
        }
      }}
    >
      {pending ? "Wird abgesagt …" : "Kurstermin absagen"}
    </button>
  );
}
