#!/usr/bin/env bash
#
# restore-db.sh — restore the Travelfox Postgres database (running in Docker)
# from a dump file produced by backup-db.sh.
#
# Usage:
#   ./restore-db.sh                     # restores the most recent backup
#   ./restore-db.sh path/to/file.dump   # restores a specific backup
#   ./restore-db.sh -y ...              # skip the confirmation prompt
#
# Config (override via environment variables if your setup differs):
#   CONTAINER_NAME  - name of the running Postgres container (default: travel-app-db)
#   BACKUP_DIR      - where dump files live, used when no file is given (default: ../backups relative to this script)
#
# This is DESTRUCTIVE: it drops and recreates every object in the target
# database before loading the dump (pg_restore --clean --if-exists), so
# anything written since the backup was taken is lost. It asks for
# confirmation unless you pass -y.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CONTAINER_NAME="${CONTAINER_NAME:-travel-app-db}"
BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/../backups}"

SKIP_CONFIRM=0
if [ "${1:-}" = "-y" ]; then
  SKIP_CONFIRM=1
  shift
fi

BACKUP_FILE="${1:-}"

# --- sanity checks -----------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" >/dev/null 2>&1 \
   || [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]; then
  echo "Error: container '$CONTAINER_NAME' is not running. Start it first (e.g. 'docker start $CONTAINER_NAME')." >&2
  exit 1
fi

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE="$(ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | head -n 1 || true)"
  if [ -z "$BACKUP_FILE" ]; then
    echo "Error: no backup file given and none found in $BACKUP_DIR." >&2
    echo "Usage: $0 [-y] [path/to/backup.dump]" >&2
    exit 1
  fi
  echo "No file given — using most recent backup: $BACKUP_FILE"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

# Auto-detect the Postgres user/db from the container's own env, same as backup-db.sh.
POSTGRES_USER="$(docker exec "$CONTAINER_NAME" printenv POSTGRES_USER 2>/dev/null || true)"
POSTGRES_DB="$(docker exec "$CONTAINER_NAME" printenv POSTGRES_DB 2>/dev/null || true)"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"

echo "This will DROP and REPLACE all data in database '$POSTGRES_DB' (container '$CONTAINER_NAME')"
echo "with the contents of: $BACKUP_FILE"

if [ "$SKIP_CONFIRM" -ne 1 ]; then
  read -r -p "Type 'yes' to continue: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted — no changes made."
    exit 1
  fi
fi

echo "Restoring..."
if docker exec -i "$CONTAINER_NAME" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$BACKUP_FILE"; then
  echo "Restore complete from: $BACKUP_FILE"
else
  echo "pg_restore reported errors above — some of these (e.g. 'role does not exist' for --no-owner cases) are often harmless, but review the output carefully." >&2
  exit 1
fi
