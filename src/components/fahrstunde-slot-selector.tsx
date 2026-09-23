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
export function FahrstundeSlotSelector({ slots, slug }: { slots: Slot[]; slug: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const byDay = new Map<string, Slot[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.day) ?? [];
    list.push(slot);
    byDay.set(slot.day, list);
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
            className="surface bg-paper p-5 grid gap-3 sm:grid-cols-[13rem_1fr] sm:items-center"
          >
            <h2 className="text-base font-bold">{formatDayLong(day)}</h2>
            <ul className="flex flex-wrap gap-2">
              {entries.map((slot) => {
                const value = `${slot.day}T${slot.time}`;
                const checked = selected.has(value);
                return (
                  <li key={slot.time}>
                    <label
                      className={`nums block rounded-[var(--radius-control)] px-4 py-2.5 font-bold cursor-pointer transition-colors select-none ${
                        checked ? "bg-signal text-deep" : "bg-concrete hover:bg-signal-tint"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="termin"
                        value={value}
                        checked={checked}
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
          durch mehrere Wochen jederzeit sichtbar bleibt. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
        <div className="glass-deep w-full max-w-xl rounded-[var(--radius-surface)] px-5 py-3.5 flex items-center justify-between gap-4">
          <p className="text-fine text-paper">
            {selected.size === 0
              ? "Eine oder mehrere Lektionen auswählen"
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
