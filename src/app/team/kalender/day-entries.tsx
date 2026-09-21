"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CancelBookingButton } from "@/components/cancel-booking-button";
import { DeleteExceptionButton } from "@/components/availability-delete";

export type DayBooking = {
  id: string;
  timeLabel: string;
  customerName: string;
  customerPhone: string | null;
  customerNote: string | null;
  lessonName: string | null;
  staffName: string | null;
};

export type DayAbsence = {
  id: string;
  staffId: string;
  timeLabel: string;
  note: string | null;
  lessonName: string | null;
  staffName: string | null;
};

type Selection = { kind: "buchung" | "abwesenheit"; id: string };

/**
 * Die Einträge eines Tages im Monatsraster: schmale Chips, die beim Klick
 * einen Dialog mit allen Angaben öffnen. Im Monat soll man den Überblick
 * behalten statt für jede Buchung die Seite zu wechseln — Absagen,
 * Verschieben und das Entfernen einer Abwesenheit gehen direkt von hier.
 */
export function DayEntries({
  bookings,
  absences,
  manages,
  mayEditAvailability,
}: {
  bookings: DayBooking[];
  absences: DayAbsence[];
  manages: boolean;
  mayEditAvailability: boolean;
}) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const booking =
    selected?.kind === "buchung" ? bookings.find((entry) => entry.id === selected.id) ?? null : null;
  const absence =
    selected?.kind === "abwesenheit"
      ? absences.find((entry) => entry.id === selected.id) ?? null
      : null;

  // Ein Boolean als Abhängigkeit, kein Objekt: die Props kommen bei jedem
  // Server-Render neu, die Referenz ändert sich also ständig. Verschwindet
  // der gewählte Eintrag (abgesagt, entfernt), schliesst sich der Dialog.
  const isOpen = booking !== null || absence !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <>
      <ul className="mt-1 space-y-0.5 flex-1">
        {absences.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => setSelected({ kind: "abwesenheit", id: entry.id })}
              className="block w-full bg-concrete-dim hover:bg-deep/10 border-l-2 border-slate px-1.5 py-0.5 text-left text-[0.62rem] sm:text-[0.7rem] leading-tight text-slate transition-colors"
            >
              Abwesend
            </button>
          </li>
        ))}

        {bookings.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => setSelected({ kind: "buchung", id: entry.id })}
              className="block w-full bg-deep/5 hover:bg-signal-tint border-l-2 border-deep px-1.5 py-0.5 text-left text-[0.62rem] sm:text-[0.7rem] leading-tight transition-colors"
            >
              <span className="nums font-bold">{entry.timeLabel.slice(0, 5)}</span>
              <span className="hidden sm:inline"> {entry.customerName}</span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={() => setSelected(null)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] border border-deep/20 bg-paper p-0 backdrop:bg-deep/50"
      >
        <div className="p-5">
          {booking && (
            <>
              <p className="nums text-fine font-bold">{booking.timeLabel}</p>
              <p className="text-base leading-snug mt-1">{booking.customerName}</p>
              <p className="text-fine text-slate leading-snug mt-0.5">
                {booking.lessonName}
                {booking.staffName ? ` · ${booking.staffName}` : ""}
              </p>
              {booking.customerPhone && (
                <a
                  href={`tel:${booking.customerPhone}`}
                  className="nums text-fine text-signal-ink font-semibold block mt-2"
                >
                  {booking.customerPhone}
                </a>
              )}
              {booking.customerNote && (
                <p className="text-fine text-slate mt-2">{booking.customerNote}</p>
              )}

              <DialogActions onClose={() => setSelected(null)}>
                {manages && (
                  <>
                    <Link
                      href={`/team/kalender/verschieben?id=${booking.id}`}
                      className="text-fine font-semibold text-slate hover:text-signal-ink underline underline-offset-2"
                    >
                      Verschieben
                    </Link>
                    <CancelBookingButton bookingId={booking.id} />
                  </>
                )}
              </DialogActions>
            </>
          )}

          {absence && (
            <>
              <p className="text-fine font-bold">Abwesend</p>
              <p className="nums text-base leading-snug mt-1">{absence.timeLabel}</p>
              <p className="text-fine text-slate leading-snug mt-0.5">
                {absence.lessonName ?? "alle Angebote"}
                {absence.staffName ? ` · ${absence.staffName}` : ""}
              </p>
              {absence.note && <p className="text-fine text-slate mt-2">{absence.note}</p>}

              <DialogActions onClose={() => setSelected(null)}>
                {mayEditAvailability && (
                  <DeleteExceptionButton id={absence.id} person={absence.staffId} />
                )}
              </DialogActions>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

function DialogActions({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-4 items-center justify-between mt-5">
      <div className="flex flex-wrap gap-4 items-center">{children}</div>
      <button
        type="button"
        onClick={onClose}
        className="text-fine font-semibold text-slate underline underline-offset-2"
      >
        Schliessen
      </button>
    </div>
  );
}
