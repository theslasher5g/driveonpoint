"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  addExceptionAction,
  addRuleAction,
  type AvailabilityState,
} from "@/app/team/verfuegbarkeit/actions";
import { weekdayName } from "@/lib/time";

const EMPTY: AvailabilityState = {};

export function AvailabilityForms({
  person,
  lessonTypeId,
  lessonTypeName,
}: {
  person: string;
  lessonTypeId: string;
  lessonTypeName: string;
}) {
  const [ruleState, ruleAction] = useActionState(addRuleAction, EMPTY);

  return (
    <form action={ruleAction} className="space-y-4 mt-8 pt-8 border-t border-deep/15 max-w-md">
      <input type="hidden" name="person" value={person} />
      <input type="hidden" name="lessonTypeId" value={lessonTypeId} />
      <h3 className="text-base font-semibold">Zeit für {lessonTypeName} hinzufügen</h3>
      <Feedback state={ruleState} />

      <div>
        <label className="field-label" htmlFor={`wochentag-${lessonTypeId}`}>
          Wochentag
        </label>
        <select
          id={`wochentag-${lessonTypeId}`}
          name="wochentag"
          className="field"
          defaultValue="1"
        >
          {[1, 2, 3, 4, 5, 6, 0].map((weekday) => (
            <option key={weekday} value={weekday}>
              {weekdayName(weekday)}
            </option>
          ))}
        </select>
      </div>

      <TimePair idPrefix={`regel-${lessonTypeId}`} defaultFrom="08:00" defaultTo="12:00" />
      <Submit label="Zeit eintragen" busy="Wird eingetragen …" />
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
    <form action={exceptionAction} className="space-y-4 mt-8 max-w-md">
      <input type="hidden" name="person" value={person} />
      <h3 className="text-base font-semibold">Einzelnen Tag ändern</h3>
      <Feedback state={exceptionState} />

      <div>
        <label className="field-label" htmlFor="art">
          Was gilt an diesem Tag?
        </label>
        <select id="art" name="art" className="field" defaultValue="abwesend">
          <option value="abwesend">Abwesend — Zeit blockieren</option>
          <option value="frei">Zusätzlich frei — Zeit anbieten</option>
        </select>
      </div>

      {offerings.length > 0 && (
        <div>
          <label className="field-label" htmlFor="lessonTypeId">
            Angebot <span className="font-normal text-slate">(freiwillig)</span>
          </label>
          <select id="lessonTypeId" name="lessonTypeId" className="field" defaultValue="">
            <option value="">Alle Angebote</option>
            {offerings.map((offering) => (
              <option key={offering.id} value={offering.id}>
                {offering.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="field-label" htmlFor="tag">
          Datum
        </label>
        <input id="tag" name="tag" type="date" className="field nums" required />
      </div>

      <TimePair idPrefix="ausnahme" defaultFrom="08:00" defaultTo="17:00" />

      <div>
        <label className="field-label" htmlFor="notiz">
          Notiz <span className="font-normal text-slate">(freiwillig)</span>
        </label>
        <input
          id="notiz"
          name="notiz"
          maxLength={120}
          className="field"
          placeholder="Ferien, Weiterbildung, Arzttermin"
        />
      </div>

      <Submit label="Eintragen" busy="Wird eingetragen …" />
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
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="field-label" htmlFor={`${idPrefix}-von`}>
          Von
        </label>
        <input
          id={`${idPrefix}-von`}
          name="von"
          type="time"
          step={900}
          defaultValue={defaultFrom}
          className="field nums"
          required
        />
      </div>
      <div>
        <label className="field-label" htmlFor={`${idPrefix}-bis`}>
          Bis
        </label>
        <input
          id={`${idPrefix}-bis`}
          name="bis"
          type="time"
          step={900}
          defaultValue={defaultTo}
          className="field nums"
          required
        />
      </div>
    </div>
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
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}
