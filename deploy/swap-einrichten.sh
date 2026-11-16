#!/usr/bin/env bash
set -euo pipefail

# Richtet eine Swap-Datei ein (Standard 2 GB), falls noch kein Swap da ist.
# Swap ist der Puffer, wenn der Arbeitsspeicher kurz knapp wird — etwa beim
# wöchentlichen Build der App (deploy/docker-updates.sh, ~1,4 GB Spitze). Ohne
# ihn beendet Linux dann Prozesse oder der Server friert ein.
#
#   sudo deploy/swap-einrichten.sh        # 2 GB
#   sudo SWAP_MB=4096 deploy/swap-einrichten.sh
#
# Idempotent: ist schon Swap aktiv, passiert nichts.

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte mit sudo ausführen: sudo $0" >&2
  exit 1
fi

SWAP_MB="${SWAP_MB:-2048}"
FILE=/swapfile

if [ -n "$(swapon --show --noheadings 2>/dev/null)" ]; then
  echo "Swap ist bereits aktiv:"
  swapon --show
  exit 0
fi

# Platz prüfen: die Datei plus 1 GB Reserve müssen auf die Platte passen.
free_mb="$(df -Pm / | awk 'NR==2 {print $4}')"
if [ "$free_mb" -lt "$(( SWAP_MB + 1024 ))" ]; then
  echo "Zu wenig Platz auf /: ${free_mb} MB frei, gebraucht werden ${SWAP_MB} MB + 1024 MB Reserve." >&2
  echo "Kleiner einstellen, z. B.: sudo SWAP_MB=1024 $0" >&2
  exit 1
fi

if [ -e "$FILE" ]; then
  echo "$FILE existiert schon, aber ist nicht aktiv — bitte von Hand prüfen." >&2
  exit 1
fi

# fallocate geht nicht auf jedem Dateisystem (z. B. btrfs, ZFS) — dann dd.
if ! fallocate -l "${SWAP_MB}M" "$FILE" 2>/dev/null; then
  dd if=/dev/zero of="$FILE" bs=1M count="$SWAP_MB" status=none
fi
chmod 600 "$FILE"
mkswap "$FILE" >/dev/null
swapon "$FILE"

grep -qF "$FILE" /etc/fstab || echo "$FILE none swap sw 0 0" >> /etc/fstab

# Swap nur im Notfall nutzen, nicht den Cache der Datenbank verdrängen.
echo "vm.swappiness=10" > /etc/sysctl.d/99-driveonpoint-swap.conf
sysctl -q -p /etc/sysctl.d/99-driveonpoint-swap.conf

echo "Swap eingerichtet:"
swapon --show
free -h
