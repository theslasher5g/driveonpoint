"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  addExceptionAction,
  addRuleAction,
  type AvailabilityState,
} from "@/app/team/verfuegbarkeit/actions";
import { fromMinutes, minutesSinceMidnight, weekdayName } from "@/lib/time";

const EMPTY: AvailabilityState = {};
const DEFAULT_START = "08:00";

export function AvailabilityForms({
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
  const [ruleState, ruleAction] = useActionState(addRuleAction, EMPTY);
  // Ein Zeitfenster kürzer als die Termindauer zeigt nie einen buchbaren
  // Slot — der Vorschlag passt sich darum je Angebot an (Nothilfekurs
  // braucht 5 Stunden, eine Fahrstunde nur 45 Minuten).
  const defaultEnd = fromMinutes(minutesSinceMidnight(DEFAULT_START) + durationMinutes);

  return (
    // Die vier Felder passen nebeneinander in eine Zeile. Untereinander
    // brauchte jedes Angebot den Platz eines halben Bildschirms, bei vier
    // Angeboten auf derselben Seite.
    <form action={ruleAction} className="rounded-[var(--radius-control)] bg-concrete p-4">
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="lessonTypeId" value={lessonTypeId} />
      <h3 className="text-fine font-bold mb-3">Zeit für {lessonTypeName} hinzufügen</h3>
      <Feedback state={ruleState} />

      <div className="flex flex-wrap items-end gap-3 mt-3">
        <div className="min-w-[8.5rem] flex-1">
          <label className="field-label text-fine" htmlFor={`wochentag-${lessonTypeId}`}>
            Wochentag
          </label>
          <select
            id={`wochentag-${lessonTypeId}`}
            name="wochentag"
            className="field py-2"
            defaultValue="1"
          >
            {[1, 2, 3, 4, 5, 6, 0].map((weekday) => (
              <option key={weekday} value={weekday}>
                {weekdayName(weekday)}
              </option>
            ))}
          </select>
        </div>

        <TimePair idPrefix={`regel-${lessonTypeId}`} defaultFrom={DEFAULT_START} defaultTo={defaultEnd} />
        <Submit label="Eintragen" busy="…" />
      </div>
    </form>
  );
}

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
      <h3 className="text-fine font-bold mb-3">Einzelnen Tag ändern</h3>
      <Feedback state={exceptionState} />

      <div className="flex flex-wrap items-end gap-3 mt-3">
        <div className="min-w-[13rem] flex-1">
          <label className="field-label text-fine" htmlFor="art">
            Was gilt an diesem Tag?
          </label>
          <select id="art" name="art" className="field py-2" defaultValue="abwesend">
            <option value="abwesend">Abwesend — Zeit blockieren</option>
            <option value="frei">Zusätzlich frei — Zeit anbieten</option>
          </select>
        </div>

        {offerings.length > 0 && (
          <div className="min-w-[11rem] flex-1">
            <label className="field-label text-fine" htmlFor="lessonTypeId">
              Angebot <span className="font-normal text-slate">(freiwillig)</span>
            </label>
            <select id="lessonTypeId" name="lessonTypeId" className="field py-2" defaultValue="">
              <option value="">Alle Angebote</option>
              {offerings.map((offering) => (
                <option key={offering.id} value={offering.id}>
                  {offering.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="min-w-[9rem]">
          <label className="field-label text-fine" htmlFor="tag">
            Von (Datum)
          </label>
          <input id="tag" name="tag" type="date" className="field nums py-2" required />
        </div>

        <div className="min-w-[9rem]">
          <label className="field-label text-fine" htmlFor="tagBis">
            Bis <span className="font-normal text-slate">(freiwillig, z. B. Ferien)</span>
          </label>
          <input id="tagBis" name="tagBis" type="date" className="field nums py-2" />
        </div>

        <TimePair idPrefix="ausnahme" defaultFrom="08:00" defaultTo="17:00" />

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
