#!/usr/bin/env bash
set -euo pipefail

# Richtet "earlyoom" ein: Ein kleiner Dienst, der den Arbeitsspeicher beobachtet
# und rechtzeitig den grössten Verbraucher beendet, BEVOR der Server in die
# Auslagerungsschleife läuft und einfriert (Last >100, Website weg, wie am
# 15.11.). Ohne ihn friert Linux oft minutenlang oder stundenlang ein, statt
# sauber einen Prozess zu beenden.
#
#   sudo deploy/oom-schutz.sh
#
# Eingestellt ist: eingreifen, wenn weniger als 8 % RAM frei sind UND mehr als
# die Hälfte des Swaps belegt ist. Bevorzugt beendet wird "node"/"npm" (also
# der Build der App, siehe deploy/docker-updates.sh); die laufende App heisst
# "next-server" und ist davon nicht betroffen. Geschützt sind Docker, Datenbank,
# Webserver, SSH und die Sicherheitsdienste. Wird dennoch etwas beendet, startet
# Docker die Container von selbst neu (restart: unless-stopped), und die
# Serverüberwachung (deploy/ressourcen.sh) meldet es per Mail.
#
# Idempotent: erneutes Ausführen setzt dieselbe Einstellung.

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte mit sudo ausführen: sudo $0" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Dieses Skript setzt ein Debian- oder Ubuntu-System voraus (apt-get fehlt)." >&2
  exit 1
fi

if [ -z "$(swapon --show --noheadings 2>/dev/null)" ]; then
  echo "Hinweis: Es ist kein Swap aktiv. Besser zuerst: sudo deploy/swap-einrichten.sh" >&2
fi

apt-get update -qq
apt-get install -y earlyoom

CONF=/etc/default/earlyoom
AVOID='(^|/)(systemd|init|sshd|dockerd|containerd.*|tini|postgres|caddy|crowdsec.*|fail2ban.*|earlyoom)$'
PREFER='(^|/)(node|npm|npx)$'

write_conf() {
  cat > "$CONF" <<CONF
# Von deploy/oom-schutz.sh gesetzt.
# -m 8: eingreifen unter 8 % freiem RAM, -s 50: und unter 50 % freiem Swap.
# -r 3600: einmal pro Stunde eine Statuszeile ins Protokoll.
EARLYOOM_ARGS="$1"
CONF
}

write_conf "-r 3600 -m 8 -s 50 --avoid '$AVOID' --prefer '$PREFER'"
systemctl enable earlyoom >/dev/null 2>&1 || true
systemctl restart earlyoom
sleep 2

if ! systemctl is-active --quiet earlyoom; then
  echo "earlyoom startet mit den Ausnahmelisten nicht — setze die einfache Einstellung ohne Listen." >&2
  write_conf "-r 3600 -m 8 -s 50"
  systemctl restart earlyoom
  sleep 2
fi

if systemctl is-active --quiet earlyoom; then
  echo "earlyoom ist aktiv:"
  systemctl --no-pager --lines=0 status earlyoom | sed -n '1,3p'
  journalctl -u earlyoom --no-pager -n 5 2>/dev/null || true
  echo
  echo "Kontrolle jederzeit: systemctl status earlyoom  /  journalctl -u earlyoom"
else
  echo "earlyoom läuft nicht. Fehlersuche: journalctl -u earlyoom -n 30" >&2
  exit 1
fi
