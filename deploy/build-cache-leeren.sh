#!/usr/bin/env bash
set -euo pipefail

# Begrenzt täglich den Docker-Build-Cache (Zwischenstände vom Bauen der App).
# Der Cache wächst mit jedem Build um mehrere Hundert MB und wird im Betrieb
# nie gebraucht — nur beim Bauen selbst. Laufende Container, Abbilder und
# Daten (Volumes) bleiben unberührt.
#
# Nicht alles weg, sondern nur, was über KEEP_STORAGE hinausgeht (die
# jüngsten Einträge bleiben): der nächste Build nutzt weiter den warmen
# Cache und muss nicht komplett durch npm ci und next build — die
# Speicherspitze von rund 1,4 GB auf dem 2-GB-Server tritt so nicht bei
# jedem Build auf. Mit KEEP_STORAGE=0 wird alles geleert.
#
# Nicht mitten im Bau: läuft gerade ein Build (etwa das wöchentliche
# docker-updates.sh), wird der Lauf übersprungen — BuildKit würde zwar
# benutzte Einträge verschonen, aber ein halb geleerter Cache macht den
# Build langsamer und unberechenbarer.

KEEP_STORAGE="${KEEP_STORAGE:-2GB}"
LOG=/var/log/driveonpoint-build-cache.log
LOCK=/var/lock/driveonpoint-build-cache.lock

exec 9>"$LOCK"
flock -n 9 || exit 0

{
  echo "=== $(date -Is) (behalte bis $KEEP_STORAGE) ==="

  if pgrep -f "docker-updates.sh" >/dev/null || pgrep -f "docker (compose )?build( |$)" >/dev/null || pgrep -f "buildx build" >/dev/null; then
    echo "Ein Build läuft gerade — übersprungen."
    exit 0
  fi

  before="$(docker system df --format '{{.Type}}: {{.Size}}' 2>/dev/null | grep -i 'build cache' || true)"
  docker builder prune -af --keep-storage "$KEEP_STORAGE" 2>&1 | tail -1
  echo "Vorher  ${before:-unbekannt}"
  echo "Nachher $(docker system df --format '{{.Type}}: {{.Size}}' 2>/dev/null | grep -i 'build cache' || echo unbekannt)"
} >> "$LOG" 2>&1
