#!/bin/bash
# ============================================================================
# Safia Production — step 2 of 2: install the service and the real vhost.
# Run as root:   sudo bash /var/www/production/deploy/02-activate.sh
#
# Run this only AFTER 01-provision.sh succeeded and the database has been
# restored. Starting the service registers the Telegram webhook for
# @Time2Bank_bot against https://production.safiacorporate.uz.
# ============================================================================
set -euo pipefail

DOMAIN=production.safiacorporate.uz
SVC=safia-production

log() { printf '\n\033[1;33m→ %s\033[0m\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "must run as root (sudo bash $0)"; exit 1; }

[[ -d /etc/letsencrypt/live/$DOMAIN ]] || {
    echo "certificate for $DOMAIN is missing — run 01-provision.sh first"; exit 1; }

# ------------------------------------------------------------- systemd unit
log "Installing the systemd unit"
cp /var/www/production/deploy/$SVC.service /etc/systemd/system/$SVC.service
systemctl daemon-reload
systemctl enable $SVC
echo "  installed and enabled"

log "Starting $SVC (runs ~52 idempotent startup migrations against the restored DB)"
systemctl restart $SVC

# Wait for the port to answer rather than guessing at a sleep duration.
for i in $(seq 1 60); do
    if curl -sf -m 3 http://127.0.0.1:8030/health >/dev/null 2>&1; then
        echo "  /health answered after ${i}s"
        break
    fi
    if ! systemctl is-active --quiet $SVC; then
        echo "  SERVICE DIED during startup — last 60 log lines:"
        journalctl -u $SVC -n 60 --no-pager
        exit 1
    fi
    sleep 1
done

if ! curl -sf -m 5 http://127.0.0.1:8030/health >/dev/null 2>&1; then
    echo "  /health never answered — last 60 log lines:"
    journalctl -u $SVC -n 60 --no-pager
    exit 1
fi

# --------------------------------------------------------------- real vhost
log "Swapping the temporary ACME vhost for the real one"
cp /var/www/production/deploy/$DOMAIN /etc/nginx/sites-available/$DOMAIN
nginx -t
systemctl reload nginx
echo "  vhost live"

log "Smoke checks"
echo -n "  origin /health          : "; curl -s -o /dev/null -w '%{http_code}\n' -m 10 http://127.0.0.1:8030/health
echo -n "  https:// through CF     : "; curl -s -o /dev/null -w '%{http_code}\n' -m 20 https://$DOMAIN/
echo -n "  SPA index content-type  : "; curl -s -o /dev/null -w '%{content_type}\n' -m 20 https://$DOMAIN/
# An /api 404 MUST be JSON, never HTML — the SPA treats HTML on /api as an
# anti-bot challenge and force-reloads the page after two retries.
echo -n "  /api 404 content-type   : "; curl -s -o /dev/null -w '%{content_type}\n' -m 20 https://$DOMAIN/api/__does_not_exist__
echo -n "  gzip on the JS bundle   : "; curl -s -o /dev/null -D- -H 'Accept-Encoding: gzip' -m 20 https://$DOMAIN/ | grep -i '^content-encoding' || echo "(none on index.html)"

log "Step 2 complete."
echo "systemctl status $SVC      — service state"
echo "journalctl -u $SVC -f      — live logs"
