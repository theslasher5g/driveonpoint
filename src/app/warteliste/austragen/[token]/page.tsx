import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lessonTypes, waitlistEntries } from "@/lib/db/schema";
import { formatDayLong, zurichDay, zurichTime } from "@/lib/time";
import { leaveWaitlistAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Von der Warteliste streichen",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

// Ein Knopf statt Löschen beim Aufruf: Mailprogramme öffnen Links zur
// Vorschau, und das soll niemanden von der Liste werfen.
export default async function WartelisteAustragenPage({
  params,
}: {
  params: Params;
}) {
  const { token } = await params;

  const [entry] = await db
    .select({
      startsAt: waitlistEntries.startsAt,
      lessonName: lessonTypes.name,
    })
    .from(waitlistEntries)
    .innerJoin(lessonTypes, eq(lessonTypes.id, waitlistEntries.lessonTypeId))
    .where(eq(waitlistEntries.token, token))
    .limit(1);

  if (!entry) {
    return (
      <Shell title="Du stehst nicht mehr auf der Liste">
        <p className="text-slate max-w-[54ch]">
          Entweder hast du dich schon ausgetragen, der Kurs hat bereits
          stattgefunden, oder der Link stimmt nicht mehr. Du musst nichts weiter
          tun.
        </p>
        <Link href="/buchen" className="btn btn-primary mt-7">
          Termine ansehen
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="Von der Warteliste streichen?">
      <div className="surface bg-paper p-5 md:p-6 max-w-xl">
        <p className="font-bold text-lg">{entry.lessonName}</p>
        <p className="nums text-slate mt-1">
          {formatDayLong(zurichDay(entry.startsAt))},{" "}
          {zurichTime(entry.startsAt)} Uhr
        </p>
      </div>
      <p className="text-slate mt-6 max-w-[54ch]">
        Du bekommst dann keine Mail mehr, wenn für diesen Termin ein Platz frei
        wird. Deine Angaben werden gelöscht.
      </p>

      <form action={leaveWaitlistAction} className="mt-7 flex flex-wrap gap-3">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-primary">
          Ja, streichen
        </button>
        <Link href="/" className="btn btn-outline">
          Nein, drauf bleiben
        </Link>
      </form>
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="shell pt-24 pb-14 md:pt-32 md:pb-20">
      <div className="lane">
        <span
          className="block w-10 h-[3px] rounded-full bg-signal mb-5"
          aria-hidden="true"
        />
        <h1 className="text-title max-w-[18ch]">{title}</h1>
        <div className="mt-7">{children}</div>
      </div>
    </section>
  );
}
