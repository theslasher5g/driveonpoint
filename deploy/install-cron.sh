#!/usr/bin/env bash
set -euo pipefail

# Trägt die wiederkehrenden Aufgaben in die crontab von root ein: stündlich
# Erinnerungen und verfallene Anfragen, täglich den Aufräumlauf, wöchentlich
# die Docker-Image-Updates, alle 3 Minuten die Serverüberwachung
# (Arbeitsspeicher, Prozessor, Festplatte). Läuft
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

chmod +x "$DIR/deploy/swap-einrichten.sh" "$DIR/deploy/oom-schutz.sh" "$DIR/deploy/cron-aufruf.sh" "$DIR/deploy/aufraeumen.sh" "$DIR/deploy/stuendlich.sh" "$DIR/deploy/docker-updates.sh" "$DIR/deploy/ressourcen.sh"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

crontab -l 2>/dev/null | grep -vF "$MARKER" > "$TMP" || true
{
  cat "$TMP"
  echo "7 * * * * $DIR/deploy/stuendlich.sh $MARKER stuendlich"
  echo "17 3 * * * $DIR/deploy/aufraeumen.sh $MARKER aufraeumen"
  # 04:30 statt 04:00: um vier startet bei Bedarf der Neustart nach Sicherheitsupdates.
  echo "30 4 * * 0 $DIR/deploy/docker-updates.sh $MARKER docker-updates"
  echo "*/3 * * * * $DIR/deploy/ressourcen.sh $MARKER ressourcen"
} | crontab -

if [ -f "$DIR/deploy/logrotate.conf" ]; then
  install -m 644 "$DIR/deploy/logrotate.conf" /etc/logrotate.d/driveonpoint
fi

echo "Eingetragen:"
crontab -l | grep -F "$MARKER"
echo
if ! grep -qE '^ALERT_EMAIL=.+' "$DIR/.env" 2>/dev/null; then
  echo
  echo "ACHTUNG: ALERT_EMAIL fehlt in .env — ohne Empfängeradresse schickt die Überwachung nichts."
fi
echo
if ! command -v earlyoom >/dev/null 2>&1; then
  echo
  echo "Tipp: Speicherschutz einrichten (beendet bei Speichermangel rechtzeitig den grössten Verbraucher): sudo $DIR/deploy/oom-schutz.sh"
fi
echo
echo "Protokolle: /var/log/driveonpoint-stuendlich.log, /var/log/driveonpoint-aufraeumen.log, /var/log/driveonpoint-docker-updates.log, /var/log/driveonpoint-ressourcen.log"
