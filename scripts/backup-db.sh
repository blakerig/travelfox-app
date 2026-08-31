#!/usr/bin/env bash
#
# backup-db.sh — dump the Travelfox Postgres database (running in Docker)
# to a timestamped file in a local backups directory.
#
# Usage:
#   ./backup-db.sh
#
# Config (override via environment variables if your setup differs):
#   CONTAINER_NAME  - name of the running Postgres container (default: travel-app-db)
#   BACKUP_DIR      - where dump files are written (default: ../backups relative to this script)
#   KEEP            - how many recent backups to keep; older ones are deleted (default: 20, set 0 to disable)
#
# The script auto-detects the Postgres user/database from the container's
# own environment (POSTGRES_USER / POSTGRES_DB), so it doesn't need your
# DATABASE_URL or a password — pg_dump runs *inside* the container via
# `docker exec`, using the container's local trust auth.
#
# Output format is pg_dump's custom format (-Fc): compressed, and restorable
# with restore-db.sh (which uses pg_restore).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CONTAINER_NAME="${CONTAINER_NAME:-travel-app-db}"
BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/../backups}"
KEEP="${KEEP:-20}"

# --- sanity checks -----------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Error: container '$CONTAINER_NAME' does not exist. Is Docker running and the container created?" >&2
  exit 1
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]; then
  echo "Error: container '$CONTAINER_NAME' exists but is not running. Start it first (e.g. 'docker start $CONTAINER_NAME')." >&2
  exit 1
fi

# Auto-detect the Postgres user/db from the container's own env, falling
# back to sensible defaults if they're not set there.
POSTGRES_USER="$(docker exec "$CONTAINER_NAME" printenv POSTGRES_USER 2>/dev/null || true)"
POSTGRES_DB="$(docker exec "$CONTAINER_NAME" printenv POSTGRES_DB 2>/dev/null || true)"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.dump"

echo "Backing up database '$POSTGRES_DB' (user '$POSTGRES_USER') from container '$CONTAINER_NAME'..."

if docker exec -t "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$OUT_FILE"; then
  SIZE="$(du -h "$OUT_FILE" | cut -f1)"
  echo "Backup written: $OUT_FILE ($SIZE)"
else
  echo "Backup failed — removing incomplete file." >&2
  rm -f "$OUT_FILE"
  exit 1
fi

# --- retention: keep only the most recent $KEEP backups -----------------

if [ "$KEEP" -gt 0 ]; then
  mapfile -t OLD_BACKUPS < <(ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | tail -n +$((KEEP + 1)))
  if [ "${#OLD_BACKUPS[@]}" -gt 0 ]; then
    echo "Pruning ${#OLD_BACKUPS[@]} old backup(s) beyond the most recent $KEEP:"
    for f in "${OLD_BACKUPS[@]}"; do
      echo "  removing $f"
      rm -f "$f"
    done
  fi
fi
