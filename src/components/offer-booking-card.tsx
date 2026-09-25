import Link from "next/link";
import {
  activePromotions,
  applyPromotions,
  BOOKING_HORIZON_DAYS,
  findSlots,
  lessonTypeBySlug,
  type Slot,
} from "@/lib/booking";
import type { LessonType } from "@/lib/db/schema";
import { site } from "@/lib/site";
import { formatDayLong, formatPrice } from "@/lib/time";
import { fullCourseSessions, type FullSession } from "@/lib/waitlist";

/**
 * Die Buchungskarte oben auf den Angebotsseiten.
 *
 * Vorher stand dort nur ein einzelner Knopf (bei den Fahrstunden sogar nur
 * „Schnupperstunde buchen“), der Preis kam erst in der Seitenmitte. Jetzt
 * sieht man gleich beim Öffnen, was es kostet und wann es das nächste Mal
 * geht — und kommt mit einem Klick in die Buchung, wie bei der Terminkarte
 * auf der Startseite.
 */
export async function OfferBookingCard({ slug }: { slug: string }) {
  let lessonType: LessonType | null = null;
  let slot: Slot | undefined;
  let fullSession: FullSession | undefined;
  let priced: ReturnType<typeof applyPromotions> | null = null;

  try {
    const promotions = await activePromotions();
    lessonType = await lessonTypeBySlug(slug);
    if (lessonType?.active) {
      priced = applyPromotions(lessonType, promotions);
      slot = (await findSlots({ lessonType, days: BOOKING_HORIZON_DAYS }))[0];
      // Alles ausgebucht: dann wenigstens der Weg auf die Warteliste.
      if (!slot) fullSession = (await fullCourseSessions(lessonType))[0];
    }
  } catch (error) {
    // Ist die Datenbank kurz weg, bleibt wenigstens der Weg zur Buchung.
    console.error("Buchungskarte konnte nicht geladen werden:", error);
  }

  if (!lessonType || !lessonType.active || !priced) {
    return (
      <div className="surface bg-paper p-5 md:p-6">
        <Link href="/buchen" className="btn btn-primary w-full">
          Termin buchen
        </Link>
      </div>
    );
  }

  const isCourse = lessonType.capacity > 1;
  const reduced = priced.finalRappen < lessonType.priceRappen;
  // Fahrstunden laufen über die Mehrfachauswahl (termin=…), alles andere
  // über einen einzelnen Termin (tag=…&zeit=…).
  const slotHref = slot
    ? lessonType.slug === "fahrstunde"
      ? `/buchen?angebot=${lessonType.slug}&termin=${slot.day}T${slot.time}`
      : `/buchen?angebot=${lessonType.slug}&tag=${slot.day}&zeit=${slot.time}`
    : null;

  return (
    <div className="surface bg-paper p-5 md:p-6">
      {priced.promotion && <p className="promo-tag mb-3">{priced.promotion.label}</p>}

      <p className="flex flex-wrap items-baseline gap-x-2.5">
        <span className="nums font-display text-3xl font-bold text-signal-ink">
          CHF {formatPrice(priced.finalRappen)}
        </span>
        {reduced && (
          <span className="nums text-slate line-through">CHF {formatPrice(lessonType.priceRappen)}</span>
        )}
        <span className="text-fine text-slate">
          {isCourse ? "pro Kurs" : `pro Lektion, ${lessonType.durationMinutes} Minuten`}
        </span>
      </p>

      <div className="mt-5 pt-5 border-t border-deep/10">
        {slot && slotHref ? (
          <>
            <p className="text-fine text-slate">{isCourse ? "Nächster Kurs" : "Nächster freier Termin"}</p>
            <p className="font-display font-bold text-xl leading-tight mt-1 hyphens-none">
              {formatDayLong(slot.day)}
            </p>
            <p className="text-fine text-slate mt-0.5">
              <span className="tabular-nums font-semibold text-deep">{slot.time} Uhr</span>
              {isCourse && `, noch ${slot.seatsLeft} ${slot.seatsLeft === 1 ? "Platz" : "Plätze"} frei`}
            </p>
            <Link href={slotHref} className="btn btn-primary w-full mt-5">
              Diesen Termin buchen
            </Link>
            <Link
              href={`/buchen?angebot=${lessonType.slug}`}
              className="btn btn-outline w-full mt-2.5"
            >
              {isCourse ? "Alle Kursdaten ansehen" : "Alle freien Termine ansehen"}
            </Link>
          </>
        ) : fullSession ? (
          <>
            <p className="text-fine text-slate">Nächster Kurs, ausgebucht</p>
            <p className="font-display font-bold text-xl leading-tight mt-1 hyphens-none">
              {formatDayLong(fullSession.day)}
            </p>
            <p className="text-fine text-slate mt-0.5">
              <span className="tabular-nums font-semibold text-deep">{fullSession.time} Uhr</span>
              . Sagt jemand ab, bekommst du eine Mail.
            </p>
            <Link
              href={`/buchen/warteliste?angebot=${lessonType.slug}&tag=${fullSession.day}&zeit=${fullSession.time}`}
              className="btn btn-primary w-full mt-5"
            >
              Auf die Warteliste
            </Link>
            <Link
              href={`/buchen?angebot=${lessonType.slug}`}
              className="btn btn-outline w-full mt-2.5"
            >
              Alle Kursdaten ansehen
            </Link>
          </>
        ) : (
          <>
            <p className="font-semibold">Online ist gerade nichts frei.</p>
            <p className="text-fine text-slate mt-1">
              Ruf uns an, oft finden wir trotzdem einen Termin.
            </p>
            <a href={`tel:${site.contact.phoneHref}`} className="btn btn-primary w-full mt-4">
              {site.contact.phone}
            </a>
          </>
        )}
      </div>

    </div>
  );
}
