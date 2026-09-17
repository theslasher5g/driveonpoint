/**
 * Formularfalle. Ein echtes Eingabefeld, das nur ausserhalb des sichtbaren
 * Bereichs liegt — Menschen sehen es nie, einfache Massenskripte füllen jedes
 * Feld aus, das sie im Markup finden.
 *
 * Bewusst nicht per `display:none` versteckt: darauf achten Skripte längst.
 * `aria-hidden` und `tabIndex={-1}` halten es von Vorlesesoftware und der
 * Tastaturbedienung fern.
 */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-0 w-px h-px overflow-hidden">
      <label htmlFor="website">Bitte dieses Feld leer lassen</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}
