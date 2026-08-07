#!/usr/bin/env bash
# ============================================================================
# Safia Production — continuous deployment.
#
# Invoked by .gitea/workflows/deploy.yaml on every push to main, and safe to
# run by hand:   bash /var/www/production/deploy/deploy.sh
#
# Fast-forwards /var/www/production to origin/main and does the MINIMUM work
# each change actually needs:
#
#   backend/**, bot/**, the unit file  -> restart (nothing takes effect otherwise)
#   requirements.txt                   -> pip install, then restart
#   frontend sources without a rebuilt
#     frontend/dist in the same commit -> npm build (dist is tracked, so a commit
#                                         that already carries the build skips it)
#   frontend/dist only                 -> nothing: main.py's serve_spa reads the
#                                         file per request and index.html is
#                                         no-store, so the UI swaps with no restart
#
# On an unhealthy service it rolls the checkout back to the previous commit,
# rebuilds if it had built, restarts, and exits non-zero.
#
# Needs, on the deploy host:
#   - passwordless sudo for exactly `systemctl restart|is-active safia-production`
#     (see deploy/safia-production-deploy.sudoers)
#   - a way to read the private repo. The VPS uses a read-only Gitea deploy key
#     (~/.ssh/safia_production_deploy, wired in via the checkout's
#     core.sshCommand), so no token is needed and CI carries no secrets. The
#     $GIT_ACCESS_TOKEN path below is the fallback for an HTTPS remote.
# ============================================================================
set -euo pipefail

APP_DIR=${APP_DIR:-/var/www/production}
SVC=${SVC:-safia-production}
BRANCH=${BRANCH:-main}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8030/health}
# Startup replays ~65 idempotent migrations/seeds against a 51 MB database
# before the first request is served; the unit allows 300 s for it.
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
FORCE_RESTART=${FORCE_RESTART:-0}

log()  { printf '\n\033[1;33m→ %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Serialise: the Gitea runner has capacity 1 today, but a manual run must never
# race a pipeline run through a git reset.
exec 9>/tmp/safia-production-deploy.lock
flock -w 300 9 || die "another deploy is holding the lock"

cd "$APP_DIR" || die "$APP_DIR does not exist"
[ -d .git ] || die "$APP_DIR is not a git checkout"

# --------------------------------------------------------------- preflight
command -v git >/dev/null || die "git not found"

# Distinguish "sudo refused us" from "the service is merely stopped": the
# sudoers rule grants `systemctl is-active` but NOT `true`, so probing with
# `sudo -n true` would report a false negative on a correct install. Only the
# sudo-level complaint on stderr is fatal.
SUDO_OK=1
sudo_probe=$(sudo -n systemctl is-active "$SVC" 2>&1 || true)
case "$sudo_probe" in
  *"password is required"*|*"not allowed"*|*"may not run"*) SUDO_OK=0 ;;
esac
SUDO_HINT="passwordless sudo for systemctl is not configured, so this deploy cannot
   restart the service. Install it once, as root:
     sudo install -m 440 -o root -g root \\
       $APP_DIR/deploy/safia-production-deploy.sudoers \\
       /etc/sudoers.d/safia-production-deploy"
# Not fatal here on purpose: a docs- or CI-only commit deploys fine without it.
# It becomes fatal below, at the point a restart is actually required.
[ "$SUDO_OK" = "1" ] || info "WARNING: $SUDO_HINT"

# ------------------------------------------------------------------- fetch
PREV=$(git rev-parse HEAD)
log "Fetching origin/$BRANCH (currently at ${PREV:0:8})"
if [ -n "${GIT_ACCESS_TOKEN:-}" ]; then
  # Token via the environment, never argv — it stays out of `ps` and out of
  # .git/config.
  git -c credential.helper='!f(){ echo username=oauth2; echo password="$GIT_ACCESS_TOKEN"; }; f' \
      fetch --prune --quiet origin "$BRANCH"
else
  git fetch --prune --quiet origin "$BRANCH"
fi
NEW=$(git rev-parse "origin/$BRANCH")

if [ "$PREV" = "$NEW" ] && [ "$FORCE_RESTART" != "1" ]; then
  log "Already at ${NEW:0:8} — nothing to deploy"
  exit 0
fi

# Local edits on a deploy target are always a mistake, but never silently
# discard them: park the content in a dangling commit that git fsck can find.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  STASH=$(git stash create "pre-deploy local changes $(date -Is)" || true)
  [ -n "$STASH" ] && info "WARNING: local changes overwritten; recover with: git show $STASH"
fi

CHANGED=$(git diff --name-only "$PREV" "$NEW" 2>/dev/null || echo "")
info "$(printf '%s' "$CHANGED" | grep -c . || true) files changed ${PREV:0:8}..${NEW:0:8}"

matches() { printf '%s\n' "$CHANGED" | grep -qE "$1"; }

# if/then rather than `matches … && VAR=1`: under `set -e` a trailing failed
# && list is a foot-gun, and a deploy that aborts silently is worse than one
# that does too much.
NEED_PIP=0
if matches '^backend/requirements\.txt$'; then NEED_PIP=1; fi
NEED_NPM=0
if matches '^frontend/package(-lock)?\.json$'; then NEED_NPM=1; fi
NEED_RESTART=$FORCE_RESTART
if matches '^(backend|bot)/'; then NEED_RESTART=1; fi
if matches '^deploy/safia-production\.service$'; then NEED_RESTART=1; fi

# Rebuild only when the sources moved and the committed build did NOT follow
# them — a commit that already carries a fresh frontend/dist needs no build.
NEED_BUILD=0
if matches '^frontend/(src/|public/|index\.html|vite\.config\.js|tailwind\.config\.js|package(-lock)?\.json)' \
   && ! matches '^frontend/dist/'; then
  NEED_BUILD=1
fi
# A build that never ran leaves STATIC_DIR unresolved at import: main.py picks
# the SPA directory once, at startup, so an absent dist means a frontend-less app.
[ -d "$APP_DIR/frontend/dist/assets" ] || { NEED_BUILD=1; NEED_RESTART=1; }

# -------------------------------------------------------------- apply code
log "Checking out ${NEW:0:8}"
git reset --hard --quiet "$NEW"
git log -1 --format='   %h  %s  (%an, %ar)'

# ------------------------------------------------------------------ deps
if [ "$NEED_PIP" = "1" ]; then
  log "requirements.txt changed — installing backend dependencies"
  "$APP_DIR/backend/.venv/bin/pip" install --quiet --disable-pip-version-check \
      -r "$APP_DIR/backend/requirements.txt"
  NEED_RESTART=1
  info "done"
fi

# --------------------------------------------------------------- frontend
if [ "$NEED_BUILD" = "1" ]; then
  log "Frontend sources changed without a committed build — building"
  cd "$APP_DIR/frontend"
  if [ "$NEED_NPM" = "1" ] || [ ! -d node_modules ]; then
    info "npm ci"
    npm ci --no-audit --no-fund --silent
  fi
  info "vite build"
  npm run build --silent
  cd "$APP_DIR"
  info "built $(find frontend/dist -type f | wc -l) files"
else
  info "frontend: using the committed build (no rebuild needed)"
fi

# ---------------------------------------------------------------- restart
if [ "$NEED_RESTART" = "1" ]; then
  [ "$SUDO_OK" = "1" ] || die "$SUDO_HINT"
  log "Restarting $SVC"
  sudo -n systemctl restart "$SVC"
else
  log "Backend untouched — no restart (the SPA is served from disk per request)"
fi

# ----------------------------------------------------------- health check
log "Waiting for $HEALTH_URL"
healthy=0
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -sf -m 3 "$HEALTH_URL" >/dev/null 2>&1; then
    info "healthy after ${i}s"; healthy=1; break
  fi
  if [ "$NEED_RESTART" = "1" ] && ! sudo -n systemctl is-active --quiet "$SVC"; then
    info "service is not active — aborting the wait"; break
  fi
  sleep 1
done

if [ "$healthy" != "1" ]; then
  printf '\n\033[1;31m✗ unhealthy after %ss — rolling back to %s\033[0m\n' \
         "$HEALTH_TIMEOUT" "${PREV:0:8}" >&2
  journalctl -u "$SVC" -n 40 --no-pager 2>/dev/null || true

  git reset --hard --quiet "$PREV"
  if [ "$NEED_BUILD" = "1" ]; then
    ( cd "$APP_DIR/frontend" && npm run build --silent ) || true
  fi
  sudo -n systemctl restart "$SVC" || true
  for i in $(seq 1 120); do
    curl -sf -m 3 "$HEALTH_URL" >/dev/null 2>&1 && { info "rolled back and healthy"; break; }
    sleep 1
  done
  die "deploy of ${NEW:0:8} failed; production is back on ${PREV:0:8}"
fi

log "Deployed ${NEW:0:8} successfully"
