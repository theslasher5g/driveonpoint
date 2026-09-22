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
        <p className="text-paper/75 text-fine mb-5">
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
      <p className="text-fine font-semibold text-paper/75 mb-3">Nächster freier Termin</p>
      <p className="font-display font-bold text-2xl sm:text-[1.75rem] leading-[1.05] tracking-tight">
        {formatDayLong(slot.day)}
      </p>
      <p className="nums font-display font-bold text-5xl sm:text-6xl leading-none mt-2">
        {slot.time}
      </p>
      <p className="text-fine text-paper/75 mt-3">
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
export function NextSlotSkeleton() {
  return (
    <div className="glass rounded-[var(--radius-surface)] max-w-xl p-6 sm:p-7" aria-hidden="true">
      <div className="h-4 w-44 bg-paper/20 rounded-full mb-4" />
      <div className="h-7 w-72 max-w-full bg-paper/20 rounded-full mb-3" />
      <div className="h-11 w-32 bg-paper/20 rounded-full mb-3" />
      <div className="h-4 w-52 max-w-full bg-paper/20 rounded-full" />
    </div>
  );
}
