import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  lessonTypes,
  staff,
  staffLessonTypes,
} from "@/lib/db/schema";
import { formatDayLong, todayInZurich, weekdayName } from "@/lib/time";
import { AvailabilityForms, AvailabilityExceptionForm } from "@/components/availability-forms";
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

  const [offerings, rules, exceptions] = await Promise.all([
    db
      .select({ id: lessonTypes.id, name: lessonTypes.name })
      .from(staffLessonTypes)
      .innerJoin(lessonTypes, eq(lessonTypes.id, staffLessonTypes.lessonTypeId))
      .where(and(eq(staffLessonTypes.staffId, targetId), eq(lessonTypes.active, true)))
      .orderBy(asc(lessonTypes.sortOrder), asc(lessonTypes.name)),
    db
      .select({
        id: availabilityRules.id,
        lessonTypeId: availabilityRules.lessonTypeId,
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
        lessonName: lessonTypes.name,
      })
      .from(availabilityRules)
      .innerJoin(lessonTypes, eq(lessonTypes.id, availabilityRules.lessonTypeId))
      .where(eq(availabilityRules.staffId, targetId))
      .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime)),
    db
      .select({
        id: availabilityExceptions.id,
        lessonTypeId: availabilityExceptions.lessonTypeId,
        day: availabilityExceptions.day,
        startTime: availabilityExceptions.startTime,
        endTime: availabilityExceptions.endTime,
        available: availabilityExceptions.available,
        note: availabilityExceptions.note,
        lessonName: lessonTypes.name,
      })
      .from(availabilityExceptions)
      .leftJoin(lessonTypes, eq(lessonTypes.id, availabilityExceptions.lessonTypeId))
      .where(
        and(
          eq(availabilityExceptions.staffId, targetId),
          gte(availabilityExceptions.day, todayInZurich()),
        ),
      )
      .orderBy(asc(availabilityExceptions.day), asc(availabilityExceptions.startTime)),
  ]);

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <h1 className="text-title">Verfügbarkeit</h1>
        <p className="text-slate text-lead mt-4 max-w-[58ch]">
          Was hier steht, sehen Kundinnen und Kunden als buchbare Termine. Ohne eingetragene
          Zeiten kann niemand buchen. Jedes Angebot — Fahrstunde, VKU, Nothilfekurs — hat seinen
          eigenen Plan, denn die Zeiten unterscheiden sich stark (VKU zum Beispiel meist abends).
        </p>

        {managesOthers && team.length > 1 && (
          <ul className="flex flex-wrap gap-2 mt-7" aria-label="Person wählen">
            {team.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/team/verfuegbarkeit?person=${person.id}`}
                  className={`block px-3.5 py-2 text-fine font-semibold border ${
                    person.id === targetId
                      ? "border-signal bg-signal text-deep"
                      : "border-deep/20 bg-paper"
                  }`}
                >
                  {person.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {offerings.length === 0 ? (
          <p className="text-slate mt-10">
            {target.name} ist noch keinem Angebot zugeteilt. Das lässt sich unter{" "}
            <Link href="/team/mitarbeiter" className="font-semibold underline underline-offset-4">
              Mitarbeitende
            </Link>{" "}
            einrichten.
          </p>
        ) : (
          <div className="mt-10 space-y-14">
            {offerings.map((offering) => {
              const ownRules = rules.filter((rule) => rule.lessonTypeId === offering.id);
              const byWeekday = new Map<number, typeof ownRules>();
              for (const rule of ownRules) {
                const list = byWeekday.get(rule.weekday) ?? [];
                list.push(rule);
                byWeekday.set(rule.weekday, list);
              }

              return (
                <div key={offering.id} className="border-t-2 border-deep pt-5">
                  <h2 className="text-section mb-4">{offering.name}</h2>

                  {/* Bestand links, Eingabe rechts. Vorher stand das Formular
                      unter der Liste, viermal untereinander — dieselbe Seite
                      war dadurch mehr als doppelt so hoch. */}
                  <div className="grid gap-6 lg:grid-cols-2 lg:gap-10 items-start">
                    {ownRules.length === 0 ? (
                      <p className="text-slate text-fine">Noch nichts eingetragen.</p>
                    ) : (
                      <div className="border-t border-deep/15">
                        {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
                          const list = byWeekday.get(weekday);
                          if (!list || list.length === 0) return null;
                          return (
                            <div
                              key={weekday}
                              className="border-b border-deep/15 py-2 flex items-baseline gap-4"
                            >
                              <h3 className="text-fine font-bold w-[11ch] shrink-0 break-normal">
                                {weekdayName(weekday)}
                              </h3>
                              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                                {list.map((rule) => (
                                  <li key={rule.id} className="nums flex items-center gap-2">
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

                    <AvailabilityForms
                      person={targetId}
                      lessonTypeId={offering.id}
                      lessonTypeName={offering.name}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10 pt-6 border-t-2 border-deep">
          <h2 className="text-section">Einzelne Tage</h2>
          <p className="text-slate text-fine mt-1.5 mb-5 max-w-[60ch]">
            Ferien, Arzttermine oder ein zusätzlicher Termin. Gilt standardmässig für alle
            Angebote von {target.name} — lässt sich beim Eintragen auf ein Angebot eingrenzen.
          </p>

          {exceptions.length === 0 ? (
            <p className="text-slate text-fine">Keine Ausnahmen für die kommenden Tage.</p>
          ) : (
            <ul className="border-t border-deep/15">
              {exceptions.map((entry) => (
                <li key={entry.id} className="border-b border-deep/15 py-3.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className={`text-fine font-bold px-2 py-0.5 ${
                        entry.available ? "bg-success text-paper" : "bg-concrete-dim text-deep"
                      }`}
                    >
                      {entry.available ? "zusätzlich frei" : "abwesend"}
                    </span>
                    <span className="font-semibold">{formatDayLong(entry.day)}</span>
                    <span className="nums text-slate">
                      {entry.startTime.slice(0, 5)} – {entry.endTime.slice(0, 5)}
                    </span>
                    <span className="text-fine text-slate">
                      {entry.lessonName ?? "alle Angebote"}
                    </span>
                    <DeleteExceptionButton id={entry.id} person={targetId} />
                  </div>
                  {entry.note && <p className="text-fine text-slate mt-1">{entry.note}</p>}
                </li>
              ))}
            </ul>
          )}

          <AvailabilityExceptionForm person={targetId} offerings={offerings} />
        </div>
      </div>
    </section>
  );
}
