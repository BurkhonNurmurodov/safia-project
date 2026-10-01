#!/bin/bash
# ============================================================================
# Safia Production — switch the dashboard to ZERO-DOWNTIME deploys (blue-green).
#
# Run once, as root, on 185.74.5.198:
#
#   sudo bash /var/www/production/deploy/03-bluegreen-setup.sh --check   # changes nothing
#   sudo bash /var/www/production/deploy/03-bluegreen-setup.sh           # do it
#   sudo bash /var/www/production/deploy/03-bluegreen-setup.sh --undo    # put it back
#
# WHY: today every backend deploy restarts the ONE app process
# (safia-production.service, port 8030). Until it has booted again — up to a
# minute or more — nginx has nothing to send requests to and every user gets a
# Cloudflare "502 Bad gateway" page.
#
# WHAT IT CHANGES (all of it reversible with --undo):
#   1. /etc/sudoers.d/safia-production-deploy — lets the deploy user start/stop/
#      enable/disable the two new units (exact commands, nothing else).
#   2. /etc/systemd/system/safia-production@.service — a template for two
#      copies of the same app, on ports 8030 and 8031.
#   3. /etc/nginx/sites-available/production.safiacorporate.uz — both ports in
#      one upstream (a stopped copy is skipped), plus a fallback that serves the
#      app's own page files if neither copy answers.
#   4. Starts the copy on 8031 NEXT TO the running service, waits until it is
#      healthy, then stops and disables the old safia-production.service.
#
# The site stays up the whole time: the old service keeps serving until the
# new copy answers. If anything fails, the script stops and says what it left
# behind; the old service is never stopped before the new copy is healthy.
#
# After this, deploys need no root: deploy/deploy.sh starts the idle copy,
# waits for it, then stops the old one.
#
# Previous files are saved to /root/safia-bluegreen-backup-<timestamp>/.
# ============================================================================
set -euo pipefail

APP_DIR=/var/www/production
DOMAIN=production.safiacorporate.uz
OLD_SVC=safia-production
TEMPLATE=/etc/systemd/system/safia-production@.service
SUDOERS=/etc/sudoers.d/safia-production-deploy
NGINX_SITE=/etc/nginx/sites-available/$DOMAIN
NGINX_LINK=/etc/nginx/sites-enabled/$DOMAIN
MIN_VERSION=4.196.0          # the first version whose background jobs run in one copy only
HEALTH_WAIT=300

MODE=apply
case "${1:-}" in
  ""|--apply) MODE=apply ;;
  --check)    MODE=check ;;
  --undo)     MODE=undo ;;
  *) echo "usage: $0 [--check | --undo]"; exit 2 ;;
esac

log()  { printf '\n\033[1;33m→ %s\033[0m\n' "$*"; }
ok()   { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "must run as root:  sudo bash $0 ${1:-}"

health() {  # port → prints the /health JSON, fails when it does not answer
  curl -sf -m 3 "http://127.0.0.1:$1/health"
}
wait_health() {  # port unit
  local i
  for i in $(seq 1 "$HEALTH_WAIT"); do
    if health "$1" >/dev/null 2>&1; then ok "port $1 answers /health (after ${i}s)"; return 0; fi
    if ! systemctl is-active --quiet "$2"; then warn "$2 stopped while starting"; return 1; fi
    sleep 1
  done
  warn "port $1 did not answer within ${HEALTH_WAIT}s"
  return 1
}
via_nginx() {  # the public path, end to end, without leaving the box
  curl -sk -m 5 -o /dev/null -w '%{http_code}' \
       --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/health" || true
}
port_busy() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }

# Never run beside a deploy: deploy.sh takes the same lock. Opened READ-ONLY,
# never created: the file belongs to the deploy user, and a root-created one in
# /tmp would lock the deploy out (and fs.protected_regular refuses root an
# O_CREAT open of a user's file in /tmp anyway).
LOCK=/tmp/safia-production-deploy.lock
if [[ -e $LOCK ]]; then
  exec 9<"$LOCK"
  log "Waiting for any running deploy to finish"
  flock -w 600 9 || die "a deploy has held the lock for 10 minutes — try again later"
  ok "no deploy running"
fi

# ============================================================================
if [[ $MODE == undo ]]; then
  log "Undo: back to the single safia-production.service"
  [[ -f /etc/systemd/system/$OLD_SVC.service ]] || die "/etc/systemd/system/$OLD_SVC.service is missing — cannot undo"
  live=""
  for p in 8030 8031; do systemctl is-active --quiet "safia-production@$p" && live=$p; done
  if [[ $live == 8030 ]]; then
    # The old service needs port 8030: move the live copy to 8031 first.
    systemctl start safia-production@8031
    wait_health 8031 safia-production@8031 || die "could not move to 8031 — nothing else changed"
    systemctl stop safia-production@8030
    live=8031
  fi
  systemctl start "$OLD_SVC"
  wait_health 8030 "$OLD_SVC" || die "$OLD_SVC did not come up — the copy on ${live:-?} is still serving"
  systemctl enable "$OLD_SVC" >/dev/null 2>&1
  for p in 8030 8031; do
    systemctl stop "safia-production@$p" 2>/dev/null || true
    systemctl disable "safia-production@$p" >/dev/null 2>&1 || true
  done
  ok "$OLD_SVC is serving on 8030; the two copies are stopped and disabled"
  rm -f "$TEMPLATE"
  systemctl daemon-reload
  ok "removed $TEMPLATE"
  backup=$(ls -d /root/safia-bluegreen-backup-* 2>/dev/null | sort | tail -1 || true)
  if [[ -n $backup && -f $backup/nginx-site ]]; then
    cp "$NGINX_SITE" "$NGINX_SITE.bluegreen"
    cp "$backup/nginx-site" "$NGINX_SITE"
    if nginx -t >/dev/null 2>&1; then
      systemctl reload nginx
      ok "nginx restored from $backup"
    else
      cp "$NGINX_SITE.bluegreen" "$NGINX_SITE"
      warn "the saved nginx file did not pass nginx -t — kept the blue-green one (it works with one copy too)"
    fi
  else
    warn "no saved nginx file found — kept the current one (it works with one copy too)"
  fi
  ok "the deploy permissions file stays as it is (it also covers $OLD_SVC)"
  code=$(via_nginx); [[ $code == 200 ]] && ok "https://$DOMAIN/health → 200" || warn "https://$DOMAIN/health → $code"
  log "Undone. Deploys restart $OLD_SVC again (with a short outage each time)."
  exit 0
fi

# ============================================================================
log "Checking that everything is in place"
problems=0
need_file() { [[ -f $1 ]] && ok "$1" || { warn "missing: $1"; problems=$((problems+1)); }; }
need_file "$APP_DIR/deploy/safia-production@.service"
need_file "$APP_DIR/deploy/safia-production-deploy.sudoers"
need_file "$APP_DIR/deploy/$DOMAIN"
need_file "/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
need_file "$NGINX_SITE"
command -v nginx >/dev/null && ok "nginx installed" || { warn "nginx not found"; problems=$((problems+1)); }
command -v ss >/dev/null || { warn "ss not found"; problems=$((problems+1)); }

if [[ -f $TEMPLATE ]] && ! systemctl is-active --quiet "$OLD_SVC"; then
  for p in 8030 8031; do
    systemctl is-active --quiet "safia-production@$p" && die "already done: safia-production@$p is serving. Nothing to do (use --undo to reverse)."
  done
fi

if systemctl is-active --quiet "$OLD_SVC"; then ok "$OLD_SVC is running"
else warn "$OLD_SVC is not running"; problems=$((problems+1)); fi

h=$(health 8030 || true)
if [[ -n $h ]]; then
  ver=$(printf '%s' "$h" | sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p')
  ok "port 8030 answers (version ${ver:-?})"
  if [[ -z $ver ]] || [[ $(printf '%s\n%s\n' "$MIN_VERSION" "$ver" | sort -V | head -1) != "$MIN_VERSION" ]]; then
    warn "the running version must be $MIN_VERSION or newer (it carries the one-copy job lock) — deploy first"
    problems=$((problems+1))
  fi
else
  warn "port 8030 does not answer /health"; problems=$((problems+1))
fi

if port_busy 8031; then warn "port 8031 is already in use by something else"; problems=$((problems+1))
else ok "port 8031 is free"; fi

if visudo -cf "$APP_DIR/deploy/safia-production-deploy.sudoers" >/dev/null 2>&1; then ok "permissions file parses"
else warn "the permissions file does not pass visudo -c"; problems=$((problems+1)); fi

if sudo -u www-data test -r "$APP_DIR/frontend/dist/index.html" 2>/dev/null; then
  ok "nginx (www-data) can read the app's page files — the offline fallback will work"
else
  warn "www-data cannot read $APP_DIR/frontend/dist/index.html — the offline fallback page will not show (deploys still work)"
fi

code=$(via_nginx)
[[ $code == 200 ]] && ok "https://$DOMAIN/health → 200 today" || warn "https://$DOMAIN/health → $code today"

(( problems == 0 )) || die "$problems problem(s) above — nothing was changed"
if [[ $MODE == check ]]; then
  log "All checks passed. Nothing was changed. Run again without --check to apply."
  exit 0
fi

# ============================================================================
BACKUP=/root/safia-bluegreen-backup-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP"
cp "$NGINX_SITE" "$BACKUP/nginx-site"
[[ -f $SUDOERS ]] && cp "$SUDOERS" "$BACKUP/sudoers"
log "Saved the current nginx and permissions files to $BACKUP"

log "1/4  Deploy permissions"
install -m 440 -o root -g root "$APP_DIR/deploy/safia-production-deploy.sudoers" "$SUDOERS"
visudo -c >/dev/null || { [[ -f $BACKUP/sudoers ]] && install -m 440 -o root -g root "$BACKUP/sudoers" "$SUDOERS"; die "visudo -c failed — previous permissions restored"; }
ok "$SUDOERS installed"

log "2/4  The two-copy service template"
install -m 644 -o root -g root "$APP_DIR/deploy/safia-production@.service" "$TEMPLATE"
systemctl daemon-reload
ok "$TEMPLATE installed"

log "3/4  nginx"
install -m 644 -o root -g root "$APP_DIR/deploy/$DOMAIN" "$NGINX_SITE"
[[ -L $NGINX_LINK || -f $NGINX_LINK ]] || ln -sfn "$NGINX_SITE" "$NGINX_LINK"
if ! nginx -t 2>"$BACKUP/nginx-t.log"; then
  cp "$BACKUP/nginx-site" "$NGINX_SITE"
  cat "$BACKUP/nginx-t.log"
  die "nginx -t failed — the previous nginx file is back, nginx was NOT reloaded. Steps 1–2 are installed but inactive."
fi
systemctl reload nginx
sleep 1
code=$(via_nginx)
[[ $code == 200 ]] || die "after the nginx reload https://$DOMAIN/health → $code. Restore with: cp $BACKUP/nginx-site $NGINX_SITE && systemctl reload nginx"
ok "nginx reloaded; the site still answers (still served by $OLD_SVC)"

log "4/4  Start the copy on 8031 beside the running service"
systemctl start safia-production@8031
if ! wait_health 8031 safia-production@8031; then
  journalctl -u safia-production@8031 -n 40 --no-pager || true
  systemctl stop safia-production@8031 || true
  die "the copy on 8031 did not get healthy and was stopped. $OLD_SVC is still serving — the site never went down. Send the log above to the developer."
fi
systemctl enable safia-production@8031 >/dev/null 2>&1
log "Stopping the old service (it finishes its open requests; 8031 is already taking traffic)"
systemctl stop "$OLD_SVC"
systemctl disable "$OLD_SVC" >/dev/null 2>&1 || true
ok "$OLD_SVC stopped and disabled (its file stays, for --undo)"

for i in $(seq 1 30); do
  if health 8031 2>/dev/null | grep -q '"jobs" *: *true'; then ok "the copy on 8031 now runs the background jobs"; break; fi
  sleep 1
done
code=$(via_nginx)
[[ $code == 200 ]] && ok "https://$DOMAIN/health → 200" || warn "https://$DOMAIN/health → $code — check:  journalctl -u safia-production@8031 -n 60"

log "Done. The dashboard now runs as safia-production@8031; every future deploy swaps copies with no downtime."
echo "   Status:  systemctl status 'safia-production@*'"
echo "   Logs:    journalctl -u safia-production@8030 -u safia-production@8031 -f"
echo "   Undo:    sudo bash $0 --undo"
