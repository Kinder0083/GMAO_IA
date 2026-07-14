#!/usr/bin/env bash
###############################################################################
# FSAO Iris v1.12.0 - Mise à jour par archive Proxmox LXC / Debian 12
#
# Objectif :
# - préparer une archive applicative depuis l'hôte Proxmox ;
# - transférer cette archive dans un conteneur FSAO Iris existant ;
# - préparer la nouvelle version en staging ;
# - sauvegarder l'installation actuelle ;
# - remplacer l'application uniquement après build réussi ;
# - restaurer les fichiers .env existants ;
# - redémarrer Supervisor et Nginx.
###############################################################################

set -Eeuo pipefail

APP_NAME="FSAO Iris"
APP_VERSION="1.12.0"
APP_TECH_SLUG="gmao-iris"
APP_DIR="/opt/${APP_TECH_SLUG}"
BACKUP_ROOT="/opt/${APP_TECH_SLUG}-backups"
DEFAULT_REPO_FULL="Kinder0083/GMAO_IA"
DEFAULT_GIT_URL="git@github.com:Kinder0083/GMAO_IA.git"
DEFAULT_BRANCH="main"
LOG_FILE="/tmp/fsao-iris-update-$(date +%Y%m%d_%H%M%S).log"
HOST_WORKDIR=""
SOURCE_ARCHIVE=""
SOURCE_METHOD=""
REPO_FULL="$DEFAULT_REPO_FULL"
GIT_URL="$DEFAULT_GIT_URL"
BRANCH="$DEFAULT_BRANCH"
LOCAL_ARCHIVE=""
CTID=""

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

msg() { echo -e "${BLUE}▶${NC} $1"; }
ok() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; exit 1; }

cleanup() {
  if [[ -n "${HOST_WORKDIR:-}" && -d "$HOST_WORKDIR" ]]; then
    rm -rf "$HOST_WORKDIR" 2>/dev/null || true
  fi
}

on_error() {
  local code=$?
  local line=${1:-?}
  echo -e "${RED}✗ Erreur ligne ${line} - code ${code}. Journal : ${LOG_FILE}${NC}" >&2
}

trap cleanup EXIT
trap 'on_error $LINENO' ERR

exec > >(tee -a "$LOG_FILE") 2>&1

read_tty() {
  local prompt="$1"
  local default_value="${2:-}"
  local result
  if [[ -n "$default_value" ]]; then
    read -r -p "${prompt} [${default_value}]: " result < /dev/tty
    echo "${result:-$default_value}"
  else
    read -r -p "${prompt}: " result < /dev/tty
    echo "$result"
  fi
}

yes_no() {
  local prompt="$1"
  local default_value="${2:-n}"
  local other="o"
  local response
  [[ "$default_value" =~ ^[OoYy]$ ]] && other="n"
  read -r -p "${prompt} (${default_value}/${other}): " response < /dev/tty
  response=${response:-$default_value}
  [[ "$response" =~ ^[OoYy]$ ]]
}

banner() {
  clear
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║      ${APP_NAME} v${APP_VERSION} - Mise à jour par archive      ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Journal : ${LOG_FILE}"
  echo ""
}

require_proxmox() {
  [[ "$(id -u)" -eq 0 ]] || err "Ce script doit être exécuté en root sur l'hôte Proxmox."
  command -v pct >/dev/null 2>&1 || err "La commande pct est introuvable. Exécuter ce script sur Proxmox."
  command -v git >/dev/null 2>&1 || apt-get update && apt-get install -y git
}

ensure_github_cli() {
  if command -v gh >/dev/null 2>&1; then
    ok "GitHub CLI détecté."
    return
  fi

  msg "Installation de GitHub CLI sur l'hôte Proxmox..."
  apt-get update
  apt-get install -y curl ca-certificates gnupg
  mkdir -p -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
  chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list
  apt-get update
  apt-get install -y gh
  ok "GitHub CLI installé."
}

ensure_github_cli_auth() {
  if gh auth status -h github.com >/dev/null 2>&1; then
    ok "Session GitHub CLI déjà active."
    return
  fi

  warn "Connexion GitHub requise. Le script va lancer une connexion guidée."
  echo ""
  echo "Le terminal affichera un code et une adresse GitHub."
  echo "Ouvrez l'adresse sur votre PC, connectez-vous à GitHub, puis validez le code."
  echo ""
  read -r -p "Appuyez sur Entrée pour continuer..." < /dev/tty

  gh auth login --hostname github.com --git-protocol ssh --web
  gh auth setup-git --hostname github.com >/dev/null 2>&1 || true
  gh auth status -h github.com >/dev/null 2>&1 || err "Connexion GitHub CLI non validée."
  ok "Connexion GitHub CLI validée."
}

select_source_method() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Source de mise à jour"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "1) Connexion guidée GitHub automatique - recommandé"
  echo "2) Clé SSH déjà configurée"
  echo "3) URL Git personnalisée"
  echo "4) Archive locale déjà téléchargée"
  echo ""

  SOURCE_METHOD=$(read_tty "Votre choix" "1")

  case "$SOURCE_METHOD" in
    1)
      REPO_FULL=$(read_tty "Dépôt GitHub" "$DEFAULT_REPO_FULL")
      BRANCH=$(read_tty "Branche" "$DEFAULT_BRANCH")
      ;;
    2)
      GIT_URL=$(read_tty "URL SSH du dépôt" "$DEFAULT_GIT_URL")
      BRANCH=$(read_tty "Branche" "$DEFAULT_BRANCH")
      ;;
    3)
      GIT_URL=$(read_tty "URL Git complète du dépôt")
      [[ -z "$GIT_URL" ]] && err "URL Git obligatoire."
      BRANCH=$(read_tty "Branche" "$DEFAULT_BRANCH")
      ;;
    4)
      LOCAL_ARCHIVE=$(read_tty "Chemin complet de l'archive .tar.gz locale")
      [[ -f "$LOCAL_ARCHIVE" ]] || err "Archive introuvable : $LOCAL_ARCHIVE"
      BRANCH="archive-locale"
      ;;
    *)
      err "Choix invalide."
      ;;
  esac
}

detect_default_ctid() {
  pct list 2>/dev/null | awk -v slug="$APP_TECH_SLUG" 'NR>1 && $3==slug {print $1; exit}' || true
}

select_container() {
  local default_ctid
  default_ctid=$(detect_default_ctid)

  echo ""
  msg "Conteneurs LXC disponibles :"
  pct list || true
  echo ""

  CTID=$(read_tty "ID du conteneur FSAO Iris à mettre à jour" "$default_ctid")
  [[ -z "$CTID" ]] && err "ID conteneur obligatoire."
  pct status "$CTID" >/dev/null 2>&1 || err "Conteneur $CTID introuvable."

  local status
  status=$(pct status "$CTID" | awk '{print $2}')
  if [[ "$status" != "running" ]]; then
    if yes_no "Le conteneur $CTID est arrêté. Le démarrer ?" "o"; then
      pct start "$CTID"
      sleep 5
    else
      err "Mise à jour impossible si le conteneur est arrêté."
    fi
  fi
}

prepare_source_archive() {
  msg "Préparation de l'archive applicative sur l'hôte Proxmox..."
  HOST_WORKDIR=$(mktemp -d /tmp/fsao-iris-update-src.XXXXXX)
  SOURCE_ARCHIVE="$HOST_WORKDIR/fsao-iris-source.tar.gz"

  if [[ "$SOURCE_METHOD" == "4" ]]; then
    msg "Utilisation de l'archive locale : $LOCAL_ARCHIVE"
    tar -tzf "$LOCAL_ARCHIVE" >/dev/null || err "Archive locale invalide ou illisible."
    cp "$LOCAL_ARCHIVE" "$SOURCE_ARCHIVE"
    ok "Archive locale copiée."
    return
  fi

  local repo_dir="$HOST_WORKDIR/repo"

  case "$SOURCE_METHOD" in
    1)
      ensure_github_cli
      ensure_github_cli_auth
      msg "Vérification de l'accès GitHub au dépôt $REPO_FULL..."
      gh repo view "$REPO_FULL" >/dev/null || err "Accès refusé ou dépôt introuvable : $REPO_FULL"
      gh repo clone "$REPO_FULL" "$repo_dir" -- --depth 1 --branch "$BRANCH"
      ;;
    2)
      msg "Clonage via clé SSH déjà configurée..."
      git ls-remote "$GIT_URL" "$BRANCH" >/dev/null || err "Accès SSH au dépôt impossible. Vérifiez la clé SSH de l'hôte Proxmox."
      git clone --depth 1 --branch "$BRANCH" "$GIT_URL" "$repo_dir"
      ;;
    3)
      msg "Clonage via URL Git personnalisée..."
      git clone --depth 1 --branch "$BRANCH" "$GIT_URL" "$repo_dir"
      ;;
  esac

  rm -rf "$repo_dir/.git"
  tar \
    --exclude='backend/.env' \
    --exclude='frontend/.env' \
    --exclude='node_modules' \
    --exclude='backend/venv' \
    --exclude='frontend/build' \
    --exclude='backups' \
    --exclude='*.pyc' \
    --exclude='__pycache__' \
    -czf "$SOURCE_ARCHIVE" -C "$repo_dir" .

  ok "Archive prête : $SOURCE_ARCHIVE"
}

push_source_archive() {
  msg "Transfert de l'archive vers le conteneur $CTID..."
  [[ -f "$SOURCE_ARCHIVE" ]] || err "Archive source introuvable."
  pct push "$CTID" "$SOURCE_ARCHIVE" "/tmp/fsao-iris-source.tar.gz"
  ok "Archive transférée."
}

run_update_in_container() {
  msg "Application de la mise à jour dans le conteneur..."
  pct exec "$CTID" -- env APP_DIR="$APP_DIR" BACKUP_ROOT="$BACKUP_ROOT" APP_TECH_SLUG="$APP_TECH_SLUG" bash << 'UPDATE_EOF'
set -Eeuo pipefail

TS=$(date +%Y%m%d_%H%M%S)
STAGING_DIR="/opt/${APP_TECH_SLUG}-staging-${TS}"
BACKUP_DIR="${BACKUP_ROOT}/${TS}"
ARCHIVE="/tmp/fsao-iris-source.tar.gz"
SERVICE="gmao-iris-backend"

rollback() {
  local code=$?
  if [[ -d "$BACKUP_DIR/app" && ! -d "$APP_DIR" ]]; then
    mv "$BACKUP_DIR/app" "$APP_DIR" || true
  fi
  if command -v supervisorctl >/dev/null 2>&1; then
    supervisorctl restart "$SERVICE" >/dev/null 2>&1 || true
  fi
  echo "ERREUR : mise à jour interrompue. Ancienne version conservée ou restaurée depuis $BACKUP_DIR."
  exit "$code"
}
trap rollback ERR

[[ -f "$ARCHIVE" ]] || { echo "Archive absente : $ARCHIVE"; exit 1; }
[[ -d "$APP_DIR" ]] || { echo "Installation actuelle introuvable : $APP_DIR"; exit 1; }

mkdir -p "$BACKUP_DIR"
mkdir -p "$STAGING_DIR"

echo "Extraction en staging : $STAGING_DIR"
tar -xzf "$ARCHIVE" -C "$STAGING_DIR"
rm -f "$ARCHIVE"

if [[ -f "$APP_DIR/backend/.env" ]]; then
  mkdir -p "$STAGING_DIR/backend"
  cp "$APP_DIR/backend/.env" "$STAGING_DIR/backend/.env"
  chmod 600 "$STAGING_DIR/backend/.env"
fi

if [[ -f "$APP_DIR/frontend/.env" ]]; then
  mkdir -p "$STAGING_DIR/frontend"
  cp "$APP_DIR/frontend/.env" "$STAGING_DIR/frontend/.env"
fi

cd "$STAGING_DIR/backend"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip wheel setuptools
pip install -r requirements.txt
pip install "bcrypt<4.0.0"
if grep -q '^INSTALL_EMERGENT_INTEGRATIONS=[oOyY]' .env 2>/dev/null; then
  pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ || true
fi
if [[ -f scripts/ensure_mes_indexes.py ]]; then
  python3 scripts/ensure_mes_indexes.py || true
fi
deactivate

cd "$STAGING_DIR/frontend"
yarn install 2>&1 | tee /var/log/fsao-iris-update-yarn-install.log
CI=false yarn build 2>&1 | tee /var/log/fsao-iris-update-yarn-build.log

if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl stop "$SERVICE" || true
fi

mv "$APP_DIR" "$BACKUP_DIR/app"
mv "$STAGING_DIR" "$APP_DIR"

if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl reread || true
  supervisorctl update || true
  supervisorctl start "$SERVICE" || supervisorctl restart "$SERVICE"
fi

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || true
fi

sleep 3
if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl status "$SERVICE" || true
fi

trap - ERR

echo "Mise à jour terminée. Sauvegarde précédente : $BACKUP_DIR/app"
echo "Pour rollback manuel :"
echo "  supervisorctl stop $SERVICE"
echo "  rm -rf $APP_DIR"
echo "  mv $BACKUP_DIR/app $APP_DIR"
echo "  supervisorctl start $SERVICE"
UPDATE_EOF
  ok "Mise à jour appliquée."
}

final_summary() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                 ✅ MISE À JOUR TERMINÉE                       ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Conteneur : $CTID"
  echo "Source    : méthode $SOURCE_METHOD"
  echo "Branche   : $BRANCH"
  echo "Journal   : $LOG_FILE"
  echo ""
}

main() {
  banner
  require_proxmox
  select_container
  select_source_method
  prepare_source_archive

  echo ""
  echo "Résumé de mise à jour :"
  echo "  Conteneur : $CTID"
  echo "  Source    : méthode $SOURCE_METHOD"
  echo "  Branche   : $BRANCH"
  echo ""
  yes_no "Confirmer la mise à jour par archive ?" "n" || err "Mise à jour annulée."

  push_source_archive
  run_update_in_container
  final_summary
}

main "$@"
