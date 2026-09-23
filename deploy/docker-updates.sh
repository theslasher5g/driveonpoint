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

  docker compose "${mail_profile[@]}" pull "${services[@]}"
  docker compose "${mail_profile[@]}" build --pull app
  docker compose "${mail_profile[@]}" up -d

  # Nur nicht mehr referenzierte (namenlose) Abbilder — nichts, was noch
  # gebraucht wird, und nichts von einem anderen Projekt auf demselben Server.
  docker image prune -f --filter "until=72h" >/dev/null

  echo "Fertig."
} >> "$LOG" 2>&1
