#!/bin/bash
# ============================================================================
# Safia Production — step 1 of 2: provision database + TLS certificate.
# Run as root:   sudo bash /var/www/production/deploy/01-provision.sh
#
# Creates nothing outside: the postgres role/db, the ACME webroot, a TEMPORARY
# nginx vhost used only to answer the ACME challenge, and the certificate.
# It does NOT touch any existing site, service, or database.
# ============================================================================
set -euo pipefail

DOMAIN=production.safiacorporate.uz
DB_NAME=safia_production
DB_ROLE=safia_prod
ENVFILE=/var/www/production/backend/.env

log() { printf '\n\033[1;33m→ %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "must run as root (sudo bash $0)"; exit 1; }
[[ -f $ENVFILE ]] || { echo "missing $ENVFILE"; exit 1; }

# ---------------------------------------------------------------- 1. locale
# The data is heavily Cyrillic + Uzbek Latin. A fresh Ubuntu cluster often has
# only C.UTF-8, which sorts mixed-script names differently from the old host —
# visible in every sorted dashboard table. Generate en_US.UTF-8 to match.
log "Ensuring en_US.UTF-8 locale exists"
if ! locale -a 2>/dev/null | grep -qi '^en_US\.utf8$'; then
    locale-gen en_US.UTF-8
    echo "  generated"
else
    echo "  already present"
fi

# ------------------------------------------------------- 2. postgres role/db
# The dump carries no OWNER/GRANT statements, so whichever role runs the restore
# ends up owning all 69 tables. That restore therefore runs as $DB_ROLE (step 2
# of the deploy), never as postgres — otherwise the app gets "permission denied"
# on its first write. Here we only create the role and an empty database.
log "Creating PostgreSQL role '$DB_ROLE' and database '$DB_NAME'"
DB_PW=$(grep '^DATABASE_URL=' "$ENVFILE" | sed -E 's|^DATABASE_URL=postgresql://[^:]+:([^@]+)@.*|\1|')
[[ -n $DB_PW ]] || { echo "could not read the db password out of $ENVFILE"; exit 1; }

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_ROLE'" | grep -q 1; then
    echo "  role already exists — leaving it alone"
else
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
        "CREATE ROLE $DB_ROLE LOGIN PASSWORD '$DB_PW';"
    echo "  role created"
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    echo "  database already exists — leaving it alone"
else
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
        "CREATE DATABASE $DB_NAME OWNER $DB_ROLE ENCODING 'UTF8' \
         LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;"
    echo "  database created"
fi

sudo -u postgres psql -d "$DB_NAME" -c "SHOW server_encoding; " -c "SHOW lc_collate;"

# --------------------------------------------------------- 3. ACME challenge
log "Preparing the ACME webroot"
mkdir -p /var/www/letsencrypt/.well-known/acme-challenge
chown -R www-data:www-data /var/www/letsencrypt
chmod -R 755 /var/www/letsencrypt

# A temporary vhost that ONLY answers the ACME challenge. It has to listen on
# 443 as well as 80, because Cloudflare's "Always Use HTTPS" rewrites the
# challenge URL before it reaches the origin — so it needs a certificate to
# complete the TLS handshake before it owns one. Borrow any existing cert on the
# box: Cloudflare runs in "Full" (not "Full (strict)") mode and does not verify it.
BORROW=$(ls -d /etc/letsencrypt/live/*/ 2>/dev/null | grep -v README | head -1)
[[ -n $BORROW ]] || { echo "no existing certificate to borrow for the temp 443 listener"; exit 1; }
BORROW=${BORROW%/}
echo "  borrowing $BORROW for the temporary TLS listener"

cat > /etc/nginx/sites-available/$DOMAIN <<NGINX
# TEMPORARY — ACME bootstrap only. Replaced by the real vhost in 02-activate.sh.
server {
    listen 80;
    listen [::]:80;
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     $BORROW/fullchain.pem;
    ssl_certificate_key $BORROW/privkey.pem;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 503 "Safia Production: provisioning\n"; }
}
NGINX

ln -sfn /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
nginx -t
systemctl reload nginx
echo "  temporary vhost live"

# Prove the challenge path is reachable end-to-end through Cloudflare before
# spending a rate-limited certificate request on it.
log "Verifying the ACME path is reachable through Cloudflare"
TOKEN="deploy-probe-$$"
echo "$TOKEN" > /var/www/letsencrypt/.well-known/acme-challenge/$TOKEN
GOT=$(curl -s -m 25 "http://$DOMAIN/.well-known/acme-challenge/$TOKEN" || true)
rm -f /var/www/letsencrypt/.well-known/acme-challenge/$TOKEN
if [[ $GOT == "$TOKEN" ]]; then
    echo "  reachable — challenge served correctly"
else
    echo "  WARNING: probe returned '$GOT' instead of '$TOKEN'."
    echo "  Cloudflare may not be forwarding /.well-known to this origin."
    echo "  certbot will likely fail; check the CF proxy/page rules for $DOMAIN."
fi

# ------------------------------------------------------------ 4. certificate
# certonly + webroot: certbot's --nginx installer is unusable on this host
# (another vhost carries a 1024-bit RSA key and it aborts).
log "Requesting the certificate for $DOMAIN"
if [[ -d /etc/letsencrypt/live/$DOMAIN ]]; then
    echo "  certificate already exists — skipping"
else
    certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" \
        --non-interactive --agree-tos --register-unsafely-without-email \
        --keep-until-expiring
fi
ls -l /etc/letsencrypt/live/$DOMAIN/

log "Step 1 complete."
echo "Next: restore the database (as $DB_ROLE, NOT as postgres), then run 02-activate.sh"
