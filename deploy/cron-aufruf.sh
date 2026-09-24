#!/usr/bin/env bash
set -uo pipefail

# Ruft einen der Cron-Endpunkte der Anwendung auf (src/app/api/cron/<name>)
# und schreibt das Ergebnis nach /var/log/driveonpoint-<name>.log.
#
#   deploy/cron-aufruf.sh aufraeumen   — täglich: Kundendaten nach Frist löschen
#   deploy/cron-aufruf.sh stuendlich   — stündlich: Erinnerungen, verfallene Anfragen
#
# Liest CRON_SECRET direkt aus .env statt die ganze Datei als Umgebung zu
# laden — so bleiben Datenbankpasswort & Co. aussen vor. Ruft die Anwendung
# über 127.0.0.1:3000 direkt an, nicht über die öffentliche Domain: läuft so
# auch, bevor eine Domain eingerichtet ist, und unabhängig vom Reverse Proxy
# (siehe "127.0.0.1:3000:3000" in docker-compose.yml).

NAME="${1:-}"
case "$NAME" in
  aufraeumen|stuendlich) ;;
  *) echo "Aufruf: $0 aufraeumen|stuendlich" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

# Umschliessende Anführungszeichen entfernen — docker compose akzeptiert
# CRON_SECRET="…" in der .env, curl würde sie sonst mitschicken.
CRON_SECRET="$(grep -E '^CRON_SECRET=' .env | head -n1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
LOG="/var/log/driveonpoint-${NAME}.log"

{
  echo "=== $(date -Is) ==="

  if [ -z "$CRON_SECRET" ]; then
    echo "CRON_SECRET fehlt in .env — Lauf übersprungen."
  # Kopfzeile über stdin statt als Argument: Argumente stehen für jeden
  # Benutzer des Servers in der Prozessliste (ps), stdin nicht.
  elif printf 'Authorization: Bearer %s\n' "$CRON_SECRET" \
      | curl -fsS -X POST -H @- "http://127.0.0.1:3000/api/cron/${NAME}"; then
    echo
    echo "OK"
  else
    status=$?
    echo
    echo "FEHLGESCHLAGEN (curl-Exitcode ${status})"
  fi
} >> "$LOG" 2>&1
