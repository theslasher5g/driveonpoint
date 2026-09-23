"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteStaffAction,
  resetMfaAction,
  resetPasswordAction,
  setLessonTypesAction,
  toggleActiveAction,
  updateRoleAction,
  type StaffState,
} from "@/app/team/mitarbeiter/actions";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { staffRole, type StaffRole } from "@/lib/db/schema";
import { ActionMenu, ActionMenuItem } from "./action-menu";
import { PasswordNotice } from "./password-notice";

const EMPTY: StaffState = {};

type Person = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  mustChangePassword: boolean;
  totpEnabled: boolean;
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
  const [offersOpen, setOffersOpen] = useState(false);
  const offersDialogRef = useRef<HTMLDialogElement>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const roleDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = offersDialogRef.current;
    if (!dialog) return;
    if (offersOpen && !dialog.open) dialog.showModal();
    if (!offersOpen && dialog.open) dialog.close();
  }, [offersOpen]);

  useEffect(() => {
    const dialog = roleDialogRef.current;
    if (!dialog) return;
    if (roleOpen && !dialog.open) dialog.showModal();
    if (!roleOpen && dialog.open) dialog.close();
  }, [roleOpen]);

  const assignedOffers = offers.filter((offer) => assigned.includes(offer.id));

  return (
    <article
      className={`rounded-[var(--radius-surface)] border p-5 ${person.active ? "bg-paper border-deep/15" : "bg-concrete-dim/40 border-deep/10"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="font-display text-lg font-bold">
            {person.name}
            {isSelf && <span className="text-slate font-normal"> — das bist du</span>}
          </h3>
          <p className="text-fine text-slate mt-0.5 break-all">{person.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!person.active && (
            <span className="text-fine font-bold bg-concrete-dim text-slate px-2.5 py-0.5 rounded-full">
              abgeschaltet
            </span>
          )}
          {person.mustChangePassword && (
            <span className="text-fine font-bold bg-amber text-deep px-2.5 py-0.5 rounded-full">
              Startpasswort offen
            </span>
          )}
          <span
            className={`text-fine font-bold px-2.5 py-0.5 rounded-full ${
              person.totpEnabled ? "bg-concrete-dim text-deep" : "bg-paper border border-deep/20 text-slate"
            }`}
          >
            {person.totpEnabled ? "MFA aktiv" : "MFA nicht eingerichtet"}
          </span>
          <span className="text-fine font-bold bg-deep text-paper px-2.5 py-0.5 rounded-full">
            {ROLE_LABEL[person.role]}
          </span>

          <ActionMenu label={`Konto von ${person.name} verwalten`}>
            <ActionMenuItem onClick={() => setOffersOpen(true)}>Angebote bearbeiten</ActionMenuItem>
            {!isSelf && (
              <ActionMenuItem onClick={() => setRoleOpen(true)}>Rolle ändern</ActionMenuItem>
            )}

            {!isSelf && (
              <form action={resetAction}>
                <input type="hidden" name="id" value={person.id} />
                <ActionMenuItem type="submit">Passwort zurücksetzen</ActionMenuItem>
              </form>
            )}

            {person.totpEnabled && !isSelf && (
              <form action={resetMfaAction}>
                <input type="hidden" name="id" value={person.id} />
                <ActionMenuItem type="submit" danger>
                  MFA zurücksetzen
                </ActionMenuItem>
              </form>
            )}

            {!isSelf && (
              <form action={toggleActiveAction}>
                <input type="hidden" name="id" value={person.id} />
                <input type="hidden" name="aktiv" value={person.active ? "nein" : "ja"} />
                <ActionMenuItem type="submit" danger={person.active}>
                  {person.active ? "Zugang abschalten" : "Zugang freigeben"}
                </ActionMenuItem>
              </form>
            )}

            {!isSelf && (
              <form
                action={deleteStaffAction}
                onSubmit={(event) => {
                  const confirmed = window.confirm(
                    `Konto von ${person.name} endgültig löschen? Künftige Termine werden nach Möglichkeit an eine andere Person übergeben, sonst abgesagt und die Kundschaft um einen neuen Termin gebeten. Das lässt sich nicht rückgängig machen.`,
                  );
                  if (!confirmed) event.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={person.id} />
                <ActionMenuItem type="submit" danger>
                  Konto löschen
                </ActionMenuItem>
              </form>
            )}
          </ActionMenu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {assignedOffers.length === 0 ? (
          <span className="text-fine text-slate">Darf noch nichts unterrichten</span>
        ) : (
          assignedOffers.map((offer) => (
            <span key={offer.id} className="chip chip-quiet">
              {offer.name}
            </span>
          ))
        )}
      </div>

      {resetState.ok && (
        <p role="status" className="notice notice-success mt-4">
          {resetState.ok} Das neue Startpasswort wurde in einem Fenster angezeigt.
        </p>
      )}
      {resetState.ok && resetState.password && (
        <PasswordNotice heading={resetState.ok} password={resetState.password} />
      )}
      {resetState.error && (
        <p role="alert" className="notice notice-error mt-4">
          {resetState.error}
        </p>
      )}

      <div className="flex items-center justify-end mt-5 pt-5 border-t border-deep/10">
        <p className="text-fine text-slate">
          {person.lastLoginAt
            ? `Zuletzt angemeldet am ${person.lastLoginAt.toLocaleDateString("de-CH")}`
            : "Noch nie angemeldet"}
        </p>
      </div>

      <dialog
        ref={offersDialogRef}
        onClose={() => setOffersOpen(false)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[var(--radius-surface)] border border-deep/20 bg-paper p-0 backdrop:bg-deep/50"
      >
        <form action={setLessonTypesAction} className="p-5 md:p-6">
          <input type="hidden" name="id" value={person.id} />
          <CloseOnSaved onSaved={() => setOffersOpen(false)} />

          <h2 className="font-display text-lg font-bold">Angebote von {person.name}</h2>
          <p className="text-fine text-slate mt-1">
            Nur angekreuzte Angebote erscheinen bei dieser Person als buchbar.
          </p>

          <fieldset className="mt-4">
            <legend className="sr-only">Angebote</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2.5">
              {offers.map((offer) => (
                <label key={offer.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="angebot"
                    value={offer.id}
                    defaultChecked={assigned.includes(offer.id)}
                    className="w-4.5 h-4.5 accent-signal"
                  />
                  <span className="text-fine">{offer.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4 mt-6">
            <OffersSaveButton />
            <button
              type="button"
              onClick={() => setOffersOpen(false)}
              className="text-fine font-semibold text-slate underline underline-offset-2"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={roleDialogRef}
        onClose={() => setRoleOpen(false)}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-[var(--radius-surface)] border border-deep/20 bg-paper p-0 backdrop:bg-deep/50"
      >
        <form action={updateRoleAction} className="p-5 md:p-6">
          <input type="hidden" name="id" value={person.id} />
          <CloseOnSaved onSaved={() => setRoleOpen(false)} />

          <h2 className="font-display text-lg font-bold">Rolle von {person.name}</h2>
          <p className="text-fine text-slate mt-1">
            Die Rolle entscheidet, was diese Person im Team-Bereich sehen und ändern darf.
          </p>

          <div className="mt-4">
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

          <div className="flex flex-wrap items-center gap-4 mt-6">
            <RoleSaveButton />
            <button
              type="button"
              onClick={() => setRoleOpen(false)}
              className="text-fine font-semibold text-slate underline underline-offset-2"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </dialog>
    </article>
  );
}

/** Schliesst den Dialog selbsttätig, sobald die Server-Aktion durchgelaufen ist. */
function CloseOnSaved({ onSaved }: { onSaved: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) onSaved();
    wasPending.current = pending;
  }, [pending, onSaved]);

  return null;
}

function OffersSaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary py-2.5 px-5 text-fine" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Speichern"}
    </button>
  );
}

function RoleSaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary py-2.5 px-5 text-fine" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Speichern"}
    </button>
  );
}
