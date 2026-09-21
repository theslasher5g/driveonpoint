import Link from "next/link";

export function PageHeader({
  title,
  lead,
  action,
}: {
  title: string;
  lead: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="bg-concrete border-b border-deep/12">
      <div className="shell py-8 md:py-12">
        {/* Titel und Einleitung stehen nebeneinander statt untereinander:
            derselbe Text, ein Band statt zwei. */}
        <div className="lane md:grid md:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] md:gap-10 md:items-start">
          <div>
            <span className="block w-9 h-[3px] bg-signal mb-4" aria-hidden="true" />
            {/* Die Zeichenbreite bremst nur ab dem Punkt, an dem Titel und
                Einleitung nebeneinander stehen (md:) — vorher, auf dem
                Telefon, hat ein langes Wort wie "Verkehrskundeunterricht"
                sonst schon bei voller Bildschirmbreite unnötig umgebrochen. */}
            <h1 className="text-title md:max-w-[20ch]">{title}</h1>
          </div>
          <div className="mt-4 md:mt-0">
            <p className="text-lead text-slate max-w-[56ch]">{lead}</p>
            {action && (
              <Link href={action.href} className="btn btn-primary mt-5">
                {action.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Abschnitt mit der durchlaufenden Markierung, für Unterseiten.
 *
 * Mit Titel steht der Kopf ab 900px links neben dem Inhalt statt darüber.
 * Das spart auf jeder Unterseite ein Band je Abschnitt, ohne ein Wort zu
 * streichen — darunter wird wieder gestapelt.
 */
export function Section({
  title,
  lead,
  children,
  tone = "concrete",
}: {
  title?: string;
  lead?: string;
  children: React.ReactNode;
  tone?: "concrete" | "paper";
}) {
  return (
    <section className={tone === "paper" ? "bg-paper" : ""}>
      <div className="shell band">
        <div className="lane">
          {title ? (
            <div className="split">
              <div className="split-head-sticky">
                {/* Gleicher Grund wie beim Seitentitel: die Begrenzung
                    gehört erst zur zweispaltigen Ansicht ab 900px. */}
                <h2 className="text-section min-[900px]:max-w-[18ch]">{title}</h2>
                {lead && <p className="text-slate text-fine mt-2 min-[900px]:max-w-[40ch]">{lead}</p>}
              </div>
              <div className="min-w-0">{children}</div>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </section>
  );
}
