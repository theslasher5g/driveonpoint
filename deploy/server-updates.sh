#!/usr/bin/env bash
set -euo pipefail

# Richtet automatische Sicherheitsupdates des Betriebssystems ein
# (unattended-upgrades). Einmalig mit sudo ausführen, danach läuft es über
# die eigenen systemd-Timer von Debian/Ubuntu weiter — dieses Skript startet
# selbst keinen Dienst, es richtet nur die vorhandenen ein und ein.
#
# Bewusst nur die Betriebssystemschicht: die Basis-Abbilder von Docker und
# die Anwendung selbst deckt deploy/docker-updates.sh ab, siehe README.

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte mit sudo ausführen: sudo $0" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Dieses Skript setzt ein Debian- oder Ubuntu-System voraus (apt-get fehlt)." >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"

apt-get update
apt-get install -y unattended-upgrades apt-listchanges

install -m 644 "$HERE/apt/20auto-upgrades" /etc/apt/apt.conf.d/20auto-upgrades
install -m 644 "$HERE/apt/51driveonpoint-security.conf" /etc/apt/apt.conf.d/51driveonpoint-security

systemctl enable --now unattended-upgrades.service
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer

echo "Automatische Sicherheitsupdates eingerichtet."
echo "Protokoll ab jetzt unter /var/log/unattended-upgrades/unattended-upgrades.log"
