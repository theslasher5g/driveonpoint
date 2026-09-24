"use client";

import { useState } from "react";

/**
 * Vorwahlen der Nachbarländer plus Liechtenstein — die realistische
 * Herkunft unserer Kundschaft rund um Basel. Schweiz zuerst und als
 * Voreinstellung, der Rest alphabetisch.
 */
const COUNTRY_CODES = [
  { code: "+41", label: "Schweiz +41" },
  { code: "+49", label: "Deutschland +49" },
  { code: "+43", label: "Österreich +43" },
  { code: "+33", label: "Frankreich +33" },
  { code: "+39", label: "Italien +39" },
  { code: "+423", label: "Liechtenstein +423" },
];

/** Vorbelegten Wert in Vorwahl und Rest aufteilen, für die Fehleranzeige nach einem Tippfehler. */
function splitPhone(value?: string): { code: string; number: string } {
  const trimmed = value?.trim();
  if (!trimmed) return { code: "+41", number: "" };
  const match = COUNTRY_CODES.find((c) => trimmed.startsWith(c.code));
  if (match) return { code: match.code, number: trimmed.slice(match.code.length).trim() };
  return { code: "+41", number: trimmed };
}

/**
 * Telefonnummer mit Vorwahl-Auswahl statt freiem Text — die Fahrlehrperson
 * ruft über diese Nummer an, um den Treffpunkt zu vereinbaren, deshalb muss
 * sie stimmen. Schweiz ist voreingestellt, andere Vorwahlen lassen sich
 * wählen. Die beiden sichtbaren Felder spiegeln sich in ein verstecktes
 * Feld namens `name` — serverseitig kommt weiterhin eine einzelne Nummer
 * an, wie schon vor der Vorwahl-Auswahl.
 */
export function PhoneField({
  name = "telefon",
  label = "Telefonnummer",
  hint,
  error,
  defaultValue,
}: {
  name?: string;
  label?: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
}) {
  const initial = splitPhone(defaultValue);
  const [code, setCode] = useState(initial.code);
  const [number, setNumber] = useState(initial.number);
  const combined = number.trim() ? `${code} ${number.trim()}` : "";
  const hintId = hint || error ? `${name}-hinweis` : undefined;

  return (
    <div>
      <label className="field-label" htmlFor={`${name}-nummer`}>
        {label}
      </label>
      <div className="flex gap-2">
        <select
          aria-label="Vorwahl"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="field w-[9.5rem] shrink-0"
        >
          {COUNTRY_CODES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.label}
            </option>
          ))}
        </select>
        <input
          id={`${name}-nummer`}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          placeholder="79 123 45 67"
          className="field flex-1 min-w-0"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={hintId}
        />
      </div>
      <input type="hidden" name={name} value={combined} />
      {(hint || error) && (
        <p id={hintId} className={`field-hint ${error ? "text-danger font-semibold" : ""}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
