import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  lessonTypes,
  staff,
  staffLessonTypes,
} from "@/lib/db/schema";
import { occupiesTime } from "@/lib/booking";
import { customerHistories, describeHistory, type CustomerHistory } from "@/lib/customer-history";
import { waitlistsBetween } from "@/lib/waitlist";
import { toggleNoShowAction } from "./actions";
import {
  addDays,
  minutesSinceMidnight,
  todayInZurich,
  weekdayName,
  zurichDay,
  zurichTime,
  zurichToInstant,
  zurichWeekday,
} from "@/lib/time";
import { ActionMenu, ActionMenuItem } from "@/components/action-menu";
import { CancelBookingButton } from "@/components/cancel-booking-button";
import { DeleteExceptionButton } from "@/components/availability-delete";

type Entry = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  noShowAt: Date | null;
  cancelledBy: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  staffId: string | null;
  staffName: string | null;
  lessonName: string | null;
  lessonCapacity: number | null;
};

/** Ein Verfügbarkeitsfenster einer Person — mehrere Angebote zur selben Zeit zusammengefasst. */
type FreeBlock = { staffId: string; from: string; to: string; lessons: string[] };

type Item =
  | { kind: "frei"; start: number; block: FreeBlock }
  | { kind: "abwesend"; start: number; absence: Absence }
  | { kind: "termin"; start: number; entry: Entry };

type Absence = {
  id: string;
  staffId: string;
  startTime: string;
  endTime: string;
  note: string | null;
};

/**
 * Die Wochenansicht im Team-Kalender.
 *
 * Freie Zeit, Abwesenheit und gebuchte Termine stehen chronologisch in einer
 * Spalte, sehen aber grundverschieden aus (siehe .cal-* in globals.css) —
 * vorher waren Verfügbarkeit und Termine beides graue Kästen und kaum
 * auseinanderzuhalten. Abgesagte Termine rutschen als einzelne Zeile ans
 * Ende des Tages, statt mitten im Tag so viel Platz zu brauchen wie ein
 * echter Termin.
 */
export async function WeekView({
  start,
  visibleIds,
  seesEveryone,
  manages,
  mayEditAvailability,
}: {
  start: string;
  visibleIds: string[];
  focus?: string;
  seesEveryone: boolean;
  manages: boolean;
  mayEditAvailability: boolean;
}) {
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const today = todayInZurich();
  const now = Date.now();

  const [entries, rules, exceptions, people, offerings] = await Promise.all([
    db
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        status: bookings.status,
        noShowAt: bookings.noShowAt,
        cancelledBy: bookings.cancelledBy,
        customerName: bookings.customerName,
        customerEmail: bookings.customerEmail,
        customerPhone: bookings.customerPhone,
        customerNote: bookings.customerNote,
        staffId: bookings.staffId,
        staffName: staff.name,
        lessonName: lessonTypes.name,
        lessonCapacity: lessonTypes.capacity,
      })
      .from(bookings)
      .leftJoin(staff, eq(staff.id, bookings.staffId))
      .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
      .where(
        and(
          inArray(bookings.staffId, visibleIds),
          // Abgesagte bleiben sichtbar, verfallene Anfragen (nie per Mail
          // bestätigt) dagegen nicht.
          or(eq(bookings.status, "abgesagt"), occupiesTime()),
          gte(bookings.startsAt, zurichToInstant(start, "00:00")),
          lte(bookings.startsAt, zurichToInstant(end, "23:59")),
        ),
      ),
    db
      .select({
        staffId: availabilityRules.staffId,
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
        validFrom: availabilityRules.validFrom,
        validUntil: availabilityRules.validUntil,
        lessonName: lessonTypes.name,
      })
      .from(availabilityRules)
      .innerJoin(lessonTypes, eq(lessonTypes.id, availabilityRules.lessonTypeId))
      // Nur was auch buchbar ist, dieselben Bedingungen wie in findSlots:
      // Angebot aktiv und der Person zugeteilt, und keine Wochenregel für
      // Kurse (die laufen über einzelne Kurstermine). Vorher erschienen hier
      // Zeiten, die auf der Seite Verfügbarkeit gar nicht mehr zu sehen waren.
      .innerJoin(
        staffLessonTypes,
        and(
          eq(staffLessonTypes.staffId, availabilityRules.staffId),
          eq(staffLessonTypes.lessonTypeId, availabilityRules.lessonTypeId),
        ),
      )
      .where(
        and(
          inArray(availabilityRules.staffId, visibleIds),
          eq(lessonTypes.active, true),
          lte(lessonTypes.capacity, 1),
        ),
      ),
    db
      .select({
        id: availabilityExceptions.id,
        staffId: availabilityExceptions.staffId,
        day: availabilityExceptions.day,
        startTime: availabilityExceptions.startTime,
        endTime: availabilityExceptions.endTime,
        available: availabilityExceptions.available,
        note: availabilityExceptions.note,
        lessonTypeId: availabilityExceptions.lessonTypeId,
        lessonName: lessonTypes.name,
        lessonActive: lessonTypes.active,
      })
      .from(availabilityExceptions)
      .leftJoin(lessonTypes, eq(lessonTypes.id, availabilityExceptions.lessonTypeId))
      .where(
        and(
          inArray(availabilityExceptions.staffId, visibleIds),
          gte(availabilityExceptions.day, start),
          lte(availabilityExceptions.day, end),
        ),
      ),
    db.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, visibleIds)),
    db
      .select({ staffId: staffLessonTypes.staffId, lessonTypeId: staffLessonTypes.lessonTypeId })
      .from(staffLessonTypes)
      .where(inArray(staffLessonTypes.staffId, visibleIds)),
  ]);

  const assigned = new Set(offerings.map((row) => `${row.staffId}|${row.lessonTypeId}`));
  const histories = await customerHistories(entries.filter((entry) => entry.status !== "abgesagt"));
  // Wartelisten gehören zu keinem Konto, nur wer alle sieht oder Termine
  // verwaltet, kann damit etwas anfangen.
  const waiting =
    seesEveryone || manages
      ? await waitlistsBetween(zurichToInstant(start, "00:00"), zurichToInstant(end, "23:59"))
      : [];

  const nameOf = new Map(people.map((person) => [person.id, person.name]));
  // Wer nur den eigenen Kalender sieht, muss seinen Namen nicht auf jeder Karte lesen.
  const showPerson = seesEveryone;

  return (
    <div>
      <Legend />

      {/* Ab md sieben Spalten mit Mindestbreite und bei Bedarf seitlich
          scrollbar: bei md:grid-cols-7 wurden die Spalten auf einem Tablet
          so schmal, dass Namen mitten im Wort umbrachen. */}
      <div className="mt-4 md:overflow-x-auto md:pb-2">
      <div className="grid gap-2.5 md:grid-cols-[repeat(7,minmax(9.25rem,1fr))]">
        {days.map((day) => {
          const weekday = zurichWeekday(day);
          const isToday = day === today;

          // Freie Fenster je Person und Zeit zusammenfassen: dieselbe Person
          // von 8 bis 12 für drei Angebote ist ein Block, nicht drei.
          const free = new Map<string, FreeBlock>();
          const addFree = (staffId: string, from: string, to: string, lesson: string) => {
            const key = `${staffId}|${from}|${to}`;
            const block = free.get(key) ?? { staffId, from, to, lessons: [] };
            if (!block.lessons.includes(lesson)) block.lessons.push(lesson);
            free.set(key, block);
          };
          for (const rule of rules) {
            if (rule.weekday !== weekday) continue;
            if (rule.validFrom && day < rule.validFrom) continue;
            if (rule.validUntil && day > rule.validUntil) continue;
            addFree(rule.staffId, rule.startTime.slice(0, 5), rule.endTime.slice(0, 5), rule.lessonName);
          }
          for (const entry of exceptions) {
            if (entry.day !== day || !entry.available) continue;
            // Kurstermin oder Zusatzzeit für ein bestimmtes Angebot: nur,
            // wenn die Person es anbietet und es aktiv ist.
            if (
              entry.lessonTypeId &&
              (!entry.lessonActive || !assigned.has(`${entry.staffId}|${entry.lessonTypeId}`))
            ) {
              continue;
            }
            addFree(
              entry.staffId,
              entry.startTime.slice(0, 5),
              entry.endTime.slice(0, 5),
              entry.lessonName ?? "alle Angebote",
            );
          }

          const dayEntries = entries.filter((entry) => zurichDay(entry.startsAt) === day);
          const cancelled = dayEntries
            .filter((entry) => entry.status === "abgesagt")
            .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

          const items: Item[] = [
            ...[...free.values()].map(
              (block): Item => ({ kind: "frei", start: minutesSinceMidnight(block.from), block }),
            ),
            ...exceptions
              .filter((entry) => entry.day === day && !entry.available)
              .map(
                (absence): Item => ({
                  kind: "abwesend",
                  start: minutesSinceMidnight(absence.startTime.slice(0, 5)),
                  absence,
                }),
              ),
            ...dayEntries
              .filter((entry) => entry.status !== "abgesagt")
              .map(
                (entry): Item => ({
                  kind: "termin",
                  start: minutesSinceMidnight(zurichTime(entry.startsAt)),
                  entry,
                }),
              ),
          ].sort((a, b) => a.start - b.start || order(a) - order(b));

          const dayWaiting = waiting.filter((entry) => zurichDay(entry.startsAt) === day);
          const empty = items.length === 0 && cancelled.length === 0 && dayWaiting.length === 0;

          return (
            <section
              key={day}
              aria-label={`${weekdayName(weekday)}, ${Number(day.slice(8))}.${Number(day.slice(5, 7))}.`}
              className={`rounded-[var(--radius-surface)] border p-2.5 md:min-h-56 [&_p]:hyphens-manual ${
                isToday ? "bg-paper border-signal/40" : "bg-concrete border-deep/10"
              }`}
            >
              <h2 className={`text-base font-bold flex items-baseline gap-1.5 ${isToday ? "text-signal-ink" : ""}`}>
                {isToday && <span className="w-1.5 h-1.5 rounded-full bg-signal" aria-hidden="true" />}
                {weekdayName(weekday, true)}
                <span className="nums font-normal text-slate">
                  {Number(day.slice(8))}.{Number(day.slice(5, 7))}.
                </span>
              </h2>

              {empty && <p className="text-fine text-slate/70 mt-3">Nichts eingetragen</p>}

              <ul className="mt-3 space-y-2">
                {items.map((item) => {
                  if (item.kind === "frei") {
                    const { block } = item;
                    return (
                      <li
                        key={`frei-${block.staffId}-${block.from}-${block.to}`}
                        className="cal-free rounded-[var(--radius-control)] px-2.5 py-2"
                      >
                        <p className="tabular-nums text-fine font-bold text-deep/80">
                          {block.from}–{block.to}
                        </p>
                        <p className="text-fine leading-snug mt-0.5">
                          Verfügbar für {block.lessons.map(shortLesson).join(", ")}
                        </p>
                        {showPerson && (
                          <p className="text-fine leading-snug font-semibold text-deep/80 mt-0.5">
                            {firstName(nameOf.get(block.staffId))}
                          </p>
                        )}
                      </li>
                    );
                  }

                  if (item.kind === "abwesend") {
                    const { absence } = item;
                    return (
                      <li
                        key={`abwesend-${absence.id}`}
                        className="cal-absent rounded-[var(--radius-control)] px-2.5 py-2"
                      >
                        <p className="tabular-nums text-fine font-bold">
                          {absence.startTime.slice(0, 5)}–{absence.endTime.slice(0, 5)}
                        </p>
                        <p className="text-fine leading-snug mt-0.5">
                          Abwesend{absence.note ? ` · ${absence.note}` : ""}
                        </p>
                        {showPerson && (
                          <p className="text-fine leading-snug font-semibold mt-0.5">
                            {firstName(nameOf.get(absence.staffId))}
                          </p>
                        )}
                        {mayEditAvailability && (
                          <DeleteExceptionButton id={absence.id} person={absence.staffId} />
                        )}
                      </li>
                    );
                  }

                  const { entry } = item;
                  const pending = entry.status === "angefragt";
                  const started = entry.startsAt.getTime() <= now;
                  return (
                    <li
                      key={entry.id}
                      className={`cal-booking rounded-[var(--radius-control)] pl-2.5 pr-1 py-2 ${
                        pending ? "cal-booking-pending" : ""
                      }`}
                    >
                      {/* Zeit und Menü in einer Zeile: vorher hielt das Menü
                          rechts einen breiten Streifen frei, und Namen brachen
                          in der schmalen Spalte mitten im Wort um. */}
                      <div className="flex items-start justify-between gap-1">
                        <p className="tabular-nums text-fine font-bold pt-1.5 whitespace-nowrap">
                          {zurichTime(entry.startsAt)}–{zurichTime(entry.endsAt)}
                        </p>
                        {manages && (
                          <ActionMenu label={`Termin von ${entry.customerName ?? "Kundschaft"} verwalten`}>
                            <ActionMenuItem href={`/team/kalender/verschieben?id=${entry.id}`}>
                              Verschieben
                            </ActionMenuItem>
                            {started && !pending && (
                              <form action={toggleNoShowAction}>
                                <input type="hidden" name="id" value={entry.id} />
                                <ActionMenuItem type="submit">
                                  {entry.noShowAt ? "Doch erschienen" : "Nicht erschienen"}
                                </ActionMenuItem>
                              </form>
                            )}
                            <CancelBookingButton bookingId={entry.id} />
                            {(entry.lessonCapacity ?? 1) > 1 && !started && (
                              <ActionMenuItem href={`/team/kalender/kurs-absagen?id=${entry.id}`} danger>
                                Ganzen Kurs absagen
                              </ActionMenuItem>
                            )}
                          </ActionMenu>
                        )}
                      </div>
                      {pending && (
                        <p
                          className="text-fine font-semibold text-amber-ink"
                          title="Online gebucht, der Link in der Mail ist noch nicht angeklickt. Ohne Bestätigung wird der Platz nach einer Stunde wieder frei."
                        >
                          Unbestätigt
                        </p>
                      )}
                      {entry.noShowAt && (
                        <p className="text-fine font-semibold text-danger">Nicht erschienen</p>
                      )}
                      <p className="text-[0.85rem] font-semibold leading-snug pr-1.5">
                        {entry.customerName ?? "Angaben gelöscht"}
                      </p>
                      <HistoryLine
                        history={histories.get(entry.id)}
                        course={(entry.lessonCapacity ?? 1) > 1}
                      />
                      <p className="text-fine text-slate leading-snug pr-1.5">
                        {entry.lessonName && shortLesson(entry.lessonName)}
                      </p>
                      {showPerson && entry.staffName && (
                        <p className="text-fine text-slate leading-snug pr-1.5">bei {firstName(entry.staffName)}</p>
                      )}
                      {entry.customerPhone && (
                        <a
                          href={`tel:${entry.customerPhone.replace(/\s+/g, "")}`}
                          className="tabular-nums text-fine text-signal-ink font-semibold block mt-1 break-normal pr-1.5"
                        >
                          {entry.customerPhone}
                        </a>
                      )}
                      {entry.customerNote && (
                        <p className="text-fine text-slate mt-1 pr-1.5">{entry.customerNote}</p>
                      )}
                    </li>
                  );
                })}
              </ul>

              {dayWaiting.length > 0 && (
                <details className="mt-3 pt-2 border-t border-deep/10 text-fine">
                  <summary className="cursor-pointer font-semibold">
                    Warteliste ({dayWaiting.length})
                  </summary>
                  <ul className="mt-1.5 space-y-1.5">
                    {dayWaiting.map((entry) => (
                      <li key={entry.id} className="leading-snug">
                        <span className="nums">{zurichTime(entry.startsAt)}</span> {entry.name}
                        <span className="block text-slate">
                          {shortLesson(entry.lessonName)}
                          {entry.notifiedAt ? ", über freien Platz informiert" : ""}
                        </span>
                        <a
                          href={`tel:${entry.phone.replace(/\s+/g, "")}`}
                          className="tabular-nums text-signal-ink font-semibold break-normal"
                        >
                          {entry.phone}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {cancelled.length > 0 && (
                <ul className="mt-3 pt-2 border-t border-deep/10 space-y-0.5">
                  {cancelled.map((entry) => (
                    <li
                      key={entry.id}
                      className="text-fine text-slate/80 leading-snug"
                      title={[entry.lessonName, entry.customerPhone].filter(Boolean).join(" · ")}
                    >
                      <span className="line-through">
                        <span className="nums">{zurichTime(entry.startsAt)}</span>{" "}
                        {entry.customerName ?? "Angaben gelöscht"}
                      </span>{" "}
                      <span className="whitespace-nowrap">
                        {entry.cancelledBy === "fahrschule" ? "von uns abgesagt" : "abgesagt"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/**
 * In der schmalen Tagesspalte die übliche Kurzform — "Verkehrskundeunterricht"
 * brach dort sonst über drei Zeilen um.
 */
function shortLesson(name: string): string {
  if (name === "Verkehrskundeunterricht") return "VKU";
  // Weiche Trennstellen an der Wortfuge: die Spalte trennt nur dort
  // (hyphens: manual), statt "Schnupperstun-de".
  return name
    .replace("Schnupperstunde", "Schnupper\u00ADstunde")
    .replace("Nothilfekurs", "Nothilfe\u00ADkurs")
    .replace("Fahrstunde", "Fahr\u00ADstunde");
}

/** Vorname genügt im kleinen Team und passt in die Spalte. */
function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "Unbekannt";
}

/**
 * "Erster Termin" / "4. Termin" und Warnungen wie "1× nicht erschienen" —
 * damit man beim Blick in den Kalender weiss, mit wem man es zu tun hat.
 */
function HistoryLine({
  history,
  course,
}: {
  history: CustomerHistory | undefined;
  course: boolean;
}) {
  const { label, warnings } = describeHistory(history, { course });
  if (!label && warnings.length === 0) return null;
  return (
    <>
      {label && <p className="text-fine text-slate leading-snug pr-1.5">{label}</p>}
      {warnings.map((warning) => (
        <p key={warning} className="text-fine font-semibold text-danger leading-snug pr-1.5">
          {warning}
        </p>
      ))}
    </>
  );
}

/** Bei gleicher Startzeit: erst die freie Zeit, dann Abwesenheit, dann der Termin darin. */
function order(item: Item): number {
  return item.kind === "frei" ? 0 : item.kind === "abwesend" ? 1 : 2;
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-fine text-slate" aria-label="Legende">
      <li>
        <span className="cal-swatch cal-free mr-1.5" aria-hidden="true" />
        Verfügbar – hier kann gebucht werden
      </li>
      <li>
        <span className="cal-swatch cal-booking mr-1.5" aria-hidden="true" />
        Gebuchter Termin
      </li>
      <li>
        <span className="cal-swatch cal-booking cal-booking-pending mr-1.5" aria-hidden="true" />
        Unbestätigt
      </li>
      <li>
        <span className="cal-swatch cal-absent mr-1.5" aria-hidden="true" />
        Abwesend
      </li>
      <li>
        <span className="line-through">Durchgestrichen</span> = abgesagt
      </li>
    </ul>
  );
}
