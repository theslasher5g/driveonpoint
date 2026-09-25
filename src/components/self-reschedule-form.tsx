"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  selfRescheduleAction,
  type SelfRescheduleState,
} from "@/app/verschieben/[token]/actions";

const EMPTY: SelfRescheduleState = {};

export function SelfRescheduleForm({ token, day, time }: { token: string; day: string; time: string }) {
  const [state, action] = useActionState(selfRescheduleAction, EMPTY);

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
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
      {pending ? "Wird verschoben …" : "Auf diese Zeit verschieben"}
    </button>
  );
}
