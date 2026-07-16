# Activity wall backend

This is a Python 3.14 standard-library service for the GitHub green wall and
Codex blue wall on `zongrui.org`. It stores two small, validated JSON documents
using `fsync` plus atomic replacement. It has no database or package dependency.

## API

- `GET /health` — liveness response, never cached.
- `GET /api/activity` — `{version, updatedAt, github, codex}`; either activity
  object is `null` until its first sync.
- `GET /api/github` and `GET /api/codex` — the complete stored object or `null`.
- `POST /api/sync/github` and `POST /api/sync/codex` — replace one object. These
  require `Authorization: Bearer …` and `Content-Type: application/json`.

Public activity responses use an ETag and a 60-second browser cache. CORS is
fixed to `https://zongrui.org`; it cannot be widened through an environment
variable. Sync calls without an `Origin` are allowed for cron/GitHub Actions,
while browser calls with any other origin are rejected. Request bodies default
to a 128 KiB limit and have a hard configurable ceiling of 1 MiB.

The POST schemas are the same objects returned by the corresponding GET:

```text
github: {schemaVersion:1, kind:"github", login, totalContributions,
         startedAt, endedAt, weeks:[{firstDay, days:[
         {date,weekday,count,level}]}], updatedAt}

codex:  {schemaVersion:1, kind:"codex", totalTurns, activeDays,
         startedAt, endedAt, days:[{date,count,level}], updatedAt}
```

The server rebuilds every accepted object from its allowed fields and adds a
`receivedAt` timestamp. Unknown fields, duplicate dates, inconsistent totals,
invalid levels, and oversized calendars are rejected rather than stored.

## Run and install

Generate a secret (do not commit it), then test locally:

```bash
export ZONGRUI_ACTIVITY_SYNC_TOKEN="$(openssl rand -hex 32)"
export ZONGRUI_ACTIVITY_DATA_DIR=/tmp/zongrui-activity-data
python3.14 backend/server.py
```

For systemd, deploy this repository to `/opt/zongrui-activity`, then create the
root-owned secret file and install the provided unit:

```bash
sudo install -d -o zongrui -g zongrui /opt/zongrui-activity
sudo sh -c 'umask 077; printf "ZONGRUI_ACTIVITY_SYNC_TOKEN=%s\n" "$(openssl rand -hex 32)" > /etc/zongrui-activity.env'
sudo install -m 0644 backend/systemd/zongrui-activity.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zongrui-activity
curl --fail http://127.0.0.1:18231/health
```

The provided unit binds to loopback by default and is published at
`api.zongrui.org` through Cloudflare Tunnel. When a trusted uploader shares the
server's LAN, install `zongrui-activity-lan.conf.example` as a systemd drop-in
and pair it with a destination-specific UFW allow rule:

```bash
sudo install -d /etc/systemd/system/zongrui-activity.service.d
sudo install -m 0644 backend/systemd/zongrui-activity-lan.conf.example \
  /etc/systemd/system/zongrui-activity.service.d/lan-upload.conf
sudo ufw allow from 192.168.0.109 to 192.168.0.171 \
  port 18231 proto tcp comment 'zongrui codex activity sync'
sudo systemctl daemon-reload
sudo systemctl restart zongrui-activity
```

This keeps public reads on Cloudflare Tunnel while the Windows Codex uploader
uses `http://192.168.0.171:18231`. UFW remains default-deny and no general public
rule is added for the Python port.

## Codex blue-wall sync

The exporter scans `~/.codex/sessions` and `~/.codex/archived_sessions` one
JSONL record at a time. It tracks each `session_meta` source, excludes periods
whose source is `subagent`, deduplicates `user_message` timestamps, and converts
them into the latest 365 UTC+8 calendar days. It never emits message text,
images, tool arguments, responses, or file contents.

```bash
python3.14 scripts/export-codex-activity.py \
  | curl --fail-with-body --silent --show-error \
      -X POST https://api.zongrui.org/api/sync/codex \
      -H 'User-Agent: zongrui-activity-sync/1.0' \
      -H "Authorization: Bearer $ZONGRUI_ACTIVITY_SYNC_TOKEN" \
      -H 'Content-Type: application/json' \
      --data-binary @-
```

The exporter prints only aggregate scan diagnostics to stderr, so stdout is a
clean sync document. The GitHub wall is synced by the repository workflow using
the same bearer secret.

On Windows, `scripts/sync-codex-activity.ps1` wraps the exporter and POST. It can
read the token from `ZONGRUI_ACTIVITY_SYNC_TOKEN`, or from a DPAPI-protected
`token.clixml` stored under the current user's Local AppData. The production
machine registers this wrapper as a six-hour Scheduled Task and passes the LAN
endpoint explicitly, so the server keeps the last good snapshot whenever the PC
is offline. The script's public HTTPS endpoint remains a safe manual fallback.
