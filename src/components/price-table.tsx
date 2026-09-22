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
  /**
   * Ein Angebot oder mehrere. Mehrere gehören in einen einzigen Aufruf und
   * nicht in zwei nebeneinander: sonst erscheint der Abschnitt „Pakete und
   * Abos“ samt Erklärung zweimal auf derselben Seite. Bei einer Liste gilt
   * die angegebene Reihenfolge, sonst die aus dem Team-Bereich.
   */
  onlySlug?: string | string[];
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

  const wanted = onlySlug === undefined ? null : [onlySlug].flat();
  const visible = wanted
    ? wanted
        .map((slug) => rows.find((row) => row.slug === slug))
        .filter((row): row is (typeof rows)[number] => row !== undefined)
    : rows;

  if (visible.length === 0) {
    return <p className="text-slate">Für dieses Angebot ist noch kein Preis hinterlegt.</p>;
  }

  const visibleIds = new Set(visible.map((row) => row.id));
  const bundles = withPackages
    ? packages.filter((bundle) => !wanted || (bundle.lessonTypeId && visibleIds.has(bundle.lessonTypeId)))
    : [];

  return (
    <div>
      {/* Karten statt Zeilen: der Preis ist bei jedem Angebot die grösste
          Zahl auf der Karte, nicht ein Wert neben vielen anderen in einer
          Tabellenspalte — für eine Handvoll Angebote liest sich das schneller
          als eine Liste, die man von oben nach unten abgehen muss. */}
      <ul className={`grid gap-4 ${visible.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {visible.map((lessonType) => {
          const priced = applyPromotions(lessonType, promotions);
          const onOffer = priced.finalRappen !== lessonType.priceRappen;

          return (
            <li
              key={lessonType.id}
              className="group surface bg-paper p-6 flex flex-col hover:border-signal/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-display text-xl font-bold leading-tight">
                    {lessonType.name}
                  </h3>
                  <p className="text-fine text-slate mt-1">
                    {lessonType.shortDescription || `${lessonType.durationMinutes} Minuten`}
                  </p>
                </div>
                {onOffer && priced.promotion && (
                  <span className="promo-tag shrink-0">{priced.promotion.label}</span>
                )}
              </div>

              <div className="mt-7 pt-5 border-t border-deep/10 flex items-end justify-between gap-4">
                <div>
                  {onOffer && (
                    <p className="nums text-slate text-fine line-through">
                      CHF {formatPrice(lessonType.priceRappen)}
                    </p>
                  )}
                  <p
                    className={`nums font-display text-4xl font-bold leading-none mt-1 ${onOffer ? "text-signal-ink" : ""}`}
                  >
                    CHF {formatPrice(priced.finalRappen)}
                  </p>
                </div>
                {lessonType.reducedPriceRappen != null && !onOffer && (
                  <p className="nums text-fine text-slate text-right">
                    CHF {formatPrice(lessonType.reducedPriceRappen)}
                    <br />
                    für {lessonType.reducedLabel}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {bundles.length > 0 && (
        <div className="mt-10">
          <h3 className="text-lg mb-1">Pakete und Abos</h3>
          <p className="text-fine text-slate mb-4 max-w-[52ch]">
            Einmal bezahlt, danach buchst du die einzelnen Lektionen ganz normal im Kalender.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {bundles.map((bundle) => (
              <li
                key={bundle.id}
                className="surface bg-concrete p-5 flex items-baseline justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-bold">{bundle.label}</p>
                  {bundle.note && <p className="text-fine text-slate mt-0.5">{bundle.note}</p>}
                </div>
                <p className="nums font-display text-xl font-bold shrink-0">
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
