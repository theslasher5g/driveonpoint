import { activePromotions, applyPromotions, listLessonTypes } from "@/lib/booking";
import { formatPrice } from "@/lib/time";

/**
 * Preise kommen aus der Datenbank und werden im Team-Bereich gepflegt.
 * Läuft eine Aktion, steht der reduzierte Betrag vorne und der bisherige
 * durchgestrichen daneben.
 */
export async function PriceTable({ onlySlug }: { onlySlug?: string }) {
  let rows: Awaited<ReturnType<typeof listLessonTypes>> = [];
  let promotions: Awaited<ReturnType<typeof activePromotions>> = [];

  try {
    [rows, promotions] = await Promise.all([listLessonTypes(), activePromotions()]);
  } catch (error) {
    console.error("Preise konnten nicht geladen werden:", error);
    return (
      <p className="text-slate">
        Die Preisliste ist gerade nicht abrufbar. Ruf uns an, wir nennen sie dir.
      </p>
    );
  }

  const visible = onlySlug ? rows.filter((row) => row.slug === onlySlug) : rows;
  if (visible.length === 0) {
    return <p className="text-slate">Für dieses Angebot ist noch kein Preis hinterlegt.</p>;
  }

  return (
    <div className="border-t border-deep/15">
      {visible.map((lessonType) => {
        const priced = applyPromotions(lessonType, promotions);
        const reduced = priced.finalRappen !== lessonType.priceRappen;

        return (
          <div
            key={lessonType.id}
            className="border-b border-deep/15 py-5 flex flex-wrap gap-x-6 gap-y-2 items-baseline"
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-lg">{lessonType.name}</h3>
              <p className="text-fine text-slate mt-0.5">
                {lessonType.shortDescription || `${lessonType.durationMinutes} Minuten`}
              </p>
              {reduced && priced.promotion && (
                <p className="promo-tag mt-2.5">{priced.promotion.label}</p>
              )}
            </div>

            <p className="nums stretch-wide font-extrabold text-2xl leading-none shrink-0">
              {reduced && (
                <span className="text-slate font-semibold text-base line-through mr-2.5">
                  {formatPrice(lessonType.priceRappen)}
                </span>
              )}
              <span className={reduced ? "text-signal" : ""}>
                CHF {formatPrice(priced.finalRappen)}
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
