"use client";

import { useState } from "react";
import type { Slot } from "@/lib/booking";
import { formatDayLong } from "@/lib/time";

/**
 * Auswahl mehrerer Termine für eine Fahrstunde — heute 8, 9 und 10 Uhr
 * hintereinander, oder verteilt auf mehrere Tage. Die eigenen Angaben und
 * die Sicherheitsprüfung kommen danach nur einmal, nicht pro Termin.
 *
 * Bewusst ein GET-Formular statt eines errechneten Links: die Auswahl steht
 * als wiederholtes "termin"-Feld in der Adresse, kein eigener Zustand nötig,
 * funktioniert auch ohne JavaScript (dann eben ohne die laufende Anzahl).
 */
/** Gleich wie MAX_TERMINE in src/app/buchen/actions.ts. */
const MAX_SELECTED = 6;

export function FahrstundeSlotSelector({ slots, slug }: { slots: Slot[]; slug: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const byDay = new Map<string, Slot[]>();
  const byValue = new Map<string, Slot>();
  for (const slot of slots) {
    const list = byDay.get(slot.day) ?? [];
    list.push(slot);
    byDay.set(slot.day, list);
    byValue.set(`${slot.day}T${slot.time}`, slot);
  }

  const full = selected.size >= MAX_SELECTED;

  // Bei mehreren Fahrlehrpersonen liegen Zeiten versetzt (08:00 und 08:30).
  // Wer eine davon wählt, kann die überlappende nicht zusätzlich nehmen.
  function overlapsSelection(slot: Slot): boolean {
    for (const value of selected) {
      const other = byValue.get(value);
      if (!other || other === slot) continue;
      if (
        new Date(slot.startsAt) < new Date(other.endsAt) &&
        new Date(slot.endsAt) > new Date(other.startsAt)
      ) {
        return true;
      }
    }
    return false;
  }

  function toggle(value: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <form action="/buchen" method="get" className="pb-20">
      <input type="hidden" name="angebot" value={slug} />

      <div className="space-y-3">
        {[...byDay.entries()].map(([day, entries]) => (
          <div
            key={day}
            className="surface bg-paper p-5 grid gap-3 sm:grid-cols-[15rem_1fr] sm:items-center"
          >
            <h2 className="text-base font-bold hyphens-none">{formatDayLong(day)}</h2>
            <ul className="flex flex-wrap gap-2">
              {entries.map((slot) => {
                const value = `${slot.day}T${slot.time}`;
                const checked = selected.has(value);
                const blocked = !checked && (full || overlapsSelection(slot));
                return (
                  <li key={slot.time}>
                    <label
                      className={`nums block rounded-[var(--radius-control)] px-4 py-2.5 font-bold select-none transition-colors ${
                        checked
                          ? "bg-signal text-deep cursor-pointer"
                          : blocked
                            ? "bg-concrete text-deep/30 line-through cursor-not-allowed"
                            : "bg-concrete hover:bg-signal-tint cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="termin"
                        value={value}
                        checked={checked}
                        disabled={blocked}
                        onChange={() => toggle(value)}
                        className="sr-only"
                      />
                      {slot.time}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Fest am unteren Bildschirmrand, damit die Auswahl beim Scrollen
          durch mehrere Wochen jederzeit sichtbar bleibt. Helles statt
          dunkles Glas: über der dunklen Fusszeile verschwand die dunkle
          Leiste sonst fast unsichtbar im Hintergrund. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
        <div className="glass w-full max-w-xl rounded-[var(--radius-surface)] px-5 py-3.5 flex items-center justify-between gap-4">
          <p className="text-fine text-deep">
            {selected.size === 0
              ? "Eine oder mehrere Lektionen auswählen"
              : full
                ? `${MAX_SELECTED} Lektionen ausgewählt — mehr geht auf einmal nicht`
                : `${selected.size} ${selected.size === 1 ? "Lektion" : "Lektionen"} ausgewählt`}
          </p>
          <button type="submit" className="btn btn-primary py-2.5 px-5" disabled={selected.size === 0}>
            Weiter
          </button>
        </div>
      </div>
    </form>
  );
}
