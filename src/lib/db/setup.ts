/**
 * Dasselbe von Hand, was beim Serverstart ohnehin passiert: Migrationen
 * einspielen, die Angebote anlegen und beim allerersten Mal das
 * Administrationskonto erzeugen.
 *
 * Für die lokale Entwicklung und für den Fall, dass man den Stand einer
 * Datenbank ohne laufende Anwendung herstellen will.
 */
import { bootstrapDatabase } from "./bootstrap";
import { pool } from "./index";

async function main() {
  await bootstrapDatabase();
  console.log("Datenbank ist auf Stand.");
  await pool.end();
}

main().catch(async (error) => {
  console.error("Einrichten fehlgeschlagen:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
