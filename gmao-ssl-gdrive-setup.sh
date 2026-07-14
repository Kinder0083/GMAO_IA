#!/usr/bin/env bash
###############################################################################
# FSAO Iris - Configuration SSL + Google Drive
#
# Script post-installation a executer dans le conteneur LXC FSAO Iris.
# Objectifs :
# - installer ou verifier Certbot ;
# - obtenir un certificat Let's Encrypt ;
# - generer une configuration Nginx HTTPS propre ;
# - mettre a jour backend/.env ;
# - configurer Google Drive pour les sauvegardes, si souhaite ;
# - redemarrer les services et effectuer des controles simples.
###############################################################################

set -euo pipefail

APP_NAME="FSAO Iris"
APP_DIR="/opt/gmao-iris"
BACKEND_ENV="$APP_DIR/backend/.env"
FRONTEND_BUILD="$APP_DIR/frontend/build"
NGINX_CONF="/etc/nginx/sites-available/gmao-iris"
NGINX_ENABLED="/etc/nginx/sites-enabled/gmao-iris"
SUPERVISOR_PROGRAM="gmao-iris-backend"
LOG_FILE="/tmp/fsao-iris-ssl-setup-$(date +%Y%m%d_%H%M%S).log"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

msg()  { echo -e "${BLUE}>>>${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[ATTENTION]${NC} $1"; }
err()  { echo -e "${RED}[ERREUR]${NC} $1"; exit 1; }
ask()  { echo -en "${CYAN}?${NC} $1 "; }

exec > >(tee -a "$LOG_FILE") 2>&1

upsert_env() {
    local key="$1"
    local value="$2"
    local escaped_value
    escaped_value=$(printf '%s' "$value" | sed 's/[&/]/\\&/g')

    if grep -q "^${key}=" "$BACKEND_ENV"; then
        sed -i "s/^${key}=.*/${key}=${escaped_value}/" "$BACKEND_ENV"
    else
        echo "${key}=${value}" >> "$BACKEND_ENV"
    fi
}

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        err "Ce script doit etre execute en root : sudo bash $0"
    fi
}

check_command() {
    local command_name="$1"
    local package_name="${2:-$1}"

    if ! command -v "$command_name" >/dev/null 2>&1; then
        msg "Installation de $package_name..."
        apt-get update -qq
        apt-get install -y -qq "$package_name"
    fi
}

check_dns() {
    local domain="$1"

    if command -v host >/dev/null 2>&1; then
        host "$domain" >/dev/null 2>&1
    elif command -v nslookup >/dev/null 2>&1; then
        nslookup "$domain" >/dev/null 2>&1
    elif command -v getent >/dev/null 2>&1; then
        getent hosts "$domain" >/dev/null 2>&1
    elif command -v dig >/dev/null 2>&1; then
        dig +short "$domain" 2>/dev/null | grep -q '.'
    else
        return 1
    fi
}

print_header() {
    clear
    echo ""
    echo "=================================================================="
    echo "   $APP_NAME - Configuration SSL + Google Drive"
    echo "=================================================================="
    echo ""
    echo "  Log de cette session : $LOG_FILE"
    echo ""
}

preflight_checks() {
    require_root

    [ -d "$APP_DIR" ] || err "$APP_NAME non trouve dans $APP_DIR. Executez d'abord le script d'installation principal."
    [ -f "$BACKEND_ENV" ] || err "Fichier $BACKEND_ENV introuvable."
    command -v nginx >/dev/null 2>&1 || err "Nginx n'est pas installe. Executez d'abord l'installation principale."
    command -v supervisorctl >/dev/null 2>&1 || err "Supervisor n'est pas installe. Executez d'abord l'installation principale."

    ok "Verifications prealables terminees"
}

collect_inputs() {
    echo "------------------------------------------------------------------"
    echo "  Etape 1/5 : Informations requises"
    echo "------------------------------------------------------------------"
    echo ""

    ask "Nom de domaine (ex: fsao-iris.mondomaine.fr) :"
    read -r DOMAIN
    [ -n "$DOMAIN" ] || err "Le nom de domaine est obligatoire."

    msg "Verification DNS de $DOMAIN..."
    if check_dns "$DOMAIN"; then
        ok "DNS OK pour $DOMAIN"
    else
        warn "Impossible de resoudre $DOMAIN. Verifiez que le DNS pointe vers ce serveur."
        ask "Continuer quand meme ? (o/n) [n] :"
        read -r CONTINUE_DNS
        if [[ ! "$CONTINUE_DNS" =~ ^[OoYy]$ ]]; then
            err "Installation annulee."
        fi
    fi
    echo ""

    ask "Email pour les notifications SSL (laisser vide pour ignorer) :"
    read -r CERTBOT_EMAIL
    echo ""

    ask "Configurer Google Drive pour les sauvegardes ? (o/n) [o] :"
    read -r SETUP_GDRIVE
    SETUP_GDRIVE=${SETUP_GDRIVE:-o}

    GOOGLE_CLIENT_ID=""
    GOOGLE_CLIENT_SECRET=""

    if [[ "$SETUP_GDRIVE" =~ ^[OoYy]$ ]]; then
        echo ""
        echo "  Pour obtenir les identifiants Google Drive :"
        echo "  1. Aller sur https://console.cloud.google.com"
        echo "  2. Creer un projet et activer l'API Google Drive"
        echo "  3. Creer des identifiants OAuth 2.0 type Application Web"
        echo "  4. Ajouter cette URI de redirection autorisee :"
        echo "     https://$DOMAIN/api/backup/drive/callback"
        echo ""

        ask "Client ID Google :"
        read -r GOOGLE_CLIENT_ID
        if [ -z "$GOOGLE_CLIENT_ID" ]; then
            warn "Client ID vide. Google Drive ne sera pas configure."
            SETUP_GDRIVE="n"
        fi

        if [[ "$SETUP_GDRIVE" =~ ^[OoYy]$ ]]; then
            ask "Client Secret Google :"
            read -r GOOGLE_CLIENT_SECRET
            if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
                warn "Client Secret vide. Google Drive ne sera pas configure."
                SETUP_GDRIVE="n"
            fi
        fi
    fi

    echo ""
    echo "------------------------------------------------------------------"
    echo "  Recapitulatif"
    echo "------------------------------------------------------------------"
    echo ""
    echo "  Domaine      : $DOMAIN"
    echo "  SSL          : Let's Encrypt / Certbot"
    echo "  Email SSL    : ${CERTBOT_EMAIL:-(aucun)}"
    if [[ "$SETUP_GDRIVE" =~ ^[OoYy]$ ]]; then
        echo "  Google Drive : Oui (${GOOGLE_CLIENT_ID:0:25}...)"
    else
        echo "  Google Drive : Non"
    fi
    echo ""

    ask "Confirmer et lancer la configuration ? (o/n) [o] :"
    read -r CONFIRM
    CONFIRM=${CONFIRM:-o}
    [[ "$CONFIRM" =~ ^[OoYy]$ ]] || err "Configuration annulee."
}

install_certbot_and_certificate() {
    echo ""
    echo "------------------------------------------------------------------"
    echo "  Etape 2/5 : Certificat SSL"
    echo "------------------------------------------------------------------"
    echo ""

    check_command certbot certbot
    check_command nginx python3-certbot-nginx

    local certbot_email_arg
    if [ -n "$CERTBOT_EMAIL" ]; then
        certbot_email_arg="--email $CERTBOT_EMAIL"
    else
        certbot_email_arg="--register-unsafely-without-email"
    fi

    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        ok "Certificat SSL deja existant pour $DOMAIN"
        return
    fi

    msg "Preparation Nginx pour validation HTTP..."
    if [ -f "$NGINX_CONF" ]; then
        cp "$NGINX_CONF" "${NGINX_CONF}.pre-certbot.$(date +%Y%m%d_%H%M%S).backup"
    fi

    cat > "$NGINX_CONF" << TMPNGINX
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 200M;

    location / {
        root $FRONTEND_BUILD;
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
TMPNGINX

    ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t >/dev/null 2>&1 && systemctl reload nginx

    msg "Demande du certificat SSL pour $DOMAIN..."
    if certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos $certbot_email_arg; then
        ok "Certificat obtenu via le plugin Nginx"
    else
        warn "Plugin Nginx en echec. Tentative en mode standalone..."
        systemctl stop nginx
        if certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos $certbot_email_arg; then
            ok "Certificat obtenu en mode standalone"
        else
            systemctl start nginx || true
            err "Impossible d'obtenir le certificat SSL. Verifiez DNS, ports 80/443 et logs Certbot."
        fi
        systemctl start nginx
    fi

    [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] || err "Le certificat n'a pas ete cree."
}

write_nginx_https_config() {
    echo ""
    echo "------------------------------------------------------------------"
    echo "  Etape 3/5 : Configuration Nginx HTTPS"
    echo "------------------------------------------------------------------"
    echo ""

    if [ -f "$NGINX_CONF" ]; then
        cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
        ok "Backup de la configuration Nginx cree"
    fi

    cat > "$NGINX_CONF" << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;
    client_max_body_size 200M;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    location / {
        root $FRONTEND_BUILD;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ssh/ws {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }

    location /ws/chat/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    location /ws/whiteboard/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
NGINXEOF

    ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
    rm -f /etc/nginx/sites-enabled/default

    if nginx -t; then
        systemctl reload nginx
        ok "Nginx configure avec HTTPS"
    else
        err "Configuration Nginx invalide. Verifiez $NGINX_CONF"
    fi
}

update_backend_env() {
    echo ""
    echo "------------------------------------------------------------------"
    echo "  Etape 4/5 : Mise a jour backend/.env"
    echo "------------------------------------------------------------------"
    echo ""

    cp "$BACKEND_ENV" "${BACKEND_ENV}.backup.$(date +%Y%m%d_%H%M%S)"
    ok "Backup du fichier .env cree"

    upsert_env FRONTEND_URL "https://$DOMAIN"
    upsert_env BACKEND_URL "https://$DOMAIN"
    upsert_env APP_URL "https://$DOMAIN"

    if grep -q "http://$DOMAIN" "$BACKEND_ENV" 2>/dev/null; then
        sed -i "s|http://$DOMAIN|https://$DOMAIN|g" "$BACKEND_ENV"
    fi

    ok "URLs applicatives mises a jour en HTTPS"

    if [[ "$SETUP_GDRIVE" =~ ^[OoYy]$ ]]; then
        local redirect_uri="https://$DOMAIN/api/backup/drive/callback"
        upsert_env GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
        upsert_env GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
        upsert_env GOOGLE_DRIVE_REDIRECT_URI "$redirect_uri"
        ok "Google Drive configure"
        echo "  URI de redirection Google : $redirect_uri"
    else
        ok "Google Drive ignore"
    fi
}

restart_and_test() {
    echo ""
    echo "------------------------------------------------------------------"
    echo "  Etape 5/5 : Redemarrage et verification"
    echo "------------------------------------------------------------------"
    echo ""

    msg "Redemarrage du backend..."
    supervisorctl restart "$SUPERVISOR_PROGRAM" || warn "Redemarrage Supervisor a verifier manuellement"
    sleep 5

    if supervisorctl status "$SUPERVISOR_PROGRAM" 2>/dev/null | grep -q RUNNING; then
        ok "Backend demarre"
    else
        warn "Le backend ne semble pas demarre. Verifiez : tail -f /var/log/gmao-iris-backend.err.log"
    fi

    msg "Test HTTPS..."
    local https_code
    https_code=$(curl -sk -o /dev/null -w "%{http_code}" "https://$DOMAIN" 2>/dev/null || echo "000")
    if [ "$https_code" = "200" ] || [ "$https_code" = "304" ]; then
        ok "Interface accessible en HTTPS (code $https_code)"
    else
        warn "HTTPS retourne le code $https_code. A controler selon l'etat du frontend."
    fi

    msg "Test API..."
    local api_code
    api_code=$(curl -sk -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/version" 2>/dev/null || echo "000")
    if [ "$api_code" = "200" ]; then
        ok "API accessible en HTTPS"
    else
        warn "API retourne le code $api_code. Verifiez les logs backend si necessaire."
    fi

    if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then
        ufw allow 80/tcp >/dev/null 2>&1
        ufw allow 443/tcp >/dev/null 2>&1
        ok "Ports 80 et 443 autorises dans UFW"
    fi

    if ! systemctl is-active --quiet certbot.timer 2>/dev/null && [ ! -f /etc/cron.d/certbot ]; then
        echo "0 3 * * * root certbot renew --quiet --post-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
        chmod 644 /etc/cron.d/certbot-renew
        ok "Tache cron de renouvellement Certbot creee"
    else
        ok "Renouvellement automatique Certbot present"
    fi
}

print_summary() {
    echo ""
    echo "=================================================================="
    echo "              CONFIGURATION TERMINEE"
    echo "=================================================================="
    echo ""
    echo "  Application     : $APP_NAME"
    echo "  URL HTTPS       : https://$DOMAIN"
    echo "  Certificat      : /etc/letsencrypt/live/$DOMAIN/"
    echo "  Nginx           : $NGINX_CONF"
    echo "  Environnement   : $BACKEND_ENV"
    echo "  Log             : $LOG_FILE"

    if [[ "$SETUP_GDRIVE" =~ ^[OoYy]$ ]]; then
        echo ""
        echo "  Google Drive    : configure"
        echo "  URI callback    : https://$DOMAIN/api/backup/drive/callback"
        echo "  Action restante : ajouter/verifier cette URI dans Google Cloud Console"
    fi

    echo ""
    echo "Commandes utiles :"
    echo "  certbot certificates"
    echo "  certbot renew --dry-run"
    echo "  nginx -t && systemctl reload nginx"
    echo "  supervisorctl status $SUPERVISOR_PROGRAM"
    echo "  tail -f /var/log/gmao-iris-backend.err.log"
    echo ""
}

print_header
preflight_checks
collect_inputs
install_certbot_and_certificate
write_nginx_https_config
update_backend_env
restart_and_test
print_summary
