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
      <div className="bg-paper text-deep p-6 sm:p-7 max-w-xl">
        <p className="font-bold text-lg mb-1">Gerade ist kein Termin frei</p>
        <p className="text-slate text-fine mb-5">
          Neue Zeiten kommen laufend dazu. Ruf uns an, wir finden etwas.
        </p>
        <a href={`tel:${site.contact.phoneHref}`} className="btn btn-primary">
          {site.contact.phone}
        </a>
      </div>
    );
  }

  const { slot, lessonType } = result;

  return (
    <div className="bg-paper text-deep max-w-xl">
      <div className="p-6 sm:p-7">
        <p className="text-fine font-semibold text-slate mb-3">Nächster freier Termin</p>
        <p className="stretch-wide font-extrabold text-2xl sm:text-[1.75rem] leading-[1.05] tracking-tight">
          {formatDayLong(slot.day)}
        </p>
        <p className="nums stretch-wide font-extrabold text-signal-ink text-4xl sm:text-5xl leading-none mt-2">
          {slot.time}
        </p>
        <p className="text-fine text-slate mt-3">
          {lessonType.name}, {lessonType.durationMinutes} Minuten
          {slot.staffIds.length > 1 ? ` — ${slot.staffIds.length} Fahrlehrer verfügbar` : ""}
        </p>
      </div>
      <Link
        href={`/buchen?angebot=${lessonType.slug}&tag=${slot.day}&zeit=${slot.time}`}
        className="btn btn-deep w-full"
      >
        Diesen Termin sichern
      </Link>
    </div>
  );
}

/** Platzhalter gleicher Höhe, damit beim Nachladen nichts springt. */
export function NextSlotSkeleton() {
  return (
    <div className="bg-paper max-w-xl p-6 sm:p-7" aria-hidden="true">
      <div className="h-4 w-44 bg-concrete-dim mb-4" />
      <div className="h-7 w-72 max-w-full bg-concrete-dim mb-3" />
      <div className="h-11 w-32 bg-concrete-dim mb-3" />
      <div className="h-4 w-52 max-w-full bg-concrete-dim" />
    </div>
  );
}
