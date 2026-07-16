#!/usr/bin/env bash
set -euo pipefail
umask 077

STATE_DIR="${ARTICLES_STATE_DIR:-/var/lib/zongrui-articles}"
DATABASE="${ARTICLES_DATABASE_PATH:-${STATE_DIR}/articles.db}"
MEDIA_DIR="${ARTICLES_MEDIA_DIR:-${STATE_DIR}/media}"
STAGING="${ARTICLES_BACKUP_WORK_DIR:-/var/cache/zongrui-articles-backup/staging}"
SNAPSHOT="${STAGING}/articles.db"

install -d -m 0700 "${STAGING}"
if [[ ! -d "${MEDIA_DIR}" ]]; then
  echo "media directory does not exist: ${MEDIA_DIR}" >&2
  exit 1
fi
trap 'rm -f "${SNAPSHOT}"' EXIT

python3 - "${DATABASE}" "${SNAPSHOT}" <<'PY'
import sqlite3
import sys

source_path, destination_path = sys.argv[1:]
source = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True, timeout=30)
destination = sqlite3.connect(destination_path)
try:
    source.backup(destination)
    result = destination.execute("PRAGMA integrity_check").fetchone()
    if result != ("ok",):
        raise SystemExit(f"backup integrity_check failed: {result!r}")
finally:
    destination.close()
    source.close()
PY

restic backup "${SNAPSHOT}" "${MEDIA_DIR}" --tag zongrui-articles
restic forget --tag zongrui-articles --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
