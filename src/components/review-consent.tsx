/**
 * Freiwilliges Häkchen: einmal per Mail um eine Google-Bewertung gebeten
 * werden. Eine solche Mail gilt als Werbung — ohne Einverständnis geht sie
 * nie raus (siehe lib/reviews.ts). Standardmässig leer.
 */
export function ReviewConsent({ checked, byPhone = false }: { checked?: boolean; byPhone?: boolean }) {
  return (
    <label className="flex gap-3 items-start cursor-pointer">
      <input
        type="checkbox"
        name="bewertung"
        value="ja"
        className="mt-1 w-5 h-5 accent-signal shrink-0"
        defaultChecked={checked}
      />
      <span className="text-fine text-slate">
        {byPhone ? (
          <>
            Einverstanden, nach dem Kurs oder der Ausbildung einmal per Mail um eine
            Google-Bewertung gebeten zu werden.{" "}
            <span className="font-semibold text-deep">Nur ankreuzen, wenn die Person Ja gesagt hat.</span>
          </>
        ) : (
          <>
            Freiwillig: Nach dem Kurs oder der Ausbildung dürft ihr mich einmal per Mail um eine
            Google-Bewertung bitten. Danach kommt keine weitere Mail dieser Art.
          </>
        )}
      </span>
    </label>
  );
}
