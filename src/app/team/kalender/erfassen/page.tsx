import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { findSlots, listLessonTypes } from "@/lib/booking";
import { db } from "@/lib/db";
import { staff, staffLessonTypes } from "@/lib/db/schema";
import { formatDayLong, todayInZurich } from "@/lib/time";
import { ManualBookingForm } from "@/components/manual-booking-form";

export const dynamic = "force-dynamic";

type Params = Promise<{ angebot?: string; person?: string; tag?: string; zeit?: string }>;

export default async function ErfassenPage({ searchParams }: { searchParams: Params }) {
  const user = await requirePermission("kalender.verwalten");
  const params = await searchParams;
  const seesEveryone = can(user.role, "verfuegbarkeit.alle");

  const [types, team] = await Promise.all([
    listLessonTypes(),
    seesEveryone
      ? db
          .select({ id: staff.id, name: staff.name })
          .from(staff)
          .where(eq(staff.active, true))
          .orderBy(asc(staff.name))
      : Promise.resolve([{ id: user.id, name: user.name }]),
  ]);

  const person = seesEveryone && params.person ? params.person : user.id;
  const angebot = params.angebot;
  const lessonType = angebot ? types.find((entry) => entry.slug === angebot) : undefined;

  // Nur Angebote zeigen, die diese Person tatsächlich unterrichtet — sonst
  // liesse sich hier ein Termin erfassen, für den es gar keine Verfügbarkeit
  // geben kann.
  const personOfferings = await db
    .select({ id: staffLessonTypes.lessonTypeId })
    .from(staffLessonTypes)
    .where(eq(staffLessonTypes.staffId, person));
  const offeredIds = new Set(personOfferings.map((row) => row.id));
  const offerable = types.filter((entry) => offeredIds.has(entry.id));

  let slots: Awaited<ReturnType<typeof findSlots>> = [];
  if (lessonType) {
    slots = await findSlots({
      lessonType,
      fromDay: todayInZurich(),
      days: 28,
      staffId: person,
      ignoreLeadTime: true,
    });
  }

  const chosenSlot =
    lessonType && params.tag && params.zeit
      ? slots.find((entry) => entry.day === params.tag && entry.time === params.zeit)
      : undefined;

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane max-w-2xl">
        <h1 className="text-title">Termin erfassen</h1>
        <p className="text-slate text-lead mt-4 max-w-[58ch]">
          Für Anrufe und Laufkundschaft. Der Termin entsteht genau wie eine Online-Buchung — mit
          derselben Prüfung auf freie Zeiten und ohne doppelte Vergabe.
        </p>

        <form method="get" className="mt-8 grid gap-4 sm:grid-cols-2 items-end">
          <div>
            <label className="field-label" htmlFor="angebot">
              Angebot
            </label>
            <select id="angebot" name="angebot" className="field" defaultValue={angebot ?? ""}>
              <option value="" disabled>
                Angebot wählen …
              </option>
              {offerable.map((entry) => (
                <option key={entry.id} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>

          {seesEveryone && (
            <div>
              <label className="field-label" htmlFor="person">
                Für
              </label>
              <select id="person" name="person" className="field" defaultValue={person}>
                {team.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button type="submit" className="btn btn-outline sm:col-span-2 justify-self-start">
            Freie Termine zeigen
          </button>
        </form>

        {lessonType && !chosenSlot && (
          <div className="mt-10">
            <h2 className="text-section mb-4">
              Freie Termine — {lessonType.name}
              {seesEveryone ? ` (${team.find((entry) => entry.id === person)?.name ?? ""})` : ""}
            </h2>

            {offerable.length === 0 ? (
              <p className="text-slate max-w-[52ch]">
                Diese Person unterrichtet noch kein Angebot. Erst unter „Mitarbeitende“ zuordnen.
              </p>
            ) : slots.length === 0 ? (
              <p className="text-slate max-w-[52ch]">
                Für die nächsten vier Wochen ist nichts frei. Prüfe die Verfügbarkeit oder wähle
                ein anderes Angebot.
              </p>
            ) : (
              <SlotPicker slots={slots} angebot={lessonType.slug} person={person} />
            )}
          </div>
        )}

        {lessonType && chosenSlot && (
          <div className="mt-10">
            <div className="bg-paper border border-deep/15 p-5 mb-8">
              <p className="font-bold text-lg">{lessonType.name}</p>
              <p className="nums text-slate">
                {formatDayLong(chosenSlot.day)}, {chosenSlot.time} Uhr ·{" "}
                {lessonType.durationMinutes} Minuten
              </p>
              <Link
                href={`/team/kalender/erfassen?angebot=${lessonType.slug}&person=${person}`}
                className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-3"
              >
                Anderen Termin wählen
              </Link>
            </div>

            <ManualBookingForm
              angebot={lessonType.slug}
              person={person}
              day={chosenSlot.day}
              time={chosenSlot.time}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function SlotPicker({
  slots,
  angebot,
  person,
}: {
  slots: Awaited<ReturnType<typeof findSlots>>;
  angebot: string;
  person: string;
}) {
  const byDay = new Map<string, typeof slots>();
  for (const slot of slots) {
    const list = byDay.get(slot.day) ?? [];
    list.push(slot);
    byDay.set(slot.day, list);
  }

  return (
    <div className="border-t border-deep/15">
      {[...byDay.entries()].map(([day, entries]) => (
        <div key={day} className="border-b border-deep/15 py-4 grid gap-3 sm:grid-cols-[13rem_1fr]">
          <h3 className="text-base font-bold pt-1.5">{formatDayLong(day)}</h3>
          <ul className="flex flex-wrap gap-2">
            {entries.map((slot) => (
              <li key={slot.time}>
                <Link
                  href={`/team/kalender/erfassen?angebot=${angebot}&person=${person}&tag=${slot.day}&zeit=${slot.time}`}
                  className="nums block bg-paper border border-deep/20 px-3.5 py-2 font-bold hover:bg-signal hover:text-deep hover:border-signal transition-colors"
                >
                  {slot.time}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
