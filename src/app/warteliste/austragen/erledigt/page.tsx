import type { Metadata } from "next";
import Link from "next/link";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Von der Warteliste gestrichen",
  robots: { index: false, follow: false },
};

export default function WartelisteErledigtPage() {
  return (
    <section className="shell pt-24 pb-14 md:pt-32 md:pb-20">
      <div className="lane">
        <span
          className="block w-10 h-[3px] rounded-full bg-signal mb-5"
          aria-hidden="true"
        />
        <h1 className="text-title max-w-[18ch]">
          Du stehst nicht mehr auf der Liste.
        </h1>
        <p className="text-lead text-slate mt-6 max-w-[52ch]">
          Deine Angaben sind gelöscht, du bekommst keine weiteren Mails zu
          diesem Termin.
        </p>
        <Link href="/buchen" className="btn btn-primary mt-8">
          Andere Termine ansehen
        </Link>
      </div>
    </section>
  );
}
