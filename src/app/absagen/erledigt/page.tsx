import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termin abgesagt",
  robots: { index: false, follow: false },
};

export default function AbsageErledigtPage() {
  return (
    <section className="shell pt-24 pb-14 md:pt-32 md:pb-20">
      <div className="lane">
        <span className="block w-10 h-[3px] rounded-full bg-signal mb-5" aria-hidden="true" />
        <h1 className="text-title max-w-[16ch]">Termin ist abgesagt.</h1>
        <p className="text-lead text-slate mt-6 max-w-[52ch]">
          Der Platz ist wieder frei und steht anderen zur Verfügung. Wenn du magst, such dir
          gleich einen neuen Termin.
        </p>
        <div className="flex flex-wrap gap-3 mt-8">
          <Link href="/buchen" className="btn btn-primary">
            Neuen Termin buchen
          </Link>
          <a href={`tel:${site.contact.phoneHref}`} className="btn btn-outline">
            {site.contact.phone}
          </a>
        </div>
      </div>
    </section>
  );
}
