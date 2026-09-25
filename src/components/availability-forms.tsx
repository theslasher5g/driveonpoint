"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { occurrences, ordinalLabel } from "@/lib/availability-rules";
import { COURSE_SESSIONS_SHOWN } from "@/lib/course-horizon";
import {
  addExceptionAction,
  addOfferingDateAction,
  type AvailabilityState,
} from "@/app/team/verfuegbarkeit/actions";
import { formatDate, formatDayLong, fromMinutes, minutesSinceMidnight, weekdayName, zurichWeekday } from "@/lib/time";

const EMPTY: AvailabilityState = {};
const DEFAULT_START = "08:00";

type Repeat = "einmalig" | "taeglich" | "woechentlich" | "monatlich";

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: "einmalig", label: "Nur einmal" },
  { value: "taeglich", label: "Jeden Tag" },
  { value: "woechentlich", label: "Jede Woche" },
  { value: "monatlich", label: "Jeden Monat" },
];

/**
 * Zeit für Fahrstunde oder Schnupperstunde an einem Datum, wie bei den
 * Kursterminen. Die Fahrstunde lässt sich zusätzlich wiederholen: täglich,
 * jede Woche am selben Wochentag oder jeden Monat am selben Kalendertag.
 *
 * Aufgebaut wie ein Satz, der sich von oben nach unten liest: wann, wie oft,
 * bis wann. Unten steht derselbe Satz ausgeschrieben neben dem Knopf, damit
 * vor dem Eintragen klar ist, was entsteht.
 */
export function OfferingDateForm({
  person,
  lessonTypeId,
  lessonTypeName,
  durationMinutes,
  course,
  today,
}: {
  person: string;
  lessonTypeId: string;
  lessonTypeName: string;
  durationMinutes: number;
  /** Kurse: jeder Termin wird einzeln angelegt, dafür braucht es ein Enddatum. */
  course: boolean;
  today: string;
}) {
  const [state, action] = useActionState(addOfferingDateAction, EMPTY);
  // Ein Zeitfenster kürzer als die Termindauer zeigt nie einen buchbaren
  // Slot — der Vorschlag passt sich darum je Angebot an.
  const defaultEnd = fromMinutes(minutesSinceMidnight(DEFAULT_START) + durationMinutes);
  const [day, setDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [from, setFrom] = useState(DEFAULT_START);
  const [to, setTo] = useState(defaultEnd);
  const [repeat, setRepeat] = useState<Repeat>("einmalig");
  const repeating = repeat !== "einmalig";

  // Nach jeder Rückmeldung setzt React die Felder zurück, auch bei einem
  // Fehler. Der eigene Zustand muss mit, sonst zeigen Felder und
  // Zusammenfassung Verschiedenes.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    setDay("");
    setEndDay("");
    setFrom(DEFAULT_START);
    setTo(defaultEnd);
    setRepeat("einmalig");
  }

  const id = (name: string) => `${name}-${lessonTypeId}`;

  return (
    <form action={action} className="rounded-[var(--radius-control)] bg-concrete p-4 sm:p-5">
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="lessonTypeId" value={lessonTypeId} />
      <h3 className="text-fine font-bold mb-3">
        {course ? "Kurstermin" : "Zeit"} für {lessonTypeName} hinzufügen
      </h3>
      <Feedback state={state} />

      <div className="flex flex-wrap gap-x-5 gap-y-4 mt-3">
        <DayField
          id={id("datum")}
          name="tag"
          label={repeating ? "Erster Tag" : "Datum"}
          min={today}
          value={day}
          onChange={setDay}
          required
        />
        <TimeRange idPrefix={id("zeit")} from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      <fieldset className="mt-5">
        <legend className="field-label text-fine">Wiederholen</legend>
        <div className="flex flex-wrap gap-2">
          {REPEAT_OPTIONS.map((option) => (
            <label key={option.value} className="cursor-pointer">
              <input
                type="radio"
                name="wiederholung"
                value={option.value}
                checked={repeat === option.value}
                onChange={() => setRepeat(option.value)}
                className="peer sr-only"
              />
              <span className="block rounded-full border border-deep/30 bg-paper px-4 py-2 text-fine font-semibold text-deep/80 transition-colors hover:border-deep/60 peer-checked:border-deep peer-checked:bg-deep peer-checked:text-paper peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {repeating && (
        <div className="mt-5">
          <DayField
            id={id("ende")}
            name="tagBis"
            label="Endet am"
            hint="Leer lassen, wenn es kein Ende gibt."
            min={day || today}
            value={endDay}
            onChange={setEndDay}
          />
        </div>
      )}

      <FormFooter summary={summarize({ repeat, day, endDay, from, to, course })} />
    </form>
  );
}

/** Der Eintrag als Satz, etwa "Jeden Mittwoch, 08:00–08:45 Uhr, ab 14. Oktober 2026." */
function summarize({
  repeat,
  day,
  endDay,
  from,
  to,
  course = false,
}: {
  repeat: Repeat;
  day: string;
  endDay?: string;
  from: string;
  to: string;
  course?: boolean;
}): { pattern: string; rest: string } | null {
  if (!day) return null;
  const sentence = plainSummary(repeat, day, endDay, from, to);
  if (!course || repeat === "einmalig") return sentence;
  // Kursserie: mit Ende sagen, wie viele Kurstermine es werden; ohne Ende,
  // dass beim Buchen jeweils nur die nächsten erscheinen.
  if (!endDay || endDay < day) {
    return {
      ...sentence,
      rest: `${sentence.rest} Beim Buchen erscheinen jeweils die nächsten ${COURSE_SESSIONS_SHOWN} Kurstermine.`,
    };
  }
  const count = occurrences(repeat, day, endDay).length;
  return {
    ...sentence,
    rest: `${sentence.rest} Das gibt ${count} ${count === 1 ? "Kurstermin" : "Kurstermine"}.`,
  };
}

function plainSummary(
  repeat: Repeat,
  day: string,
  endDay: string | undefined,
  from: string,
  to: string,
): { pattern: string; rest: string } {
  // Wortverbinder um den Strich: "08:00–13:00 Uhr" bricht nicht mittendrin um.
  const time = `${from}\u2060–\u2060${to}\u00a0Uhr`;
  const until = endDay && endDay >= day ? ` bis ${formatDate(endDay)}` : "";
  switch (repeat) {
    case "taeglich":
      return { pattern: "Jeden Tag", rest: `, ${time}, ab ${formatDate(day)}${until}. Auch am Wochenende.` };
    case "woechentlich":
      return {
        pattern: `Jeden ${weekdayName(zurichWeekday(day))}`,
        rest: `, ${time}, ab ${formatDate(day)}${until}.`,
      };
    case "monatlich":
      return {
        pattern: `Jeden ${ordinalLabel(day)} ${weekdayName(zurichWeekday(day))} im Monat`,
        rest: `, ${time}, ab ${formatDate(day)}${until}.`,
      };
    default:
      return { pattern: formatDayLong(day), rest: `, ${time}.` };
  }
}

function DayField({
  id,
  name,
  label,
  hint,
  min,
  value,
  onChange,
  required,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  min?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="w-[11.5rem] max-w-full">
      <label className="field-label text-fine" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="date"
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field nums py-2"
        aria-describedby={hint ? `${id}-hinweis` : undefined}
        required={required}
      />
      {hint && (
        <p id={`${id}-hinweis`} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Zusammenfassung links, Knopf rechts — der letzte Blick vor dem Eintragen. */
function FormFooter({ summary }: { summary: { pattern: string; rest: string } | null }) {
  return (
    <div className="mt-5 pt-4 border-t border-deep/12 flex flex-wrap items-center gap-x-4 gap-y-3">
      <p className="text-fine flex-1 min-w-[12rem]" aria-live="polite">
        {summary ? (
          <>
            <strong className="font-semibold">{summary.pattern}</strong>
            {summary.rest}
          </>
        ) : (
          <span className="text-slate">Wähle ein Datum.</span>
        )}
      </p>
      <Submit label="Eintragen" busy="…" />
    </div>
  );
}

/**
 * Abwesenheiten: Ferien, Arzttermin, Weiterbildung. Zusätzliche Zeiten
 * trägt man beim jeweiligen Angebot ein, damit klar ist, wofür sie gelten.
 */
export function AvailabilityExceptionForm({
  person,
  offerings,
}: {
  person: string;
  offerings: { id: string; name: string }[];
}) {
  const [exceptionState, exceptionAction] = useActionState(addExceptionAction, EMPTY);

  return (
    <form action={exceptionAction} className="surface bg-paper p-4 mt-5">
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="art" value="abwesend" />
      <h3 className="text-fine font-bold mb-3">Abwesenheit eintragen</h3>
      <Feedback state={exceptionState} />

      <div className="flex flex-wrap items-end gap-3 mt-3">
        <div className="min-w-[9rem]">
          <label className="field-label text-fine" htmlFor="tag">
            Erster Tag
          </label>
          <input id="tag" name="tag" type="date" className="field nums py-2" required />
        </div>

        <div className="min-w-[9rem]">
          <label className="field-label text-fine" htmlFor="tagBis">
            Letzter Tag <span className="font-normal text-slate">(freiwillig)</span>
          </label>
          <input id="tagBis" name="tagBis" type="date" className="field nums py-2" />
        </div>

        <TimeRange idPrefix="ausnahme" defaultFrom="08:00" defaultTo="17:00" />

        {offerings.length > 1 && (
          <div className="min-w-[11rem] flex-1">
            <label className="field-label text-fine" htmlFor="lessonTypeId">
              Gilt für
            </label>
            <select id="lessonTypeId" name="lessonTypeId" className="field py-2" defaultValue="">
              <option value="">Alle Angebote</option>
              {offerings.map((offering) => (
                <option key={offering.id} value={offering.id}>
                  nur {offering.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="min-w-[13rem] flex-1">
          <label className="field-label text-fine" htmlFor="notiz">
            Notiz <span className="font-normal text-slate">(freiwillig)</span>
          </label>
          <input
            id="notiz"
            name="notiz"
            maxLength={120}
            className="field py-2"
            placeholder="Ferien, Weiterbildung, Arzttermin"
          />
        </div>

        <Submit label="Eintragen" busy="…" />
      </div>
    </form>
  );
}

/**
 * Von und Bis als ein Feld "Uhrzeit": zwei Zeiten, die zusammengehören,
 * stehen auch zusammen, statt als zwei lose Felder irgendwo im Formular.
 */
function TimeRange({
  idPrefix,
  from,
  to,
  onFrom,
  onTo,
  defaultFrom,
  defaultTo,
}: {
  idPrefix: string;
  from?: string;
  to?: string;
  onFrom?: (value: string) => void;
  onTo?: (value: string) => void;
  defaultFrom?: string;
  defaultTo?: string;
}) {
  const controlled = (value: string | undefined, onChange?: (value: string) => void, fallback?: string) =>
    onChange
      ? { value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value) }
      : { defaultValue: fallback };

  return (
    <fieldset className="min-w-0">
      <legend className="field-label text-fine">Uhrzeit</legend>
      <div className="flex items-center gap-2 max-w-[19rem]">
        <label className="sr-only" htmlFor={`${idPrefix}-von`}>
          Von
        </label>
        <input
          id={`${idPrefix}-von`}
          name="von"
          type="time"
          step={900}
          {...controlled(from, onFrom, defaultFrom)}
          className="field nums py-2 px-3 flex-1 min-w-0"
          required
        />
        <span aria-hidden="true" className="text-slate">
          bis
        </span>
        <label className="sr-only" htmlFor={`${idPrefix}-bis`}>
          Bis
        </label>
        <input
          id={`${idPrefix}-bis`}
          name="bis"
          type="time"
          step={900}
          {...controlled(to, onTo, defaultTo)}
          className="field nums py-2 px-3 flex-1 min-w-0"
          required
        />
      </div>
    </fieldset>
  );
}

function Feedback({ state }: { state: AvailabilityState }) {
  if (state.error) {
    return (
      <p role="alert" className="notice notice-error">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="notice notice-success">
        {state.ok}
      </p>
    );
  }
  return null;
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary py-2 px-4 text-fine" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}
