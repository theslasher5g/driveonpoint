import type { Metadata } from "next";
import Link from "next/link";
import { BookingForm } from "@/components/booking-form";
import { FahrstundeSlotSelector } from "@/components/fahrstunde-slot-selector";
import { MultiBookingForm } from "@/components/multi-booking-form";
import { PageHeader } from "@/components/page-header";
import {
  activePromotions,
  applyPromotions,
  findSlots,
  horizonDays,
  lessonTypeBySlug,
  listLessonTypes,
  type Slot,
} from "@/lib/booking";
import { COURSE_SESSIONS_SHOWN } from "@/lib/course-horizon";
import type { LessonType } from "@/lib/db/schema";
import { withSoftHyphens } from "@/lib/hyphenate";
import { site } from "@/lib/site";
import { formatDayLong, formatDayShort, formatPrice, todayInZurich, zurichTime } from "@/lib/time";
import { fullCourseSessions, type FullSession } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termin buchen",
  description:
    "Freie Termine für Fahrstunden, Verkehrskundeunterricht und Nothilfekurs direkt online auswählen.",
  alternates: { canonical: "/buchen" },
  robots: { index: true, follow: true },
};

type Params = Promise<{
  angebot?: string;
  tag?: string;
  zeit?: string;
  termin?: string | string[];
}>;

export default async function BuchenPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;

  if (!params.angebot) return <ChooseOffer />;

  const lessonType = await lessonTypeBySlug(params.angebot);
  if (!lessonType || !lessonType.active) return <ChooseOffer unknown={params.angebot} />;

  const promotions = await activePromotions();
  const priced = applyPromotions(lessonType, promotions);
  // Fahrstunden 4 Wochen voraus, Kurse ein Jahr — von denen zeigt die Liste
  // die nächsten paar (SlotList).
  const slots = await findSlots({
    lessonType,
    fromDay: todayInZurich(),
    days: horizonDays(lessonType),
    // Kurse: die Liste zeigt ohnehin nur die nächsten paar. Ein gewählter
    // späterer Termin (tag/zeit) wird beim Buchen selbst noch einmal geprüft.
    enough: lessonType.capacity > 1 && !params.tag ? COURSE_SESSIONS_SHOWN : undefined,
  });
  // Volle Kurstermine bleiben sichtbar, mit dem Weg auf die Warteliste.
  const full = lessonType.capacity > 1 ? await fullCourseSessions(lessonType) : [];

  // Mehrere Fahrstunden auf einmal: eine eigene Auswahl statt eines
  // einzelnen Termins, siehe FahrstundeSlotSelector. Nur für Fahrstunden —
  // bei Kursen bucht man ohnehin nur einen Kursstart, bei der Schnupperstunde
  // ist "mehrere auf einmal" dem Zweck der ersten Kennenlern-Lektion fremd.
  const allowsMulti = lessonType.slug === "fahrstunde";

  if (allowsMulti && params.termin) {
    const termine = Array.isArray(params.termin) ? params.termin : [params.termin];
    const chosen = [...new Set(termine)]
      .map((value) => {
        const [day, time] = value.split("T");
        return slots.find((slot) => slot.day === day && slot.time === time);
      })
      .filter((slot): slot is Slot => slot !== undefined);

    if (chosen.length > 0) {
      const sorted = [...chosen].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
      const totalRappen = priced.finalRappen * sorted.length;

      return (
        <>
          <PageHeader
            title="Deine Angaben"
            lead={`${sorted.length} ${sorted.length === 1 ? "Fahrstunde" : "Fahrstunden"}. Jetzt noch deine Angaben.`}
          />
          <section className="shell band">
            <div className="lane max-w-2xl">
              <div className="surface bg-paper p-5 md:p-6 mb-6">
                <ul className="divide-y divide-deep/12">
                  {sorted.map((slot) => (
                    <li
                      key={`${slot.day}T${slot.time}`}
                      className="py-2.5 first:pt-0 last:pb-0 flex items-baseline justify-between gap-4"
                    >
                      <p className="nums font-bold">
                        {formatDayLong(slot.day)}, {slot.time} Uhr
                      </p>
                      <p className="nums text-slate text-fine shrink-0">
                        {lessonType.durationMinutes} Minuten
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="flex items-baseline justify-between gap-4 mt-4 pt-4 border-t border-deep/12">
                  <p className="font-bold">Gesamtpreis</p>
                  <p className="nums font-display text-2xl font-bold text-signal-ink">
                    CHF {formatPrice(totalRappen)}
                  </p>
                </div>
                {priced.promotion && <p className="promo-tag mt-3">{priced.promotion.label}</p>}
                <Link
                  href={`/buchen?angebot=${lessonType.slug}`}
                  className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-4"
                >
                  Andere Termine wählen
                </Link>
              </div>

              <div className="surface bg-paper p-5 md:p-6">
                <MultiBookingForm
                  slug={lessonType.slug}
                  termine={sorted.map((slot) => `${slot.day}T${slot.time}`)}
                />
              </div>
            </div>
          </section>
        </>
      );
    }
  }

  // Dritter Schritt (alle anderen Angebote): Termin steht, jetzt die Angaben.
  if (params.tag && params.zeit) {
    const chosen = slots.find((slot) => slot.day === params.tag && slot.time === params.zeit);

    if (chosen) {
      const isCourse = lessonType.capacity > 1;
      // Kurse: mit Zeitspanne und, falls es einen gibt, dem 2. Kurstag.
      const firstDay = isCourse
        ? `${formatDayLong(chosen.day)}, ${chosen.time}–${zurichTime(chosen.endsAt)} Uhr`
        : `${formatDayLong(chosen.day)}, ${chosen.time} Uhr`;
      const secondDay = chosen.second
        ? `${formatDayLong(chosen.second.day)}, ${chosen.second.time}–${chosen.second.endTime} Uhr`
        : null;
      return (
        <>
          <PageHeader
            title="Deine Angaben"
            lead={
              secondDay
                ? `${lessonType.name} an zwei Tagen: ${firstDay} und ${secondDay}. Jetzt noch deine Angaben.`
                : `${lessonType.name} am ${formatDayLong(chosen.day)} um ${chosen.time} Uhr. Jetzt noch deine Angaben.`
            }
          />
          <section className="shell band">
            <div className="lane max-w-2xl">
              <div className="surface bg-paper p-5 md:p-6 mb-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <div>
                    <p className="font-bold text-lg">{lessonType.name}</p>
                    {secondDay ? (
                      <ul className="nums text-slate">
                        <li>{firstDay} (1. Kurstag)</li>
                        <li>{secondDay} (2. Kurstag)</li>
                      </ul>
                    ) : isCourse ? (
                      <p className="nums text-slate">{firstDay}</p>
                    ) : (
                      <p className="nums text-slate">
                        {firstDay} · {lessonType.durationMinutes} Minuten
                      </p>
                    )}
                  </div>
                  <p className="nums font-display text-2xl font-bold text-signal-ink">
                    CHF {formatPrice(priced.finalRappen)}
                  </p>
                </div>
                {priced.promotion && <p className="promo-tag mt-3">{priced.promotion.label}</p>}
                <Link
                  href={`/buchen?angebot=${lessonType.slug}`}
                  className="inline-block text-fine font-bold text-signal-ink underline underline-offset-4 mt-4"
                >
                  Anderen Termin wählen
                </Link>
              </div>

              <div className="surface bg-paper p-5 md:p-6">
                <BookingForm
                  slug={lessonType.slug}
                  day={chosen.day}
                  time={chosen.time}
                  pickup={lessonType.capacity <= 1}
                />
              </div>
            </div>
          </section>
        </>
      );
    }
  }

  // Zweiter Schritt: freie Termine zur Auswahl.
  return (
    <>
      <PageHeader
        title={lessonType.name}
        lead={
          slots.length > 0 || full.length > 0
            ? allowsMulti
              ? "Wähle einen oder mehrere Termine, hintereinander am selben Tag oder verteilt auf mehrere Tage. Alle Zeiten hier sind wirklich frei."
              : full.length > 0
                ? "Wähle einen Kurstermin. Ist einer ausgebucht, kannst du dich auf die Warteliste setzen und bekommst eine Mail, sobald ein Platz frei wird."
                : `Wähle einen Termin. Alle Zeiten hier sind wirklich frei, sie kommen direkt aus unserem Kalender.`
            : lessonType.capacity > 1
              ? "Online ist gerade kein Kurstermin frei."
              : "Für die nächsten vier Wochen ist online nichts frei."
        }
      />
      <section className="shell band">
        <div className="lane">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-9">
            <p className="nums font-display text-3xl font-bold text-signal-ink">
              CHF {formatPrice(priced.finalRappen)}
            </p>
            {priced.promotion && <p className="promo-tag">{priced.promotion.label}</p>}
            <Link href="/buchen" className="btn btn-outline py-2.5 px-4 text-fine ml-auto">
              Anderes Angebot
            </Link>
          </div>

          {slots.length === 0 && full.length === 0 ? (
            <div className="surface bg-paper p-6 md:p-7 max-w-xl">
              <p className="font-display text-xl font-bold">Ruf uns an</p>
              <p className="text-slate mt-2">
                Online ist gerade nichts frei, aber oft finden wir trotzdem einen Termin. Ruf
                uns an oder schreib uns kurz.
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <a href={`tel:${site.contact.phoneHref}`} className="btn btn-primary">
                  {site.contact.phone}
                </a>
                <Link href="/kontakt" className="btn btn-outline">
                  Schreib uns
                </Link>
              </div>
            </div>
          ) : allowsMulti ? (
            <FahrstundeSlotSelector slots={slots} slug={lessonType.slug} />
          ) : (
            <SlotList
              slots={slots}
              full={full}
              slug={lessonType.slug}
              isCourse={lessonType.capacity > 1}
            />
          )}
        </div>
      </section>
    </>
  );
}

type ListEntry = {
  day: string;
  time: string;
  /** Kurse: Ende des (1.) Kurstags. */
  endTime: string | null;
  second: { day: string; startTime: string; endTime: string } | null;
  seatsLeft: number | null;
};

/** "und Mi, 30. Sep., 18:00–21:00" — der 2. Kurstag unter der Uhrzeit. */
function SecondDay({ second }: { second: ListEntry["second"] }) {
  if (!second) return null;
  return (
    <span className="block text-fine font-semibold">
      und {formatDayShort(second.day)}, {second.startTime}–{second.endTime}
    </span>
  );
}

function SlotList({
  slots,
  full,
  slug,
  isCourse,
}: {
  slots: Slot[];
  full: FullSession[];
  slug: string;
  isCourse: boolean;
}) {
  if (slots.length === 0 && full.length === 0) {
    return (
      <p className="text-slate max-w-[52ch]">
        Sobald neue Zeiten eingetragen sind, erscheinen sie hier automatisch.
      </p>
    );
  }

  // Ausgebuchte Kurstermine (seatsLeft null) stehen zwischen den freien,
  // in zeitlicher Reihenfolge.
  const all: ListEntry[] = [
    ...slots.map((slot) => ({
      day: slot.day,
      time: slot.time,
      endTime: isCourse ? zurichTime(slot.endsAt) : null,
      second: slot.second ? { day: slot.second.day, startTime: slot.second.time, endTime: slot.second.endTime } : null,
      seatsLeft: slot.seatsLeft,
    })),
    ...full.map((session) => ({
      day: session.day,
      time: session.time,
      endTime: session.endTime,
      second: session.second,
      seatsLeft: null,
    })),
  ].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  // Kurse: nur die nächsten paar, sonst stünde eine wöchentliche Serie mit
  // einem ganzen Jahr Terminen da. Spätere rücken nach.
  const listed = isCourse ? all.slice(0, COURSE_SESSIONS_SHOWN) : all;
  // Die Liste rechnet bei Kursen nur bis zu den nächsten paar Terminen
  // (enough); ist sie voll, folgen wahrscheinlich weitere.
  const later = isCourse && listed.length >= COURSE_SESSIONS_SHOWN;

  const byDay = new Map<string, ListEntry[]>();
  for (const entry of listed) {
    const list = byDay.get(entry.day) ?? [];
    list.push(entry);
    byDay.set(entry.day, list);
  }

  return (
    <div className="space-y-3">
      {[...byDay.entries()].map(([day, entries]) => (
        <div
          key={day}
          className="surface bg-paper p-5 grid gap-3 sm:grid-cols-[15rem_1fr] sm:items-center"
        >
          <h2 className="text-base font-bold hyphens-none">{formatDayLong(day)}</h2>
          <ul className="flex flex-wrap gap-2">
            {entries.map((slot) =>
              slot.seatsLeft === null ? (
                <li key={slot.time}>
                  <Link
                    href={`/buchen/warteliste?angebot=${slug}&tag=${slot.day}&zeit=${slot.time}`}
                    className="nums block rounded-[var(--radius-control)] border border-dashed border-deep/25 px-4 py-2.5 font-bold text-slate hover:border-deep hover:text-deep transition-colors"
                  >
                    {slot.time}
                    {slot.endTime && `–${slot.endTime}`}
                    <SecondDay second={slot.second} />
                    <span className="block text-fine font-normal">Ausgebucht, Warteliste</span>
                  </Link>
                </li>
              ) : (
              <li key={slot.time}>
                <Link
                  href={`/buchen?angebot=${slug}&tag=${slot.day}&zeit=${slot.time}`}
                  className="nums block rounded-[var(--radius-control)] bg-concrete px-4 py-2.5 font-bold hover:bg-signal hover:text-deep transition-colors"
                >
                  {slot.time}
                  {slot.endTime && `–${slot.endTime}`}
                  <SecondDay second={slot.second} />
                  {isCourse && (
                    <span className="block text-fine font-normal opacity-75">
                      {slot.seatsLeft} {slot.seatsLeft === 1 ? "Platz" : "Plätze"}
                    </span>
                  )}
                </Link>
              </li>
              ),
            )}
          </ul>
        </div>
      ))}
      {later && (
        <p className="text-fine text-slate pt-2">
          Das sind die nächsten {listed.length} Kurstermine. Spätere erscheinen hier, sobald
          diese vorbei sind.
        </p>
      )}
    </div>
  );
}

type OfferRow = {
  lessonType: LessonType;
  priced: ReturnType<typeof applyPromotions>;
  next: Slot | undefined;
  /** Kurs: nichts frei, aber ein voller Termin mit Warteliste. */
  waitlist: boolean;
};

/**
 * Erster Schritt: Angebot wählen.
 *
 * Nach Buchungsart gruppiert statt vier gleicher Karten: Kurse haben feste
 * Daten und laufen in der Gruppe, Fahrstunden sind einzeln und frei wählbar.
 * Das ergibt zwei Paare statt einer Dreierreihe mit einer verwaisten vierten
 * Karte, und jede Gruppe sagt in einem Satz, wie das Buchen dort läuft.
 * Jede Zeile zeigt gleich den nächsten freien Termin — die Seite hält damit
 * schon hier, was die Einleitung verspricht.
 */
async function ChooseOffer({ unknown }: { unknown?: string } = {}) {
  const [types, promotions] = await Promise.all([listLessonTypes(), activePromotions()]);

  const rows: OfferRow[] = await Promise.all(
    types.map(async (lessonType) => {
      let next: Slot | undefined;
      let waitlist = false;
      try {
        next = (await findSlots({ lessonType, days: horizonDays(lessonType), enough: 1 }))[0];
        if (!next && lessonType.capacity > 1) {
          waitlist = (await fullCourseSessions(lessonType)).length > 0;
        }
      } catch (error) {
        // Ohne Termin-Vorschau bleibt die Auswahl trotzdem benutzbar.
        console.error("Nächster Termin konnte nicht geladen werden:", error);
      }
      return { lessonType, priced: applyPromotions(lessonType, promotions), next, waitlist };
    }),
  );

  const courses = rows.filter((row) => row.lessonType.capacity > 1);
  const lessons = rows.filter((row) => row.lessonType.capacity <= 1);

  return (
    <>
      <PageHeader
        title="Was möchtest du buchen?"
        lead="Bei jedem Angebot steht schon der nächste freie Termin. Ein Klick, und du siehst alle."
      />
      <section className="shell band">
        <div className="lane">
          {unknown && (
            <p className="notice notice-warn mb-8 max-w-[56ch]">
              Das Angebot „{unknown}“ gibt es nicht mehr. Hier sind die aktuellen.
            </p>
          )}

          {rows.length === 0 ? (
            <p className="text-slate">Es sind gerade keine Angebote hinterlegt.</p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
              {courses.length > 0 && (
                <OfferGroup
                  title="Kurse"
                  lead="Feste Daten, in der Gruppe. Beide sind Pflicht für den Ausweis."
                  rows={courses}
                />
              )}
              {lessons.length > 0 && (
                <OfferGroup
                  title="Fahrstunden"
                  lead="Einzeln im Schulfahrzeug, zu der Zeit, die dir passt."
                  rows={lessons}
                />
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function OfferGroup({ title, lead, rows }: { title: string; lead: string; rows: OfferRow[] }) {
  return (
    <section className="surface bg-paper overflow-hidden">
      <div className="p-5 md:p-6 pb-4 md:pb-5">
        <h2 className="font-display text-2xl md:text-3xl font-bold leading-tight">{title}</h2>
        <p className="text-slate text-fine mt-1.5 max-w-[48ch]">{lead}</p>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.lessonType.id} className="border-t border-deep/10">
            <OfferLine row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OfferLine({ row }: { row: OfferRow }) {
  const { lessonType, priced, next, waitlist } = row;
  const isCourse = lessonType.capacity > 1;

  return (
    <Link
      href={`/buchen?angebot=${lessonType.slug}`}
      className="group grid grid-cols-[1fr_auto] gap-x-5 p-5 md:p-6 hover:bg-signal-tint/50 focus-visible:bg-signal-tint/50 transition-colors"
    >
      {/* Auf dem Handy steht der Preis unter dem Namen: daneben blieb für
          "Verkehrskundeunterricht" zu wenig Platz, das Wort brach mitten
          drin ohne Trennstrich um. */}
      <div className="min-w-0 col-span-2 sm:col-span-1">
        <h3 className="font-display text-xl md:text-[1.4rem] font-bold leading-tight">
          {withSoftHyphens(lessonType.name)}
        </h3>
        <p className="text-slate text-fine mt-1">
          {lessonType.shortDescription || `${lessonType.durationMinutes} Minuten pro Termin`}
        </p>
      </div>
      <div className="col-span-2 mt-2 sm:col-span-1 sm:mt-0 sm:text-right">
        <p className="nums font-display text-lg font-bold whitespace-nowrap">
          CHF {formatPrice(priced.finalRappen)}
        </p>
        {priced.promotion && <p className="promo-tag mt-1.5">{priced.promotion.label}</p>}
      </div>

      {/* Der nächste Termin ist die eigentliche Auskunft der Seite: der
          Punkt zeigt auf einen Blick, ob online etwas frei ist. */}
      <p className="text-fine mt-4 flex items-center gap-2 min-w-0 self-center">
        <span
          aria-hidden="true"
          className={`w-2 h-2 rounded-full shrink-0 ${next ? "bg-success" : "bg-deep/25"}`}
        />
        {next ? (
          <span>
            {isCourse ? "Nächster Kurs" : "Nächster freier Termin"}:{" "}
            <strong className="text-deep">
              {formatDayShort(next.day)}, {next.time} Uhr
            </strong>
            {isCourse && (
              <span className="text-slate">
                , noch {next.seatsLeft} {next.seatsLeft === 1 ? "Platz" : "Plätze"}
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate">
            {waitlist ? "Nächster Kurs ausgebucht, Warteliste offen" : "Online gerade nichts frei"}
          </span>
        )}
      </p>
      <span
        aria-hidden="true"
        className="mt-4 self-center justify-self-end grid place-items-center w-10 h-10 rounded-full border border-deep/15 text-deep group-hover:bg-signal group-hover:border-signal transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <path
            d="M4 9h10M9 4l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  );
}
