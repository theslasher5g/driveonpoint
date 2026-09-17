"use client";

import { useFormStatus } from "react-dom";
import {
  deleteExceptionAction,
  deleteRuleAction,
} from "@/app/team/verfuegbarkeit/actions";

export function DeleteRuleButton({ id, person }: { id: string; person: string }) {
  return (
    <form action={deleteRuleAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="person" value={person} />
      <RemoveButton />
    </form>
  );
}

export function DeleteExceptionButton({ id, person }: { id: string; person: string }) {
  return (
    <form action={deleteExceptionAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="person" value={person} />
      <RemoveButton />
    </form>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-fine font-semibold text-slate hover:text-[#B3261E] underline underline-offset-2 disabled:opacity-50"
    >
      {pending ? "Entfernt …" : "Entfernen"}
    </button>
  );
}
