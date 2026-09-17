/**
 * Läuft einmal beim Start des Servers, bevor die erste Anfrage bedient wird.
 *
 * Prüft die Umgebung und bringt die Datenbank auf Stand. Damit genügt zum
 * Aufschalten ein einziger Befehl — und ein fehlendes Geheimnis fällt beim
 * Hochfahren auf, nicht erst, wenn jemand ein Formular abschickt.
 *
 * Die Prüfung auf NEXT_RUNTIME muss als umschliessende Bedingung geschrieben
 * sein, nicht als vorzeitiges Verlassen der Funktion: Next übersetzt diese
 * Datei auch für die Edge-Laufzeit, und nur so lässt der Bundler den
 * Datenbankzweig dort weg. Sonst scheitert der Bau daran, dass „fs“ in der
 * Edge-Laufzeit nicht existiert.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Beim Bauen gibt es weder Geheimnisse noch Datenbank.
    if (process.env.NEXT_PHASE === "phase-production-build") return;

    const { assertEnvironment } = await import("./lib/env");
    assertEnvironment();

    const { bootstrapDatabase } = await import("./lib/db/bootstrap");

    try {
      await bootstrapDatabase();
    } catch (error) {
      // Nicht beenden: steht die Datenbank beim Start noch nicht bereit,
      // soll der Container nicht in eine Neustartschleife laufen. Die
      // Bereitschaftsprüfung unter /api/health meldet den Zustand, und der
      // nächste Neustart versucht es erneut.
      console.error("Datenbank konnte nicht vorbereitet werden:", error);
    }
  }
}
