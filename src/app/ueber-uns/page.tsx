import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHeader, Section } from "@/components/page-header";
import { site, type TeamMember } from "@/lib/site";

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
        <div className="grid gap-6 md:grid-cols-2 max-w-5xl">
          {site.team.map((person) => (
            <TeamCard key={person.name} person={person} />
          ))}
        </div>
      </Section>

      <Section title={site.philosophy.title} tone="paper">
        <div className="grid gap-12 lg:grid-cols-[1fr_0.85fr] lg:items-start">
          <div className="prose-column space-y-4 text-slate">
            <p>{site.philosophy.body}</p>
            <p>
              In der Praxis heisst das: Wir sagen dir ehrlich, wann du bereit bist. Eine
              Anmeldung zur Prüfung, die absehbar scheitert, kostet dich Geld und Nerven. Und
              umgekehrt melden wir dich an, sobald es reicht — nicht erst nach einer Wunschzahl
              an Lektionen.
            </p>
            <p>
              Unterrichtet wird in {site.languages.join(" und ")}. Wir fahren in{" "}
              {site.region.join(", ")} und Umgebung.
            </p>
          </div>

          <Image
            src={site.images.team.src}
            alt={site.images.team.alt}
            width={site.images.team.width}
            height={site.images.team.height}
            className="w-full h-auto surface"
            sizes="(min-width: 1024px) 40vw, 100vw"
          />
        </div>
      </Section>

      <Section title="Wo wir fahren">
        <div className="max-w-2xl">
          <ul className="flex flex-wrap gap-2">
            {site.region.map((place) => (
              <li key={place} className="chip chip-quiet">
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

function TeamCard({ person }: { person: TeamMember }) {
  return (
    <article
      className={`surface bg-paper flex flex-col ${
        person.owner ? "ring-2 ring-signal" : "ring-1 ring-deep/10"
      }`}
    >
      <div className={`relative aspect-[4/3] ${person.photo ? "bg-deep" : "bg-concrete"}`}>
        {person.photo ? (
          <Image
            src={person.photo}
            alt={`Porträt von ${person.name}`}
            fill
            className="object-cover"
            sizes="(min-width: 768px) 45vw, 100vw"
          />
        ) : (
          /* Bis ein Porträt da ist: ein leerer Bildplatz wie im Fotoalbum,
             mit Ecken und Initiale. Ein schwarzer Kasten sagt nichts aus und
             passt hier auch farblich nicht mehr. */
          <span className="absolute inset-4 border border-rule" aria-hidden="true">
            <span className="absolute inset-0 grid place-items-center stretch-wide font-extrabold text-deep/12 text-[7rem] leading-none select-none">
              {person.name.charAt(0)}
            </span>
          </span>
        )}

        {person.owner && <span className="chip absolute top-4 left-4 z-10">Inhaberin</span>}

        {/* Name auf dem Bild. Auf einem echten Foto braucht es den Verlauf,
            damit die Schrift auch über hellen Stellen lesbar bleibt; auf dem
            leeren Platz steht sie einfach in Tinte auf Papier. */}
        <div
          className={`absolute inset-x-0 bottom-0 p-5 ${
            person.photo ? "bg-gradient-to-t from-black/85 via-black/45 to-transparent" : ""
          }`}
        >
          <h2
            className={`text-section stretch-wide leading-none ${
              person.photo ? "text-paper" : "text-deep"
            }`}
          >
            {person.name}
          </h2>
          <p className={`text-fine mt-1.5 ${person.photo ? "text-paper/85" : "text-slate"}`}>
            {person.role}
          </p>
        </div>
      </div>

      <div className="p-6 flex flex-col flex-1">
        <p className="text-slate flex-1">{person.body}</p>
        <ul className="flex flex-wrap gap-2 mt-5">
          {person.tags.map((tag) => (
            <li key={tag} className="chip chip-quiet">
              {tag}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
