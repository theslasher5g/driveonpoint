#!/usr/bin/env bash
# Täglicher Aufräumlauf — siehe deploy/cron-aufruf.sh.
exec "$(dirname "$0")/cron-aufruf.sh" aufraeumen
