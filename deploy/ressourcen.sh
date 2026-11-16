#!/usr/bin/env bash
set -uo pipefail

# Überwacht den Server (Arbeitsspeicher, Prozessor, Festplatte, Docker-
# Container, Erreichbarkeit der Anwendung) und schickt bei Problemen eine Mail
# von inbox@driveonpoint.ch an ALERT_EMAIL (aus .env).
#
#   deploy/ressourcen.sh            — Prüflauf (vom Cron alle 3 Minuten)
#   deploy/ressourcen.sh status     — Werte anzeigen, nichts senden, nichts speichern
#   deploy/ressourcen.sh test       — Testmail mit den aktuellen Werten senden
#
# Läuft bewusst ausserhalb der Anwendung, direkt auf dem Server: Eine
# abgestürzte oder festgefahrene Anwendung kann sich nicht selbst melden.
#
# Mails gehen dieselbe Strecke wie die der Anwendung (SMTP_* aus .env): über
# den mitgelieferten mail-Container oder einen externen Anbieter. Läuft der
# Mailserver auf demselben Server und fällt mit aus, kommt keine Warnung an —
# dafür ALERT_EMAIL auf eine Adresse bei einem anderen Anbieter legen.
#
# Pro Problem gibt es eine Mail beim Auftreten, eine Erinnerung alle
# REPEAT_HOURS Stunden, solange es besteht, und eine Entwarnung am Ende.

cd "$(dirname "$0")/.."
DIR="$(pwd)"

# Zustandsdateien, Protokoll und die Mail-Zwischendatei nur für root lesbar.
umask 077

# Docker-Befehle können hängen, gerade wenn der Server unter Druck steht. Ohne
# Zeitlimit würde sich alle 3 Minuten ein weiterer Lauf dahinter aufstauen.
dk() { timeout 20 docker "$@"; }

# --- Schwellen (per Umgebungsvariable überschreibbar) ----------------------
RAM_MIN_AVAILABLE_PCT="${RAM_MIN_AVAILABLE_PCT:-12}"   # Warnung, wenn weniger frei
SWAP_MAX_USED_PCT="${SWAP_MAX_USED_PCT:-50}"           # Warnung, wenn mehr belegt
CPU_MAX_PCT="${CPU_MAX_PCT:-90}"                       # Auslastung, die als hoch gilt …
CPU_RUNS="${CPU_RUNS:-3}"                              # … wenn sie so viele Läufe in Folge anhält
DISK_MAX_PCT="${DISK_MAX_PCT:-85}"                     # Warnung, wenn Dateisystem voller
INODE_MAX_PCT="${INODE_MAX_PCT:-90}"
HEALTH_RUNS="${HEALTH_RUNS:-2}"                        # Fehlversuche in Folge bis zur Warnung
HEALTH_MAX_SECONDS="${HEALTH_MAX_SECONDS:-5}"          # langsamer als das gilt als Problem
LOAD_PER_CORE_MAX="${LOAD_PER_CORE_MAX:-4}"            # Systemlast pro Kern, ab der gewarnt wird
REPEAT_HOURS="${REPEAT_HOURS:-6}"
STATE_DIR="${MONITOR_STATE_DIR:-/var/lib/driveonpoint-monitor}"
LOG="${MONITOR_LOG:-/var/log/driveonpoint-ressourcen.log}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"

MODE="${1:-pruefen}"
case "$MODE" in
  pruefen|status|test) ;;
  *) echo "Aufruf: $0 [status|test]" >&2; exit 2 ;;
esac

# --- .env lesen (nur die nötigen Schlüssel, ohne die Datei zu laden) --------
envget() {
  # Bei doppelten Zeilen gilt die letzte — wie bei docker compose.
  grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- \
    | sed -E 's/^["'\'']//; s/["'\'']$//'
}
ALERT_EMAIL="$(envget ALERT_EMAIL)"
MAIL_FROM="$(envget MAIL_FROM)"; MAIL_FROM="${MAIL_FROM:-DriveOnPoint <inbox@driveonpoint.ch>}"
SMTP_HOST="$(envget SMTP_HOST)"; SMTP_HOST="${SMTP_HOST:-mail}"
SMTP_PORT="$(envget SMTP_PORT)"; SMTP_PORT="${SMTP_PORT:-587}"
SMTP_SECURE="$(envget SMTP_SECURE)"
SMTP_USER="$(envget SMTP_USER)"
SMTP_PASS="$(envget SMTP_PASS)"
FROM_ADDR="$(printf '%s' "$MAIL_FROM" | sed -E 's/^.*<([^>]+)>.*$/\1/')"
HOST="$(hostname)"

log() { [ "$MODE" = "status" ] && echo "$*" || echo "$(date -Is) $*" >> "$LOG" 2>/dev/null || true; }

# --- Mailversand ------------------------------------------------------------
mime_subject() { printf '=?UTF-8?B?%s?=' "$(printf '%s' "$1" | base64 -w0)"; }

send_mail() {
  local subject="$1" body="$2" msg
  msg="$(mktemp)"
  {
    printf 'From: %s\n' "$MAIL_FROM"
    printf 'To: %s\n' "$ALERT_EMAIL"
    printf 'Subject: %s\n' "$(mime_subject "$subject")"
    printf 'Date: %s\n' "$(date -R)"
    printf 'Message-ID: <%s.%s@%s>\n' "$(date +%s)" "$RANDOM" "${HOST}"
    printf 'MIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n'
    printf 'Auto-Submitted: auto-generated\n\n'
    printf '%s\n' "$body"
  } > "$msg"

  local ok=1 target scheme="smtp" opts=()
  target="$SMTP_HOST"
  if [ "$SMTP_HOST" = "mail" ]; then
    # Der mitgelieferte mail-Container hat keinen Port auf dem Host; seine
    # Adresse im internen Docker-Netz ist von hier aus erreichbar.
    local cid
    cid="$(dk compose ps -q mail 2>/dev/null | head -n1)"
    [ -n "$cid" ] && target="$(dk inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$cid" 2>/dev/null)"
    [ -z "${cid:-}" ] && target=""
  fi
  case "$SMTP_HOST" in
    127.*|localhost|mail) ;;                          # lokal bzw. internes Netz: ohne TLS
    *) if [ "$SMTP_SECURE" = "true" ]; then scheme="smtps"; else opts+=(--ssl-reqd); fi ;;
  esac

  # Zugangsdaten über stdin statt als Argument: Argumente stehen für jeden
  # Benutzer des Servers in der Prozessliste (ps), stdin nicht.
  local auth=""
  if [ -n "$SMTP_USER" ]; then
    auth="$(printf '%s:%s' "$SMTP_USER" "$SMTP_PASS" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
    auth="user = \"$auth\""
  fi

  if [ -n "$target" ] && printf '%s\n' "$auth" | curl -sS --max-time 30 --crlf -K - "${opts[@]}" \
      --url "${scheme}://${target}:${SMTP_PORT}" \
      --mail-from "$FROM_ADDR" --mail-rcpt "$ALERT_EMAIL" -T "$msg" >/dev/null 2>>"${LOG}"; then
    ok=0
  elif [ "$SMTP_HOST" = "mail" ] && command -v docker >/dev/null \
      && timeout 60 docker compose exec -T mail sendmail -i -f "$FROM_ADDR" "$ALERT_EMAIL" < "$msg" 2>>"${LOG}"; then
    ok=0
  fi
  rm -f "$msg"
  return $ok
}

# --- Messwerte --------------------------------------------------------------
declare -A PROBLEM       # Schlüssel -> Beschreibung (aktuell bestehende Probleme)
declare -A NEEDRUNS      # Schlüssel -> Läufe in Folge, bis gewarnt wird
declare -A TITLE        # Schlüssel -> Kurztitel für die Betreffzeile
declare -a EVTITLE=()
declare -a EVENTS=()        # einmalige Ereignisse (Neustart eines Containers)

meminfo() { awk -v k="$1:" '$1==k {print $2}' /proc/meminfo; }

check_ram() {
  local total avail stotal sfree pct spct
  total="$(meminfo MemTotal)"; avail="$(meminfo MemAvailable)"
  stotal="$(meminfo SwapTotal)"; sfree="$(meminfo SwapFree)"
  pct=$(( avail * 100 / total ))
  RAM_LINE="Arbeitsspeicher: $(( (total - avail) / 1024 )) von $(( total / 1024 )) MB belegt, ${pct} % frei"
  if [ "$pct" -lt "$RAM_MIN_AVAILABLE_PCT" ]; then
    TITLE[ram]="Arbeitsspeicher fast voll"; PROBLEM[ram]="Arbeitsspeicher fast voll: nur noch ${pct} % frei ($(( avail / 1024 )) von $(( total / 1024 )) MB). Wird er ganz voll, beendet das System Prozesse oder der Server steht still."
    NEEDRUNS[ram]=1
  fi
  if [ "${stotal:-0}" -gt 0 ]; then
    spct=$(( (stotal - sfree) * 100 / stotal ))
    SWAP_LINE="Auslagerungsspeicher (Swap): ${spct} % von $(( stotal / 1024 )) MB belegt"
    if [ "$spct" -gt "$SWAP_MAX_USED_PCT" ]; then
      TITLE[swap]="Swap stark belegt"; PROBLEM[swap]="Auslagerungsspeicher zu ${spct} % belegt. Das System weicht auf die Festplatte aus und wird dadurch sehr langsam."
      NEEDRUNS[swap]=1
    fi
  else
    SWAP_LINE="Auslagerungsspeicher (Swap): keiner eingerichtet"
  fi
}

cpu_sample() {   # Auslastung in Prozent über 5 Sekunden
  local -a c
  local idle1 total1 idle2 total2 dt
  read -r -a c < /proc/stat      # cpu user nice system idle iowait irq softirq steal
  idle1=$(( c[4] + c[5] )); total1=$(( c[1] + c[2] + c[3] + c[4] + c[5] + c[6] + c[7] + c[8] ))
  sleep 5
  read -r -a c < /proc/stat
  idle2=$(( c[4] + c[5] )); total2=$(( c[1] + c[2] + c[3] + c[4] + c[5] + c[6] + c[7] + c[8] ))
  dt=$(( total2 - total1 ))
  [ "$dt" -le 0 ] && { echo 0; return; }
  echo $(( 100 * (dt - (idle2 - idle1)) / dt ))
}

check_cpu() {
  local cpu cores load
  cpu="$(cpu_sample)"; cores="$(nproc)"; load="$(cut -d' ' -f1-3 /proc/loadavg)"
  CPU_LINE="Prozessor: ${cpu} % ausgelastet ($cores Kerne, Last 1/5/15 Min: $load)"
  if [ "$cpu" -ge "$CPU_MAX_PCT" ]; then
    TITLE[cpu]="Prozessor überlastet"; PROBLEM[cpu]="Prozessor dauerhaft hoch ausgelastet (jetzt ${cpu} %, Last $load bei $cores Kernen)."
    NEEDRUNS[cpu]="$CPU_RUNS"
  fi
  # Die Systemlast verrät mehr als die Auslastung: Ein Server, der wegen
  # Speichermangel ständig auslagert oder wartet, steht bei 60 % CPU und
  # Last 100 faktisch still.
  local per_core
  per_core="$(awk -v l="${load%% *}" -v c="$cores" 'BEGIN {printf "%d", l / c}')"
  if [ "$per_core" -ge "$LOAD_PER_CORE_MAX" ]; then
    TITLE[load]="Server überlastet"; PROBLEM[load]="Server überlastet: Systemlast ${load%% *} bei $cores Kern(en) (normal: unter $cores). Meist Speichermangel, ein laufender Build oder ein Dauerangriff — die Website ist dann sehr langsam oder nicht erreichbar."
    NEEDRUNS[load]=2
  fi
}

check_disk() {
  DISK_LINES=""
  local seen="" line mount pct use ipct
  # Jedes echte Dateisystem einmal; Docker-Overlays und Pseudo-Dateisysteme überspringen.
  while read -r dev _ _ _ pct mount; do
    case "$dev" in /dev/loop*) continue ;; /dev/*) ;; *) continue ;; esac
    case " $seen " in *" $dev "*) continue ;; esac
    seen="$seen $dev"
    use="${pct%\%}"
    ipct="$(df -Pi "$mount" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print ($5=="-"?0:$5)}')"
    DISK_LINES+="Festplatte $mount: ${use} % belegt, $(df -Ph "$mount" | awk 'NR==2 {print $4}') frei (Inodes ${ipct:-0} %)"$'\n'
    if [ "$use" -ge "$DISK_MAX_PCT" ]; then
      TITLE[disk:$mount]="Festplatte $mount fast voll"; PROBLEM[disk:$mount]="Festplatte $mount ist zu ${use} % voll ($(df -Ph "$mount" | awk 'NR==2 {print $4}') frei). Ist sie voll, kann die Datenbank nicht mehr schreiben."
      NEEDRUNS[disk:$mount]=1
    fi
    if [ "${ipct:-0}" -ge "$INODE_MAX_PCT" ]; then
      TITLE[inode:$mount]="Inodes auf $mount knapp"; PROBLEM[inode:$mount]="Auf $mount sind ${ipct} % der Dateieinträge (Inodes) belegt."
      NEEDRUNS[inode:$mount]=1
    fi
  done < <(df -P 2>/dev/null | awk 'NR>1')
}

check_docker() {
  DOCKER_LINE=""
  command -v docker >/dev/null || return 0
  local svc cid info status restarts oom started key last
  for svc in app db proxy; do
    cid="$(dk compose ps -q "$svc" 2>/dev/null | head -n1)"
    if [ -z "$cid" ]; then
      TITLE[container:$svc]="Container $svc läuft nicht"; PROBLEM[container:$svc]="Der Container \"$svc\" existiert nicht oder ist gestoppt (docker compose ps)."
      NEEDRUNS[container:$svc]=2
      continue
    fi
    info="$(dk inspect -f '{{.State.Status}} {{.RestartCount}} {{.State.OOMKilled}} {{.State.StartedAt}}' "$cid" 2>/dev/null)" || continue
    read -r status restarts oom started <<< "$info"
    DOCKER_LINE+="Container $svc: $status, Neustarts $restarts"$'\n'
    if [ "$status" != "running" ]; then
      TITLE[container:$svc]="Container $svc läuft nicht"; PROBLEM[container:$svc]="Der Container \"$svc\" läuft nicht (Status: $status)."
      NEEDRUNS[container:$svc]=2
    fi
    # Neustart seit dem letzten Lauf? Dann einmalig melden, mit Hinweis auf Speichermangel.
    key="$restarts $started"
    last="$(cat "$STATE_DIR/start-$svc" 2>/dev/null || true)"
    if [ "$MODE" = "pruefen" ]; then
      if [ -n "$last" ] && [ "$last" != "$key" ]; then
        EVTITLE+=("Container $svc neu gestartet"); EVENTS+=("Der Container \"$svc\" wurde neu gestartet ($(date -d "$started" '+%d.%m.%Y %H:%M' 2>/dev/null || echo "$started")).$([ "$oom" = "true" ] && echo " Der Docker-Daemon meldet: wegen Speichermangel beendet (OOM).")")
      fi
      printf '%s\n' "$key" > "$STATE_DIR/start-$svc"
    fi
  done
}

check_health() {
  local t
  if t="$(curl -fsS --max-time 10 -o /dev/null -w '%{time_total}' "$HEALTH_URL" 2>/dev/null)"; then
    HEALTH_LINE="Anwendung: antwortet (${t} s)"
    if awk -v t="$t" -v m="$HEALTH_MAX_SECONDS" 'BEGIN {exit !(t > m)}'; then
      TITLE[healthslow]="Anwendung antwortet langsam"; PROBLEM[healthslow]="Die Anwendung antwortet sehr langsam (${t} Sekunden statt unter einer)."
      NEEDRUNS[healthslow]=2
    fi
  else
    HEALTH_LINE="Anwendung: antwortet NICHT ($HEALTH_URL)"
    TITLE[health]="Anwendung antwortet nicht"; PROBLEM[health]="Die Anwendung antwortet nicht auf $HEALTH_URL — die Website ist vermutlich nicht erreichbar."
    NEEDRUNS[health]="$HEALTH_RUNS"
  fi
}

OOM_PATTERN='Out of memory|Killed process|oom-kill|oom_reaper'

# Neustart des ganzen Servers und Speichermangel-Abschüsse des Kernels.
check_boot() {
  [ "$MODE" = "pruefen" ] || return 0
  local id last_id since lines
  id="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || true)"
  last_id="$(cat "$STATE_DIR/boot-id" 2>/dev/null || true)"
  if [ -n "$id" ] && [ -n "$last_id" ] && [ "$id" != "$last_id" ]; then
    EVTITLE+=("Server neu gestartet")
    EVENTS+=("Der ganze Server wurde neu gestartet (laufend seit $(uptime -s 2>/dev/null || echo "unbekannt")). Ein Neustart nach Sicherheitsupdates ist um 04:00 gewollt; zu anderen Zeiten spricht er für einen Absturz oder einen Eingriff des Anbieters.")
    if command -v journalctl >/dev/null; then
      lines="$(journalctl -k -b -1 --no-pager -q 2>/dev/null | grep -E "$OOM_PATTERN" | tail -n 3 | cut -c1-200)"
      [ -n "$lines" ] && { EVTITLE+=("Speichermangel vor dem Neustart"); EVENTS+=("Im Protokoll vor dem Neustart meldet der Kernel Speichermangel:"$'\n'"$lines"); }
    fi
  fi
  [ -n "$id" ] && printf '%s\n' "$id" > "$STATE_DIR/boot-id"

  since="$(cat "$STATE_DIR/last-run" 2>/dev/null || true)"
  date +%s > "$STATE_DIR/last-run"
  if [ -n "$since" ] && [ "$id" = "$last_id" ] && command -v journalctl >/dev/null; then
    lines="$(journalctl -k --since "@$since" --no-pager -q 2>/dev/null | grep -E "$OOM_PATTERN" | tail -n 3 | cut -c1-200)"
    [ -n "$lines" ] && { EVTITLE+=("Speichermangel: Prozess beendet"); EVENTS+=("Das System hat wegen Speichermangel Prozesse beendet:"$'\n'"$lines"); }
  fi
}

# Was gerade an Wartung läuft — erklärt oft, warum der Speicher knapp ist.
maintenance_line() {
  local found="" pat
  for pat in "docker-updates.sh" "compose.* build" "buildkitd" "unattended-upgrade" "apt-get" "dpkg"; do
    pgrep -f "$pat" >/dev/null 2>&1 && found+="${found:+, }$pat"
  done
  [ -n "$found" ] && echo "Läuft gerade: $found"
}

# --- Zusammenfassung für den Mailtext ---------------------------------------
summary() {
  echo "Stand $(date '+%d.%m.%Y %H:%M:%S') auf $HOST"
  echo
  echo "$RAM_LINE"; echo "$SWAP_LINE"; echo "$CPU_LINE"
  printf '%s' "$DISK_LINES"
  [ -n "$DOCKER_LINE" ] && printf '%s' "$DOCKER_LINE"
  echo "$HEALTH_LINE"
  maintenance_line
  echo
  echo "Die grössten Speicherverbraucher:"
  ps -eo rss,args --sort=-rss 2>/dev/null | head -n 7 | awk 'NR>1 {rss=$1; $1=""; printf "  %5d MB %s\n", rss/1024, substr($0, 1, 100)}'
  if command -v docker >/dev/null; then
    local stats
    stats="$(timeout 20 docker stats --no-stream --format '  {{.Name}}: {{.MemUsage}} Speicher, {{.CPUPerc}} CPU' 2>/dev/null)"
    [ -n "$stats" ] && { echo; echo "Docker-Container:"; echo "$stats"; }
  fi
}

label() {
  case "${1%%:*}" in
    ram) echo "Arbeitsspeicher" ;;
    swap) echo "Auslagerungsspeicher" ;;
    cpu) echo "Prozessor-Auslastung" ;;
    disk) echo "Festplatte ${1#*:}" ;;
    inode) echo "Dateieinträge (Inodes) auf ${1#*:}" ;;
    container) echo "Container ${1#*:}" ;;
    health) echo "Erreichbarkeit der Anwendung" ;;
    healthslow) echo "Antwortzeit der Anwendung" ;;
    load) echo "Systemlast" ;;
    *) echo "$1" ;;
  esac
}

# --- Ablauf -----------------------------------------------------------------
RAM_LINE=""; SWAP_LINE=""; CPU_LINE=""; DISK_LINES=""; DOCKER_LINE=""; HEALTH_LINE=""

if [ "$MODE" != "status" ]; then
  if [ -z "$ALERT_EMAIL" ]; then
    log "ALERT_EMAIL fehlt in .env — keine Überwachung möglich."
    echo "ALERT_EMAIL fehlt in .env — bitte dort die Empfängeradresse eintragen." >&2
    exit 1
  fi
  mkdir -p "$STATE_DIR" 2>/dev/null || { echo "Kann $STATE_DIR nicht anlegen (mit sudo ausführen?)" >&2; exit 1; }
fi
if [ "$MODE" = "status" ]; then
  STATE_DIR="$(mktemp -d /tmp/driveonpoint-status.XXXXXX)" || exit 1
elif [ "$MODE" = "pruefen" ] && command -v flock >/dev/null; then
  # Nie zwei Prüfläufe gleichzeitig: ein hängender Lauf blockiert den nächsten
  # nicht, aber es stapeln sich auch keine.
  exec 9>"$STATE_DIR/lock"
  flock -n 9 || { log "Vorheriger Lauf läuft noch — übersprungen."; exit 0; }
fi

check_ram; check_cpu; check_disk; check_docker; check_health; check_boot

if [ "$MODE" = "status" ]; then
  summary
  if [ "${#PROBLEM[@]}" -gt 0 ]; then
    echo; echo "PROBLEME:"
    for k in "${!PROBLEM[@]}"; do echo "  - ${PROBLEM[$k]}"; done
  else
    echo; echo "Keine Probleme."
  fi
  case "$STATE_DIR" in /tmp/*) rm -rf "$STATE_DIR" ;; esac
  exit 0
fi

if [ "$MODE" = "test" ]; then
  if send_mail "Testmail der Serverüberwachung ($HOST)" "$(printf 'Diese Mail zeigt, dass die Serverüberwachung Mails verschicken kann.\n\n'; summary)"; then
    echo "Testmail an $ALERT_EMAIL gesendet."; log "Testmail gesendet"
    exit 0
  fi
  echo "Senden fehlgeschlagen — Einzelheiten in $LOG" >&2; exit 1
fi

NOW="$(date +%s)"
REPEAT=$(( REPEAT_HOURS * 3600 ))
declare -a NEW=() REPEATED=() GONE=() SUBJ=()

# Bestehende Probleme: Zähler hochzählen, bei Bedarf melden
for key in "${!PROBLEM[@]}"; do
  f="$STATE_DIR/p-${key//[^A-Za-z0-9]/_}"
  count=0; alerted=0
  [ -f "$f" ] && read -r count alerted _ < "$f"
  count=$(( count + 1 ))
  need="${NEEDRUNS[$key]:-1}"
  if [ "$count" -ge "$need" ]; then
    if [ "$alerted" -eq 0 ]; then NEW+=("${PROBLEM[$key]}"); SUBJ+=("${TITLE[$key]:-$key}"); alerted="$NOW"
    elif [ $(( NOW - alerted )) -ge "$REPEAT" ]; then REPEATED+=("${PROBLEM[$key]}"); SUBJ+=("${TITLE[$key]:-$key}"); alerted="$NOW"; fi
  fi
  printf '%s %s %s\n' "$count" "$alerted" "$key" > "$f"
done

# Verschwundene Probleme: Entwarnung, falls gemeldet
for f in "$STATE_DIR"/p-*; do
  [ -e "$f" ] || continue
  read -r count alerted key < "$f"
  if [ -z "${PROBLEM[$key]+x}" ]; then
    [ "$alerted" -gt 0 ] && GONE+=("$key")
    rm -f "$f"
  fi
done

if [ "${#NEW[@]}" -gt 0 ] || [ "${#REPEATED[@]}" -gt 0 ] || [ "${#EVENTS[@]}" -gt 0 ]; then
  body=""
  if [ "${#NEW[@]}" -gt 0 ]; then body+="Neu aufgetreten:"$'\n'; for t in "${NEW[@]}"; do body+="  - $t"$'\n'; done; body+=$'\n'; fi
  if [ "${#REPEATED[@]}" -gt 0 ]; then body+="Besteht weiterhin:"$'\n'; for t in "${REPEATED[@]}"; do body+="  - $t"$'\n'; done; body+=$'\n'; fi
  if [ "${#EVENTS[@]}" -gt 0 ]; then body+="Ereignisse:"$'\n'; for t in "${EVENTS[@]}"; do body+="  - $t"$'\n'; done; body+=$'\n'; fi
  body+="$(summary)"
  SUBJ+=("${EVTITLE[@]}")
  subject="Server $HOST: ${SUBJ[0]}"
  [ "${#SUBJ[@]}" -gt 1 ] && subject+=" (+$(( ${#SUBJ[@]} - 1 )) weitere)"
  if send_mail "$subject" "$body"; then log "Warnung gesendet: $subject"; else
    log "Senden der Warnung fehlgeschlagen: $subject"
    # Zähler zurücksetzen, damit beim nächsten Lauf erneut versucht wird.
    for f in "$STATE_DIR"/p-*; do [ -e "$f" ] || continue; read -r c a k < "$f"; printf '%s 0 %s\n' "$c" "$k" > "$f"; done
  fi
fi

if [ "${#GONE[@]}" -gt 0 ]; then
  body="Folgendes hat sich wieder normalisiert:"$'\n'
  for k in "${GONE[@]}"; do body+="  - $(label "$k")"$'\n'; done
  body+=$'\n'"$(summary)"
  if send_mail "Server $HOST: wieder in Ordnung" "$body"; then log "Entwarnung gesendet"; else log "Senden der Entwarnung fehlgeschlagen"; fi
fi
exit 0
