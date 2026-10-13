/**
 * Kleine, einheitliche Strichsymbole für den Team-Bereich (Navigation).
 * Ein Strichstärke, eine Grösse — sie sollen den Eintrag wiedererkennbar
 * machen, nicht schmücken.
 */
export type TeamIconName =
  | "uebersicht"
  | "kalender"
  | "uhr"
  | "preis"
  | "prozent"
  | "personen"
  | "beleg"
  | "protokoll"
  | "konto";

export function TeamIcon({ name, size = 18 }: { name: TeamIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "uebersicht":
      return (
        <svg {...common}>
          <path d="M4 11.5 12 4.5l8 7" />
          <path d="M6 10v9.5h12V10" />
        </svg>
      );
    case "kalender":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <path d="M8 3v4M16 3v4M3.5 10h17" />
        </svg>
      );
    case "uhr":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "preis":
      return (
        <svg {...common}>
          <path d="M11 4h6a2 2 0 0 1 2 2v6L10.5 20 4 13.5 11 4Z" />
          <circle cx="14.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "prozent":
      return (
        <svg {...common}>
          <path d="M6 18 18 6" />
          <circle cx="7.5" cy="7.5" r="2" />
          <circle cx="16.5" cy="16.5" r="2" />
        </svg>
      );
    case "personen":
      return (
        <svg {...common}>
          <circle cx="8.5" cy="8" r="3" />
          <path d="M2.5 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
          <path d="M15.5 5.2c1.4.4 2.4 1.6 2.4 3.1 0 1.4-.9 2.6-2.2 3.1M17.5 13.7c2.2.6 3.8 2.3 4 4.6" />
        </svg>
      );
    case "beleg":
      return (
        <svg {...common}>
          <path d="M6 3.5h12v17l-2.5-1.6L13 20.5l-2.5-1.6L8 20.5l-2-1.6V3.5Z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
      );
    case "protokoll":
      return (
        <svg {...common}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "konto":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
        </svg>
      );
  }
}
