#!/bin/bash
# ================================================================
# MAJ_FSAO.sh - Mise à jour FSAO Iris depuis le conteneur LXC
# ================================================================
# Appelé par l'interface graphique via backend/update_service.py.
# Usage:
#   MAJ_FSAO.sh --check
#   MAJ_FSAO.sh <version> <update_id>
#
# Philosophie : aucune action sur l'hôte Proxmox.
# Toutes les opérations se font dans le conteneur LXC applicatif.
# ================================================================

set -uo pipefail

VERSION_CIBLE="${1:-inconnue}"
UPDATE_ID="${2:-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo manual-$(date +%s))}"
CHECK_ONLY="false"
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY="true"
  VERSION_CIBLE="precheck"
  UPDATE_ID="precheck-$(date +%s)"
fi

APP_NAME="FSAO Iris"
APP_ROOT="${APP_ROOT:-/opt/gmao-iris}"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_DIR="$APP_ROOT/frontend"
ENV_FILE="$BACKEND_DIR/.env"
GITHUB_USER="${GITHUB_USER:-Kinder0083}"
GITHUB_REPO="${GITHUB_REPO:-GMAO_IA}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
GITHUB_URL="${GITHUB_URL:-https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git}"
LOG_FILE="${LOG_FILE:-/var/log/gmao-iris-update.log}"
RESULT_FILE="${RESULT_FILE:-/var/log/gmao-iris-update-result.json}"
MFLAG="$APP_ROOT/maintenance.flag"
EXTRA_INDEX="${EXTRA_INDEX:-https://d33sy5i8bnduwe.cloudfront.net/simple/}"

DB_NAME="${DB_NAME:-fsao_iris}"
INSTALL_EMERGENT_INTEGRATIONS="${INSTALL_EMERGENT_INTEGRATIONS:-n}"
if [[ -f "$ENV_FILE" ]]; then
  DB_NAME="$(grep -E '^DB_NAME=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  DB_NAME="${DB_NAME:-fsao_iris}"
  INSTALL_EMERGENT_INTEGRATIONS="$(grep -E '^INSTALL_EMERGENT_INTEGRATIONS=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  INSTALL_EMERGENT_INTEGRATIONS="${INSTALL_EMERGENT_INTEGRATIONS:-n}"
fi

ERRORS=""
WARNINGS=""
STEPS_OK=0
STEPS_WARN=0
STEPS_ERR=0
CODE_UPDATED="false"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
APP_BACKUP_PATH=""

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || LOG_FILE="/tmp/gmao-iris-update.log"
: > "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/gmao-iris-update.log"
exec > >(tee -a "$LOG_FILE") 2>&1

step_ok()   { echo "  [OK] $1"; STEPS_OK=$((STEPS_OK + 1)); }
step_warn() { echo "  [WARN] $1"; STEPS_WARN=$((STEPS_WARN + 1)); WARNINGS="${WARNINGS}|${1}"; }
step_fail() { echo "  [ERREUR] $1"; STEPS_ERR=$((STEPS_ERR + 1)); ERRORS="${ERRORS}|${1}"; }

json_array_from_pipe() {
  local raw="$1"
  if [[ -z "$raw" ]]; then
    echo "[]"
    return
  fi
  echo "$raw" | tr '|' '\n' | sed '/^$/d' | python3 -c 'import json,sys; print(json.dumps([l.rstrip("\n") for l in sys.stdin], ensure_ascii=False))' 2>/dev/null || echo "[]"
}

current_version() {
  if [[ -f "$APP_ROOT/updates/version.json" ]]; then
    python3 -c "import json; print(json.load(open('$APP_ROOT/updates/version.json')).get('version','?'))" 2>/dev/null || echo "?"
  else
    echo "?"
  fi
}

write_result() {
  local success="$1"
  local completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local err_json warn_json log_json backup_json
  err_json="$(json_array_from_pipe "$ERRORS")"
  warn_json="$(json_array_from_pipe "$WARNINGS")"
  log_json="$(tail -c 20000 "$LOG_FILE" 2>/dev/null | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read(), ensure_ascii=False))' 2>/dev/null || echo '""')"
  backup_json="$(python3 -c 'import json,os; print(json.dumps(os.environ.get("APP_BACKUP_PATH", ""), ensure_ascii=False))' 2>/dev/null || echo '""')"

  mkdir -p "$(dirname "$RESULT_FILE")" 2>/dev/null || RESULT_FILE="/tmp/gmao-iris-update-result.json"
  cat > "$RESULT_FILE" << EOJSON
{
  "update_id": "$UPDATE_ID",
  "success": $success,
  "code_updated": $CODE_UPDATED,
  "version_before": "$(current_version)",
  "version_after": "$VERSION_CIBLE",
  "started_at": "$STARTED_AT",
  "completed_at": "$completed_at",
  "steps_ok": $STEPS_OK,
  "steps_warn": $STEPS_WARN,
  "steps_err": $STEPS_ERR,
  "errors": $err_json,
  "warnings": $warn_json,
  "backup_path": $backup_json,
  "log_content": $log_json
}
EOJSON
  echo "Résultat écrit dans $RESULT_FILE"
}

find_nginx_conf() {
  for f in /etc/nginx/sites-enabled/gmao-iris \
           /etc/nginx/sites-enabled/fsao-iris \
           /etc/nginx/sites-enabled/default \
           /etc/nginx/conf.d/gmao-iris.conf \
           /etc/nginx/conf.d/default.conf; do
    [[ -f "$f" ]] && echo "$f" && return
  done
}

run_git() {
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    git -c http.extraHeader="AUTHORIZATION: bearer ${GITHUB_TOKEN}" "$@"
  else
    git "$@"
  fi
}

check_git_access() {
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    git -c http.extraHeader="AUTHORIZATION: bearer ${GITHUB_TOKEN}" ls-remote "$GITHUB_URL" "$GITHUB_BRANCH" >/dev/null 2>&1
  elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    gh repo view "${GITHUB_USER}/${GITHUB_REPO}" >/dev/null 2>&1
  else
    git ls-remote "$GITHUB_URL" "$GITHUB_BRANCH" >/dev/null 2>&1
  fi
}

precheck() {
  echo "========================================================"
  echo "  PRE-CHECK MISE À JOUR $APP_NAME - LXC"
  echo "========================================================"
  echo "Application : $APP_ROOT"
  echo "Dépôt       : ${GITHUB_USER}/${GITHUB_REPO} ($GITHUB_BRANCH)"
  echo "Base Mongo  : $DB_NAME"
  echo ""

  [[ -d "$APP_ROOT" ]] && step_ok "Dossier application présent" || step_fail "Dossier application absent: $APP_ROOT"
  [[ -w "$APP_ROOT" ]] && step_ok "Dossier application modifiable" || step_fail "Dossier application non modifiable"
  [[ -f "$ENV_FILE" ]] && step_ok "backend/.env présent" || step_fail "backend/.env absent"
  command -v git >/dev/null 2>&1 && step_ok "git disponible" || step_fail "git absent"
  command -v python3 >/dev/null 2>&1 && step_ok "python3 disponible" || step_fail "python3 absent"
  command -v yarn >/dev/null 2>&1 && step_ok "yarn disponible" || step_warn "yarn absent ou non accessible"
  command -v nginx >/dev/null 2>&1 && step_ok "nginx disponible" || step_warn "nginx absent ou non accessible"
  command -v supervisorctl >/dev/null 2>&1 && step_ok "supervisorctl disponible" || step_warn "supervisorctl absent ou non accessible"
  command -v mongodump >/dev/null 2>&1 && step_ok "mongodump disponible" || step_warn "mongodump absent : backup MongoDB limité"

  if check_git_access; then
    step_ok "Accès au dépôt GitHub OK"
  else
    step_fail "Accès au dépôt GitHub impossible. Configurer GITHUB_TOKEN, gh auth ou une URL SSH valide dans le LXC."
  fi

  local free_kb
  free_kb=$(df -Pk "$APP_ROOT" | awk 'NR==2 {print $4}')
  if [[ -n "$free_kb" && "$free_kb" -gt 2097152 ]]; then
    step_ok "Espace disque disponible supérieur à 2 Go"
  else
    step_warn "Espace disque potentiellement insuffisant"
  fi

  if [[ $STEPS_ERR -eq 0 ]]; then
    write_result true
    exit 0
  fi
  write_result false
  exit 1
}

if [[ "$CHECK_ONLY" == "true" ]]; then
  precheck
fi

NGINX_CONF="$(find_nginx_conf || true)"
NGINX_REAL="$(readlink -f "$NGINX_CONF" 2>/dev/null || echo "$NGINX_CONF")"
NGINX_BACKUP="${NGINX_REAL}.backup_pre_maintenance"
ENV_TMP_DIR="/tmp/fsao-iris-env-${UPDATE_ID}"

restore_maintenance() {
  rm -f "$MFLAG" 2>/dev/null || true
  if [[ -n "${NGINX_REAL:-}" && -f "${NGINX_BACKUP:-}" ]]; then
    cp "$NGINX_BACKUP" "$NGINX_REAL" 2>/dev/null || true
    nginx -t >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1 || systemctl reload nginx >/dev/null 2>&1 || true
  fi
}

trap 'echo "[TRAP] Sortie inattendue"; restore_maintenance; write_result false' ERR

cat << HEADER
========================================================
  MISE À JOUR $APP_NAME - DEPUIS LE LXC
  Version cible : $VERSION_CIBLE
  Update ID     : $UPDATE_ID
  Date          : $(date '+%d/%m/%Y %H:%M:%S')
========================================================
HEADER

# 1. Déconnexion forcée
step_label="[1/9] Déconnexion forcée des utilisateurs"
echo "$step_label..."
MONGO_CMD="$(command -v mongosh 2>/dev/null || command -v mongo 2>/dev/null || echo "")"
if [[ -n "$MONGO_CMD" ]]; then
  if $MONGO_CMD --quiet --eval "db = db.getSiblingDB('$DB_NAME'); db.system_settings.updateOne({key:'force_logout_at'},{\$set:{key:'force_logout_at',timestamp:Date.now()/1000}},{upsert:true}); print('OK');" >/dev/null 2>&1; then
    step_ok "Force logout envoyé"
    sleep 10
  else
    step_warn "Force logout échoué (non bloquant)"
  fi
else
  step_warn "mongosh/mongo non trouvé, déconnexion ignorée"
fi

# 2. Maintenance
step_label="[2/9] Activation maintenance"
echo "$step_label..."
touch "$MFLAG" 2>/dev/null || step_warn "maintenance.flag non créé"
if [[ -n "$NGINX_CONF" && -f "$NGINX_REAL" ]]; then
  [[ -f "$NGINX_BACKUP" ]] || cp "$NGINX_REAL" "$NGINX_BACKUP"
  cat > "$NGINX_REAL" << NGINX_MAINT
server {
    listen 80;
    server_name _;
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    location / {
        root $APP_ROOT;
        try_files /maintenance.html =503;
    }
    error_page 503 @maintenance;
    location @maintenance {
        root $APP_ROOT;
        rewrite ^(.*)$ /maintenance.html break;
    }
}
NGINX_MAINT
  if nginx -t >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1; then
    step_ok "Page de maintenance active"
  else
    systemctl reload nginx >/dev/null 2>&1 || true
    step_warn "Maintenance activée avec rechargement NGINX imparfait"
  fi
else
  step_warn "Configuration NGINX non trouvée, maintenance.flag seul"
fi

# 3. Backup MongoDB
step_label="[3/9] Backup MongoDB"
echo "$step_label..."
BACKUP_DIR="$APP_ROOT/backups/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
if command -v mongodump >/dev/null 2>&1; then
  if mongodump --uri="${MONGO_URL:-mongodb://localhost:27017}" --db="$DB_NAME" --out="$BACKUP_DIR" >/dev/null 2>&1; then
    step_ok "Backup MongoDB réussi: $BACKUP_DIR"
  else
    step_warn "Backup MongoDB échoué (non bloquant)"
  fi
else
  step_warn "mongodump absent, backup MongoDB ignoré"
fi

# 4. Backup applicatif léger
step_label="[4/9] Sauvegarde applicative"
echo "$step_label..."
APP_BACKUP_PATH="$APP_ROOT/backups/app_$(date +%Y%m%d_%H%M%S).tar.gz"
export APP_BACKUP_PATH
if tar --exclude='./backups' --exclude='./backend/venv' --exclude='./frontend/node_modules' --exclude='./frontend/build_backup' -czf "$APP_BACKUP_PATH" -C "$APP_ROOT" . >/dev/null 2>&1; then
  step_ok "Sauvegarde applicative créée: $APP_BACKUP_PATH"
else
  step_warn "Sauvegarde applicative échouée"
fi

# 5. Sauvegarde .env et dossiers persistants
step_label="[5/9] Sauvegarde des fichiers persistants"
echo "$step_label..."
mkdir -p "$ENV_TMP_DIR"
for f in "backend/.env" "frontend/.env"; do
  if [[ -f "$APP_ROOT/$f" ]]; then
    mkdir -p "$ENV_TMP_DIR/$(dirname "$f")"
    cp -a "$APP_ROOT/$f" "$ENV_TMP_DIR/$f"
  fi
done
[[ -f "$ENV_TMP_DIR/backend/.env" ]] && step_ok "Fichiers .env sauvegardés" || step_fail "backend/.env introuvable"

# 6. Mise à jour du code
step_label="[6/9] Synchronisation du code depuis GitHub"
echo "$step_label..."
cd "$APP_ROOT" || { step_fail "Impossible d'entrer dans $APP_ROOT"; write_result false; exit 1; }
if [[ ! -d .git ]]; then
  git init >/dev/null 2>&1 || step_fail "git init échoué"
  git remote add origin "$GITHUB_URL" >/dev/null 2>&1 || git remote set-url origin "$GITHUB_URL" >/dev/null 2>&1 || true
else
  git remote set-url origin "$GITHUB_URL" >/dev/null 2>&1 || true
fi

if run_git fetch origin "$GITHUB_BRANCH" >/dev/null 2>&1; then
  if git reset --hard "origin/$GITHUB_BRANCH" >/dev/null 2>&1; then
    git clean -fd -e backups/ -e backend/.env -e frontend/.env -e backend/uploads/ >/dev/null 2>&1 || true
    CODE_UPDATED="true"
    step_ok "Code source synchronisé depuis ${GITHUB_USER}/${GITHUB_REPO}:${GITHUB_BRANCH}"
  else
    step_fail "git reset --hard échoué"
  fi
else
  step_fail "git fetch échoué : vérifier l'accès GitHub depuis le LXC"
fi

# 7. Restauration .env
step_label="[7/9] Restauration des fichiers persistants"
echo "$step_label..."
for f in "backend/.env" "frontend/.env"; do
  if [[ -f "$ENV_TMP_DIR/$f" ]]; then
    mkdir -p "$APP_ROOT/$(dirname "$f")"
    cp -a "$ENV_TMP_DIR/$f" "$APP_ROOT/$f"
  fi
done
rm -rf "$ENV_TMP_DIR" 2>/dev/null || true
[[ -f "$APP_ROOT/backend/.env" ]] && step_ok "backend/.env restauré" || step_fail "backend/.env non restauré"

# 8. Dépendances et build
step_label="[8/9] Installation dépendances et build"
echo "$step_label..."
cd "$BACKEND_DIR" || step_fail "Dossier backend introuvable"
if [[ -d "$BACKEND_DIR" ]]; then
  [[ -d "$BACKEND_DIR/venv" ]] || python3 -m venv "$BACKEND_DIR/venv" >/dev/null 2>&1 || step_warn "Création venv échouée"
  if [[ -f "$BACKEND_DIR/venv/bin/activate" ]]; then
    source "$BACKEND_DIR/venv/bin/activate"
    pip install --upgrade pip wheel setuptools >/dev/null 2>&1 || step_warn "Mise à jour pip avec avertissements"
    if pip install -r "$BACKEND_DIR/requirements.txt" --extra-index-url "$EXTRA_INDEX" >/dev/null 2>&1; then
      step_ok "Dépendances backend installées"
    else
      step_fail "pip install backend échoué"
    fi
    if [[ "$INSTALL_EMERGENT_INTEGRATIONS" =~ ^[OoYy]$ ]]; then
      pip install emergentintegrations --extra-index-url "$EXTRA_INDEX" >/dev/null 2>&1 || step_warn "emergentintegrations non installé"
    fi
    deactivate 2>/dev/null || true
  fi
fi

cd "$FRONTEND_DIR" || step_fail "Dossier frontend introuvable"
if [[ -d "$FRONTEND_DIR" ]]; then
  [[ -d build ]] && rm -rf build_backup && cp -a build build_backup
  yarn install --production=false >/dev/null 2>&1 || step_warn "yarn install avec avertissements"
  if CI=false yarn build >/dev/null 2>&1 && [[ -f build/index.html ]]; then
    step_ok "Frontend compilé"
  else
    step_fail "Build frontend échoué"
    if [[ -d build_backup ]]; then
      rm -rf build
      cp -a build_backup build
      step_warn "Ancien build restauré"
    fi
  fi
  rm -rf build_backup 2>/dev/null || true
fi
cd "$APP_ROOT" || true

# 9. Désactivation maintenance et redémarrage services
step_label="[9/9] Redémarrage applicatif"
echo "$step_label..."
restore_maintenance
step_ok "Maintenance désactivée"

if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl reread >/dev/null 2>&1 || true
  supervisorctl update >/dev/null 2>&1 || true
  if supervisorctl restart gmao-iris-backend >/dev/null 2>&1 || supervisorctl restart all >/dev/null 2>&1; then
    step_ok "Backend redémarré via supervisor"
  else
    step_warn "Redémarrage supervisor incertain"
  fi
else
  step_warn "supervisorctl absent, redémarrage manuel potentiellement nécessaire"
fi
nginx -t >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1 || systemctl reload nginx >/dev/null 2>&1 || step_warn "Reload NGINX incertain"

if [[ $STEPS_ERR -eq 0 ]]; then
  echo ""
  echo "=========================================="
  echo "  MISE À JOUR RÉUSSIE"
  echo "  OK: $STEPS_OK | WARN: $STEPS_WARN | ERR: $STEPS_ERR"
  echo "=========================================="
  write_result true
  exit 0
fi

echo ""
echo "=========================================="
echo "  MISE À JOUR TERMINÉE AVEC $STEPS_ERR ERREUR(S)"
echo "  OK: $STEPS_OK | WARN: $STEPS_WARN | ERR: $STEPS_ERR"
echo "=========================================="
write_result false
exit 1
