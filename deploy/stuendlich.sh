#!/usr/bin/env bash
# Stündlicher Lauf: Erinnerungen vor dem Termin, unbestätigte Buchungen
# löschen — siehe deploy/cron-aufruf.sh.
exec "$(dirname "$0")/cron-aufruf.sh" stuendlich
