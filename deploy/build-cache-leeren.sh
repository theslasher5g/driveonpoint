#!/usr/bin/env bash
set -euo pipefail

# Leert stündlich den Docker-Build-Cache (Zwischenstände vom Bauen der App).
# Der Cache wächst mit jedem Build um mehrere Hundert MB und wird im Betrieb
# nie gebraucht — nur beim Bauen selbst. Laufende Container, Abbilder und
# Daten (Volumes) bleiben unberührt.
#
# Folge: der nächste Build der App startet ohne Cache und braucht länger
# (npm ci und next build laufen komplett durch). Gewollt, siehe README.
#
# Nicht mitten im Bau: läuft gerade ein Build (etwa das wöchentliche
# docker-updates.sh), wird der Lauf übersprungen — BuildKit würde zwar
# benutzte Einträge verschonen, aber ein halb geleerter Cache macht den
# Build langsamer und unberechenbarer.

LOG=/var/log/driveonpoint-build-cache.log
LOCK=/var/lock/driveonpoint-build-cache.lock

exec 9>"$LOCK"
flock -n 9 || exit 0

{
  echo "=== $(date -Is) ==="

  if pgrep -f "docker-updates.sh" >/dev/null || pgrep -f "docker (compose )?build" >/dev/null || pgrep -f "buildx build" >/dev/null; then
    echo "Ein Build läuft gerade — übersprungen."
    exit 0
  fi

  before="$(docker system df --format '{{.Type}}: {{.Size}}' 2>/dev/null | grep -i 'build cache' || true)"
  docker builder prune -af 2>&1 | tail -1
  echo "Vorher  ${before:-unbekannt}"
  echo "Nachher $(docker system df --format '{{.Type}}: {{.Size}}' 2>/dev/null | grep -i 'build cache' || echo unbekannt)"
} >> "$LOG" 2>&1
