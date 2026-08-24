#!/usr/bin/env bash
#
# Make a Claude Code CLOUD session run the Safia stack exactly as a laptop does:
# postgres up with the schema built, deps installed, backend on :8000, vite on
# :5173, the DEV_AUTH login working, headless Chrome for the driver's shots.
#
# A cloud session gets ONLY what the repo carries — no backend/.env, no
# .claude/launch.json, no venv, no node_modules, no Homebrew postgres — so
# everything the laptop keeps outside git has to be rebuilt here, from scratch,
# by a script that is itself in git.
#
# ONE script, two callers, because the cloud has two very different moments:
#
#   provision  ← the environment's «Setup script» field, run ONCE per
#                environment before Claude Code launches. Anthropic snapshots
#                the filesystem afterwards, so everything installed here (venv,
#                node_modules, Chrome, and the postgres data directory WITH the
#                schema already built) is free in every later session.
#   (no args)  ← the repo's .claude/settings.json SessionStart hook, run on
#                EVERY session. It starts what a filesystem snapshot cannot
#                keep — processes — and tops the deps up if a manifest moved.
#
# It is a NO-OP outside a cloud session unless called with `provision`, so
# committing the hook cannot touch a laptop: the guard is CLAUDE_CODE_REMOTE,
# which the session VM sets to "true" and nothing local ever does.
#
# NEVER `set -e` here. A non-zero exit from the Setup script fails the whole
# session before Claude starts, and a hook that dies takes the session's start
# with it — on a platform where the operator has no shell to fix it from.

set -uo pipefail

MODE="${1:-session}"

# /opt, not the repo: the repo is re-cloned per session, /opt is what the
# snapshot keeps. 0777 because provision runs as root and the session does not.
CACHE=/opt/safia
VENV="$CACHE/venv"
NPMDIR="$CACHE/npm"
CHROMEDIR="$CACHE/chrome"
CHROMELINK="$CACHE/chrome-headless-shell"   # stable path; driver.mjs looks here
LOGDIR=/tmp/safia-cloud

PGDB=zagruzka_db
PGUSER=safia
PGPASS=safia
API_PORT=8000
WEB_PORT=5173

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '[safia-cloud] %s\n' "$*"; }

# Cloud sessions are single-tenant VMs: provision is root, the session is not.
run_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo -n "$@" 2>/dev/null || "$@"; fi; }
run_pg()   { if [ "$(id -u)" = 0 ]; then su -s /bin/sh postgres -c "$1"; else sudo -n -u postgres sh -c "$1"; fi; }
listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

if [ "$MODE" != "provision" ] \
   && [ "${SAFIA_CLOUD_FORCE:-}" != "1" ] \
   && [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if [ ! -f "$REPO/backend/requirements.txt" ]; then
  log "no repo at $REPO — nothing to provision"
  exit 0
fi

mkdir -p "$LOGDIR"
run_root mkdir -p "$CACHE" && run_root chmod 0777 "$CACHE"

# ---------------------------------------------------------------- postgres ---
# Pre-installed on the VM (PostgreSQL 16) but never running: the snapshot keeps
# the data directory, not the daemon, so this runs in BOTH modes.
ensure_pg() {
  if ! pg_isready -q 2>/dev/null; then
    run_root service postgresql start >/dev/null 2>&1 \
      || run_root pg_ctlcluster 16 main start >/dev/null 2>&1 \
      || run_root pg_createcluster 16 main --start >/dev/null 2>&1
    for _ in $(seq 1 30); do pg_isready -q 2>/dev/null && break; sleep 0.5; done
  fi
  pg_isready -q 2>/dev/null || { log "postgres would not start — see $LOGDIR"; return 1; }

  # A password-authenticated role, not a peer/OS one: provision and the session
  # run as different users, and one DATABASE_URL has to work for both.
  if ! run_pg "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$PGUSER'\"" 2>/dev/null | grep -q 1; then
    run_pg "psql -c \"CREATE ROLE $PGUSER LOGIN SUPERUSER PASSWORD '$PGPASS'\"" >/dev/null 2>&1
  fi
  if ! run_pg "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$PGDB'\"" 2>/dev/null | grep -q 1; then
    run_pg "createdb -O $PGUSER $PGDB" >/dev/null 2>&1
  fi
  log "postgres ready ($PGDB)"
}

# ------------------------------------------------------------------ python ---
# Ubuntu 24.04 marks its python externally-managed, so a venv is the only clean
# route. Keyed on the requirements hash: a snapshot that predates a dependency
# bump must top itself up, and one that doesn't must cost nothing.
ensure_python() {
  if [ ! -x "$VENV/bin/python" ]; then
    python3 -m venv "$VENV" >/dev/null 2>&1 || uv venv "$VENV" >/dev/null 2>&1
  fi
  [ -x "$VENV/bin/pip" ] || { log "no venv at $VENV"; return 1; }

  local want have
  want="$(sha1sum "$REPO/backend/requirements.txt" | cut -d' ' -f1)"
  have="$(cat "$CACHE/requirements.sha1" 2>/dev/null || true)"
  if [ "$want" != "$have" ]; then
    log "installing backend deps"
    "$VENV/bin/pip" install -q --upgrade pip >/dev/null 2>&1
    if "$VENV/bin/pip" install -q -r "$REPO/backend/requirements.txt"; then
      echo "$want" > "$CACHE/requirements.sha1"
    else
      log "pip install FAILED — see the session log"
      return 1
    fi
  fi
  log "backend deps ready"
}

# -------------------------------------------------------------------- node ---
# node_modules lives OUTSIDE the repo and is symlinked in, because the repo is a
# fresh clone every session while /opt survives in the snapshot. Installing into
# the clone would re-run npm ci on every single session start.
ensure_node() {
  mkdir -p "$NPMDIR"
  cp "$REPO/frontend/package.json" "$NPMDIR/" 2>/dev/null
  cp "$REPO/frontend/package-lock.json" "$NPMDIR/" 2>/dev/null

  local want have
  want="$(sha1sum "$REPO/frontend/package-lock.json" | cut -d' ' -f1)"
  have="$(cat "$CACHE/npm.sha1" 2>/dev/null || true)"
  if [ "$want" != "$have" ] || [ ! -d "$NPMDIR/node_modules" ]; then
    log "installing frontend deps"
    # The lockfile was written on mac arm64; npm picks the linux-x64 optional
    # binaries (esbuild, rolldown) from the same lockfile. If it ever can't,
    # a plain install resolves them rather than leaving the build broken.
    if (cd "$NPMDIR" && npm ci --no-audit --no-fund --silent) \
       || (cd "$NPMDIR" && npm install --no-audit --no-fund --silent); then
      echo "$want" > "$CACHE/npm.sha1"
    else
      log "npm install FAILED — the vite build will not run"
      return 1
    fi
  fi
  [ -e "$REPO/frontend/node_modules" ] || ln -s "$NPMDIR/node_modules" "$REPO/frontend/node_modules"
  log "frontend deps ready"
}

# ------------------------------------------------------------------ chrome ---
# For driver.mjs shots. Installed under /opt with a stable symlink, NOT into
# ~/.cache/puppeteer: provision's HOME is root's and the session's is not, so a
# cached binary under /root would be invisible to the session that needs it.
ensure_chrome() {
  if [ ! -x "$CHROMELINK" ]; then
    npx --yes @puppeteer/browsers install --path "$CHROMEDIR" chrome-headless-shell@stable >/dev/null 2>&1
    local bin
    bin="$(find "$CHROMEDIR" -type f -name chrome-headless-shell -perm -u+x 2>/dev/null | head -1)"
    [ -n "$bin" ] && ln -sf "$bin" "$CHROMELINK"
  fi
  [ -x "$CHROMELINK" ] && log "chrome ready" || log "no chrome — shots unavailable, API + build still fine"
}

# ------------------------------------------------------------------ config ---
# Both files are gitignored and per-machine, which is exactly why the cloud has
# neither. Writing them here is what makes the checkout runnable.
write_conf() {
  if [ ! -f "$REPO/backend/.env" ]; then
    cat > "$REPO/backend/.env" <<'ENV_EOF'
# Written by scripts/cloud-setup.sh for a Claude Code cloud session.
# NOT the laptop's .env and NOT production's: no Gemini key, no Notion token, no
# Google service account, no real bot token. Every one of those features is
# written to disable itself when its key is blank, so the app boots without them.
DEV_AUTH=1
# Seeds the admins table on first boot (startup.seed_admins), which is what the
# __dev__ login resolves to. Without a row there, login answers "not_registered".
ADMIN_TELEGRAM_ID=1
# telebot validates the FORMAT at import, so the shape matters and the value
# does not. No Telegram call can succeed from here anyway.
TELEGRAM_BOT_TOKEN=123456:LOCAL_DEV_DUMMY
DATABASE_URL=postgresql://safia:safia@localhost:5432/zagruzka_db
# WEBAPP_URL is deliberately UNSET: config.is_production is keyed on it, and its
# http://localhost default is what keeps DEV_AUTH legal (assert_secure_config
# refuses to boot with the dev bypass on once that URL looks like production).
ENV_EOF
    log "wrote backend/.env"
  fi

  # The laptop's launch.json names a macOS framework python by absolute path,
  # and it is gitignored, so the cloud needs its own.
  mkdir -p "$REPO/.claude"
  cat > "$REPO/.claude/launch.json" <<LAUNCH_EOF
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "backend",
      "runtimeExecutable": "$VENV/bin/uvicorn",
      "runtimeArgs": ["app.main:app", "--port", "$API_PORT"],
      "cwd": "backend",
      "port": $API_PORT
    },
    {
      "name": "frontend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "frontend",
      "port": $WEB_PORT,
      "autoPort": true
    }
  ]
}
LAUNCH_EOF
}

# ------------------------------------------------------------------- serve ---
# No .env.development.local in a fresh clone ⇒ no VITE_API_URL ⇒ the UI goes
# through the vite /api proxy, whose target is :8000. So :8000 is the backend
# the UI calls, and the one driver.mjs will talk to. Don't split them.
start_stack() {
  if ! listening "$API_PORT"; then
    ( cd "$REPO/backend" && setsid nohup "$VENV/bin/uvicorn" app.main:app \
        --host 127.0.0.1 --port "$API_PORT" >"$LOGDIR/backend.log" 2>&1 & )
    log "backend starting on :$API_PORT ($LOGDIR/backend.log)"
  fi
  if ! listening "$WEB_PORT"; then
    ( cd "$REPO/frontend" && setsid nohup npm run dev \
        >"$LOGDIR/frontend.log" 2>&1 & )
    log "vite starting on :$WEB_PORT ($LOGDIR/frontend.log)"
  fi
}

# The first boot runs create_all plus every startup migration. Waiting for it in
# PROVISION is the point: the schema then lands in the snapshot, so later
# sessions open a database that is already built.
wait_for_api() {
  for _ in $(seq 1 "${1:-90}"); do
    listening "$API_PORT" && curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 && {
      log "backend healthy"; return 0; }
    sleep 1
  done
  log "backend not healthy yet — tail $LOGDIR/backend.log"
  return 1
}

ensure_pg
ensure_python
ensure_node
ensure_chrome
write_conf

if [ "$MODE" = "provision" ]; then
  # Build the schema into the snapshot, then stop: a snapshot keeps files, and
  # a process left running here would not survive it anyway.
  start_stack
  wait_for_api 120
  log "provisioned"
else
  start_stack
  log "session ready — driver.mjs doctor will confirm"
fi

exit 0
