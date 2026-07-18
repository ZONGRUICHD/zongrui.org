# ZongRui Articles backend

Independent FastAPI service for `zongrui.org/articles`. It deliberately does
not import, modify, share a port with, or share state with the existing activity
wall service in `../backend`.

## Architecture and safety boundaries

- FastAPI + SQLAlchemy 2 + Alembic, with SQLite WAL and foreign keys enabled.
- Loopback-only by default on `127.0.0.1:18232`.
- Main database: `/var/lib/zongrui-articles/articles.db`.
- Content-addressed WebP media: `/var/lib/zongrui-articles/media`.
- `articles-origin.zongrui.org` is a Cloudflare Tunnel hostname guarded by an
  Access service-token policy and/or the application's optional shared origin
  token. Only the Pages Function should call it.
- `media.zongrui.org` exposes **only** `/media/*` paths matching the content-addressed
  media regex shown below. It must not proxy `/api`, `/health`, or arbitrary
  paths to this process.
- The API never stores raw visitor IP addresses or visitor user agents.
  Comment throttling uses a daily rotating HMAC. Network visitor estimates use
  the separate `ARTICLES_STATISTICS_SECRET`, group IPv6 by `/64`, and use
  different contexts for the site and for every article so records cannot be
  linked across scopes. Only the digests are retained: no per-visitor timestamp
  is stored. They remain until the counters are deliberately reset.
  Obvious bots, prefetches, cross-site POSTs, `DNT: 1`, and `Sec-GPC: 1` are
  ignored.
- Request bodies are bounded before JSON or multipart parsing; comments have a
  dedicated 16 KiB ceiling and image uploads allow only the configured 10 MiB
  payload plus multipart overhead.
- Public rich text is generated from a small TipTap JSON node allowlist and is
  sanitised again with Bleach. Raw HTML is never accepted.

The service supplies no CORS headers because browsers call the same-origin
Pages Function at `/api/articles/*`. Public GET responses are edge-cacheable;
admin, auth, and comment responses are `no-store`.

## API contract

All JSON uses camelCase. The base URL is `/api/articles/v1`.

Public:

- `GET /articles?q=&tag=&archive=&cursor=&limit=` → `{items,nextCursor}`.
- `GET /articles/{slug}` → `{article}`; a historical slug returns a `308` to
  the new API URL.
- `GET /gallery?cursor=&limit=` returns published gallery images in the
  administrator-defined order. Each item includes the immutable WebP URL,
  dimensions, title, caption, alt text, order, and publication timestamp.
- `GET /tags` → `{items:[{name,slug,count}]}`.
- `GET /articles/{slug}/comments?cursor=&limit=` → `{items,nextCursor}`.
- `POST /articles/{slug}/comments` with
  `{nickname,body,parentId?,turnstileToken}` → `{comment}`.
- `GET|POST /stats/site` returns
  `{uniqueVisitors,counted,since}`. GET is read-only; POST records one unique
  site visitor.
- `GET|POST /stats/articles/{slug}` uses the same response shape for the
  article's estimated unique network readers. The article POST also records the
  site visitor. Repeated POSTs from the same purpose-separated network digest
  do not increment. All statistics responses are `no-store`.
- `GET /rss.xml` and `GET /sitemap.xml` return XML.

Authentication:

- `GET /auth/github/login?returnTo=/console...` starts OAuth. Legacy `/articles/console...` return paths remain accepted during migration.
- `GET /auth/github/callback` validates single-use state and the configured
  numeric GitHub user ID plus login.
- `GET /auth/session` → `{authenticated,user?,turnstileSiteKey?}` and rotates
  the readable `zr_articles_csrf` cookie.
- `POST /auth/logout` clears the session.

Admin (session required; every mutation also requires `X-CSRF-Token`):

- `GET|POST /admin/articles`, `GET|PATCH /admin/articles/{id}`.
- `POST /admin/articles/{id}/publish|unpublish|archive` with `{revision}`.
- `POST /admin/articles/{id}/schedule` with `{revision,scheduledAt}`.
- `GET /admin/articles/{id}/revisions` and
  `POST /admin/articles/{id}/revisions/{revision}/restore`.
- `GET|POST /admin/media`, `DELETE /admin/media/{id}`.
- `GET|POST /admin/gallery`, `GET|PATCH|DELETE /admin/gallery/{id}`.
- `POST /admin/gallery/upload` accepts a JPEG, PNG, or WebP plus gallery
  metadata. It runs through the same verified image pipeline as `/admin/media`:
  the original is never kept, metadata is removed, the longest edge is reduced
  to 2000px, and the result is stored as a content-addressed WebP.
- `POST /admin/gallery/reorder` with `{orderedIds:[...]}` moves the supplied
  images to the front in that exact order and normalises all gallery order
  values. `POST /admin/gallery/{id}/publish|archive` controls public visibility.
  Deleting a gallery item leaves its reusable Media object intact; Media
  deletion remains a separate guarded operation and is rejected while the
  image is still used by either an article or the gallery.
- `GET /admin/comments` and
  `POST /admin/comments/{id}/hide|restore|delete`.
- `POST /admin/translate/traditional` with
  `{title,summary,contentJson}` converts Simplified Chinese to Traditional
  Chinese and returns the same shape. It requires an administrator session and
  CSRF token. It does not save or publish anything; the Console applies the
  result through the existing revision-aware article save flow.

Article writes use a required `revision` on PATCH/action calls. A stale value
returns HTTP 409 with `currentRevision`. PATCH accepts `reason` (`manual` or
`autosave`) and `checkpoint`; a normal three-second autosave advances the
optimistic-lock revision without filling history, while `checkpoint: true`
stores the five-minute recovery point. Responses also include an `ETag` such
as `"revision-4"`.

## Local development

Python 3.12 or newer is required (production currently uses Python 3.14).

```bash
cd articles-backend
python3.14 -m venv .venv
.venv/bin/pip install -e '.[test]'
cp .env.example .env
# Set a temporary SQLite URL/media directory and real or development secrets.
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed
.venv/bin/python -m app.server
```

The seed command is idempotent. It creates one **draft** named `关于我` from
facts already present on the homepage: ZongRui, Rust, RoboMaster, Linux, and
the exact `Programming in Ciallo～(∠・ω< )⌒★` line. It never publishes it.

Run verification:

```bash
.venv/bin/pytest
.venv/bin/alembic check
```

`ARTICLES_TURNSTILE_BYPASS=true` exists only for isolated development/tests.
It must be false on the server.

## Server installation

First perform a read-only preflight. Do not stop or reconfigure the activity
wall service:

```bash
python3 --version
systemctl is-active cloudflared
ss -ltn '( sport >= :18232 and sport <= :18239 )'
df -h /var/lib /opt
sudo ufw status numbered
```

Use `18232` when free. Otherwise choose the first free port from `18233` through
`18239` and set it consistently in the service and Tunnel configuration. No UFW
allow rule is needed because the process stays on loopback.

Install into separate runtime and backup identities. The web process belongs to
the read-only data group but never to the backup user's group, so it cannot read
the restic password or R2 credentials:

```bash
sudo groupadd --system zongrui-articles-data
sudo useradd --system --gid zongrui-articles-data --home /nonexistent --shell /usr/sbin/nologin zongrui-articles
sudo useradd --system --user-group --home /nonexistent --shell /usr/sbin/nologin zongrui-articles-backup
sudo usermod --append --groups zongrui-articles-data zongrui-articles-backup
sudo install -d -o root -g root -m 0755 /opt/zongrui-articles
# Copy this directory's contents to /opt/zongrui-articles.
sudo python3.14 -m venv /opt/zongrui-articles/.venv
sudo /opt/zongrui-articles/.venv/bin/pip install --no-cache-dir /opt/zongrui-articles
sudo install -o root -g zongrui-articles-data -m 0640 .env.example /etc/zongrui-articles.env
sudo install -d -o zongrui-articles -g zongrui-articles-data -m 0750 /var/lib/zongrui-articles
sudo chown -R zongrui-articles:zongrui-articles-data /var/lib/zongrui-articles
sudo find /var/lib/zongrui-articles -type d -exec chmod 0750 {} +
sudo find /var/lib/zongrui-articles -type f -exec chmod 0640 {} +
sudo -u zongrui-articles /bin/bash -c \
  'umask 0027; set -a; source /etc/zongrui-articles.env; exec /opt/zongrui-articles/.venv/bin/alembic -c /opt/zongrui-articles/alembic.ini upgrade head'
sudo -u zongrui-articles /bin/bash -c \
  'umask 0027; set -a; source /etc/zongrui-articles.env; exec /opt/zongrui-articles/.venv/bin/python -m app.seed'
sudo install -m 0644 systemd/zongrui-articles*.service systemd/zongrui-articles*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zongrui-articles.service zongrui-articles-scheduler.timer
curl --fail http://127.0.0.1:18232/health
```

Edit `/etc/zongrui-articles.env` rather than using the example unchanged.
Generate separate rate-limit and statistics secrets with `openssl rand -hex 32`.
Set `ARTICLES_STATISTICS_STARTED_AT` to the UTC deployment time. The file must
remain root-owned, group-readable only by `zongrui-articles-data`, and must
never enter Git. Rotating `ARTICLES_STATISTICS_SECRET` makes returning networks
look new; rotate it only while clearing `site_visitors` and `article_readers`
and resetting `ARTICLES_STATISTICS_STARTED_AT` in the same maintenance window.

For Console translation, set `DEEPSEEK_API_KEY` only in
`/etc/zongrui-articles.env`. The browser and Cloudflare Pages must never receive
it. The default API base is `https://api.deepseek.com` and the default model is
`deepseek-v4-flash`; both can be changed with `DEEPSEEK_API_BASE_URL` and
`DEEPSEEK_MODEL`. Requests are split into bounded batches using the serialized
segment JSON (including wrapper and IDs), plus a conservative completion-token
estimate with reserved output headroom. Responses fail closed on a timeout,
incomplete output, changed segment IDs, changed non-Chinese text, a changed Han
character count, or an oversized response. A missing key leaves the rest of
the service healthy and makes only the translation endpoint return HTTP 503.

Create a GitHub OAuth App with this exact callback URL:

```text
https://zongrui.org/api/articles/v1/auth/github/callback
```

In production, when `ARTICLES_ORIGIN_SHARED_SECRET` is set, the backend sends
the short-lived authorization code to the protected Pages relay at
`/api/articles/_oauth/github/exchange`. This avoids depending on the home
server's route to GitHub. The relay returns only the verified GitHub profile;
the GitHub access token remains at the edge. Set
`ARTICLES_GITHUB_EXCHANGE_RELAY_URL` only to override the default same-origin
relay URL for a controlled preview or test. Override URLs are restricted to
the public site, its subdomains, this project's `pages.dev` preview hostnames,
or loopback; non-loopback relays must use HTTPS. Set
`ARTICLES_GITHUB_EXCHANGE_RELAY_ENABLED=false` only as an emergency switch for
an environment with known-good direct GitHub egress.

The example contains the numeric ID `98888228`, verified against GitHub's user
API for `ZONGRUICHD` during implementation. Re-verify it before first deploy;
the numeric ID is the authoritative allowlist because a login can be renamed.
Configure the Turnstile widget for `zongrui.org` and put only its secret in the
server environment. The client and server both use the action marker
`turnstile-spin-v1`; hostname and action must both match before a comment is
accepted.

## Cloudflare Tunnel and Access

Append rules before the existing catch-all, preserving every existing ingress
entry. The media path restriction is a security boundary:

```yaml
ingress:
  - hostname: articles-origin.zongrui.org
    service: http://127.0.0.1:18232
  - hostname: media.zongrui.org
    path: ^/media/[0-9]{4}/[0-9]{2}/[a-f0-9]{64}\.webp$
    service: http://127.0.0.1:18232
  - hostname: media.zongrui.org
    service: http_status:404
  # Existing ingress rules remain below these entries.
```

When Cloudflare Access is available, protect `articles-origin.zongrui.org/*`
with a service-token policy and put its client ID/secret only in Pages secrets.
Access can be enabled later without changing the application.

If Access is unavailable, generate a separate origin secret with
`openssl rand -hex 32`. Put it in `/etc/zongrui-articles.env` as
`ARTICLES_ORIGIN_SHARED_SECRET` and in Pages as `ARTICLES_ORIGIN_SHARED_SECRET`. The
Pages Function sends it as `X-ZR-Origin-Token`; the backend compares it in
constant time and returns 404 for API/auth/admin requests without a match. The
two values must never be committed or printed. Access and this token may also
be used together as defence in depth.

Do not protect `media.zongrui.org`; its random, immutable objects are public.
Both the Tunnel path rule and the application allow only `GET`/`HEAD` under
`/media/*`: other paths return 404 and other methods return 405. This prevents
the media hostname from becoming an alternate route to the API.

## R2/restic disaster recovery

Create a private bucket named `zongrui-articles-backup`, then an R2 token scoped
only to object read/write on that bucket. Install `restic`, copy
`.restic.env.example` to `/etc/zongrui-articles-restic.env`, fill the four
secrets, and apply mode `0640` with group `zongrui-articles-backup`. The web
service user must never be added to that group.

```bash
sudo install -o root -g zongrui-articles-backup -m 0640 \
  .restic.env.example /etc/zongrui-articles-restic.env
sudo install -d -o zongrui-articles-backup -g zongrui-articles-backup -m 0700 \
  /var/cache/zongrui-articles-backup/restic
sudo -u zongrui-articles-backup /bin/bash -c \
  'set -a; source /etc/zongrui-articles-restic.env; export RESTIC_CACHE_DIR=/var/cache/zongrui-articles-backup/restic; exec restic init'
sudo systemctl enable --now zongrui-articles-backup.timer zongrui-articles-restore-check.timer
sudo systemctl start zongrui-articles-backup.service
sudo journalctl -u zongrui-articles-backup.service --since today
sudo -u zongrui-articles-backup /bin/bash -c \
  'set -a; source /etc/zongrui-articles-restic.env; export RESTIC_CACHE_DIR=/var/cache/zongrui-articles-backup/restic; exec restic snapshots --tag zongrui-articles'
```

Run `restic init` exactly once for a new empty repository; on later deployments,
skip that line and verify the existing repository with `restic snapshots`.

The nightly job uses SQLite's online backup API, runs `integrity_check`, backs
up media, then retains 14 daily, 8 weekly, and 12 monthly snapshots. Media
uploads and deletions share `/var/lib/zongrui-articles/.media-backup.lock` with
the snapshot job, so the database and content-addressed files cannot diverge
during a backup. Backup and monthly restore-check jobs also share a restic
operation lock and wait for one another instead of failing on an overlapping
timer. The monthly job restores the newest snapshot into a temporary directory,
verifies the database structure and integrity, and checks every Media row
against the restored file's SHA-256. Test the initial backup before relying on
the timers.

## Rollback

Stop only `zongrui-articles.service` and its timers, switch the Pages deployment
back, and leave `/var/lib/zongrui-articles` untouched. Alembic migrations must
be preceded by the nightly backup (or a manual restic snapshot). Never roll the
activity wall service, its port `18231`, or its state as part of this rollback.
