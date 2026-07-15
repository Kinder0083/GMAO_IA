#!/usr/bin/env bash
# ================================================================
# MAJ_FSAO.sh - Mise à jour FSAO Iris depuis le conteneur LXC
# ================================================================
# Appelé par l'interface graphique.
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
APP_BACKUP_PATH=""
VERSION_BEFORE="?"
CODE_UPDATED="false"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ERRORS=""
WARNINGS=""
STEPS_OK=0
STEPS_WARN=0
STEPS_ERR=0

read_env_value() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed 's/^"//;s/"$//' || true
}

if [[ -f "$ENV_FILE" ]]; then
  for key in DB_NAME GITHUB_USER GITHUB_REPO GITHUB_BRANCH GITHUB_URL GITHUB_TOKEN INSTALL_EMERGENT_INTEGRATIONS; do
    val="$(read_env_value "$key")"
    if [[ -n "$val" && -z "${!key:-}" ]]; then
      export "$key=$val"
    fi
  done
  DB_FROM_ENV="$(read_env_value DB_NAME)"
  [[ -n "$DB_FROM_ENV" ]] && DB_NAME="$DB_FROM_ENV"
  GITHUB_USER_FROM_ENV="$(read_env_value GITHUB_USER)"
  [[ -n "$GITHUB_USER_FROM_ENV" ]] && GITHUB_USER="$GITHUB_USER_FROM_ENV"
  GITHUB_REPO_FROM_ENV="$(read_env_value GITHUB_REPO)"
  [[ -n "$GITHUB_REPO_FROM_ENV" ]] && GITHUB_REPO="$GITHUB_REPO_FROM_ENV"
  GITHUB_BRANCH_FROM_ENV="$(read_env_value GITHUB_BRANCH)"
  [[ -n "$GITHUB_BRANCH_FROM_ENV" ]] && GITHUB_BRANCH="$GITHUB_BRANCH_FROM_ENV"
  GITHUB_URL_FROM_ENV="$(read_env_value GITHUB_URL)"
  [[ -n "$GITHUB_URL_FROM_ENV" ]] && GITHUB_URL="$GITHUB_URL_FROM_ENV"
fi

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || LOG_FILE="/tmp/gmao-iris-update.log"
: > "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/gmao-iris-update.log"
exec > >(tee -a "$LOG_FILE") 2>&1

step_ok()   { echo "  [OK] $1"; STEPS_OK=$((STEPS_OK + 1)); }
step_warn() { echo "  [WARN] $1"; STEPS_WARN=$((STEPS_WARN + 1)); WARNINGS="${WARNINGS}|${1}"; }
step_fail() { echo "  [ERREUR] $1"; STEPS_ERR=$((STEPS_ERR + 1)); ERRORS="${ERRORS}|${1}"; }

json_array_from_pipe() {
  local raw="$1"
  if [[ -z "$raw" ]]; then echo "[]"; return; fi
  echo "$raw" | tr '|' '\n' | sed '/^$/d' | python3 -c 'import json,sys; print(json.dumps([l.rstrip("\n") for l in sys.stdin], ensure_ascii=False))' 2>/dev/null || echo "[]"
}

current_version() {
  if [[ -f "$APP_ROOT/updates/version.json" ]]; then
    python3 -c "import json; print(json.load(open('$APP_ROOT/updates/version.json')).get('version','?'))" 2>/dev/null || echo "?"
  else
    echo "?"
  fi
}

run_git() {
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    git -c http.extraHeader="AUTHORIZATION: bearer ${GITHUB_TOKEN}" "$@"
  else
    git "$@"
  fi
}

check_git_access() {
  run_git ls-remote "$GITHUB_URL" "$GITHUB_BRANCH" >/dev/null 2>&1
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
  "version_before": "$VERSION_BEFORE",
  "version_after": "$VERSION_CIBLE",
  "started_at": "$STARTED_AT",
  "completed_at": "$completed_at",
  "repository": "${GITHUB_USER}/${GITHUB_REPO}",
  "branch": "$GITHUB_BRANCH",
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
  for f in /etc/nginx/sites-enabled/gmao-iris /etc/nginx/sites-enabled/fsao-iris /etc/nginx/sites-enabled/default /etc/nginx/conf.d/gmao-iris.conf /etc/nginx/conf.d/default.conf; do
    [[ -f "$f" ]] && echo "$f" && return
  done
}

validate_remote_tree() {
  local ref="origin/$GITHUB_BRANCH"
  local required=("updates/version.json" "backend" "frontend" "MAJ_FSAO.sh")
  if ! git cat-file -e "${ref}^{commit}" 2>/dev/null; then
    step_fail "Branche distante introuvable après fetch: $ref"
    return 1
  fi
  for item in "${required[@]}"; do
    if ! git cat-file -e "${ref}:${item}" 2>/dev/null; then
      step_fail "Branche non compatible: élément manquant '${item}' dans ${GITHUB_USER}/${GITHUB_REPO}:${GITHUB_BRANCH}"
      return 1
    fi
  done
  step_ok "Branche distante compatible: ${GITHUB_USER}/${GITHUB_REPO}:${GITHUB_BRANCH}"
  return 0
}

precheck() {
  echo "=============================================================="
  echo "Pré-vérification mise à jour $APP_NAME"
  echo "Dépôt : ${GITHUB_USER}/${GITHUB_REPO}"
  echo "Branche : ${GITHUB_BRANCH}"
  echo "URL Git : ${GITHUB_URL}"
  echo "APP_ROOT : ${APP_ROOT}"
  echo "=============================================================="

  [[ -d "$APP_ROOT" ]] && step_ok "Répertoire applicatif trouvé" || step_fail "Répertoire applicatif introuvable: $APP_ROOT"
  [[ -f "$ENV_FILE" ]] && step_ok "backend/.env trouvé" || step_warn "backend/.env introuvable"
  command -v git >/dev/null 2>&1 && step_ok "git disponible" || step_fail "git absent"
  command -v python3 >/dev/null 2>&1 && step_ok "python3 disponible" || step_fail "python3 absent"
  command -v tar >/dev/null 2>&1 && step_ok "tar disponible" || step_fail "tar absent"
  [[ -d "$BACKEND_DIR" ]] && step_ok "Dossier backend trouvé" || step_fail "Dossier backend introuvable"
  [[ -d "$FRONTEND_DIR" ]] && step_ok "Dossier frontend trouvé" || step_fail "Dossier frontend introuvable"

  if check_git_access; then
    step_ok "Accès git au dépôt OK"
  else
    step_fail "Accès git impossible. Vérifier dépôt, branche, GITHUB_TOKEN, gh auth ou clé SSH dans le LXC."
  fi

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

VERSION_BEFORE="$(current_version)"
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

finish_failure() {
  restore_maintenance
  write_result false
  exit 1
}

trap 'echo "[TRAP] Sortie inattendue"; finish_failure' ERR

echo "=============================================================="
echo "Mise à jour $APP_NAME"
echo "Version actuelle : $VERSION_BEFORE"
echo "Version demandée : $VERSION_CIBLE"
echo "Dépôt : ${GITHUB_USER}/${GITHUB_REPO}"
echo "Branche : ${GITHUB_BRANCH}"
echo "Update ID : $UPDATE_ID"
echo "=============================================================="

# 1. Activation maintenance
step_label="[1/9] Page de maintenance"
echo "$step_label..."
touch "$MFLAG" 2>/dev/null || true
cat > "$APP_ROOT/maintenance.html" << 'HTML_MAINT'
<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FSAO Iris - Mise à jour</title><style>body{font-family:Arial,sans-serif;background:#0f172a;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.box{max-width:620px;padding:32px;border:1px solid #334155;border-radius:18px;background:#111827;text-align:center}h1{margin:0 0 12px;font-size:28px}p{color:#cbd5e1;line-height:1.5}</style></head><body><div class="box"><h1>FSAO Iris est en mise à jour</h1><p>L'application est momentanément indisponible. Merci de patienter quelques minutes puis de vous reconnecter.</p></div></body></html>
HTML_MAINT
if [[ -n "$NGINX_CONF" && -f "$NGINX_REAL" ]]; then
  cp "$NGINX_REAL" "$NGINX_BACKUP" 2>/dev/null || true
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

# 2. Backup MongoDB
step_label="[2/9] Backup MongoDB"
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

# 3. Backup applicatif
step_label="[3/9] Sauvegarde applicative"
echo "$step_label..."
APP_BACKUP_PATH="$APP_ROOT/backups/app_$(date +%Y%m%d_%H%M%S).tar.gz"
export APP_BACKUP_PATH
mkdir -p "$APP_ROOT/backups"
if tar --exclude='./backups' --exclude='./backend/venv' --exclude='./frontend/node_modules' --exclude='./frontend/build_backup' -czf "$APP_BACKUP_PATH" -C "$APP_ROOT" . >/dev/null 2>&1; then
  step_ok "Sauvegarde applicative créée: $APP_BACKUP_PATH"
else
  step_fail "Sauvegarde applicative échouée"
  finish_failure
fi

# 4. Sauvegarde fichiers persistants
step_label="[4/9] Sauvegarde des fichiers persistants"
echo "$step_label..."
mkdir -p "$ENV_TMP_DIR"
for f in "backend/.env" "frontend/.env"; do
  if [[ -f "$APP_ROOT/$f" ]]; then
    mkdir -p "$ENV_TMP_DIR/$(dirname "$f")"
    cp -a "$APP_ROOT/$f" "$ENV_TMP_DIR/$f"
  fi
done
[[ -f "$ENV_TMP_DIR/backend/.env" ]] && step_ok "Fichiers .env sauvegardés" || step_warn "backend/.env introuvable"

# 5. Synchronisation du code
step_label="[5/9] Synchronisation du code depuis GitHub"
echo "$step_label..."
cd "$APP_ROOT" || { step_fail "Impossible d'entrer dans $APP_ROOT"; finish_failure; }
if [[ ! -d .git ]]; then
  git init >/dev/null 2>&1 || { step_fail "git init échoué"; finish_failure; }
  git remote add origin "$GITHUB_URL" >/dev/null 2>&1 || git remote set-url origin "$GITHUB_URL" >/dev/null 2>&1 || true
else
  git remote set-url origin "$GITHUB_URL" >/dev/null 2>&1 || true
fi

if run_git fetch origin "$GITHUB_BRANCH" >/dev/null 2>&1; then
  validate_remote_tree || finish_failure
  if git reset --hard "origin/$GITHUB_BRANCH" >/dev/null 2>&1; then
    git clean -fd -e backups/ -e backend/.env -e frontend/.env -e backend/uploads/ >/dev/null 2>&1 || true
    CODE_UPDATED="true"
    step_ok "Code source synchronisé depuis ${GITHUB_USER}/${GITHUB_REPO}:${GITHUB_BRANCH}"
  else
    step_fail "git reset --hard échoué"
    finish_failure
  fi
else
  step_fail "git fetch échoué depuis ${GITHUB_USER}/${GITHUB_REPO}:${GITHUB_BRANCH}"
  finish_failure
fi

# 6. Restauration persistants
step_label="[6/9] Restauration des fichiers persistants"
echo "$step_label..."
for f in "backend/.env" "frontend/.env"; do
  if [[ -f "$ENV_TMP_DIR/$f" ]]; then
    mkdir -p "$APP_ROOT/$(dirname "$f")"
    cp -a "$ENV_TMP_DIR/$f" "$APP_ROOT/$f"
  fi
done
step_ok "Fichiers persistants restaurés"

# 7. Backend
step_label="[7/9] Backend Python"
echo "$step_label..."
cd "$BACKEND_DIR" || { step_fail "Dossier backend inaccessible"; finish_failure; }
if [[ ! -d venv ]]; then
  python3 -m venv venv >/dev/null 2>&1 || step_warn "Création venv impossible"
fi
if [[ -x venv/bin/pip ]]; then
  venv/bin/pip install --upgrade pip >/dev/null 2>&1 || true
  if [[ -f requirements.txt ]]; then
    venv/bin/pip install -r requirements.txt >/dev/null 2>&1 && step_ok "Dépendances backend installées" || step_warn "Installation dépendances backend incomplète"
  else
    step_warn "requirements.txt absent"
  fi
else
  step_warn "venv/bin/pip indisponible"
fi

# 8. Frontend
step_label="[8/9] Frontend React"
echo "$step_label..."
cd "$FRONTEND_DIR" || { step_warn "Dossier frontend inaccessible"; cd "$APP_ROOT"; }
if [[ -f package.json ]]; then
  if command -v yarn >/dev/null 2>&1; then
    yarn install --silent >/dev/null 2>&1 || step_warn "yarn install incomplet"
    yarn build >/dev/null 2>&1 && step_ok "Frontend reconstruit" || step_warn "Build frontend échoué"
  elif command -v npm >/dev/null 2>&1; then
    npm install >/dev/null 2>&1 || step_warn "npm install incomplet"
    npm run build >/dev/null 2>&1 && step_ok "Frontend reconstruit" || step_warn "Build frontend échoué"
  else
    step_warn "npm/yarn absent, build frontend ignoré"
  fi
else
  step_warn "package.json absent"
fi

# 9. Redémarrage services
step_label="[9/9] Redémarrage services"
echo "$step_label..."
restore_maintenance
if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl reread >/dev/null 2>&1 || true
  supervisorctl update >/dev/null 2>&1 || true
  supervisorctl restart gmao-iris-backend >/dev/null 2>&1 || supervisorctl restart fsao-iris-backend >/dev/null 2>&1 || step_warn "Redémarrage backend supervisor incertain"
else
  step_warn "supervisorctl absent"
fi
if command -v nginx >/dev/null 2>&1; then
  nginx -t >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1 && step_ok "NGINX rechargé" || step_warn "Reload NGINX impossible"
fi

write_result true
echo "=============================================================="
echo "Mise à jour terminée. Version avant: $VERSION_BEFORE / cible: $VERSION_CIBLE"
echo "Dépôt utilisé: ${GITHUB_USER}/${GITHUB_REPO}:${GITHUB_BRANCH}"
echo "=============================================================="
exit 0
