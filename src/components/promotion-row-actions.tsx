"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deletePromotionAction, togglePromotionAction } from "@/app/team/aktionen/actions";

export function PromotionRowActions({ id, active }: { id: string; active: boolean }) {
  const [asking, setAsking] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-4 mt-3">
      <form action={togglePromotionAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="aktiv" value={active ? "nein" : "ja"} />
        <SmallButton
          idle={active ? "Pausieren" : "Wieder starten"}
          busy={active ? "Pausiert …" : "Startet …"}
        />
      </form>

      {asking ? (
        <form action={deletePromotionAction} className="flex items-center gap-3">
          <input type="hidden" name="id" value={id} />
          <DangerButton />
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="text-fine font-semibold text-slate underline underline-offset-2"
          >
            Abbrechen
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="text-fine font-semibold text-slate hover:text-[#B3261E] underline underline-offset-2"
        >
          Löschen
        </button>
      )}
    </div>
  );
}

function SmallButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-fine font-semibold text-signal-ink underline underline-offset-2 disabled:opacity-50"
    >
      {pending ? busy : idle}
    </button>
  );
}

function DangerButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-fine font-bold bg-[#B3261E] text-paper px-2.5 py-1 disabled:opacity-60"
    >
      {pending ? "Löscht …" : "Wirklich löschen"}
    </button>
  );
}
