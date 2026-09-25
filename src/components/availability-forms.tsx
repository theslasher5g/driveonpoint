"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addExceptionAction,
  addOfferingDateAction,
  type AvailabilityState,
} from "@/app/team/verfuegbarkeit/actions";
import { formatDate, fromMinutes, minutesSinceMidnight, weekdayName, zurichWeekday } from "@/lib/time";

const EMPTY: AvailabilityState = {};
const DEFAULT_START = "08:00";

type Repeat = "einmalig" | "taeglich" | "woechentlich" | "monatlich";

/**
 * Zeit für Fahrstunde oder Schnupperstunde an einem Datum, wie bei den
 * Kursterminen. Die Fahrstunde lässt sich zusätzlich wiederholen: täglich,
 * jede Woche am selben Wochentag oder jeden Monat am selben Kalendertag.
 */
export function OfferingDateForm({
  person,
  lessonTypeId,
  lessonTypeName,
  durationMinutes,
  repeatable,
  today,
}: {
  person: string;
  lessonTypeId: string;
  lessonTypeName: string;
  durationMinutes: number;
  repeatable: boolean;
  today: string;
}) {
  const [state, action] = useActionState(addOfferingDateAction, EMPTY);
  const [day, setDay] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("einmalig");
  // Ein Zeitfenster kürzer als die Termindauer zeigt nie einen buchbaren
  // Slot — der Vorschlag passt sich darum je Angebot an.
  const defaultEnd = fromMinutes(minutesSinceMidnight(DEFAULT_START) + durationMinutes);
  const repeating = repeatable && repeat !== "einmalig";

  // Nach jeder Rückmeldung setzt React die Felder zurück, auch bei einem
  // Fehler. Datum und Wiederholung müssen mit, sonst zeigt die Auswahl
  // "Nicht wiederholen" und das Formular verhält sich wie beim letzten Mal.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    setDay("");
    setRepeat("einmalig");
  }

  return (
    <form action={action} className="rounded-[var(--radius-control)] bg-concrete p-4">
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="lessonTypeId" value={lessonTypeId} />
      <h3 className="text-fine font-bold mb-3">Zeit für {lessonTypeName} hinzufügen</h3>
      <Feedback state={state} />

      <div className="flex flex-wrap items-end gap-3 mt-3">
        <div className="min-w-[9rem]">
          <label className="field-label text-fine" htmlFor={`datum-${lessonTypeId}`}>
            {repeating ? "Ab" : "Datum"}
          </label>
          <input
            id={`datum-${lessonTypeId}`}
            name="tag"
            type="date"
            min={today}
            value={day}
            onChange={(event) => setDay(event.target.value)}
            className="field nums py-2"
            required
          />
        </div>

        {repeatable && (
          <div className="min-w-[9rem]">
            <label className="field-label text-fine" htmlFor={`wiederholung-${lessonTypeId}`}>
              Wiederholen
            </label>
            <select
              id={`wiederholung-${lessonTypeId}`}
              name="wiederholung"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value as Repeat)}
              className="field py-2"
            >
              <option value="einmalig">Nicht wiederholen</option>
              <option value="taeglich">Jeden Tag</option>
              <option value="woechentlich">Jede Woche</option>
              <option value="monatlich">Jeden Monat</option>
            </select>
          </div>
        )}

        {repeating && (
          <div className="min-w-[9rem]">
            <label className="field-label text-fine" htmlFor={`bis-datum-${lessonTypeId}`}>
              Endet am <span className="font-normal text-slate">(freiwillig)</span>
            </label>
            <input
              id={`bis-datum-${lessonTypeId}`}
              name="tagBis"
              type="date"
              min={day || today}
              className="field nums py-2"
            />
          </div>
        )}

        <TimePair idPrefix={`datum-${lessonTypeId}`} defaultFrom={DEFAULT_START} defaultTo={defaultEnd} />
        <Submit label="Eintragen" busy="…" />
      </div>

      {repeating && day && (
        <p className="text-fine text-slate mt-3">{repeatHint(repeat, day)}</p>
      )}
    </form>
  );
}

function repeatHint(repeat: Repeat, day: string): string {
  const date = Number(day.slice(8));
  switch (repeat) {
    case "taeglich":
      return `Jeden Tag ab ${formatDate(day)}, auch am Wochenende.`;
    case "woechentlich":
      return `Jeden ${weekdayName(zurichWeekday(day))} ab ${formatDate(day)}.`;
    default:
      return date > 28
        ? `Jeden Monat am ${date}., ab ${formatDate(day)}. Monate ohne diesen Tag fallen aus.`
        : `Jeden Monat am ${date}., ab ${formatDate(day)}.`;
  }
}

/**
 * Ein Kurstermin, kein wöchentlicher Rhythmus: VKU und Nothilfekurs finden
 * nicht jede Woche statt, sondern nur an den Tagen, die tatsächlich
 * angeboten werden. Deshalb trägt man hier direkt einzelne Daten ein statt
 * über die wöchentliche Regel — die würde sonst jede Woche denselben
 * Wochentag anbieten, egal ob an dem Tag wirklich ein Kurs stattfindet.
 */
export function CourseDateForm({
  person,
  lessonTypeId,
  lessonTypeName,
  durationMinutes,
}: {
  person: string;
  lessonTypeId: string;
  lessonTypeName: string;
  durationMinutes: number;
}) {
  const [state, action] = useActionState(addExceptionAction, EMPTY);
  const defaultEnd = fromMinutes(minutesSinceMidnight(DEFAULT_START) + durationMinutes);

  return (
    <form action={action} className="rounded-[var(--radius-control)] bg-concrete p-4">
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="lessonTypeId" value={lessonTypeId} />
      <input type="hidden" name="art" value="frei" />
      <h3 className="text-fine font-bold mb-3">Kurstermin für {lessonTypeName} hinzufügen</h3>
      <Feedback state={state} />

      <div className="flex flex-wrap items-end gap-3 mt-3">
        <div className="min-w-[9rem]">
          <label className="field-label text-fine" htmlFor={`kurstag-${lessonTypeId}`}>
            Datum
          </label>
          <input
            id={`kurstag-${lessonTypeId}`}
            name="tag"
            type="date"
            className="field nums py-2"
            required
          />
        </div>
        <TimePair idPrefix={`kurs-${lessonTypeId}`} defaultFrom={DEFAULT_START} defaultTo={defaultEnd} />
        <Submit label="Eintragen" busy="…" />
      </div>
    </form>
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

        <TimePair idPrefix="ausnahme" defaultFrom="08:00" defaultTo="17:00" />

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

function TimePair({
  idPrefix,
  defaultFrom,
  defaultTo,
}: {
  idPrefix: string;
  defaultFrom: string;
  defaultTo: string;
}) {
  return (
    <>
      <div className="min-w-[7rem]">
        <label className="field-label text-fine" htmlFor={`${idPrefix}-von`}>
          Von
        </label>
        <input
          id={`${idPrefix}-von`}
          name="von"
          type="time"
          step={900}
          defaultValue={defaultFrom}
          className="field nums py-2"
          required
        />
      </div>
      <div className="min-w-[7rem]">
        <label className="field-label text-fine" htmlFor={`${idPrefix}-bis`}>
          Bis
        </label>
        <input
          id={`${idPrefix}-bis`}
          name="bis"
          type="time"
          step={900}
          defaultValue={defaultTo}
          className="field nums py-2"
          required
        />
      </div>
    </>
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
