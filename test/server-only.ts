/**
 * Ersatz für das Paket "server-only", das sonst Next.js mitbringt.
 *
 * Die Bibliotheken unter src/lib markieren sich damit als reiner Servercode.
 * Ausserhalb von Next.js gibt es das Modul nicht, deshalb zeigt
 * tsconfig.test.json den Verweis hierher — absichtlich leer.
 */
export {};
