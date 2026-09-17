/**
 * Zeigt ein Startpasswort genau einmal an.
 *
 * Gespeichert wird nur der Hash. Wer diesen Kasten wegklickt, ohne das
 * Passwort weiterzugeben, muss es zurücksetzen — das ist Absicht.
 */
export function PasswordNotice({ heading, password }: { heading: string; password: string }) {
  return (
    <div role="status" className="notice notice-warn">
      <p className="font-bold">{heading}</p>
      <p className="nums font-extrabold text-xl mt-2 tracking-wide break-all select-all">
        {password}
      </p>
      <p className="text-fine text-slate mt-2">
        Gib es der Person persönlich oder am Telefon weiter. Es erscheint nur jetzt und wird beim
        ersten Anmelden geändert.
      </p>
    </div>
  );
}
