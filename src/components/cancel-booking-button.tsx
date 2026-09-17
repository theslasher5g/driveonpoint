"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { cancelByStaffAction } from "@/app/team/kalender/actions";

/**
 * Zweistufig: der erste Klick fragt nach, der zweite sagt ab. Ein
 * versehentlich getroffener Knopf im Wochenraster soll keinen Termin
 * kosten — und die Kundschaft keine überraschende Absagemail.
 */
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-[0.72rem] font-semibold text-slate hover:text-[#B3261E] underline underline-offset-2 mt-1.5"
      >
        Absagen
      </button>
    );
  }

  return (
    <form action={cancelByStaffAction} className="mt-1.5 flex flex-wrap gap-2 items-center">
      <input type="hidden" name="id" value={bookingId} />
      <ConfirmButton />
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="text-[0.72rem] font-semibold text-slate underline underline-offset-2"
      >
        Behalten
      </button>
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-[0.72rem] font-bold bg-[#B3261E] text-paper px-2 py-1 disabled:opacity-60"
    >
      {pending ? "Sagt ab …" : "Wirklich absagen"}
    </button>
  );
}
