"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  resetPasswordAction,
  setLessonTypesAction,
  toggleActiveAction,
  updateRoleAction,
  type StaffState,
} from "@/app/team/mitarbeiter/actions";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { staffRole, type StaffRole } from "@/lib/db/schema";
import { PasswordNotice } from "./password-notice";

const EMPTY: StaffState = {};

type Person = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
};

export function StaffRow({
  person,
  offers,
  assigned,
  isSelf,
}: {
  person: Person;
  offers: { id: string; name: string }[];
  assigned: string[];
  isSelf: boolean;
}) {
  const [resetState, resetAction] = useActionState(resetPasswordAction, EMPTY);

  return (
    <article
      className={`border p-5 ${person.active ? "bg-paper border-deep/15" : "bg-concrete-dim/40 border-deep/10"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="text-lg">
            {person.name}
            {isSelf && <span className="text-slate font-normal"> — das bist du</span>}
          </h3>
          <p className="text-fine text-slate mt-0.5 break-all">{person.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!person.active && (
            <span className="text-fine font-bold bg-concrete-dim text-slate px-2 py-0.5">
              abgeschaltet
            </span>
          )}
          {person.mustChangePassword && (
            <span className="text-fine font-bold bg-amber text-deep px-2 py-0.5">
              Startpasswort offen
            </span>
          )}
          <span className="text-fine font-bold bg-signal text-paper px-2 py-0.5">
            {ROLE_LABEL[person.role]}
          </span>
        </div>
      </div>

      {resetState.ok && resetState.password && (
        <div className="mt-4">
          <PasswordNotice heading={resetState.ok} password={resetState.password} />
        </div>
      )}
      {resetState.error && (
        <p role="alert" className="border-l-4 border-[#B3261E] bg-concrete px-4 py-3 font-semibold mt-4">
          {resetState.error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2 mt-5 pt-5 border-t border-deep/10">
        <form action={setLessonTypesAction}>
          <input type="hidden" name="id" value={person.id} />
          <fieldset>
            <legend className="field-label">Darf unterrichten</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-1">
              {offers.map((offer) => (
                <label key={offer.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="angebot"
                    value={offer.id}
                    defaultChecked={assigned.includes(offer.id)}
                    className="w-4.5 h-4.5 accent-[#D33F2C]"
                  />
                  <span className="text-fine">{offer.name}</span>
                </label>
              ))}
            </div>
            <p className="field-hint">
              Nur angekreuzte Angebote erscheinen bei dieser Person als buchbar.
            </p>
          </fieldset>
          <MiniSubmit idle="Angebote speichern" busy="Speichert …" />
        </form>

        <div className="space-y-4">
          {!isSelf && (
            <form action={updateRoleAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={person.id} />
              <div className="flex-1 min-w-40">
                <label className="field-label" htmlFor={`rolle-${person.id}`}>
                  Rolle
                </label>
                <select
                  id={`rolle-${person.id}`}
                  name="rolle"
                  className="field"
                  defaultValue={person.role}
                >
                  {staffRole.enumValues.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              </div>
              <MiniSubmit idle="Rolle setzen" busy="Setzt …" />
            </form>
          )}

          <div className="flex flex-wrap items-center gap-5">
            <form action={resetAction}>
              <input type="hidden" name="id" value={person.id} />
              <MiniSubmit idle="Passwort zurücksetzen" busy="Setzt zurück …" />
            </form>

            {!isSelf && (
              <form action={toggleActiveAction}>
                <input type="hidden" name="id" value={person.id} />
                <input type="hidden" name="aktiv" value={person.active ? "nein" : "ja"} />
                <MiniSubmit
                  idle={person.active ? "Zugang abschalten" : "Zugang freigeben"}
                  busy="Ändert …"
                  danger={person.active}
                />
              </form>
            )}
          </div>

          <p className="text-fine text-slate">
            {person.lastLoginAt
              ? `Zuletzt angemeldet am ${person.lastLoginAt.toLocaleDateString("de-CH")}`
              : "Noch nie angemeldet"}
          </p>
        </div>
      </div>
    </article>
  );
}

function MiniSubmit({
  idle,
  busy,
  danger,
}: {
  idle: string;
  busy: string;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`text-fine font-semibold underline underline-offset-2 disabled:opacity-50 mt-3 ${
        danger ? "text-slate hover:text-[#B3261E]" : "text-signal-ink"
      }`}
    >
      {pending ? busy : idle}
    </button>
  );
}
