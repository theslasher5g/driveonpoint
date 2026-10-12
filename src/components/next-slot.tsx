import Link from "next/link";
import { nextFreeSlot } from "@/lib/booking";
import { site } from "@/lib/site";
import { formatDayLong } from "@/lib/time";

/**
 * Der nächste tatsächlich freie Termin, als Leiste unter dem Foto im
 * Aufmacher der Startseite — statt einer erfundenen Kennzahl die eine
 * Information, die nur diese Seite zeigen kann.
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
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
        <div>
          <p className="font-bold">Online ist gerade nichts frei.</p>
          <p className="text-fine text-slate mt-0.5">Ruf an, oft finden wir trotzdem einen Termin.</p>
        </div>
        <a href={`tel:${site.contact.phoneHref}`} className="btn btn-outline nums">
          {site.contact.phone}
        </a>
      </div>
    );
  }

  const { slot, lessonType } = result;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
      <div className="min-w-0">
        <p className="text-fine text-slate">Nächster freier Termin</p>
        {/* hyphens-none: "Oktober" soll ganz umbrechen statt mitten im
            Wort getrennt zu werden. */}
        <p className="font-display font-bold text-xl sm:text-2xl leading-tight mt-0.5 hyphens-none">
          {formatDayLong(slot.day)}, <span className="nums">{slot.time}</span>
        </p>
        <p className="text-fine text-slate mt-0.5">
          {lessonType.name}, {lessonType.durationMinutes} Minuten
        </p>
      </div>
      <Link
        href={`/buchen?angebot=${lessonType.slug}&tag=${slot.day}&zeit=${slot.time}`}
        className="btn btn-primary shrink-0"
      >
        Diesen Termin buchen
      </Link>
    </div>
  );
}

/**
 * Platzhalter mit demselben Aufbau und denselben Schriften, nur
 * unsichtbarem Text: so ist er genau so hoch wie die fertige Leiste und
 * beim Nachladen springt nichts.
 */
export function NextSlotSkeleton() {
  const bar = "bg-deep/8 rounded-full text-transparent select-none";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 p-5 sm:p-6" aria-hidden="true">
      <div>
        <p className="text-fine">
          <span className={bar}>Nächster freier Termin</span>
        </p>
        <p className="font-display font-bold text-xl sm:text-2xl leading-tight mt-0.5">
          <span className={bar}>Mittwoch, 14. Oktober 2026, 07:00</span>
        </p>
        <p className="text-fine mt-0.5">
          <span className={bar}>Fahrstunde, 45 Minuten</span>
        </p>
      </div>
      <span className="btn btn-primary opacity-30">Diesen Termin buchen</span>
    </div>
  );
}
