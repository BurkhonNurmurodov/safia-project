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
# THREE WAYS TO RESTART, picked automatically:
#   the in-process supervisor (backend/app/supervisor.py, from 2026-10-18 —
#     CLAUDE.md «Zero-downtime on ONE port»): under systemd the unit's main
#     process is a small supervisor holding port 8030 and the app is its child
#     worker. A deploy is `kill -HUP <MainPID>` — the same user, no sudo: the
#     supervisor starts a worker on the new code and swaps once it is READY,
#     the old worker serving meanwhile; a worker that never gets ready is
#     dropped and the old one keeps serving. Needs nothing from root.
#   blue-green (once deploy/03-bluegreen-setup.sh has been run as root): the
#     app runs as safia-production@8030 / @8031. A restart STARTS the idle copy,
#     waits for its /health, and only then stops the old one — nginx sends
#     traffic to whichever answers, so users see no gap. A new copy that never
#     gets healthy is stopped and the old one, never touched, keeps serving.
#   single copy (neither of the above): `systemctl restart safia-production`,
#     which leaves nothing answering while the app boots. Still used for the
#     first deploy that introduces the supervisor and whenever the
#     supervisor's OWN file changes — a running supervisor cannot swap itself.
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
BG_UNIT=/etc/systemd/system/safia-production@.service
BG_PORTS="8030 8031"
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

# Blue-green when its unit is installed AND sudo lets us drive it; else the
# single-copy restart. Probing the exact argv the sudoers file grants.
BG=0
ACTIVE_PORT=""
if [ -f "$BG_UNIT" ]; then
  bg_probe=$(sudo -n systemctl is-active safia-production@8030 2>&1 || true)
  case "$bg_probe" in
    *"password is required"*|*"not allowed"*|*"may not run"*)
      info "WARNING: $BG_UNIT exists but sudo cannot drive it — using the single-copy restart" ;;
    *) BG=1 ;;
  esac
fi
if [ "$BG" = "1" ]; then
  for p in $BG_PORTS; do
    if systemctl is-active --quiet "safia-production@$p"; then ACTIVE_PORT=$p; break; fi
  done
  info "blue-green: live copy on port ${ACTIVE_PORT:-none}"
  [ -n "$ACTIVE_PORT" ] && HEALTH_URL="http://127.0.0.1:$ACTIVE_PORT/health"
fi

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
# The supervisor swaps WORKERS; its own code only lands on a real restart.
NEED_FULL_RESTART=0
if matches '^backend/app/supervisor\.py$'; then NEED_FULL_RESTART=1; fi

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

# ------------------------------------------------------------- supervisor
# The in-process supervisor (see the header): is the unit's main process it,
# and what does its status file say? Same user as the service, so /proc and
# the status file are readable and SIGHUP needs no sudo.
SUP_STATUS="$APP_DIR/backend/data/supervisor/status.json"
NEW12=${NEW:0:12}    # the supervisor records a worker's commit as 12 characters
PREV12=${PREV:0:12}
sup_pid() { systemctl show -p MainPID --value "$SVC" 2>/dev/null || true; }
sup_live() {  # 0 when the unit's main process is the supervisor
  local pid; pid=$(sup_pid)
  [ -n "$pid" ] && [ "$pid" != "0" ] && tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null | grep -q 'app\.supervisor'
}
sup_field() {  # a dotted field of status.json, printed as JSON ("ready", 7, null)
  "$APP_DIR/backend/.venv/bin/python" - "$SUP_STATUS" "$1" <<'PYEOF' 2>/dev/null || echo null
import json, sys
try:
    cur = json.load(open(sys.argv[1]))
    for part in sys.argv[2].split("."):
        cur = cur.get(part) if isinstance(cur, dict) else None
    print(json.dumps(cur))
except Exception:
    print("null")
PYEOF
}
sup_text() {  # a dotted field as plain text, for a message
  local v; v=$(sup_field "$1"); v=${v#\"}; v=${v%\"}; printf '%s' "$v"
}
# ONE read of the status file into S_* (raw values, "null" for none), so the
# fields compared together come from the same moment.
sup_snap() {
  local v
  v=$("$APP_DIR/backend/.venv/bin/python" - "$SUP_STATUS" <<'PYEOF' 2>/dev/null || true
import json, sys
FIELDS = ("state", "worker.gen", "worker.commit", "worker.pid", "booting.gen",
          "booting.commit", "booting.pid", "booting.reason", "last_swap.requested_at",
          "last_swap.gen", "last_swap.ok")
try:
    doc = json.load(open(sys.argv[1]))
except Exception:
    doc = None
out = []
for path in FIELDS:
    cur = doc
    for part in path.split("."):
        cur = cur.get(part) if isinstance(cur, dict) else None
    if cur is None or cur == "":
        out.append("null")
    else:
        out.append((cur if isinstance(cur, str) else json.dumps(cur)).replace(" ", "_"))
print(" ".join(out))
PYEOF
)
  read -r S_STATE S_WGEN S_WCOMMIT S_WPID S_BGEN S_BCOMMIT S_BPID S_BREASON \
          S_SWAP_AT S_SWAP_GEN S_SWAP_OK <<<"$v" || true
  : "${S_STATE:=null}" "${S_WGEN:=null}" "${S_WCOMMIT:=null}" "${S_WPID:=null}" \
    "${S_BGEN:=null}" "${S_BCOMMIT:=null}" "${S_BPID:=null}" "${S_BREASON:=null}" \
    "${S_SWAP_AT:=null}" "${S_SWAP_GEN:=null}" "${S_SWAP_OK:=null}"
}
is_worker_proc() {  # 0 when PID is a live supervisor WORKER (never the supervisor)
  [ -n "$1" ] && [ "$1" != "null" ] && tr '\0' ' ' <"/proc/$1/cmdline" 2>/dev/null | grep -q 'app\.supervisor --worker'
}
# SIGKILL the worker that is BOOTING — never the one serving. Both pids are
# re-read right before the kill (a boot that turned ready meanwhile is the
# serving worker now), and the pid must be a supervisor worker by its
# cmdline. Waits up to 15 s for the supervisor to reap it. 0 when nothing of
# that boot is left.
kill_booting() {  # why
  local pid i
  sup_snap
  [ "$S_BPID" = "null" ] && return 0
  pid=$S_BPID
  sup_snap
  if [ "$S_BPID" != "$pid" ]; then return 0; fi
  if [ "$S_WPID" = "$pid" ]; then
    info "WARNING: pid $pid is listed as serving AND booting — left alone"; return 1
  fi
  if ! is_worker_proc "$pid"; then
    info "WARNING: booting pid $pid is not a supervisor worker — left alone"; return 1
  fi
  info "ending the unfinished worker gen $S_BGEN (pid $pid, commit ${S_BCOMMIT:0:8}) — $1"
  kill -KILL "$pid" 2>/dev/null || true
  for i in $(seq 1 15); do
    sleep 1
    sup_snap
    if [ "$S_BPID" != "$pid" ]; then return 0; fi
  done
  info "WARNING: the supervisor still lists pid $pid as booting after 15s"
  return 1
}

# A boot already in flight — a crash respawn, or a worker an earlier deploy
# gave up on — reads its files from the checkout: moving the checkout under it
# makes a worker built from two commits, and the supervisor drops a HUP while
# a worker boots (swap_busy), so this deploy's swap would never happen. Let it
# finish first. A full restart replaces every worker anyway and does not wait.
if [ "$BG" != "1" ] && [ "$NEED_FULL_RESTART" != "1" ] \
   && { [ "$NEED_RESTART" = "1" ] || [ "$NEED_PIP" = "1" ]; } && sup_live; then
  sup_snap
  if [ "$S_BGEN" != "null" ]; then
    log "Worker gen $S_BGEN ($S_BREASON, commit ${S_BCOMMIT:0:8}) is still booting — waiting for it before the checkout moves"
    for i in $(seq 1 "$HEALTH_TIMEOUT"); do
      sleep 1
      sup_snap
      if [ "$S_BGEN" = "null" ]; then
        info "it settled after ${i}s — state $S_STATE, serving gen $S_WGEN (commit ${S_WCOMMIT:0:8})"
        break
      fi
    done
    [ "$S_BGEN" = "null" ] || die "worker gen $S_BGEN is still booting after ${HEALTH_TIMEOUT}s — nothing was changed; run the deploy again once it settles"
  fi
fi

# -------------------------------------------------------------- apply code
log "Checking out ${NEW:0:8}"
git reset --hard --quiet "$NEW"
git log -1 --format='   %h  %s  (%an, %ar)'

# ------------------------------------------------------------------ deps
if [ "$NEED_PIP" = "1" ]; then
  log "requirements.txt changed — installing backend dependencies"
  "$APP_DIR/backend/.venv/bin/python" -m pip install --quiet --disable-pip-version-check --upgrade pip==26.2.1
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
# (The supervisor's helpers — sup_snap, kill_booting — are defined above the
# checkout, which waits on them.)

# Is the swap THIS deploy asked for done? Sets SWAP_VERDICT to ok, failed
# (with swap_error) or wait, from the S_* snapshot. Success is the worker of
# THAT gen serving, alone, on THIS commit — a gen alone could be a worker that
# started before the checkout moved.
swap_verdict() {
  SWAP_VERDICT=wait
  if [ "$S_STATE" = "ready" ] && [ "$S_WGEN" = "$WANT_GEN" ]; then
    if [ "$S_WCOMMIT" = "$NEW12" ]; then
      SWAP_VERDICT=ok
    elif [ "$S_WCOMMIT" = "null" ]; then
      info "WARNING: the supervisor could not read worker gen $WANT_GEN's commit — accepted on its gen"
      SWAP_VERDICT=ok
    else
      SWAP_VERDICT=failed
      swap_error="worker gen $WANT_GEN reports commit ${S_WCOMMIT:0:8}, not ${NEW:0:8}"
    fi
  elif [ "$S_BGEN" != "$WANT_GEN" ] && [ "$S_WGEN" != "$WANT_GEN" ]; then
    SWAP_VERDICT=failed
    if [ "$S_SWAP_GEN" = "$WANT_GEN" ] && [ "$S_SWAP_OK" = "false" ]; then
      swap_error=$(sup_text last_swap.error)
    else
      swap_error="worker gen $WANT_GEN is gone"
    fi
  elif ! systemctl is-active --quiet "$SVC"; then
    SWAP_VERDICT=failed
    swap_error="the unit is not active"
  fi
}

# After a rollback: get the worker serving onto PREV. A boot started before
# the checkout moved back is ended (a mix of both commits); with nothing on
# PREV serving and nothing booting, ONE HUP asks for a worker on PREV.
# Returns 0 once the worker serving, alone, is on PREV; SETTLE_HOW says how.
settle_on_prev() {
  local i asked=0 kills=0
  SETTLE_HOW=""
  for i in $(seq 1 "$HEALTH_TIMEOUT"); do
    sup_snap
    if [ "$S_STATE" = "ready" ] && [ "$S_WCOMMIT" = "$PREV12" ]; then
      if [ "$asked" = "0" ] && [ "$i" = "1" ]; then SETTLE_HOW=stayed; else SETTLE_HOW="after ${i}s"; fi
      return 0
    fi
    if [ "$S_BGEN" != "null" ] && [ "$S_BCOMMIT" != "null" ] && [ "$S_BCOMMIT" != "$PREV12" ]; then
      kills=$((kills + 1))
      [ "$kills" -le 2 ] || return 1
      kill_booting "it started before the checkout moved back to ${PREV:0:8}" || return 1
      continue
    fi
    if [ "$S_BGEN" = "null" ] && [ "$asked" = "0" ] \
       && { [ "$S_WGEN" = "null" ] || { [ "$S_WCOMMIT" != "null" ] && [ "$S_WCOMMIT" != "$PREV12" ]; }; }; then
      if [ "$S_WGEN" = "null" ]; then
        info "no worker is serving — asking the supervisor for one on ${PREV:0:8}"
      else
        info "worker gen $S_WGEN serving is on ${S_WCOMMIT:0:8}, not ${PREV:0:8} — asking the supervisor for a worker on ${PREV:0:8}"
      fi
      kill -HUP "$SUP_PID" 2>/dev/null || true
      asked=1
    fi
    sleep 1
  done
  return 1
}

wait_healthy() {  # url, unit — 0 when /health answers, 1 on timeout or a dead unit
  local url=$1 unit=$2 i
  for i in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -sf -m 3 "$url" >/dev/null 2>&1; then info "healthy after ${i}s"; return 0; fi
    # No sudo here: querying unit state needs no privilege (see below).
    if ! systemctl is-active --quiet "$unit"; then info "$unit is not active — aborting the wait"; return 1; fi
    sleep 1
  done
  return 1
}

if [ "$NEED_RESTART" = "1" ] && [ "$BG" = "1" ]; then
  [ "$SUDO_OK" = "1" ] || die "$SUDO_HINT"
  NEW_PORT=8030
  [ "$ACTIVE_PORT" = "8030" ] && NEW_PORT=8031
  NEW_UNIT="safia-production@$NEW_PORT"
  log "Blue-green: starting the new copy on $NEW_PORT (old copy: ${ACTIVE_PORT:-none}, still serving)"
  # A leftover from an aborted deploy would be running OLD code — start fresh.
  if systemctl is-active --quiet "$NEW_UNIT"; then sudo -n systemctl stop "$NEW_UNIT"; fi
  sudo -n systemctl start "$NEW_UNIT"
  if wait_healthy "http://127.0.0.1:$NEW_PORT/health" "$NEW_UNIT"; then
    sudo -n systemctl enable "$NEW_UNIT" >/dev/null 2>&1 || info "WARNING: could not enable $NEW_UNIT for boot"
    if [ -n "$ACTIVE_PORT" ]; then
      log "Stopping the old copy on $ACTIVE_PORT (it finishes its open requests first)"
      sudo -n systemctl stop "safia-production@$ACTIVE_PORT" || info "WARNING: stopping the old copy failed"
      sudo -n systemctl disable "safia-production@$ACTIVE_PORT" >/dev/null 2>&1 || true
    fi
    log "Deployed ${NEW:0:8} — live on port $NEW_PORT, no downtime"
    exit 0
  fi
  printf '\n\033[1;31m✗ the new copy never got healthy — stopping it; the old copy keeps serving\033[0m\n' >&2
  journalctl -u "$NEW_UNIT" -n 40 --no-pager 2>/dev/null || true
  sudo -n systemctl stop "$NEW_UNIT" || true
  git reset --hard --quiet "$PREV"
  if [ "$NEED_BUILD" = "1" ]; then
    ( cd "$APP_DIR/frontend" && npm run build --silent ) || true
  fi
  if [ -z "$ACTIVE_PORT" ]; then
    # Nothing was running before either: bring the previous commit up.
    sudo -n systemctl start "$NEW_UNIT" || true
    wait_healthy "http://127.0.0.1:$NEW_PORT/health" "$NEW_UNIT" || true
  fi
  die "deploy of ${NEW:0:8} failed; production is still on ${PREV:0:8}"
elif [ "$NEED_RESTART" = "1" ] && [ "$NEED_FULL_RESTART" != "1" ] && sup_live; then
  SUP_PID=$(sup_pid)
  sup_snap
  GEN_BEFORE=$S_WGEN
  SWAP_BEFORE=$S_SWAP_AT
  if [ "$GEN_BEFORE" = "null" ]; then
    log "Supervisor (pid $SUP_PID) holds port 8030 — asking for a worker on ${NEW:0:8}; no worker is serving right now (the supervisor answers meanwhile)"
  else
    log "Supervisor (pid $SUP_PID) holds port 8030 — swapping in a worker on ${NEW:0:8}; worker gen $GEN_BEFORE keeps serving meanwhile"
  fi
  kill -HUP "$SUP_PID"
  # The swap THIS deploy asked for: the supervisor writes a new last_swap,
  # with the gen it spawns, the moment it takes the HUP. It DROPS the HUP while
  # a worker boots (swap_busy) — and then the one boot worth waiting for is one
  # already on this commit: a crash respawn after the checkout moved.
  WANT_GEN=null
  ADOPTED=0
  swap_error=""
  for i in $(seq 1 15); do
    sleep 1
    sup_snap
    if [ "$S_SWAP_AT" != "$SWAP_BEFORE" ] && [ "$S_SWAP_GEN" != "null" ]; then
      WANT_GEN=$S_SWAP_GEN
      break
    fi
  done
  if [ "$WANT_GEN" = "null" ]; then
    if [ "$S_BGEN" != "null" ] && [ "$S_BCOMMIT" = "$NEW12" ]; then
      WANT_GEN=$S_BGEN
      ADOPTED=1
      info "the supervisor did not take the HUP — it is already booting worker gen $S_BGEN ($S_BREASON) on ${NEW:0:8}; waiting for that one"
    elif [ "$S_BGEN" = "null" ] && [ "$S_WGEN" != "null" ] && [ "$S_WGEN" != "$GEN_BEFORE" ] \
         && [ "$S_WCOMMIT" = "$NEW12" ]; then
      WANT_GEN=$S_WGEN
      ADOPTED=1
      info "the supervisor did not take the HUP — worker gen $S_WGEN on ${NEW:0:8} took over meanwhile (a crash respawn)"
    elif [ "$S_BGEN" != "null" ]; then
      swap_error="the supervisor did not take the HUP: worker gen $S_BGEN ($S_BREASON, commit ${S_BCOMMIT:0:8}) is booting, not one on ${NEW:0:8}"
    else
      swap_error="the supervisor did not take the HUP"
    fi
  fi
  swapped=0
  if [ -z "$swap_error" ]; then
    SWAP_VERDICT=wait
    for i in $(seq 1 "$HEALTH_TIMEOUT"); do
      swap_verdict
      [ "$SWAP_VERDICT" = "wait" ] || break
      sleep 1
      sup_snap
    done
    # One last look: it may have turned ready in the very last second.
    if [ "$SWAP_VERDICT" = "wait" ]; then
      swap_verdict
      if [ "$SWAP_VERDICT" = "wait" ]; then swap_error="not ready after ${HEALTH_TIMEOUT}s"; fi
    fi
    if [ "$SWAP_VERDICT" = "ok" ]; then
      swapped=1
      if [ "$ADOPTED" = "1" ]; then
        info "worker gen $WANT_GEN on ${NEW:0:8} is serving after ${i}s"
      else
        info "worker gen $WANT_GEN on ${NEW:0:8} is serving after ${i}s — the old one is retiring"
      fi
    fi
  fi
  if [ "$swapped" != "1" ]; then
    printf '\n\033[1;31m✗ the new worker never got ready%s — rolling the checkout back to %s\033[0m\n' \
           "${swap_error:+ ($swap_error)}" "${PREV:0:8}" >&2
    journalctl -u "$SVC" -n 40 --no-pager 2>/dev/null || true
    # End whatever is still booting BEFORE the checkout moves back under it.
    # Left running, it finishes on files from both commits, is swapped in with
    # nobody watching, and makes the supervisor drop the next deploy's HUP.
    kill_booting "this deploy gave up on it" || true
    git reset --hard --quiet "$PREV"
    if [ "$NEED_BUILD" = "1" ]; then
      ( cd "$APP_DIR/frontend" && npm run build --silent ) || true
    fi
    if settle_on_prev; then
      if [ "$SETTLE_HOW" = "stayed" ]; then
        info "the previous worker never stopped serving — production is still on ${PREV:0:8}"
      else
        info "back on ${PREV:0:8} $SETTLE_HOW (worker gen $S_WGEN)"
      fi
      die "deploy of ${NEW:0:8} failed; production is on ${PREV:0:8}"
    fi
    if [ "$S_WGEN" = "null" ]; then
      ON="no worker yet — the supervisor answers «Server yangilanmoqda»"
    else
      ON="worker gen $S_WGEN on ${S_WCOMMIT:0:8}"
    fi
    [ "$S_BGEN" = "null" ] || ON="$ON; worker gen $S_BGEN ($S_BREASON) on ${S_BCOMMIT:0:8} is booting"
    die "deploy of ${NEW:0:8} failed and production is NOT back on ${PREV:0:8}: $ON — check journalctl -u $SVC"
  fi
elif [ "$NEED_RESTART" = "1" ]; then
  [ "$SUDO_OK" = "1" ] || die "$SUDO_HINT"
  if [ "$NEED_FULL_RESTART" = "1" ] && sup_live; then
    log "Restarting $SVC — the supervisor's own code changed (the one deploy that still leaves a gap)"
  else
    log "Restarting $SVC"
  fi
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
  # No sudo here: querying unit state needs no privilege, and the sudoers rule
  # matches argv EXACTLY — `sudo systemctl is-active --quiet safia-production`
  # is a different vector from the `… is-active safia-production` it grants, so
  # sudo would deny it and the denial would read as "the service is dead",
  # rolling back a perfectly healthy deploy.
  if [ "$NEED_RESTART" = "1" ] && ! systemctl is-active --quiet "$SVC"; then
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
  # Blue-green and no restart this time: the backend was not touched, so a
  # restart would not help — the checkout is back, and the failure is reported.
  [ "$BG" = "1" ] && die "service unhealthy at ${PREV:0:8} with the backend untouched — check journalctl"
  sudo -n systemctl restart "$SVC" || true
  for i in $(seq 1 120); do
    curl -sf -m 3 "$HEALTH_URL" >/dev/null 2>&1 && { info "rolled back and healthy"; break; }
    sleep 1
  done
  die "deploy of ${NEW:0:8} failed; production is back on ${PREV:0:8}"
fi

log "Deployed ${NEW:0:8} successfully"
