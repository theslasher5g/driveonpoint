/**
 * Die Marke: eine Raute im abgerundeten Quadrat.
 *
 * Die Raute ist der Punkt aus „on Point“ — der Scheitel einer Kurve, die
 * Stelle, auf die es ankommt. Sie stammt aus der bestehenden Gestaltung der
 * Fahrschule und bleibt dort das einzige Bildzeichen.
 *
 * `tone` kehrt sie um: auf roten Flächen wird das Quadrat weiss und die
 * Raute rot, sonst umgekehrt.
 */
export function BrandMark({
  className = "",
  tone = "solid",
}: {
  className?: string;
  tone?: "solid" | "invert";
}) {
  const box = tone === "solid" ? "bg-signal" : "bg-paper";
  const diamond = tone === "solid" ? "text-paper" : "text-signal";

  return (
    <span
      className={`grid place-items-center aspect-square shrink-0 ${box} ${className}`}
      style={{ borderRadius: "var(--radius-control)" }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className={`w-[52%] h-[52%] ${diamond}`} fill="currentColor">
        <path d="M12 2.5 21.5 12 12 21.5 2.5 12z" />
      </svg>
    </span>
  );
}
