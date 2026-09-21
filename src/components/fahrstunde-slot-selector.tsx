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

      <div className="border-t border-deep/15">
        {[...byDay.entries()].map(([day, entries]) => (
          <div key={day} className="border-b border-deep/15 py-5 grid gap-3 sm:grid-cols-[13rem_1fr]">
            <h2 className="text-base font-bold pt-1.5">{formatDayLong(day)}</h2>
            <ul className="flex flex-wrap gap-2">
              {entries.map((slot) => {
                const value = `${slot.day}T${slot.time}`;
                const checked = selected.has(value);
                return (
                  <li key={slot.time}>
                    <label
                      className={`nums block border px-4 py-2.5 font-bold cursor-pointer transition-colors select-none ${
                        checked
                          ? "bg-signal text-deep border-signal"
                          : "bg-paper border-deep/20 hover:bg-signal-tint"
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
      <div className="fixed inset-x-0 bottom-0 bg-deep text-paper border-t border-deep/40 z-20">
        <div className="shell py-3.5 flex items-center justify-between gap-4">
          <p className="text-fine">
            {selected.size === 0
              ? "Eine oder mehrere Lektionen auswählen"
              : `${selected.size} ${selected.size === 1 ? "Lektion" : "Lektionen"} ausgewählt`}
          </p>
          <button type="submit" className="btn btn-primary" disabled={selected.size === 0}>
            Weiter
          </button>
        </div>
      </div>
    </form>
  );
}
