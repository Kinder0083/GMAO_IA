#!/bin/bash
# ================================================================
# MAJ_FSAO.sh - Script de mise à jour FSAO Iris (version unifiée)
# ================================================================
# Fusionne le meilleur de update_manual.sh et MAJ_SSH.sh :
#   - Déconnexion forcée des utilisateurs (MAJ_SSH)
#   - Page de maintenance NGINX (les deux)
#   - Backup MongoDB avant MAJ (update_manual)
#   - Logging complet dans un fichier (update_manual)
#   - Gestion d'erreurs non bloquante (update_manual)
#   - Backup du build frontend avant recompilation (update_manual)
#   - Détection intelligente de venv/pip (update_manual)
#   - Résumé final avec statut de chaque étape
# ================================================================

set -euo pipefail

# === CONFIGURATION ===
APP_ROOT="/opt/gmao-iris"
GITHUB_URL="https://github.com/Kinder0083/GMAO.git"
GITHUB_BRANCH="main"
MFLAG="$APP_ROOT/maintenance.flag"
LOG_FILE="$APP_ROOT/update_log.txt"
EXTRA_INDEX="https://d33sy5i8bnduwe.cloudfront.net/simple/"

# === COULEURS ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# === SUIVI DES ÉTAPES ===
declare -A STEP_STATUS
ERRORS_COUNT=0
START_TIME=$(date +%s)

# === LOGGING ===
exec > >(tee -a "$LOG_FILE") 2>&1

log_ok()   { echo -e "  ${GREEN}[OK]${NC} $1"; STEP_STATUS["$2"]="OK"; }
log_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; STEP_STATUS["$2"]="WARN"; }
log_fail() { echo -e "  ${RED}[ERREUR]${NC} $1"; STEP_STATUS["$2"]="ERREUR"; ERRORS_COUNT=$((ERRORS_COUNT + 1)); }
log_info() { echo -e "  ${CYAN}[INFO]${NC} $1"; }

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

echo ""
echo -e "${CYAN}========================================================${NC}"
echo -e "${CYAN}  MISE À JOUR FSAO IRIS - $(date '+%d/%m/%Y %H:%M:%S')${NC}"
echo -e "${CYAN}========================================================${NC}"
echo ""

# ═══════════════════════════════════════════════════════════
# ÉTAPE 1/8 : DÉCONNEXION FORCÉE DES UTILISATEURS
# ═══════════════════════════════════════════════════════════
echo -e "${CYAN}[1/8] Déconnexion forcée des utilisateurs...${NC}"
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
        log_ok "Force logout envoyé — attente 10s..." "logout"
        sleep 10
    else
        log_warn "Force logout échoué (non bloquant)" "logout"
    fi
else
    log_warn "mongosh/mongo non trouvé, déconnexion ignorée" "logout"
fi

# ═══════════════════════════════════════════════════════════
# ÉTAPE 2/8 : ACTIVER LA PAGE DE MAINTENANCE
# ═══════════════════════════════════════════════════════════
echo -e "${CYAN}[2/8] Activation de la page de maintenance...${NC}"
touch "$MFLAG"

if [ -n "$NGINX_CONF" ]; then
    if [ ! -f "$NGINX_BACKUP" ]; then
        cp "$NGINX_REAL" "$NGINX_BACKUP"
        log_info "Config NGINX sauvegardée: $NGINX_BACKUP"
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
        log_ok "Page de maintenance ACTIVE" "maintenance_on"
    else
        systemctl reload nginx 2>/dev/null || true
        log_warn "NGINX rechargé via systemctl" "maintenance_on"
    fi
else
    log_warn "Config NGINX non trouvée, maintenance.flag seul" "maintenance_on"
fi

# ═══════════════════════════════════════════════════════════
# ÉTAPE 3/8 : BACKUP MONGODB
# ═══════════════════════════════════════════════════════════
echo -e "${CYAN}[3/8] Backup MongoDB...${NC}"
BACKUP_DIR="$APP_ROOT/backups/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
if command -v mongodump &> /dev/null; then
    if mongodump --uri="mongodb://localhost:27017" --db=gmao_iris --out="$BACKUP_DIR" 2>/dev/null; then
        BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
        log_ok "Backup MongoDB réussi ($BACKUP_SIZE) → $BACKUP_DIR" "backup_db"
    else
        log_warn "Backup MongoDB échoué (non bloquant)" "backup_db"
    fi
else
    log_warn "mongodump non installé, backup ignoré" "backup_db"
fi

# ═══════════════════════════════════════════════════════════
# ÉTAPE 4/8 : SAUVEGARDE DES .ENV
# ═══════════════════════════════════════════════════════════
echo -e "${CYAN}[4/8] Sauvegarde des fichiers .env...${NC}"
ENV_OK=0
for f in "backend/.env" "frontend/.env"; do
    src="$APP_ROOT/$f"
    dst="/tmp/$(echo "$f" | tr '/' '_')"
    if [ -f "$src" ]; then
        cp -a "$src" "$dst"
        log_info "$f → $dst"
        ENV_OK=$((ENV_OK + 1))
    fi
done
[ $ENV_OK -gt 0 ] && log_ok "$ENV_OK fichier(s) .env sauvegardé(s)" "save_env" || log_fail "Aucun .env trouvé" "save_env"

# ═══════════════════════════════════════════════════════════
# ÉTAPE 5/8 : GIT - RÉCUPÉRATION DU CODE
# ═══════════════════════════════════════════════════════════
echo -e "${CYAN}[5/8] Téléchargement du code source...${NC}"
cd "$APP_ROOT"

rm -rf .git 2>/dev/null || true
git init >> "$LOG_FILE" 2>&1
git remote add origin "$GITHUB_URL" >> "$LOG_FILE" 2>&1

if git fetch origin "$GITHUB_BRANCH" >> "$LOG_FILE" 2>&1; then
    log_info "git fetch OK"
else
    log_fail "git fetch échoué" "git"
fi

if git reset --hard "origin/$GITHUB_BRANCH" >> "$LOG_FILE" 2>&1; then
    log_ok "Code source synchronisé (branche: $GITHUB_BRANCH)" "git"
else
    log_fail "git reset échoué" "git"
fi

# ═══════════════════════════════════════════════════════════
# ÉTAPE 6/8 : RESTAURATION DES .ENV
# ═══════════════════════════════════════════════════════════
echo -e "${CYAN}[6/8] Restauration des fichiers .env...${NC}"
for f in "backend/.env" "frontend/.env"; do
    src="/tmp/$(echo "$f" | tr '/' '_')"
    dst="$APP_ROOT/$f"
    if [ -f "$src" ]; then
        cp -a "$src" "$dst"
        log_info "$src → $f"
    fi
done
log_ok "Fichiers .env restaurés" "restore_env"

# ═══════════════════════════════════════════════════════════
# ÉTAPE 7/8 : INSTALLATION DES DÉPENDANCES
# ═══════════════════════════════════════════════════════════
echo -e "${CYAN}[7/8] Installation des dépendances...${NC}"

# --- Backend ---
log_info "Backend : pip install..."
if [ -f "$APP_ROOT/venv/bin/activate" ]; then
    source "$APP_ROOT/venv/bin/activate"
    pip install -r "$APP_ROOT/backend/requirements.txt" --extra-index-url "$EXTRA_INDEX" >> "$LOG_FILE" 2>&1 \
        && log_ok "pip install OK (venv)" "pip" \
        || log_warn "pip install échoué (non bloquant)" "pip"
    pip install emergentintegrations --extra-index-url "$EXTRA_INDEX" >> "$LOG_FILE" 2>&1 || true
    deactivate 2>/dev/null || true
elif [ -f "$APP_ROOT/backend/requirements.txt" ]; then
    PIP_CMD=$(command -v pip3 2>/dev/null || echo "pip")
    $PIP_CMD install -r "$APP_ROOT/backend/requirements.txt" --extra-index-url "$EXTRA_INDEX" >> "$LOG_FILE" 2>&1 \
        && log_ok "pip install OK (système)" "pip" \
        || log_warn "pip install échoué (non bloquant)" "pip"
else
    log_warn "requirements.txt introuvable" "pip"
fi

# --- Frontend ---
log_info "Frontend : yarn install + build..."
cd "$APP_ROOT/frontend"

# Backup du build existant
if [ -d "build" ]; then
    rm -rf build_backup 2>/dev/null || true
    cp -r build build_backup
    log_info "Backup du build existant créé"
fi

# yarn install
yarn install --production=false >> "$LOG_FILE" 2>&1 \
    && log_info "yarn install OK" \
    || log_warn "yarn install avec avertissements"

# yarn build
if CI=false yarn build >> "$LOG_FILE" 2>&1; then
    if [ -f "build/index.html" ]; then
        log_ok "Frontend compilé (index.html présent)" "frontend"
    else
        log_fail "Build terminé mais index.html absent" "frontend"
    fi
else
    log_fail "yarn build échoué" "frontend"
    # Restaurer le build précédent
    if [ -d "build_backup" ]; then
        rm -rf build 2>/dev/null || true
        cp -r build_backup build
        log_warn "Build précédent restauré depuis le backup" "frontend"
        STEP_STATUS["frontend"]="WARN (rollback)"
    fi
fi

# Nettoyer backup
rm -rf build_backup 2>/dev/null || true
cd "$APP_ROOT"

# ═══════════════════════════════════════════════════════════
# ÉTAPE 8/8 : DÉSACTIVER MAINTENANCE + REDÉMARRAGE
# ═══════════════════════════════════════════════════════════
echo -e "${CYAN}[8/8] Désactivation maintenance et redémarrage...${NC}"

# Restaurer la config NGINX originale
if [ -f "$NGINX_BACKUP" ]; then
    cp "$NGINX_BACKUP" "$NGINX_REAL"
    log_info "Config NGINX restaurée"
fi

# Supprimer le flag
rm -f "$MFLAG"

# Recharger NGINX
if nginx -t 2>/dev/null && nginx -s reload 2>/dev/null; then
    log_ok "NGINX rechargé" "maintenance_off"
else
    systemctl reload nginx 2>/dev/null || true
    log_warn "NGINX rechargé via systemctl" "maintenance_off"
fi

log_ok "Mode maintenance DÉSACTIVÉ" "maintenance_off"

# ═══════════════════════════════════════════════════════════
# RÉSUMÉ FINAL
# ═══════════════════════════════════════════════════════════
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  RÉSUMÉ DE LA MISE À JOUR${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════${NC}"
echo -e "  Durée totale : ${MINUTES}min ${SECONDS}s"
echo -e "  Erreurs      : ${ERRORS_COUNT}"
echo ""
echo -e "  Étape                 │ Statut"
echo -e "  ──────────────────────┼─────────────"
for step in logout maintenance_on backup_db save_env git restore_env pip frontend maintenance_off; do
    status="${STEP_STATUS[$step]:-N/A}"
    case "$status" in
        OK*)   color=$GREEN ;;
        WARN*) color=$YELLOW ;;
        ERREUR*) color=$RED ;;
        *)     color=$NC ;;
    esac
    printf "  %-22s │ ${color}%s${NC}\n" "$step" "$status"
done
echo ""

if [ $ERRORS_COUNT -eq 0 ]; then
    echo -e "  ${GREEN}✓ MISE À JOUR RÉUSSIE${NC}"
else
    echo -e "  ${YELLOW}⚠ MISE À JOUR TERMINÉE AVEC $ERRORS_COUNT ERREUR(S)${NC}"
fi
echo -e "${CYAN}════════════════════════════════════════════════════${NC}"
echo ""

echo "Redémarrage dans 5 secondes..."
sleep 5
reboot
