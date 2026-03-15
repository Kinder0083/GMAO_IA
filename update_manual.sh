#!/bin/bash
# ============================================
# Script de mise à jour manuelle FSAO Iris
# Avec page de maintenance automatique
# ============================================
set -e

APP_ROOT="/opt/gmao-iris"
GITHUB_URL="https://github.com/Kinder0083/GMAO.git"
MFLAG="$APP_ROOT/maintenance.flag"
LOG_FILE="$APP_ROOT/update_log.txt"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "=========================================="
echo "Mise à jour démarrée: $(date)"
echo "=========================================="

# ─── Trouver la config NGINX active ───
find_nginx_conf() {
    for f in /etc/nginx/sites-enabled/gmao-iris \
             /etc/nginx/sites-enabled/fsao-iris \
             /etc/nginx/sites-enabled/default \
             /etc/nginx/conf.d/gmao-iris.conf \
             /etc/nginx/conf.d/default.conf; do
        [ -f "$f" ] && echo "$f" && return
    done
}

NGINX_CONF=$(find_nginx_conf)
NGINX_REAL=$(readlink -f "$NGINX_CONF" 2>/dev/null || echo "$NGINX_CONF")
NGINX_BACKUP="${NGINX_REAL}.backup_pre_maintenance"

# ═══════════════════════════════════════════
# ETAPE 0: ACTIVER LA PAGE DE MAINTENANCE
# ═══════════════════════════════════════════
echo "[0/6] Activation de la page de maintenance..."
touch "$MFLAG"

if [ -n "$NGINX_CONF" ]; then
    # Sauvegarder la config NGINX actuelle
    if [ ! -f "$NGINX_BACKUP" ]; then
        cp "$NGINX_REAL" "$NGINX_BACKUP"
        echo "  Config NGINX sauvegardée: $NGINX_BACKUP"
    fi

    # Remplacer par la config maintenance
    cat > "$NGINX_REAL" << 'NGINX_MAINT'
# FSAO Iris - MODE MAINTENANCE (mise a jour en cours)
server {
    listen 80;
    server_name _;
    location /logo-iris.png {
        alias /opt/gmao-iris/frontend/public/logo-iris.png;
        access_log off;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location / {
        root /opt/gmao-iris;
        try_files /maintenance.html =503;
    }
    error_page 503 @maintenance;
    location @maintenance {
        root /opt/gmao-iris;
        rewrite ^(.*)$ /maintenance.html break;
    }
}
NGINX_MAINT

    # Si vous utilisez SSL, dupliquer le bloc pour le port 443 :
    # Décommentez et adaptez si nécessaire
    # cat >> "$NGINX_REAL" << 'NGINX_SSL'
    # server {
    #     listen 443 ssl;
    #     server_name votre-domaine.com;
    #     ssl_certificate /chemin/cert.pem;
    #     ssl_certificate_key /chemin/key.pem;
    #     location /logo-iris.png { alias /opt/gmao-iris/frontend/public/logo-iris.png; }
    #     location /api/ { proxy_pass http://127.0.0.1:8001/api/; }
    #     location / { root /opt/gmao-iris; try_files /maintenance.html =503; }
    # }
    # NGINX_SSL

    nginx -t 2>/dev/null && nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
    echo "[OK] Page de maintenance ACTIVE - les utilisateurs voient la page de maintenance"
else
    echo "[WARN] Config NGINX non trouvée, maintenance.flag seul"
fi

# ═══════════════════════════════════════════
# ETAPE 1: SAUVEGARDER LES .ENV
# ═══════════════════════════════════════════
echo "[1/6] Sauvegarde des fichiers .env..."
cp "$APP_ROOT/backend/.env" /tmp/backend.env 2>/dev/null || true
cp "$APP_ROOT/frontend/.env" /tmp/frontend.env 2>/dev/null || true
echo "[OK] Fichiers .env sauvegardés"

# ═══════════════════════════════════════════
# ETAPE 2: BACKUP MONGODB
# ═══════════════════════════════════════════
echo "[2/6] Backup MongoDB..."
BACKUP_DIR="$APP_ROOT/backups/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
if command -v mongodump &> /dev/null; then
    mongodump --uri="mongodb://localhost:27017" --out="$BACKUP_DIR" 2>/dev/null \
        && echo "[OK] Backup MongoDB réussi" \
        || echo "[WARN] Backup MongoDB échoué (non bloquant)"
else
    echo "[WARN] mongodump non trouvé, backup ignoré"
fi

# ═══════════════════════════════════════════
# ETAPE 3: GIT - RECUPERATION DU CODE
# ═══════════════════════════════════════════
echo "[3/6] Téléchargement du code source..."
cd "$APP_ROOT"
rm -rf .git
git init
git remote add origin "$GITHUB_URL"
git fetch origin main
git reset --hard origin/main
echo "[OK] Code source synchronisé"

# ═══════════════════════════════════════════
# ETAPE 4: RESTAURER LES .ENV
# ═══════════════════════════════════════════
echo "[4/6] Restauration des fichiers .env..."
cp /tmp/backend.env "$APP_ROOT/backend/.env" 2>/dev/null || true
cp /tmp/frontend.env "$APP_ROOT/frontend/.env" 2>/dev/null || true
echo "[OK] Fichiers .env restaurés"

# ═══════════════════════════════════════════
# ETAPE 5: INSTALLER LES DEPENDANCES
# ═══════════════════════════════════════════
echo "[5/6] Installation des dépendances..."

# Backend
if [ -f "$APP_ROOT/venv/bin/activate" ]; then
    source "$APP_ROOT/venv/bin/activate"
    pip install -r "$APP_ROOT/backend/requirements.txt" 2>&1 || echo "[WARN] pip install échoué"
    pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ 2>&1 || true
    deactivate 2>/dev/null || true
else
    pip3 install -r "$APP_ROOT/backend/requirements.txt" 2>&1 || echo "[WARN] pip install échoué"
fi
echo "[OK] Backend OK"

# Frontend
cd "$APP_ROOT/frontend"
yarn install --production=false 2>&1 || echo "[WARN] yarn install échoué"
CI=false yarn build 2>&1 || echo "[WARN] yarn build échoué"
cd "$APP_ROOT"
echo "[OK] Frontend compilé"

# ═══════════════════════════════════════════
# ETAPE 6: DESACTIVER LA MAINTENANCE + REBOOT
# ═══════════════════════════════════════════
echo "[6/6] Désactivation de la maintenance et redémarrage..."

# Restaurer la config NGINX originale
if [ -f "$NGINX_BACKUP" ]; then
    cp "$NGINX_BACKUP" "$NGINX_REAL"
    echo "  Config NGINX restaurée depuis $NGINX_BACKUP"
fi

# Supprimer le flag maintenance
rm -f "$MFLAG"

# Recharger NGINX avec la config normale
nginx -t 2>/dev/null && nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
echo "[OK] Mode maintenance désactivé"

echo "=========================================="
echo "Mise à jour terminée: $(date)"
echo "Redémarrage dans 3 secondes..."
echo "=========================================="

sleep 3
reboot
