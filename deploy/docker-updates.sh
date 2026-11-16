#!/usr/bin/env bash
set -euo pipefail

# Holt Sicherheitskorrekturen der Docker-Abbilder — dieselben Versionen,
# aber mit dem, was seit dem letzten Pull an Patches erschienen ist.
#
# - db (postgres:17-alpine), proxy (caddy:2-alpine): erneut gezogen, keine
#   neue Version im Sinn der Anwendung, nur ein aktuelleres Alpine darunter.
# - app: neu gebaut mit --pull, holt damit die aktuelle
#   node:22-bookworm-slim-Basis. npm ci hält sich an package-lock.json,
#   es ändert sich also nur die Betriebssystemschicht der Basis, kein
#   Anwendungscode und keine Abhängigkeitsversion.
#
# Zieht absichtlich NICHT neuen Programmcode (kein git pull) — ein Deploy
# neuer Funktionen bleibt eine bewusste, manuelle Entscheidung, siehe README.
#
# Für den mail-Dienst gilt "--profile mail" nur, wenn er bereits Teil dieser
# Installation ist (siehe "docker compose --profile mail up -d --build" in
# der README) — sonst würde dieses Skript ihn ungefragt mit starten.

cd "$(dirname "$0")/.."
LOG=/var/log/driveonpoint-docker-updates.log

# Der Build der App braucht in der Spitze rund 1,4 GB Arbeitsspeicher. Auf
# einem Server mit 2 GB und ohne Swap legt das alles lahm (Website nicht
# erreichbar, Last >100), bis der Build durch ist oder das System Prozesse
# beendet. Darum: nur bauen, wenn genug frei ist, mit niedrigster Priorität
# und mit Zeitlimit. Sonst wird der Lauf übersprungen — die Basisabbilder
# sind dann eben erst nächste Woche dran, die laufende Seite bleibt heil.
MIN_FREE_MB="${MIN_FREE_MB:-1600}"   # frei = verfügbarer RAM + freier Swap
BUILD_TIMEOUT="${BUILD_TIMEOUT:-40m}"

# Wird der Lauf von aussen beendet (die Serverüberwachung bricht ihn bei
# Überlastung ab, siehe deploy/ressourcen.sh), im Protokoll festhalten. Der
# Abbruch hindert das Skript auch daran, mit "up -d" weiterzumachen.
trap 'echo "ABGEBROCHEN (Signal) um $(date -Is) — keine Container ersetzt." >> "$LOG"; exit 143' TERM INT

{
  echo "=== $(date -Is) ==="

  project="$(basename "$(pwd)")"
  mail_profile=()
  if docker ps -a \
      --filter "label=com.docker.compose.project=${project}" \
      --filter "label=com.docker.compose.service=mail" \
      -q | grep -q .; then
    mail_profile=(--profile mail)
    echo "Mail-Container ist Teil dieser Installation, wird mit aktualisiert."
  fi

  services=(db proxy)
  if [ "${#mail_profile[@]}" -gt 0 ]; then
    services+=(mail)
  fi

  avail_kb="$(awk '$1=="MemAvailable:" {a=$2} $1=="SwapFree:" {s=$2} END {print a+s}' /proc/meminfo)"
  if [ "$(( avail_kb / 1024 ))" -lt "$MIN_FREE_MB" ]; then
    echo "Nur $(( avail_kb / 1024 )) MB Arbeits- und Auslagerungsspeicher frei (nötig: $MIN_FREE_MB MB) — Update übersprungen."
    echo "Tipp: Swap einrichten mit deploy/swap-einrichten.sh."
    exit 0
  fi

  docker compose "${mail_profile[@]}" pull "${services[@]}"
  nice -n 19 ionice -c 3 timeout "$BUILD_TIMEOUT" \
    docker compose "${mail_profile[@]}" build --pull app
  docker compose "${mail_profile[@]}" up -d

  # Nur nicht mehr referenzierte (namenlose) Abbilder — nichts, was noch
  # gebraucht wird, und nichts von einem anderen Projekt auf demselben Server.
  docker image prune -f --filter "until=72h" >/dev/null

  echo "Fertig."
} >> "$LOG" 2>&1
