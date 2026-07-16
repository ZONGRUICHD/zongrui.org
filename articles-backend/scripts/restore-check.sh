#!/usr/bin/env bash
set -euo pipefail
umask 077

CACHE_DIR="${ARTICLES_BACKUP_CACHE_DIR:-/var/cache/zongrui-articles-backup}"
RESTIC_OPERATION_LOCK="${ARTICLES_RESTIC_OPERATION_LOCK:-${CACHE_DIR}/restic-operation.lock}"
exec 9>"${RESTIC_OPERATION_LOCK}"
flock --exclusive --wait 21600 9

WORK_DIR="$(mktemp -d /var/tmp/zongrui-articles-restore.XXXXXX)"
trap 'rm -rf "${WORK_DIR}"' EXIT

restic restore latest --tag zongrui-articles --target "${WORK_DIR}"
DATABASE="${WORK_DIR}/var/cache/zongrui-articles-backup/staging/articles.db"
MEDIA_DIR="${WORK_DIR}/var/lib/zongrui-articles/media"
if [[ ! -f "${DATABASE}" ]]; then
  echo "restored snapshot does not contain the database" >&2
  exit 1
fi

python3 - "${DATABASE}" "${MEDIA_DIR}" <<'PY'
import hashlib
from pathlib import Path
import sqlite3
import sys

database = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
media_root = Path(sys.argv[2]).resolve()
try:
    result = database.execute("PRAGMA integrity_check").fetchone()
    if result != ("ok",):
        raise SystemExit(f"restored database integrity_check failed: {result!r}")
    database.execute("SELECT COUNT(*) FROM articles").fetchone()
    for relative_path, expected_sha256 in database.execute("SELECT path, sha256 FROM media"):
        media_path = (media_root / relative_path).resolve()
        if not media_path.is_relative_to(media_root) or not media_path.is_file():
            raise SystemExit(f"restored media file is missing or unsafe: {relative_path}")
        digest = hashlib.sha256()
        with media_path.open("rb") as media_file:
            for chunk in iter(lambda: media_file.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected_sha256:
            raise SystemExit(f"restored media checksum failed: {relative_path}")
finally:
    database.close()
PY

echo "latest zongrui-articles backup restored and verified"
