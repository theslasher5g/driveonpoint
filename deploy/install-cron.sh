#!/usr/bin/env bash
set -euo pipefail

# Trägt die beiden wiederkehrenden Aufgaben in die crontab von root ein:
# täglich den Aufräumlauf, wöchentlich die Docker-Image-Updates. Läuft
# als root, damit der Cron-Aufruf ohne weitere Einrichtung auf den
# Docker-Socket zugreifen kann.
#
# Erneutes Ausführen ersetzt die vorhandenen Zeilen (am Kommentar
# "# driveonpoint" erkennbar) statt sie zu verdoppeln — unbedenklich, wenn
# sich der Pfad dieses Projekts einmal ändert.

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte mit sudo ausführen: sudo $0" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)"
MARKER="# driveonpoint"

chmod +x "$DIR/deploy/aufraeumen.sh" "$DIR/deploy/docker-updates.sh"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

crontab -l 2>/dev/null | grep -vF "$MARKER" > "$TMP" || true
{
  cat "$TMP"
  echo "17 3 * * * $DIR/deploy/aufraeumen.sh $MARKER aufraeumen"
  echo "0 4 * * 0 $DIR/deploy/docker-updates.sh $MARKER docker-updates"
} | crontab -

if [ -f "$DIR/deploy/logrotate.conf" ]; then
  install -m 644 "$DIR/deploy/logrotate.conf" /etc/logrotate.d/driveonpoint
fi

echo "Eingetragen:"
crontab -l | grep -F "$MARKER"
echo
echo "Protokolle: /var/log/driveonpoint-aufraeumen.log, /var/log/driveonpoint-docker-updates.log"
