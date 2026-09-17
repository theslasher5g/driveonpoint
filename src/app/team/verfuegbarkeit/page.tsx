import Link from "next/link";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { availabilityExceptions, availabilityRules, staff } from "@/lib/db/schema";
import { formatDayLong, todayInZurich, weekdayName } from "@/lib/time";
import { AvailabilityForms } from "@/components/availability-forms";
import { DeleteRuleButton, DeleteExceptionButton } from "@/components/availability-delete";

export const dynamic = "force-dynamic";

export default async function VerfuegbarkeitPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const user = await requirePermission("verfuegbarkeit.eigene");
  const params = await searchParams;

  const managesOthers = can(user.role, "verfuegbarkeit.alle");

  const team = managesOthers
    ? await db
        .select({ id: staff.id, name: staff.name })
        .from(staff)
        .where(eq(staff.active, true))
        .orderBy(asc(staff.name))
    : [{ id: user.id, name: user.name }];

  const allowed = team.map((person) => person.id);
  const targetId = params.person && allowed.includes(params.person) ? params.person : user.id;
  const target = team.find((person) => person.id === targetId) ?? { id: user.id, name: user.name };

  const [rules, exceptions] = await Promise.all([
    db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.staffId, targetId))
      .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime)),
    db
      .select()
      .from(availabilityExceptions)
      .where(
        and(
          eq(availabilityExceptions.staffId, targetId),
          gte(availabilityExceptions.day, todayInZurich()),
        ),
      )
      .orderBy(asc(availabilityExceptions.day), asc(availabilityExceptions.startTime)),
  ]);

  const byWeekday = new Map<number, typeof rules>();
  for (const rule of rules) {
    const list = byWeekday.get(rule.weekday) ?? [];
    list.push(rule);
    byWeekday.set(rule.weekday, list);
  }

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <h1 className="text-title">Verfügbarkeit</h1>
        <p className="text-slate text-lead mt-4 max-w-[58ch]">
          Was hier steht, sehen Kundinnen und Kunden als buchbare Termine. Ohne eingetragene
          Zeiten kann niemand buchen.
        </p>

        {managesOthers && team.length > 1 && (
          <ul className="flex flex-wrap gap-2 mt-7" aria-label="Person wählen">
            {team.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/team/verfuegbarkeit?person=${person.id}`}
                  className={`block px-3.5 py-2 text-fine font-semibold border ${
                    person.id === targetId
                      ? "border-signal bg-signal text-paper"
                      : "border-deep/20 bg-paper"
                  }`}
                >
                  {person.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-12 lg:grid-cols-2 mt-10">
          <div>
            <h2 className="text-section">Wöchentlich</h2>
            <p className="text-slate mt-2 mb-6 max-w-[48ch]">
              Zeiten, die jede Woche gelten. Für {target.name}.
            </p>

            {rules.length === 0 ? (
              <p className="text-slate">Noch nichts eingetragen.</p>
            ) : (
              <div className="border-t border-deep/15">
                {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
                  const list = byWeekday.get(weekday);
                  if (!list || list.length === 0) return null;
                  return (
                    <div key={weekday} className="border-b border-deep/15 py-3.5">
                      <h3 className="text-base">{weekdayName(weekday)}</h3>
                      <ul className="mt-1.5 space-y-1.5">
                        {list.map((rule) => (
                          <li key={rule.id} className="nums flex items-center gap-3">
                            <span className="font-semibold">
                              {rule.startTime.slice(0, 5)} – {rule.endTime.slice(0, 5)}
                            </span>
                            <DeleteRuleButton id={rule.id} person={targetId} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-section">Einzelne Tage</h2>
            <p className="text-slate mt-2 mb-6 max-w-[48ch]">
              Ferien, Arzttermine oder ein zusätzlicher Samstag. Überschreibt das Wochenraster.
            </p>

            {exceptions.length === 0 ? (
              <p className="text-slate">Keine Ausnahmen für die kommenden Tage.</p>
            ) : (
              <ul className="border-t border-deep/15">
                {exceptions.map((entry) => (
                  <li key={entry.id} className="border-b border-deep/15 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span
                        className={`text-fine font-bold px-2 py-0.5 ${
                          entry.available ? "bg-signal text-paper" : "bg-concrete-dim text-deep"
                        }`}
                      >
                        {entry.available ? "zusätzlich frei" : "abwesend"}
                      </span>
                      <span className="font-semibold">{formatDayLong(entry.day)}</span>
                      <span className="nums text-slate">
                        {entry.startTime.slice(0, 5)} – {entry.endTime.slice(0, 5)}
                      </span>
                      <DeleteExceptionButton id={entry.id} person={targetId} />
                    </div>
                    {entry.note && <p className="text-fine text-slate mt-1">{entry.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <AvailabilityForms person={targetId} />
      </div>
    </section>
  );
}
