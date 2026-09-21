"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CancelBookingButton } from "@/components/cancel-booking-button";

export type DayBookingEntry = {
  id: string;
  timeLabel: string;
  customerName: string;
  customerPhone: string | null;
  customerNote: string | null;
  lessonName: string | null;
  staffName: string | null;
};

/**
 * Ersetzt die ausgeschriebenen Buchungskarten im Monatsraster durch schmale
 * Zeit-Chips. Ein Klick öffnet die Details in einem Dialog statt in die
 * Wochenansicht zu springen — im Monat soll man einen Blick auf den ganzen
 * Monat behalten, nicht bei jeder Buchung die Seite wechseln.
 */
export function DayBookings({
  entries,
  manages,
}: {
  entries: DayBookingEntry[];
  manages: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = entries.find((entry) => entry.id === openId) ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <ul className="mt-1 space-y-0.5 flex-1">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => setOpenId(entry.id)}
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
        onClose={() => setOpenId(null)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] border border-deep/20 bg-paper p-0 backdrop:bg-deep/50"
      >
        {open && (
          <div className="p-5">
            <p className="nums text-fine font-bold">{open.timeLabel}</p>
            <p className="text-base leading-snug mt-1">{open.customerName}</p>
            <p className="text-fine text-slate leading-snug mt-0.5">
              {open.lessonName}
              {open.staffName ? ` · ${open.staffName}` : ""}
            </p>
            {open.customerPhone && (
              <a
                href={`tel:${open.customerPhone}`}
                className="nums text-fine text-signal-ink font-semibold block mt-2"
              >
                {open.customerPhone}
              </a>
            )}
            {open.customerNote && <p className="text-fine text-slate mt-2">{open.customerNote}</p>}

            <div className="flex flex-wrap gap-4 items-center justify-between mt-5">
              {manages ? (
                <div className="flex flex-wrap gap-4 items-center">
                  <Link
                    href={`/team/kalender/verschieben?id=${open.id}`}
                    className="text-fine font-semibold text-slate hover:text-signal-ink underline underline-offset-2"
                  >
                    Verschieben
                  </Link>
                  <CancelBookingButton bookingId={open.id} />
                </div>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="text-fine font-semibold text-slate underline underline-offset-2"
              >
                Schliessen
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
