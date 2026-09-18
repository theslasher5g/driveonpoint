"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { rescheduleBookingAction, type RescheduleState } from "@/app/team/kalender/actions";

const EMPTY: RescheduleState = {};

export function RescheduleConfirmForm({
  id,
  day,
  time,
}: {
  id: string;
  day: string;
  time: string;
}) {
  const [state, action] = useActionState(rescheduleBookingAction, EMPTY);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="tag" value={day} />
      <input type="hidden" name="zeit" value={time} />

      {state.error && (
        <p role="alert" className="notice notice-error mb-4">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Wird verschoben …" : "Verschieben bestätigen"}
    </button>
  );
}
