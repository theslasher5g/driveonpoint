#!/usr/bin/env bash
set -uo pipefail

# Ruft den täglichen Aufräumlauf auf (siehe src/app/api/cron/aufraeumen):
# löscht Kundendaten nach Ablauf der Aufbewahrungsfrist, entfernt abgelaufene
# Sitzungen und alte Zähler.
#
# Liest CRON_SECRET direkt aus .env statt die ganze Datei als Umgebung zu
# laden — so bleiben Datenbankpasswort & Co. aussen vor. Ruft die Anwendung
# über 127.0.0.1:3000 direkt an, nicht über die öffentliche Domain: läuft so
# auch, bevor eine Domain eingerichtet ist, und unabhängig vom Reverse Proxy
# (siehe "127.0.0.1:3000:3000" in docker-compose.yml).

cd "$(dirname "$0")/.."

CRON_SECRET="$(grep -E '^CRON_SECRET=' .env | head -n1 | cut -d= -f2-)"
LOG=/var/log/driveonpoint-aufraeumen.log

{
  echo "=== $(date -Is) ==="

  if [ -z "$CRON_SECRET" ]; then
    echo "CRON_SECRET fehlt in .env — Aufräumlauf übersprungen."
  elif curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET}" \
      http://127.0.0.1:3000/api/cron/aufraeumen; then
    echo
    echo "OK"
  else
    status=$?
    echo
    echo "FEHLGESCHLAGEN (curl-Exitcode ${status})"
  fi
} >> "$LOG" 2>&1
