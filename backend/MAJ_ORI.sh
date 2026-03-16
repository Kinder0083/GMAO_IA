#!/bin/bash
# ================================================================
# MAJ_ORI.sh - Script ORIGINAL de mise à jour FSAO Iris
# ================================================================
# BACKUP de la logique de mise à jour telle qu'elle existait dans
# update_service.py (méthode apply_update, version v7.1)
#
# Ce fichier est une RÉFÉRENCE. Ne pas modifier.
# Les améliorations seront faites dans un nouveau script séparé.
#
# Étapes reproduites :
#   1. Sauvegarde des fichiers .env
#   2. Suppression .git + git init + git fetch + git reset --hard
#   3. Restauration des fichiers .env
#   4. Installation dépendances backend (pip install)
#   5. Installation + build frontend (yarn install + yarn build)
#   6. Redémarrage des services
# ================================================================

set -e

# === CONFIGURATION ===
APP_ROOT="${APP_ROOT:-$(dirname "$(dirname "$(realpath "$0")")")}"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_DIR="$APP_ROOT/frontend"
GITHUB_USER="${GITHUB_USER:-Kinder0083}"
GITHUB_REPO="${GITHUB_REPO:-GMAO}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
GITHUB_URL="https://github.com/$GITHUB_USER/$GITHUB_REPO.git"
EXTRA_INDEX="https://d33sy5i8bnduwe.cloudfront.net/simple/"
VERSION_CIBLE="${1:-inconnue}"

LOG_FILE="/var/log/gmao-iris-update.log"
RESULT_FILE="/var/log/gmao-iris-update-result.json"

# === FONCTIONS UTILITAIRES ===
log() {
    local msg="[$(date '+%H:%M:%S')] $1"
    echo "$msg"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

erreur() {
    log "ERREUR: $1"
    echo "{\"success\":false,\"errors\":[\"$1\"],\"version_after\":\"$VERSION_CIBLE\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S)\"}" > "$RESULT_FILE" 2>/dev/null || true
    exit 1
}

# === DÉBUT ===
echo "" > "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/gmao-iris-update.log" && echo "" > "$LOG_FILE"

log "============================================================"
log "MISE À JOUR FSAO IRIS - Script Original (MAJ_ORI.sh)"
log "Version cible: $VERSION_CIBLE"
log "APP_ROOT: $APP_ROOT"
log "GitHub: $GITHUB_USER/$GITHUB_REPO:$GITHUB_BRANCH"
log "============================================================"

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%S)"
ERRORS=""

# === ÉTAPE 1/6 : Sauvegarde .env ===
log ""
log "=== ÉTAPE 1/6 : Sauvegarde .env ==="
for f in "backend/.env" "frontend/.env"; do
    src="$APP_ROOT/$f"
    dst="/tmp/$(echo "$f" | tr '/' '_')"
    if [ -f "$src" ]; then
        cp -a "$src" "$dst"
        log "  OK: $f -> $dst"
    else
        log "  SKIP: $f (n'existe pas)"
    fi
done

# === ÉTAPE 2/6 : Récupération du code (méthode clean) ===
log ""
log "=== ÉTAPE 2/6 : Récupération code (méthode clean) ==="
cd "$APP_ROOT"

# Supprimer le .git existant
if [ -d ".git" ]; then
    rm -rf .git
    log "  rm -rf .git OK"
fi

# git init
git init >> "$LOG_FILE" 2>&1
log "  git init OK"

# git remote add origin
git remote add origin "$GITHUB_URL" >> "$LOG_FILE" 2>&1
log "  git remote add origin OK"

# git fetch
log "  git fetch origin $GITHUB_BRANCH ..."
if git fetch origin "$GITHUB_BRANCH" >> "$LOG_FILE" 2>&1; then
    log "  git fetch OK"
else
    ERRORS="$ERRORS|git fetch échoué"
    log "  git fetch ERREUR"
fi

# git reset --hard
if git reset --hard "origin/$GITHUB_BRANCH" >> "$LOG_FILE" 2>&1; then
    log "  git reset --hard OK"
    CODE_UPDATED="true"
else
    ERRORS="$ERRORS|git reset échoué"
    log "  git reset ERREUR"
    CODE_UPDATED="false"
fi

# === ÉTAPE 3/6 : Restauration .env ===
log ""
log "=== ÉTAPE 3/6 : Restauration .env ==="
for f in "backend/.env" "frontend/.env"; do
    src="/tmp/$(echo "$f" | tr '/' '_')"
    dst="$APP_ROOT/$f"
    if [ -f "$src" ]; then
        cp -a "$src" "$dst"
        log "  OK: $src -> $f"
    fi
done

# === ÉTAPE 4/6 : Installation dépendances backend ===
log ""
log "=== ÉTAPE 4/6 : Installation dépendances backend ==="
VENV_ACTIVATE="$APP_ROOT/venv/bin/activate"
REQUIREMENTS="$BACKEND_DIR/requirements.txt"

if [ -f "$VENV_ACTIVATE" ] && [ -f "$REQUIREMENTS" ]; then
    log "  source venv/bin/activate && pip install -r requirements.txt"
    if bash -c "source $VENV_ACTIVATE && pip install -r $REQUIREMENTS --extra-index-url $EXTRA_INDEX" >> "$LOG_FILE" 2>&1; then
        log "  pip install OK"
    else
        log "  pip install ERREUR (non bloquant)"
    fi
elif [ -f "$REQUIREMENTS" ]; then
    VENV_PIP="$APP_ROOT/venv/bin/pip3"
    [ ! -f "$VENV_PIP" ] && VENV_PIP="$APP_ROOT/venv/bin/pip"
    [ ! -f "$VENV_PIP" ] && VENV_PIP="pip3"
    log "  Fallback: $VENV_PIP install -r requirements.txt"
    $VENV_PIP install -r "$REQUIREMENTS" --extra-index-url "$EXTRA_INDEX" >> "$LOG_FILE" 2>&1 || log "  pip ERREUR (non bloquant)"
else
    log "  SKIP: requirements.txt introuvable"
fi

# === ÉTAPE 5/6 : Frontend (yarn install + yarn build) ===
log ""
log "=== ÉTAPE 5/6 : Frontend (yarn install + build) ==="
if [ -f "$FRONTEND_DIR/package.json" ]; then
    cd "$FRONTEND_DIR"

    # Backup du build existant
    if [ -d "build" ]; then
        rm -rf build_backup
        cp -r build build_backup
        log "  Backup build/ créé"
    fi

    # yarn install
    if yarn install >> "$LOG_FILE" 2>&1; then
        log "  yarn install OK"
    else
        log "  yarn install AVERTISSEMENT"
    fi

    # yarn build
    log "  yarn build ..."
    if CI=false yarn build >> "$LOG_FILE" 2>&1; then
        if [ -f "build/index.html" ]; then
            log "  yarn build OK (index.html présent)"
        else
            log "  yarn build OK mais index.html absent!"
            ERRORS="$ERRORS|yarn build: index.html absent"
        fi
    else
        log "  yarn build ERREUR"
        ERRORS="$ERRORS|yarn build échoué"
        # Restaurer le backup
        if [ -d "build_backup" ]; then
            rm -rf build
            cp -r build_backup build
            log "  Build restauré depuis le backup"
        fi
    fi

    # Nettoyer backup
    rm -rf build_backup

    cd "$APP_ROOT"
else
    log "  SKIP: package.json introuvable"
fi

# === ÉTAPE 6/6 : Redémarrage ===
log ""
log "=== ÉTAPE 6/6 : Redémarrage des services ==="
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%S)"

if [ -z "$ERRORS" ] && [ "$CODE_UPDATED" = "true" ]; then
    SUCCESS="true"
    log "MISE À JOUR RÉUSSIE"
else
    SUCCESS="false"
    log "MISE À JOUR AVEC ERREURS: $ERRORS"
fi

# Sauvegarder le résultat
cat > "$RESULT_FILE" << EOJSON
{
    "success": $SUCCESS,
    "code_updated": $CODE_UPDATED,
    "version_before": "$(cat "$APP_ROOT/updates/version.json" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "?")",
    "version_after": "$VERSION_CIBLE",
    "started_at": "$STARTED_AT",
    "completed_at": "$COMPLETED_AT",
    "errors": [$(echo "$ERRORS" | tr '|' '\n' | sed '/^$/d' | sed 's/.*/"&"/' | paste -sd',')],
    "update_id": "$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "manual-$(date +%s)")"
}
EOJSON

# Recharger NGINX
nginx -s reload >> "$LOG_FILE" 2>&1 || sudo nginx -s reload >> "$LOG_FILE" 2>&1 || sudo systemctl reload nginx >> "$LOG_FILE" 2>&1 || true
log "  NGINX reload tenté"

# Redémarrer les services
supervisorctl restart backend >> "$LOG_FILE" 2>&1 || sudo supervisorctl restart backend >> "$LOG_FILE" 2>&1 || true
log "  Backend restart tenté"

# Optionnel: reboot complet
# reboot >> "$LOG_FILE" 2>&1 || sudo reboot >> "$LOG_FILE" 2>&1 || true

log "============================================================"
log "Script MAJ_ORI.sh terminé"
log "============================================================"
