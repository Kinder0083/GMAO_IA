#!/bin/bash
# ================================================================
# MAJ_FSAO.sh - Script de mise à jour FSAO Iris (version unifiée)
# ================================================================
# Appelé par update_service.py via le bouton de mise à jour.
# Usage: MAJ_FSAO.sh <version> <update_id>
#
# Étapes :
#   1. Déconnexion forcée des utilisateurs
#   2. Activation page de maintenance NGINX
#   3. Backup MongoDB
#   4. Sauvegarde des .env
#   5. Git fetch + reset --hard
#   6. Restauration des .env
#   7. Installation dépendances (pip + yarn + build)
#   8. Désactivation maintenance + redémarrage
#
# Résultat écrit dans /var/log/gmao-iris-update-result.json
# ================================================================

# === PARAMÈTRES ===
VERSION_CIBLE="${1:-inconnue}"
UPDATE_ID="${2:-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo manual-$(date +%s))}"

# === CONFIGURATION ===
APP_ROOT="/opt/gmao-iris"
GITHUB_URL="https://github.com/Kinder0083/GMAO.git"
GITHUB_BRANCH="main"
MFLAG="$APP_ROOT/maintenance.flag"
LOG_FILE="/var/log/gmao-iris-update.log"
RESULT_FILE="/var/log/gmao-iris-update-result.json"
EXTRA_INDEX="https://d33sy5i8bnduwe.cloudfront.net/simple/"

# === SUIVI ===
ERRORS=""
WARNINGS=""
STEPS_OK=0
STEPS_WARN=0
STEPS_ERR=0
CODE_UPDATED="false"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# === LOGGING ===
echo "" > "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/gmao-iris-update.log" && echo "" > "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

step_ok()   { echo "  [OK] $1"; STEPS_OK=$((STEPS_OK + 1)); }
step_warn() { echo "  [WARN] $1"; STEPS_WARN=$((STEPS_WARN + 1)); WARNINGS="${WARNINGS}|${1}"; }
step_fail() { echo "  [ERREUR] $1"; STEPS_ERR=$((STEPS_ERR + 1)); ERRORS="${ERRORS}|${1}"; }

# === ÉCRIRE LE RÉSULTAT JSON ===
write_result() {
    local success="$1"
    local COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # Lire le contenu du log
    local LOG_CONTENT=""
    if [ -f "$LOG_FILE" ]; then
        LOG_CONTENT=$(tail -c 10000 "$LOG_FILE" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
    fi

    # Construire les tableaux JSON d'erreurs et warnings
    local ERR_JSON="[]"
    local WARN_JSON="[]"
    if [ -n "$ERRORS" ]; then
        ERR_JSON=$(echo "$ERRORS" | tr '|' '\n' | sed '/^$/d' | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | awk '{printf "\"%s\",", $0}' | sed 's/,$//' | awk '{print "["$0"]"}')
    fi
    if [ -n "$WARNINGS" ]; then
        WARN_JSON=$(echo "$WARNINGS" | tr '|' '\n' | sed '/^$/d' | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | awk '{printf "\"%s\",", $0}' | sed 's/,$//' | awk '{print "["$0"]"}')
    fi

    # Lire la version actuelle
    local VERSION_BEFORE="?"
    if [ -f "$APP_ROOT/updates/version.json" ]; then
        VERSION_BEFORE=$(python3 -c "import json;print(json.load(open('$APP_ROOT/updates/version.json')).get('version','?'))" 2>/dev/null || echo "?")
    fi

    cat > "$RESULT_FILE" << EOJSON
{
    "update_id": "$UPDATE_ID",
    "success": $success,
    "code_updated": $CODE_UPDATED,
    "version_before": "$VERSION_BEFORE",
    "version_after": "$VERSION_CIBLE",
    "started_at": "$STARTED_AT",
    "completed_at": "$COMPLETED_AT",
    "steps_ok": $STEPS_OK,
    "steps_warn": $STEPS_WARN,
    "steps_err": $STEPS_ERR,
    "errors": $ERR_JSON,
    "warnings": $WARN_JSON,
    "log_content": "$LOG_CONTENT"
}
EOJSON
    echo "Résultat écrit dans $RESULT_FILE"
}

# === TROUVER LA CONFIG NGINX ===
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

echo "========================================================"
echo "  MISE À JOUR FSAO IRIS"
echo "  Version cible : $VERSION_CIBLE"
echo "  Update ID     : $UPDATE_ID"
echo "  Date           : $(date '+%d/%m/%Y %H:%M:%S')"
echo "========================================================"
echo ""

# ═══════════════════════════════════════════════════════════
# ÉTAPE 1/8 : DÉCONNEXION FORCÉE DES UTILISATEURS
# ═══════════════════════════════════════════════════════════
echo "[1/8] Déconnexion forcée des utilisateurs..."
MONGO_CMD=$(command -v mongosh 2>/dev/null || command -v mongo 2>/dev/null || echo "")
if [ -n "$MONGO_CMD" ]; then
    if $MONGO_CMD --quiet --eval "
        db = db.getSiblingDB('gmao_iris');
        db.system_settings.updateOne(
            { key: 'force_logout_at' },
            { \$set: { key: 'force_logout_at', timestamp: Date.now() / 1000 } },
            { upsert: true }
        );
        print('Force logout inséré');
    " 2>/dev/null; then
        step_ok "Force logout envoyé — attente 10s..."
        sleep 10
    else
        step_warn "Force logout échoué (non bloquant)"
    fi
else
    step_warn "mongosh/mongo non trouvé, déconnexion ignorée"
fi

# ═══════════════════════════════════════════════════════════
# ÉTAPE 2/8 : ACTIVER LA PAGE DE MAINTENANCE
# ═══════════════════════════════════════════════════════════
echo "[2/8] Activation de la page de maintenance..."
touch "$MFLAG"

if [ -n "$NGINX_CONF" ]; then
    if [ ! -f "$NGINX_BACKUP" ]; then
        cp "$NGINX_REAL" "$NGINX_BACKUP"
        echo "  Config NGINX sauvegardée: $NGINX_BACKUP"
    fi

    cat > "$NGINX_REAL" << 'NGINX_MAINT'
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

    if nginx -t 2>/dev/null && nginx -s reload 2>/dev/null; then
        step_ok "Page de maintenance ACTIVE"
    else
        systemctl reload nginx 2>/dev/null || true
        step_warn "NGINX rechargé via systemctl"
    fi
else
    step_warn "Config NGINX non trouvée, maintenance.flag seul"
fi

# ═══════════════════════════════════════════════════════════
# ÉTAPE 3/8 : BACKUP MONGODB
# ═══════════════════════════════════════════════════════════
echo "[3/8] Backup MongoDB..."
BACKUP_DIR="$APP_ROOT/backups/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
if command -v mongodump &> /dev/null; then
    if mongodump --uri="mongodb://localhost:27017" --db=gmao_iris --out="$BACKUP_DIR" 2>/dev/null; then
        BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
        step_ok "Backup MongoDB réussi ($BACKUP_SIZE)"
    else
        step_warn "Backup MongoDB échoué (non bloquant)"
    fi
else
    step_warn "mongodump non installé, backup ignoré"
fi

# ═══════════════════════════════════════════════════════════
# ÉTAPE 4/8 : SAUVEGARDE DES .ENV
# ═══════════════════════════════════════════════════════════
echo "[4/8] Sauvegarde des fichiers .env..."
ENV_OK=0
for f in "backend/.env" "frontend/.env"; do
    src="$APP_ROOT/$f"
    dst="/tmp/$(echo "$f" | tr '/' '_')"
    if [ -f "$src" ]; then
        cp -a "$src" "$dst"
        echo "  $f → $dst"
        ENV_OK=$((ENV_OK + 1))
    fi
done
[ $ENV_OK -gt 0 ] && step_ok "$ENV_OK fichier(s) .env sauvegardé(s)" || step_fail "Aucun .env trouvé"

# ═══════════════════════════════════════════════════════════
# ÉTAPE 5/8 : GIT - RÉCUPÉRATION DU CODE
# ═══════════════════════════════════════════════════════════
echo "[5/8] Téléchargement du code source..."
cd "$APP_ROOT"

rm -rf .git 2>/dev/null || true
git init >> "$LOG_FILE" 2>&1
git remote add origin "$GITHUB_URL" >> "$LOG_FILE" 2>&1

GIT_OK=true
if git fetch origin "$GITHUB_BRANCH" >> "$LOG_FILE" 2>&1; then
    echo "  git fetch OK"
else
    step_fail "git fetch échoué"
    GIT_OK=false
fi

if [ "$GIT_OK" = true ]; then
    if git reset --hard "origin/$GITHUB_BRANCH" >> "$LOG_FILE" 2>&1; then
        step_ok "Code source synchronisé (branche: $GITHUB_BRANCH)"
        CODE_UPDATED="true"
    else
        step_fail "git reset échoué"
    fi
fi

# ═══════════════════════════════════════════════════════════
# ÉTAPE 6/8 : RESTAURATION DES .ENV
# ═══════════════════════════════════════════════════════════
echo "[6/8] Restauration des fichiers .env..."
for f in "backend/.env" "frontend/.env"; do
    src="/tmp/$(echo "$f" | tr '/' '_')"
    dst="$APP_ROOT/$f"
    if [ -f "$src" ]; then
        cp -a "$src" "$dst"
        echo "  $src → $f"
    fi
done
step_ok "Fichiers .env restaurés"

# ═══════════════════════════════════════════════════════════
# ÉTAPE 7/8 : INSTALLATION DES DÉPENDANCES
# ═══════════════════════════════════════════════════════════
echo "[7/8] Installation des dépendances..."

# --- Backend ---
echo "  Backend : pip install..."
if [ -f "$APP_ROOT/venv/bin/activate" ]; then
    source "$APP_ROOT/venv/bin/activate"
    if pip install -r "$APP_ROOT/backend/requirements.txt" --extra-index-url "$EXTRA_INDEX" >> "$LOG_FILE" 2>&1; then
        step_ok "pip install OK (venv)"
    else
        step_warn "pip install échoué (non bloquant)"
    fi
    pip install emergentintegrations --extra-index-url "$EXTRA_INDEX" >> "$LOG_FILE" 2>&1 || true
    deactivate 2>/dev/null || true
elif [ -f "$APP_ROOT/backend/requirements.txt" ]; then
    PIP_CMD=$(command -v pip3 2>/dev/null || echo "pip")
    if $PIP_CMD install -r "$APP_ROOT/backend/requirements.txt" --extra-index-url "$EXTRA_INDEX" >> "$LOG_FILE" 2>&1; then
        step_ok "pip install OK (système)"
    else
        step_warn "pip install échoué (non bloquant)"
    fi
else
    step_warn "requirements.txt introuvable"
fi

# --- Frontend ---
echo "  Frontend : yarn install + build..."
cd "$APP_ROOT/frontend"

# Backup du build existant
if [ -d "build" ]; then
    rm -rf build_backup 2>/dev/null || true
    cp -r build build_backup
    echo "  Backup du build existant créé"
fi

# yarn install
yarn install --production=false >> "$LOG_FILE" 2>&1 || step_warn "yarn install avec avertissements"

# yarn build
if CI=false yarn build >> "$LOG_FILE" 2>&1; then
    if [ -f "build/index.html" ]; then
        step_ok "Frontend compilé (index.html présent)"
    else
        step_fail "Build terminé mais index.html absent"
    fi
else
    step_fail "yarn build échoué"
    # Restaurer le build précédent
    if [ -d "build_backup" ]; then
        rm -rf build 2>/dev/null || true
        cp -r build_backup build
        step_warn "Build précédent restauré depuis le backup"
    fi
fi

# Nettoyer backup
rm -rf build_backup 2>/dev/null || true
cd "$APP_ROOT"

# ═══════════════════════════════════════════════════════════
# ÉTAPE 8/8 : DÉSACTIVER MAINTENANCE + REDÉMARRAGE
# ═══════════════════════════════════════════════════════════
echo "[8/8] Désactivation maintenance et redémarrage..."

# Restaurer la config NGINX originale
if [ -f "$NGINX_BACKUP" ]; then
    cp "$NGINX_BACKUP" "$NGINX_REAL"
    echo "  Config NGINX restaurée"
fi

# Supprimer le flag
rm -f "$MFLAG"

# Recharger NGINX
if nginx -t 2>/dev/null && nginx -s reload 2>/dev/null; then
    step_ok "NGINX rechargé, maintenance désactivée"
else
    systemctl reload nginx 2>/dev/null || true
    step_warn "NGINX rechargé via systemctl"
fi

# ═══════════════════════════════════════════════════════════
# ÉCRIRE LE RÉSULTAT
# ═══════════════════════════════════════════════════════════
if [ $STEPS_ERR -eq 0 ]; then
    SUCCESS="true"
    echo ""
    echo "=========================================="
    echo "  MISE À JOUR RÉUSSIE"
    echo "  OK: $STEPS_OK | WARN: $STEPS_WARN | ERR: $STEPS_ERR"
    echo "=========================================="
else
    SUCCESS="false"
    echo ""
    echo "=========================================="
    echo "  MISE À JOUR TERMINÉE AVEC $STEPS_ERR ERREUR(S)"
    echo "  OK: $STEPS_OK | WARN: $STEPS_WARN | ERR: $STEPS_ERR"
    echo "=========================================="
fi

write_result "$SUCCESS"

echo ""
echo "Redémarrage dans 5 secondes..."
sleep 5
reboot
