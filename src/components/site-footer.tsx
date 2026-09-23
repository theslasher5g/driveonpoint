import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { site } from "@/lib/site";

const ANGEBOT = [
  { href: "/fahrstunden", label: "Fahrstunden Kategorie B" },
  { href: "/vku", label: "Verkehrskundeunterricht" },
  { href: "/nothilfekurs", label: "Nothilfekurs" },
  { href: "/preise", label: "Preise und Aktionen" },
];

const ORIENTIERUNG = [
  { href: "/ausbildungsweg", label: "Weg zum Führerausweis" },
  { href: "/ueber-uns", label: "Über uns" },
  { href: "/kontakt", label: "Kontakt" },
  { href: "/buchen", label: "Termin buchen" },
];

const RECHTLICHES = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/agb", label: "AGB" },
];

export function SiteFooter() {
  return (
    // Kein Abstand nach oben: der dunkle Grund trennt den Fuss schon von
    // allem darüber, und auf der Startseite entstand daraus ein heller
    // Streifen zwischen zwei dunklen Bändern.
    //
    // .lane zieht dieselbe Blattkante durch, die jeder andere Abschnitt der
    // Seite trägt — vorher war der Fuss der einzige Bereich ohne sie und
    // wirkte dadurch wie angeklebt statt wie der letzte Eintrag im Heft.
    <footer className="bg-deep text-paper">
      <div className="shell band">
        <div className="lane">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.9fr_0.9fr_1fr] lg:gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <BrandMark className="w-9" tone="invert" />
                <span className="stretch-wide font-extrabold text-lg leading-none">
                  {site.name}
                </span>
              </div>
              <p className="text-paper/55 text-fine max-w-[24ch] mb-5">
                {site.claim} in {site.region[0]} und Umgebung.
              </p>

              {/* Anruf zuerst, Adresse zuletzt: wer im Fuss landet, will
                  meistens anrufen oder schreiben, selten einen Brief
                  schicken — dieselbe Reihenfolge, in der man die Angaben
                  tatsächlich braucht. Telefonnummern zählen wie Uhrzeiten
                  und Preise zu den eingetragenen Zahlen der Seite. */}
              <a
                href={`tel:${site.contact.phoneHref}`}
                className="nums font-display text-xl font-bold block hover:text-paper/80 transition-colors"
              >
                {site.contact.phone}
              </a>
              <a
                href={`mailto:${site.contact.email}`}
                className="text-paper/70 text-fine hover:text-paper underline-offset-4 hover:underline block mt-1.5"
              >
                {site.contact.email}
              </a>
              <address className="not-italic text-paper/50 text-fine mt-4 leading-relaxed">
                {site.contact.street}
                <br />
                {site.contact.zip} {site.contact.city}
              </address>
            </div>

            <FooterColumn title="Angebot" links={ANGEBOT} />
            <FooterColumn title="Orientierung" links={ORIENTIERUNG} />

            <div>
              <h2 className="stretch-normal text-sm font-bold mb-4">Öffnungszeiten</h2>
              <dl className="text-fine text-paper/70 space-y-1.5">
                {site.hours.map((entry) => (
                  <div key={entry.days} className="flex justify-between gap-4">
                    <dt>{entry.days}</dt>
                    <dd className="nums shrink-0">{entry.time}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-fine text-paper/55 mt-5">
                Wir unterrichten in {site.languages.join(", ")}.
              </p>
            </div>
          </div>

          <div className="mt-14 pt-7 border-t border-paper/15 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-fine text-paper/55">
              © {new Date().getFullYear()} {site.name}. Einzugsgebiet{" "}
              {site.region.slice(0, 4).join(", ")} und Umgebung.
            </p>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {RECHTLICHES.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="py-3 -my-3 text-fine text-paper/70 hover:text-paper underline-offset-4 hover:underline"
                >
                  {item.label}
                </Link>
              ))}

              {/*
                Zugang für Mitarbeitende. Bewusst unauffällig und ohne Eintrag
                in der Hauptnavigation, aber weiterhin als normaler Link
                vorhanden: ein wirklich verstecktes Feld fänden weder
                Tastaturbedienung noch Vorlesesoftware.
              */}
              <Link
                href="/team"
                className="py-3 -my-3 text-fine text-paper/35 hover:text-paper/80 underline-offset-4 hover:underline"
              >
                Team-Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <nav aria-label={title}>
      <h2 className="stretch-normal text-sm font-bold mb-4">{title}</h2>
      <ul className="space-y-2.5">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block py-3 -my-3 text-fine text-paper/70 hover:text-paper underline-offset-4 hover:underline"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
