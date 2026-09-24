/**
 * Chromium unter Windows und Linux kennt keine deutsche Silbentrennung —
 * `hyphens: auto` greift dort nicht, und in schmalen Spalten brach
 * „Verkehrskundeunterricht" als „Verkehrskundeunt / erricht" um. Ein weiches
 * Trennzeichen an der Wortfuge trennt überall an der richtigen Stelle und
 * bleibt sonst unsichtbar.
 */
export function withSoftHyphens(text: string): string {
  return text.replace(/Verkehrskundeunterricht/g, "Verkehrskunde­unterricht");
}
