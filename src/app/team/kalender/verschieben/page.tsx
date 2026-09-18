import Link from "next/link";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { findSlots } from "@/lib/booking";
import { db } from "@/lib/db";
import { bookings, lessonTypes, staff } from "@/lib/db/schema";
import { formatDayLong, todayInZurich, zurichDay, zurichTime } from "@/lib/time";
import { RescheduleConfirmForm } from "@/components/reschedule-confirm-form";

export const dynamic = "force-dynamic";

type Params = Promise<{ id?: string; tag?: string; zeit?: string }>;

export default async function VerschiebenPage({ searchParams }: { searchParams: Params }) {
  await requirePermission("kalender.verwalten");
  const params = await searchParams;
  const id = params.id ?? "";

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return (
      <section className="shell py-10 md:py-14">
        <div className="lane max-w-2xl">
          <p className="notice notice-error">Kein Termin angegeben.</p>
        </div>
      </section>
    );
  }

  const [entry] = await db
    .select({
      staffId: bookings.staffId,
      lessonTypeId: bookings.lessonTypeId,
      status: bookings.status,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      customerName: bookings.customerName,
      reference: bookings.reference,
      staffName: staff.name,
    })
    .from(bookings)
    .leftJoin(staff, eq(staff.id, bookings.staffId))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!entry || entry.status === "abgesagt" || !entry.staffId || !entry.lessonTypeId) {
    return (
      <section className="shell py-10 md:py-14">
        <div className="lane max-w-2xl">
          <p className="notice notice-error">Dieser Termin lässt sich nicht verschieben.</p>
        </div>
      </section>
    );
  }

  const [lessonType] = await db
    .select()
    .from(lessonTypes)
    .where(eq(lessonTypes.id, entry.lessonTypeId))
    .limit(1);

  if (!lessonType) {
    return (
      <section className="shell py-10 md:py-14">
        <div className="lane max-w-2xl">
          <p className="notice notice-error">Das Angebot zu diesem Termin gibt es nicht mehr.</p>
        </div>
      </section>
    );
  }

  const slots = await findSlots({
    lessonType,
    fromDay: todayInZurich(),
    days: 28,
    staffId: entry.staffId,
    excludeBookingId: id,
  });

  const chosenSlot =
    params.tag && params.zeit
      ? slots.find((s) => s.day === params.tag && s.time === params.zeit)
      : undefined;

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane max-w-2xl">
        <h1 className="text-title">Termin verschieben</h1>

        <div className="bg-paper border border-deep/15 p-5 mt-6">
          <p className="font-bold text-lg">
            {entry.customerName ?? "Angaben gelöscht"} — {lessonType.name}
          </p>
          <p className="nums text-slate">
            Bisher: {formatDayLong(zurichDay(entry.startsAt))}, {zurichTime(entry.startsAt)}–
            {zurichTime(entry.endsAt)} Uhr
            {entry.staffName ? ` · ${entry.staffName}` : ""}
          </p>
          <p className="text-fine text-slate mt-1">Referenz {entry.reference}</p>
        </div>

        {!chosenSlot ? (
          <div className="mt-10">
            <h2 className="text-section mb-4">Neue Zeit wählen</h2>
            {slots.length === 0 ? (
              <p className="text-slate max-w-[52ch]">
                Für die nächsten vier Wochen ist sonst nichts frei.
              </p>
            ) : (
              <SlotPicker slots={slots} id={id} />
            )}
          </div>
        ) : (
          <div className="mt-10">
            <p className="text-slate max-w-[52ch] mb-5">
              Neu: <strong className="text-deep">{formatDayLong(chosenSlot.day)}, {chosenSlot.time} Uhr</strong>.
              Die Kundschaft wird per Mail informiert, falls eine Adresse hinterlegt ist.
            </p>
            <RescheduleConfirmForm id={id} day={chosenSlot.day} time={chosenSlot.time} />
            <Link
              href={`/team/kalender/verschieben?id=${id}`}
              className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-4"
            >
              Andere Zeit wählen
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function SlotPicker({ slots, id }: { slots: Awaited<ReturnType<typeof findSlots>>; id: string }) {
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
                  href={`/team/kalender/verschieben?id=${id}&tag=${slot.day}&zeit=${slot.time}`}
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
