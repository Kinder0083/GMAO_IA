#!/bin/bash
# ============================================
# MAJ_SSH - Commandes de mise à jour manuelle
# À exécuter en SSH sur le Proxmox
# ============================================

cd /opt/gmao-iris

# ── DECONNECTER TOUS LES UTILISATEURS ──
# Insère un flag force_logout dans MongoDB
# Le frontend le détecte en <30s et déconnecte automatiquement tous les utilisateurs
MONGO_CMD=$(command -v mongosh 2>/dev/null || command -v mongo 2>/dev/null || echo "mongosh")
$MONGO_CMD --quiet --eval "
  db = db.getSiblingDB('gmao_iris');
  db.system_settings.updateOne(
    { key: 'force_logout_at' },
    { \$set: { key: 'force_logout_at', timestamp: Date.now() / 1000 } },
    { upsert: true }
  );
  print('[OK] Force logout envoyé à tous les utilisateurs');
"
echo "Attente 10s pour que les navigateurs detectent la deconnexion..."
sleep 10

# ── Trouver la config NGINX ──
NGINX_CONF=$(for f in /etc/nginx/sites-enabled/gmao-iris /etc/nginx/sites-enabled/fsao-iris /etc/nginx/sites-enabled/default /etc/nginx/conf.d/gmao-iris.conf /etc/nginx/conf.d/default.conf; do [ -f "$f" ] && echo "$f" && break; done)
NGINX_REAL=$(readlink -f "$NGINX_CONF" 2>/dev/null || echo "$NGINX_CONF")
NGINX_BACKUP="${NGINX_REAL}.backup_pre_maintenance"

# ── ACTIVER LA PAGE DE MAINTENANCE ──
touch /opt/gmao-iris/maintenance.flag
cp "$NGINX_REAL" "$NGINX_BACKUP"
cat > "$NGINX_REAL" << 'EOF'
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
EOF
nginx -t && nginx -s reload
echo "[OK] Page de maintenance activée"

# ── Sauvegarder les .env ──
cp backend/.env /tmp/backend.env
cp frontend/.env /tmp/frontend.env 2>/dev/null

# ── Git : supprimer et re-cloner ──
rm -rf .git
git init
git remote add origin https://github.com/Kinder0083/GMAO.git
git fetch origin main
git reset --hard origin/main

# ── Restaurer les .env ──
cp /tmp/backend.env backend/.env
cp /tmp/frontend.env frontend/.env 2>/dev/null

# ── Installer et compiler ──
source venv/bin/activate
pip install -r backend/requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
deactivate
cd frontend && yarn install && CI=false yarn build && cd ..

# ── DESACTIVER LA MAINTENANCE ──
cp "$NGINX_BACKUP" "$NGINX_REAL"
rm -f /opt/gmao-iris/maintenance.flag
nginx -t && nginx -s reload
echo "[OK] Mode maintenance désactivé"

# ── Redémarrer ──
reboot
