"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPromotionAction, type PromotionState } from "@/app/team/aktionen/actions";

const EMPTY: PromotionState = {};

export function PromotionForm({
  offers,
  today,
}: {
  offers: { id: string; name: string }[];
  today: string;
}) {
  const [state, action] = useActionState(createPromotionAction, EMPTY);
  const [kind, setKind] = useState<"prozent" | "betrag">("prozent");

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p role="alert" className="bg-paper border-l-4 border-[#B3261E] px-4 py-3 font-semibold">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="bg-paper border-l-4 border-signal px-4 py-3 font-semibold">
          {state.ok}
        </p>
      )}

      <div>
        <label className="field-label" htmlFor="label">
          Wie heisst die Aktion?
        </label>
        <input
          id="label"
          name="label"
          className="field"
          maxLength={80}
          placeholder="Sommeraktion — 10 Prozent auf Fahrstunden"
          required
        />
        <p className="field-hint">Dieser Text steht später auf der Website.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="field-label" htmlFor="art">
            Art des Rabatts
          </label>
          <select
            id="art"
            name="art"
            className="field"
            value={kind}
            onChange={(event) => setKind(event.target.value as "prozent" | "betrag")}
          >
            <option value="prozent">Prozent</option>
            <option value="betrag">Fester Betrag</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="wert">
            {kind === "prozent" ? "Prozent" : "Franken"}
          </label>
          <input
            id="wert"
            name="wert"
            type="number"
            inputMode="decimal"
            step={kind === "prozent" ? "1" : "0.05"}
            min="0"
            max={kind === "prozent" ? "100" : undefined}
            className="field nums"
            required
          />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="angebot">
          Gilt für
        </label>
        <select id="angebot" name="angebot" className="field" defaultValue="alle">
          <option value="alle">Alle Angebote</option>
          {offers.map((offer) => (
            <option key={offer.id} value={offer.id}>
              {offer.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="field-label" htmlFor="von">
            Von
          </label>
          <input id="von" name="von" type="date" className="field nums" defaultValue={today} required />
        </div>
        <div>
          <label className="field-label" htmlFor="bis">
            Bis und mit
          </label>
          <input id="bis" name="bis" type="date" className="field nums" required />
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Wird angelegt …" : "Aktion starten"}
    </button>
  );
}
