import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { site } from "@/lib/site";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Über uns",
  description: `Die Fahrschule ${site.name} in ${site.contact.city} — wer unterrichtet, wie wir arbeiten und wo wir fahren.`,
  alternates: { canonical: "/ueber-uns" },
};

export default function UeberUnsPage() {
  return (
    <>
      <PageHeader
        title="Wer dir das Fahren beibringt"
        lead={`Eine kleine Fahrschule in ${site.contact.city}. Klein genug, dass du immer bei derselben Person fährst — und dass wir uns an dich erinnern, wenn du anrufst.`}
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_0.85fr] lg:items-start">
          <div className="prose-column space-y-4 text-slate">
            <p>
              Wir unterrichten seit über zehn Jahren im Grossraum {site.contact.city}. In dieser
              Zeit hat sich vor allem eines bestätigt: Wer bei wechselnden Fahrlehrern sitzt,
              braucht mehr Lektionen. Deshalb bleibst du bei uns bei derselben Person — von der
              ersten Stunde bis zur Prüfungsanmeldung.
            </p>
            <p>
              Wir sagen dir ehrlich, wann du bereit bist. Eine Anmeldung zur Prüfung, die
              absehbar scheitert, kostet dich Geld und Nerven und uns den Ruf. Umgekehrt melden
              wir dich an, sobald es reicht, und nicht erst nach einer Wunschzahl an Lektionen.
            </p>
            <p>
              Unterrichtet wird in {site.languages.join(", ")}. Wir fahren in{" "}
              {site.region.join(", ")} und Umgebung.
            </p>
          </div>

          <Image
            src={site.images.team.src}
            alt={site.images.team.alt}
            width={site.images.team.width}
            height={site.images.team.height}
            className="w-full h-auto"
            sizes="(min-width: 1024px) 40vw, 100vw"
            priority
          />
        </div>
      </Section>

      <Section title="Das Team" tone="paper">
        <div className="border-t border-deep/15 max-w-3xl">
          {site.team.map((person, index) => (
            <div key={`${person.name}-${index}`} className="border-b border-deep/15 py-6">
              <h3 className="text-lg">{person.name}</h3>
              <p className="text-fine text-signal font-semibold mt-0.5">{person.role}</p>
              <p className="text-slate mt-2 max-w-[58ch]">{person.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Wo wir fahren">
        <div className="max-w-2xl">
          <ul className="flex flex-wrap gap-2">
            {site.region.map((place) => (
              <li key={place} className="bg-paper border border-deep/15 px-3.5 py-2 font-semibold">
                {place}
              </li>
            ))}
          </ul>
          <p className="text-slate mt-6">
            Wohnst du knapp ausserhalb? Frag trotzdem — meistens lässt es sich einrichten.
          </p>
          <Link href="/kontakt" className="btn btn-outline mt-7">
            Frage stellen
          </Link>
        </div>
      </Section>
    </>
  );
}
