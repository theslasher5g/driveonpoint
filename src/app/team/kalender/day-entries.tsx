"use client";

import { useEffect, useRef, useState } from "react";
import { ActionMenu, ActionMenuItem } from "@/components/action-menu";
import { CancelBookingButton } from "@/components/cancel-booking-button";
import { requestReviewAction, toggleNoShowAction } from "./actions";
import { DeleteExceptionButton } from "@/components/availability-delete";

export type DayBooking = {
  id: string;
  timeLabel: string;
  customerName: string;
  customerPhone: string | null;
  customerNote: string | null;
  lessonName: string | null;
  staffName: string | null;
  history: { label: string | null; warnings: string[] };
  /** Kurstermin, der noch nicht begonnen hat — dann lässt er sich als Ganzes absagen. */
  cancellableCourse: boolean;
  /** Begonnen und darf markiert werden: "offen" oder schon "markiert"; sonst null. */
  noShow: "offen" | "markiert" | null;
  /** Um eine Google-Bewertung bitten: dieser Termin, ganzer Kurs. */
  review: { single: boolean; course: boolean };
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
              className="block w-full overflow-hidden whitespace-nowrap bg-deep/5 hover:bg-signal-tint border-l-2 border-deep px-0.5 sm:px-1.5 py-0.5 text-left text-[0.62rem] sm:text-[0.7rem] leading-tight transition-colors"
            >
              {/* Auf dem Telefon ist die Tageszelle rund 20 px breit —
                  „08:00“ brach dort als „08: / 00“ um. Ohne führende Null
                  passt die Zeit auf eine Zeile. */}
              <span className="nums font-bold sm:hidden">
                {entry.timeLabel.slice(0, 5).replace(/^0/, "")}
              </span>
              <span className="nums font-bold hidden sm:inline">{entry.timeLabel.slice(0, 5)}</span>
              <span className="hidden sm:inline"> {entry.customerName}</span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={() => setSelected(null)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] overflow-visible rounded-[var(--radius-surface)] border border-deep/20 bg-paper p-0 backdrop:bg-deep/50"
      >
        <div className="p-5">
          {booking && (
            <>
              <p className="nums text-fine font-bold">{booking.timeLabel}</p>
              <p className="text-base leading-snug mt-1">{booking.customerName}</p>
              {(booking.history.label || booking.history.warnings.length > 0) && (
                <p className="text-fine text-slate leading-snug mt-0.5">
                  {booking.history.label}
                  {booking.history.warnings.length > 0 && (
                    <span className="font-semibold text-danger">
                      {booking.history.label && " · "}
                      {booking.history.warnings.join(" · ")}
                    </span>
                  )}
                </p>
              )}
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
                {(manages || booking.noShow || booking.review.single) && (
                  <ActionMenu label="Termin verwalten" align="left">
                    {manages && (
                      <ActionMenuItem href={`/team/kalender/verschieben?id=${booking.id}`}>
                        Verschieben
                      </ActionMenuItem>
                    )}
                    {manages && booking.cancellableCourse && (
                      <ActionMenuItem href={`/team/kalender/kurs-verschieben?id=${booking.id}`}>
                        Ganzen Kurs verschieben
                      </ActionMenuItem>
                    )}
                    {booking.noShow && (
                      <form action={toggleNoShowAction}>
                        <input type="hidden" name="id" value={booking.id} />
                        <ActionMenuItem type="submit">
                          {booking.noShow === "markiert" ? "Doch erschienen" : "Nicht erschienen"}
                        </ActionMenuItem>
                      </form>
                    )}
                    {booking.review.single && (
                      <form action={requestReviewAction}>
                        <input type="hidden" name="id" value={booking.id} />
                        <ActionMenuItem type="submit">Um Bewertung bitten</ActionMenuItem>
                      </form>
                    )}
                    {booking.review.course && (
                      <form action={requestReviewAction}>
                        <input type="hidden" name="id" value={booking.id} />
                        <input type="hidden" name="umfang" value="kurs" />
                        <ActionMenuItem type="submit">Ganzen Kurs um Bewertung bitten</ActionMenuItem>
                      </form>
                    )}
                    {manages && <CancelBookingButton bookingId={booking.id} />}
                    {manages && booking.cancellableCourse && (
                      <ActionMenuItem href={`/team/kalender/kurs-absagen?id=${booking.id}`} danger>
                        Ganzen Kurs absagen
                      </ActionMenuItem>
                    )}
                  </ActionMenu>
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
