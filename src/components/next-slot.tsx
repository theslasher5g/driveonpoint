import Link from "next/link";
import { nextFreeSlot } from "@/lib/booking";
import { site } from "@/lib/site";
import { formatDayLong } from "@/lib/time";

/**
 * Der Aufmacher der Startseite.
 *
 * Statt einer erfundenen Kennzahl steht hier der nächste tatsächlich freie
 * Termin aus dem Kalender der Mitarbeitenden. Das ist die eine Information,
 * die nur diese Seite zeigen kann — und die einzige, für die jemand
 * hierherkommt.
 */
export async function NextSlotPanel() {
  let result: Awaited<ReturnType<typeof nextFreeSlot>> = null;

  try {
    result = await nextFreeSlot();
  } catch (error) {
    // Ist die Datenbank kurz weg, bleibt die Seite trotzdem stehen.
    console.error("Freie Termine konnten nicht geladen werden:", error);
  }

  if (!result) {
    return (
      <div className="glass text-paper rounded-[var(--radius-surface)] p-6 sm:p-7 max-w-xl">
        <p className="font-bold text-lg mb-1">Gerade ist kein Termin frei</p>
        <p className="text-paper/90 text-fine mb-5">
          Neue Zeiten kommen laufend dazu. Ruf uns an, wir finden etwas.
        </p>
        <a href={`tel:${site.contact.phoneHref}`} className="btn btn-invert">
          {site.contact.phone}
        </a>
      </div>
    );
  }

  const { slot, lessonType } = result;

  return (
    <div className="glass text-paper rounded-[var(--radius-surface)] max-w-xl p-6 sm:p-7">
      <p className="text-fine font-semibold text-paper/90 mb-3">Nächster freier Termin</p>
      {/* Ohne Trennung würde der Browser "September" wie ein Kompositum
          mitten im Wort trennen (die globale Trennregel gilt für lange
          deutsche Wörter, nicht für Datumsangaben) — hier lieber ganz
          umbrechen als das Wort aufreissen. */}
      <p
        className="font-display font-bold text-2xl sm:text-[1.75rem] leading-[1.05] tracking-tight hyphens-none"
      >
        {formatDayLong(slot.day)}
      </p>
      <p className="nums font-display font-bold text-5xl sm:text-6xl leading-none mt-2">
        {slot.time}
      </p>
      <p className="text-fine text-paper/90 mt-3">
        {lessonType.name}, {lessonType.durationMinutes} Minuten
        {slot.staffIds.length > 1 ? ` — ${slot.staffIds.length} Fahrlehrer verfügbar` : ""}
      </p>
      <Link
        href={`/buchen?angebot=${lessonType.slug}&tag=${slot.day}&zeit=${slot.time}`}
        className="btn btn-invert w-full mt-6"
      >
        Diesen Termin sichern
      </Link>
    </div>
  );
}

/** Platzhalter gleicher Höhe, damit beim Nachladen nichts springt. */
/**
 * Platzhalter, bis die Karte oben fertig ist. Gleicher Aufbau, gleiche
 * Schriften, nur unsichtbarer Text: so ist er genau so hoch wie die Karte.
 * Vorher war er niedriger — beim Nachladen wuchs der Aufmacher, und
 * Lighthouse zählte das als Layoutverschiebung.
 */
export function NextSlotSkeleton() {
  const bar = "bg-paper/20 rounded-full text-transparent select-none";
  return (
    <div className="glass text-paper rounded-[var(--radius-surface)] max-w-xl p-6 sm:p-7" aria-hidden="true">
      <p className="text-fine font-semibold mb-3">
        <span className={bar}>Nächster freier Termin</span>
      </p>
      <p className="font-display font-bold text-2xl sm:text-[1.75rem] leading-[1.05] tracking-tight hyphens-none">
        <span className={bar}>Dienstag, 6. Oktober 2026</span>
      </p>
      <p className="nums font-display font-bold text-5xl sm:text-6xl leading-none mt-2">
        <span className={bar}>00:00</span>
      </p>
      <p className="text-fine mt-3">
        <span className={bar}>Fahrstunde, 45 Minuten</span>
      </p>
      <span className="btn btn-invert w-full mt-6 opacity-30">&nbsp;</span>
    </div>
  );
}
