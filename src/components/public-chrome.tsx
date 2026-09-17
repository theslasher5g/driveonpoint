"use client";

import { usePathname } from "next/navigation";

/**
 * Blendet Kopf- und Fusszeile der öffentlichen Seite im Team-Bereich aus.
 *
 * Dort hat der Team-Bereich seine eigene Leiste. Beides übereinander hiess:
 * zwei Navigationen, acht Links zu Kursangeboten und ein roter Knopf
 * „Termin buchen“ über einem Bildschirm, auf dem jemand den eigenen
 * Kalender führt. Der Inhalt wird serverseitig ohnehin gebaut — hier fällt
 * nur die Anzeige weg, dafür bleibt die Fusszeile eine gewöhnliche
 * Server-Komponente.
 */
export function PublicOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/team")) return null;
  return <>{children}</>;
}
