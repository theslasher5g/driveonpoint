"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Challenge = {
  challenge: string;
  salt: string;
  maxnumber: number;
  signature: string;
  expires: number;
};

type State = "bereit" | "rechnet" | "fertig" | "fehler";

/**
 * Sichtbarer Nachweis, dass ein Browser und kein Skript das Formular
 * abschickt. Der Browser sucht die Zahl, die zur vom Server genannten
 * Prüfsumme passt.
 *
 * Es gibt nichts anzuklicken und nichts zu entziffern. Vor allem gibt es
 * keine Verbindung zu einem fremden Dienst: die Aufgabe kommt vom eigenen
 * Server, es fliesst keine IP-Adresse ab, und es wird nichts gespeichert.
 */
export function CaptchaField({ scope }: { scope: "buchung" | "kontakt" }) {
  const [state, setState] = useState<State>("bereit");
  const [payload, setPayload] = useState("");
  const started = useRef(false);

  const solve = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setState("rechnet");

    try {
      const response = await fetch(`/api/captcha?zweck=${scope}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Aufgabe nicht erhalten");
      const task = (await response.json()) as Challenge;

      const encoder = new TextEncoder();
      const found = await search(task, encoder);
      if (found === null) throw new Error("Keine Lösung gefunden");

      setPayload(
        btoa(
          JSON.stringify({
            challenge: task.challenge,
            salt: task.salt,
            number: found,
            signature: task.signature,
            expires: task.expires,
          }),
        ),
      );
      setState("fertig");
    } catch {
      started.current = false;
      setState("fehler");
    }
  }, [scope]);

  // Sobald die Seite steht, im Hintergrund lösen. Bis jemand das Formular
  // ausgefüllt hat, ist die Prüfung längst durch.
  useEffect(() => {
    const idle = window.setTimeout(() => void solve(), 400);
    return () => window.clearTimeout(idle);
  }, [solve]);

  return (
    <div className="bg-concrete border border-deep/15 px-4 py-3.5 flex items-center gap-3">
      <input type="hidden" name="captcha" value={payload} />
      <Indicator state={state} />
      <p className="text-fine" aria-live="polite">
        {state === "fertig" && "Sicherheitsprüfung bestanden."}
        {state === "rechnet" && "Sicherheitsprüfung läuft …"}
        {state === "bereit" && "Sicherheitsprüfung wird vorbereitet …"}
        {state === "fehler" && (
          <>
            Die Prüfung ist fehlgeschlagen.{" "}
            <button
              type="button"
              onClick={() => void solve()}
              className="font-bold text-signal-ink underline underline-offset-4"
            >
              Erneut versuchen
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function Indicator({ state }: { state: State }) {
  if (state === "fertig") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" className="text-signal-ink shrink-0" aria-hidden="true">
        <path d="M3 10.5 L8 15.5 L17 5" stroke="currentColor" strokeWidth="2.75" fill="none" />
      </svg>
    );
  }
  if (state === "fehler") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" className="text-[#B3261E] shrink-0" aria-hidden="true">
        <path d="M4 4 L16 16 M16 4 L4 16" stroke="currentColor" strokeWidth="2.75" />
      </svg>
    );
  }
  return (
    <span
      className="w-5 h-5 shrink-0 border-2 border-deep/25 border-t-signal animate-spin"
      aria-hidden="true"
    />
  );
}

/**
 * Probiert die Zahlen in Blöcken durch.
 *
 * Blockweise, damit der Hauptthread zwischendurch atmet — sonst friert die
 * Seite auf schwächeren Geräten für den Moment der Suche ein.
 */
async function search(task: Challenge, encoder: TextEncoder): Promise<number | null> {
  const CHUNK = 256;

  for (let start = 0; start <= task.maxnumber; start += CHUNK) {
    const candidates: number[] = [];
    for (let n = start; n < Math.min(start + CHUNK, task.maxnumber + 1); n += 1) {
      candidates.push(n);
    }

    const digests = await Promise.all(
      candidates.map((n) =>
        crypto.subtle.digest("SHA-256", encoder.encode(`${task.salt}${n}`)),
      ),
    );

    for (let index = 0; index < digests.length; index += 1) {
      if (toHex(digests[index]) === task.challenge) return candidates[index];
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return null;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}
