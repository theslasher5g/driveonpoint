import { activePromotions, applyPromotions, listLessonTypes, listPackages } from "@/lib/booking";
import { formatPrice } from "@/lib/time";

/**
 * Preise kommen aus der Datenbank und werden im Team-Bereich gepflegt.
 *
 * Drei Beträge können nebeneinander stehen: der reguläre Preis, der
 * ermässigte für Lehrlinge, Studierende und IV, und — falls eine Aktion
 * läuft — der reduzierte. Die Aktion gewinnt und wird gelb markiert.
 */
export async function PriceTable({
  onlySlug,
  withPackages = true,
}: {
  onlySlug?: string;
  withPackages?: boolean;
}) {
  let rows: Awaited<ReturnType<typeof listLessonTypes>> = [];
  let promotions: Awaited<ReturnType<typeof activePromotions>> = [];
  let packages: Awaited<ReturnType<typeof listPackages>> = [];

  try {
    [rows, promotions, packages] = await Promise.all([
      listLessonTypes(),
      activePromotions(),
      listPackages(),
    ]);
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

  const visibleIds = new Set(visible.map((row) => row.id));
  const bundles = withPackages
    ? packages.filter((bundle) => !onlySlug || (bundle.lessonTypeId && visibleIds.has(bundle.lessonTypeId)))
    : [];

  return (
    <div className="border-t border-deep/12">
      {visible.map((lessonType) => {
        const priced = applyPromotions(lessonType, promotions);
        const onOffer = priced.finalRappen !== lessonType.priceRappen;

        return (
          <div
            key={lessonType.id}
            className="border-b border-deep/12 py-5 flex flex-wrap gap-x-6 gap-y-2 items-baseline"
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-lg">{lessonType.name}</h3>
              <p className="text-fine text-slate mt-0.5">
                {lessonType.shortDescription || `${lessonType.durationMinutes} Minuten`}
              </p>
              {onOffer && priced.promotion && (
                <p className="promo-tag mt-2.5">{priced.promotion.label}</p>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="nums stretch-wide font-extrabold text-2xl leading-none">
                {onOffer && (
                  <span className="text-slate font-semibold text-base line-through mr-2.5">
                    {formatPrice(lessonType.priceRappen)}
                  </span>
                )}
                <span className={onOffer ? "text-signal-ink" : ""}>
                  CHF {formatPrice(priced.finalRappen)}
                </span>
              </p>
              {lessonType.reducedPriceRappen != null && !onOffer && (
                <p className="nums text-fine text-slate mt-1.5">
                  CHF {formatPrice(lessonType.reducedPriceRappen)} für{" "}
                  {lessonType.reducedLabel}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {bundles.length > 0 && (
        <div className="pt-7">
          <h3 className="text-lg mb-1">Pakete und Abos</h3>
          <p className="text-fine text-slate mb-4 max-w-[52ch]">
            Einmal bezahlt, danach buchst du die einzelnen Lektionen ganz normal im Kalender.
          </p>
          <ul className="border-t border-deep/12">
            {bundles.map((bundle) => (
              <li
                key={bundle.id}
                className="border-b border-deep/12 py-4 flex flex-wrap gap-x-6 gap-y-1 items-baseline"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{bundle.label}</p>
                  {bundle.note && <p className="text-fine text-slate mt-0.5">{bundle.note}</p>}
                </div>
                <p className="nums stretch-wide font-extrabold text-xl shrink-0">
                  CHF {formatPrice(bundle.priceRappen)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
