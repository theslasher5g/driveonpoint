import { asc, desc, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { lessonTypes, promotions } from "@/lib/db/schema";
import { formatDayLong, formatPrice, todayInZurich } from "@/lib/time";
import { PromotionForm } from "@/components/promotion-form";
import { PromotionRowActions } from "@/components/promotion-row-actions";

export const dynamic = "force-dynamic";

export default async function AktionenPage() {
  await requirePermission("aktionen.verwalten");

  const [offers, rows] = await Promise.all([
    db
      .select({ id: lessonTypes.id, name: lessonTypes.name })
      .from(lessonTypes)
      .where(eq(lessonTypes.active, true))
      .orderBy(asc(lessonTypes.sortOrder)),
    db
      .select({
        id: promotions.id,
        label: promotions.label,
        percentOff: promotions.percentOff,
        amountOffRappen: promotions.amountOffRappen,
        startsOn: promotions.startsOn,
        endsOn: promotions.endsOn,
        active: promotions.active,
        offerName: lessonTypes.name,
      })
      .from(promotions)
      .leftJoin(lessonTypes, eq(lessonTypes.id, promotions.lessonTypeId))
      .orderBy(desc(promotions.startsOn)),
  ]);

  const today = todayInZurich();

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <h1 className="text-title">Rabattaktionen</h1>
        <p className="text-slate text-lead mt-4 max-w-[58ch]">
          Eine laufende Aktion erscheint sofort in der Preisliste und im Buchungsablauf. Läuft
          mehr als eine, gilt für die Kundschaft automatisch die günstigste.
        </p>

        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] mt-10">
          <div>
            <h2 className="text-section mb-6">Neue Aktion</h2>
            <PromotionForm offers={offers} today={today} />
          </div>

          <div>
            <h2 className="text-section mb-6">Bestehende</h2>
            {rows.length === 0 ? (
              <p className="text-slate">Noch keine Aktion angelegt.</p>
            ) : (
              <ul className="border-t border-deep/15">
                {rows.map((promotion) => {
                  const running =
                    promotion.active &&
                    promotion.startsOn <= today &&
                    promotion.endsOn >= today;
                  const over = promotion.endsOn < today;

                  return (
                    <li key={promotion.id} className="border-b border-deep/15 py-4">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                        <span
                          className={`text-fine font-bold px-2 py-0.5 ${
                            running
                              ? "bg-amber text-deep"
                              : over
                                ? "bg-concrete-dim text-slate"
                                : "bg-paper border border-deep/20 text-slate"
                          }`}
                        >
                          {running ? "läuft" : over ? "vorbei" : promotion.active ? "geplant" : "pausiert"}
                        </span>
                        <h3 className="text-base">{promotion.label}</h3>
                      </div>

                      <p className="nums text-fine text-slate mt-1.5">
                        {promotion.percentOff != null
                          ? `${promotion.percentOff} Prozent`
                          : `CHF ${formatPrice(promotion.amountOffRappen ?? 0)}`}{" "}
                        Rabatt auf {promotion.offerName ?? "alle Angebote"}
                      </p>
                      <p className="nums text-fine text-slate">
                        {formatDayLong(promotion.startsOn)} bis {formatDayLong(promotion.endsOn)}
                      </p>

                      <PromotionRowActions id={promotion.id} active={promotion.active} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
