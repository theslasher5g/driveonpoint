"use client";

import { cancelByStaffAction } from "@/app/team/kalender/actions";
import { ActionMenuItem } from "./action-menu";

/**
 * Eine Zeile im Drei-Punkte-Menü eines Termins. Die Rückfrage kommt als
 * einzelner `window.confirm()` statt eines zweiten Klickzustands — die
 * Kundschaft bekommt sonst dieselbe Absagemail wie bei einem verirrten Klick,
 * das Muster ist dasselbe wie beim Löschen eines Mitarbeitenden-Kontos.
 */
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  return (
    <form
      action={cancelByStaffAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Termin wirklich absagen? Die Kundschaft wird per E-Mail benachrichtigt.",
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={bookingId} />
      <ActionMenuItem type="submit" danger>
        Absagen
      </ActionMenuItem>
    </form>
  );
}
