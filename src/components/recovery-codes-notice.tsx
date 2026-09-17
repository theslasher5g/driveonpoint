/**
 * Zeigt Wiederherstellungscodes genau einmal an.
 *
 * Gespeichert wird nur der Hash jedes Codes. Wer diesen Kasten wegklickt,
 * ohne die Codes zu sichern, hat bei einem verlorenen Gerät keinen Weg mehr
 * ins Konto ausser über die Administration — das ist der Grund, warum der
 * Hinweis so deutlich ausfällt.
 */
export function RecoveryCodesNotice({ codes }: { codes: string[] }) {
  return (
    <div className="surface bg-concrete border border-deep/15 px-5 py-5">
      <p className="font-bold mb-1">Deine Wiederherstellungscodes</p>
      <p className="text-fine text-slate mb-4">
        Jeder Code funktioniert einmal, falls du keinen Zugriff mehr auf die Authenticator-App
        hast. Speichere sie jetzt an einem sicheren Ort — sie werden kein zweites Mal angezeigt.
      </p>
      <ul className="nums grid grid-cols-2 gap-2 font-bold">
        {codes.map((code) => (
          <li key={code} className="surface bg-paper border border-deep/12 px-3 py-2 text-center">
            {code}
          </li>
        ))}
      </ul>
    </div>
  );
}
