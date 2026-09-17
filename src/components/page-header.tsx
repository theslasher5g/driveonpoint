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
      <div className="shell pt-12 pb-14 md:pt-20 md:pb-20">
        <div className="lane lane-draws">
          <span className="block w-10 h-1 bg-signal mb-6" aria-hidden="true" />
          <h1 className="text-title max-w-[24ch]">{title}</h1>
          <p className="text-lead text-slate mt-6 max-w-[56ch]">{lead}</p>
          {action && (
            <Link href={action.href} className="btn btn-primary mt-8">
              {action.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** Abschnitt mit der durchlaufenden Markierung, für Unterseiten. */
export function Section({
  title,
  children,
  tone = "concrete",
}: {
  title?: string;
  children: React.ReactNode;
  tone?: "concrete" | "paper";
}) {
  return (
    <section className={tone === "paper" ? "bg-paper" : ""}>
      <div className="shell py-14 md:py-20">
        <div className="lane">
          {title && <h2 className="text-section max-w-[20ch] mb-7">{title}</h2>}
          {children}
        </div>
      </div>
    </section>
  );
}
