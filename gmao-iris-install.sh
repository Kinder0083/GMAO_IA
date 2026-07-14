#!/usr/bin/env bash
###############################################################################
# FSAO Iris v1.12.0 - Installation Proxmox LXC / Debian 12
#
# Backup avant refonte :
# backups/gmao-iris-install.sh.backup-2026-07-14
#
# Objectif :
# - créer un conteneur LXC Debian 12 ;
# - installer les dépendances système ;
# - installer MongoDB 7 uniquement si le CPU supporte AVX ;
# - proposer plusieurs méthodes simples d'accès au dépôt privé GitHub ;
# - préparer une archive applicative sur l'hôte Proxmox ;
# - transférer cette archive dans le conteneur ;
# - configurer backend, frontend, Supervisor et Nginx ;
# - créer les comptes administrateurs demandés ;
# - éviter de stocker une clé SSH ou un token GitHub dans le conteneur.
###############################################################################

set -Eeuo pipefail

APP_NAME="FSAO Iris"
APP_VERSION="1.12.0"
APP_TECH_SLUG="gmao-iris"
APP_DIR="/opt/${APP_TECH_SLUG}"
DB_NAME="fsao_iris"
DEFAULT_REPO_FULL="Kinder0083/GMAO_IA"
DEFAULT_GIT_URL="git@github.com:Kinder0083/GMAO_IA.git"
DEFAULT_BRANCH="main"
LOG_FILE="/tmp/fsao-iris-install-$(date +%Y%m%d_%H%M%S).log"
HOST_WORKDIR=""
SOURCE_ARCHIVE=""
SOURCE_METHOD=""
REPO_FULL="$DEFAULT_REPO_FULL"
GIT_URL="$DEFAULT_GIT_URL"
BRANCH="$DEFAULT_BRANCH"
LOCAL_ARCHIVE=""

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
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

read_secret_tty() {
  local prompt="$1"
  local result
  read -r -s -p "${prompt}: " result < /dev/tty
  echo "" > /dev/tty
  echo "$result"
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
  echo "║        ${APP_NAME} v${APP_VERSION} - Installation Proxmox       ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Journal : ${LOG_FILE}"
  echo ""
}

require_proxmox() {
  [[ "$(id -u)" -eq 0 ]] || err "Ce script doit être exécuté en root sur l'hôte Proxmox."
  command -v pct >/dev/null 2>&1 || err "La commande pct est introuvable. Exécuter ce script sur Proxmox."
}

ensure_host_command() {
  local command_name="$1"
  local package_name="${2:-$1}"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    msg "Installation du paquet hôte : $package_name"
    apt-get update
    apt-get install -y "$package_name"
  fi
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
  echo "  Accès au dépôt privé GitHub"
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

detect_template() {
  msg "Recherche du template Debian 12..."
  TEMPLATE=$(ls /var/lib/vz/template/cache/*debian-12*.tar.* 2>/dev/null | head -1 | xargs basename 2>/dev/null || true)
  if [[ -n "$TEMPLATE" ]]; then
    ok "Template trouvé : $TEMPLATE"
    return
  fi

  warn "Aucun template Debian 12 local. Téléchargement..."
  pveam update || warn "pveam update a retourné un avertissement."
  TEMPLATE=$(pveam available --section system 2>/dev/null | grep -i "debian-12" | awk '{print $2}' | head -1 || true)
  [[ -z "$TEMPLATE" ]] && TEMPLATE=$(pveam available 2>/dev/null | grep -i "debian-12" | awk '{print $2}' | head -1 || true)
  [[ -z "$TEMPLATE" ]] && err "Template Debian 12 introuvable. Téléchargez-le manuellement via pveam."
  pveam download local "$TEMPLATE"
  ok "Template téléchargé : $TEMPLATE"
}

detect_storage() {
  msg "Détection du stockage..."
  if pvesm status | grep -q "local-lvm"; then
    STORAGE="local-lvm"
  elif pvesm status | grep -q "^local "; then
    STORAGE="local"
  else
    STORAGE=$(pvesm status | awk 'NR==2 {print $1}')
  fi
  [[ -z "${STORAGE:-}" ]] && err "Aucun stockage Proxmox détecté."
  ok "Stockage sélectionné : $STORAGE"
}

select_bridge() {
  msg "Détection des bridges réseau..."
  BRIDGES=$(ip link show | grep -E '^[0-9]+: vmbr' | awk -F': ' '{print $2}' | sed 's/@.*//' || true)
  [[ -z "$BRIDGES" ]] && err "Aucun bridge vmbr détecté."

  echo "Bridges disponibles :"
  local i=1
  for br in $BRIDGES; do
    local state ip
    state=$(ip link show "$br" 2>/dev/null | grep -o "state [A-Z]*" | awk '{print $2}' || true)
    ip=$(ip -4 addr show "$br" 2>/dev/null | grep "inet " | awk '{print $2}' | head -1 || true)
    echo "  $i) $br - ${state:-UNKNOWN} ${ip:+- IP: $ip}"
    i=$((i + 1))
  done

  local count choice
  count=$(echo "$BRIDGES" | wc -l)
  if [[ "$count" -eq 1 ]]; then
    SELECTED_BRIDGE=$(echo "$BRIDGES" | head -1)
  else
    choice=$(read_tty "Numéro du bridge" "1")
    SELECTED_BRIDGE=$(echo "$BRIDGES" | sed -n "${choice}p")
  fi
  [[ -z "$SELECTED_BRIDGE" ]] && err "Bridge invalide."
  ok "Bridge sélectionné : $SELECTED_BRIDGE"
}

configure_network() {
  msg "Configuration réseau du conteneur..."
  local bridge_ip bridge_cidr bridge_gw suggested_ip mode network_prefix
  bridge_ip=$(ip -4 addr show "$SELECTED_BRIDGE" | grep "inet " | awk '{print $2}' | cut -d'/' -f1 | head -1 || true)
  bridge_cidr=$(ip -4 addr show "$SELECTED_BRIDGE" | grep "inet " | awk '{print $2}' | cut -d'/' -f2 | head -1 || true)
  bridge_gw=$(ip route | grep "default.*$SELECTED_BRIDGE" | awk '{print $3}' | head -1 || true)
  [[ -z "$bridge_gw" ]] && bridge_gw="$bridge_ip"

  if [[ -n "$bridge_ip" ]]; then
    network_prefix=$(echo "$bridge_ip" | cut -d'.' -f1-3)
    suggested_ip="${network_prefix}.150"
  else
    suggested_ip="192.168.1.150"
    bridge_cidr="24"
    bridge_gw="192.168.1.1"
  fi

  echo "1) IP statique"
  echo "2) DHCP"
  mode=$(read_tty "Mode réseau" "1")

  if [[ "$mode" == "1" ]]; then
    CONTAINER_IP=$(read_tty "Adresse IP du conteneur" "$suggested_ip")
    CONTAINER_CIDR=$(read_tty "Masque CIDR" "$bridge_cidr")
    CONTAINER_GW=$(read_tty "Gateway" "$bridge_gw")
    IP_CONFIG="${CONTAINER_IP}/${CONTAINER_CIDR}"
    NET_MODE="static"
  else
    CONTAINER_IP="dhcp"
    IP_CONFIG="dhcp"
    NET_MODE="dhcp"
  fi
}

prepare_source_archive() {
  msg "Préparation de l'archive applicative sur l'hôte Proxmox..."
  ensure_host_command git git
  ensure_host_command tar tar

  HOST_WORKDIR=$(mktemp -d /tmp/fsao-iris-src.XXXXXX)
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

create_container() {
  msg "Création du conteneur LXC..."
  if [[ "$NET_MODE" == "static" ]]; then
    pct create "$CTID" "local:vztmpl/$TEMPLATE" \
      --arch amd64 --cores "$CORES" --hostname "$APP_TECH_SLUG" --memory "$RAM" \
      --net0 "name=eth0,bridge=${SELECTED_BRIDGE},ip=${CONTAINER_IP}/${CONTAINER_CIDR},gw=${CONTAINER_GW}" \
      --onboot 1 --ostype debian --rootfs "${STORAGE}:${DISK_SIZE}" \
      --unprivileged 1 --features nesting=1 --password "$ROOT_PASS"
  else
    pct create "$CTID" "local:vztmpl/$TEMPLATE" \
      --arch amd64 --cores "$CORES" --hostname "$APP_TECH_SLUG" --memory "$RAM" \
      --net0 "name=eth0,bridge=${SELECTED_BRIDGE},ip=dhcp" \
      --onboot 1 --ostype debian --rootfs "${STORAGE}:${DISK_SIZE}" \
      --unprivileged 1 --features nesting=1 --password "$ROOT_PASS"
  fi
  pct start "$CTID"
  sleep 5
  ok "Conteneur $CTID créé."
}

check_network() {
  msg "Vérification réseau du conteneur..."
  if ! pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then
    warn "DNS non fonctionnel. Configuration DNS temporaire."
    pct exec "$CTID" -- tee /etc/resolv.conf >/dev/null << 'DNS_EOF'
nameserver 1.1.1.1
nameserver 8.8.8.8
DNS_EOF
  fi
  pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 || err "DNS ou Internet non fonctionnel dans le conteneur."
  ok "Réseau OK."
}

install_system() {
  msg "Installation système..."
  pct exec "$CTID" -- bash << 'SYS_EOF'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y locales curl wget git gnupg ca-certificates build-essential supervisor nginx ufw python3 python3-pip python3-venv smbclient mailutils postfix ffmpeg tar iputils-ping libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender1 libxml2-dev libxslt1-dev
grep -q "en_US.UTF-8 UTF-8" /etc/locale.gen || echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
locale-gen >/dev/null 2>&1
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g yarn

if ! grep -q avx /proc/cpuinfo 2>/dev/null; then
  echo "ERREUR : CPU sans AVX. MongoDB 7.x nécessite AVX."
  echo "Alternative : utiliser un hôte AVX ou déployer MongoDB sur un serveur compatible."
  exit 42
fi

curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server.gpg --dearmor
echo "deb [signed-by=/usr/share/keyrings/mongodb-server.gpg] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" > /etc/apt/sources.list.d/mongodb-org.list
apt-get update
apt-get install -y mongodb-org
mkdir -p /etc/systemd/system/mongod.service.d
printf "[Service]\nExecStartPre=\n" > /etc/systemd/system/mongod.service.d/lxc-fix.conf
systemctl daemon-reload
mkdir -p /var/lib/mongodb /var/log/mongodb /run/mongodb
chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb /run/mongodb 2>/dev/null || true
systemctl enable mongod
systemctl start mongod
echo "fsao-iris.local" > /etc/mailname
debconf-set-selections <<< "postfix postfix/mailname string fsao-iris.local"
debconf-set-selections <<< "postfix postfix/main_mailer_type string Internet Site"
systemctl restart postfix || true
systemctl enable postfix >/dev/null 2>&1 || true
SYS_EOF
  ok "Système installé."
}

verify_mongodb() {
  msg "Vérification MongoDB..."
  pct exec "$CTID" -- bash << 'MONGO_EOF'
set -Eeuo pipefail
for i in $(seq 1 15); do
  if (mongosh --quiet --eval "db.runCommand({ping:1})" 2>/dev/null || mongo --quiet --eval "db.runCommand({ping:1})" 2>/dev/null) | grep -q "ok"; then
    echo "MongoDB prêt."
    exit 0
  fi
  sleep 2
done
systemctl status mongod --no-pager 2>&1 | head -30 || true
tail -40 /var/log/mongodb/mongod.log 2>/dev/null || true
exit 1
MONGO_EOF
  ok "MongoDB OK."
}

resolve_ip() {
  if [[ "$CONTAINER_IP" == "dhcp" ]]; then
    CONTAINER_IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}' || true)
    [[ -z "$CONTAINER_IP" ]] && CONTAINER_IP="AUCUNE_IP"
  fi
}

install_tailscale() {
  TAILSCALE_IP=""
  if [[ "$INSTALL_TAILSCALE" == "o" && -n "$TAILSCALE_AUTH_KEY" ]]; then
    msg "Installation Tailscale..."
    pct exec "$CTID" -- bash -c 'curl -fsSL https://tailscale.com/install.sh | sh'
    pct exec "$CTID" -- tailscale up --authkey="$TAILSCALE_AUTH_KEY" --hostname="${APP_TECH_SLUG}-${CTID}" --accept-routes --accept-dns=false || true
    sleep 5
    TAILSCALE_IP=$(pct exec "$CTID" -- tailscale ip -4 2>/dev/null || true)
  fi
}

push_source_archive() {
  msg "Transfert de l'archive applicative vers le conteneur..."
  [[ -f "$SOURCE_ARCHIVE" ]] || err "Archive source introuvable."
  pct push "$CTID" "$SOURCE_ARCHIVE" "/tmp/fsao-iris-source.tar.gz"
  ok "Archive transférée."
}

deploy_app() {
  msg "Déploiement de l'application dans le conteneur..."
  pct exec "$CTID" -- env APP_NAME="$APP_NAME" APP_DIR="$APP_DIR" APP_TECH_SLUG="$APP_TECH_SLUG" DB_NAME="$DB_NAME" FRONTEND_URL="$FRONTEND_URL" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASS="$ADMIN_PASS" DOCS_PASS="$DOCS_PASS" CREATE_SECONDARY_ADMIN="$CREATE_SECONDARY_ADMIN" SECONDARY_ADMIN_EMAIL="$SECONDARY_ADMIN_EMAIL" SECONDARY_ADMIN_PASS="$SECONDARY_ADMIN_PASS" INSTALL_EMERGENT_INTEGRATIONS="$INSTALL_EMERGENT_INTEGRATIONS" bash << 'APP_EOF'
set -Eeuo pipefail
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
tar -xzf /tmp/fsao-iris-source.tar.gz -C "$APP_DIR"
rm -f /tmp/fsao-iris-source.tar.gz
cd "$APP_DIR"

SECRET_KEY=$(openssl rand -hex 32)
CAMERA_ENCRYPTION_KEY=$(python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())")
cat > backend/.env << ENV_EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=${DB_NAME}
SECRET_KEY=${SECRET_KEY}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
DOCS_USER=admin
DOCS_PASS=${DOCS_PASS}
PORT=8001
HOST=0.0.0.0
FRONTEND_URL=${FRONTEND_URL}
BACKEND_URL=${FRONTEND_URL}
APP_URL=${FRONTEND_URL}
SMTP_HOST=localhost
SMTP_SERVER=localhost
SMTP_PORT=25
SMTP_FROM=noreply@fsao-iris.local
SMTP_SENDER_EMAIL=noreply@fsao-iris.local
SMTP_FROM_NAME=${APP_NAME}
SMTP_USE_TLS=false
EMERGENT_LLM_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
ANTHROPIC_API_KEY=
INSTALL_EMERGENT_INTEGRATIONS=${INSTALL_EMERGENT_INTEGRATIONS}
CAMERA_ENCRYPTION_KEY=${CAMERA_ENCRYPTION_KEY}
ENV_EOF
chmod 600 backend/.env

cat > frontend/.env << FRONT_ENV_EOF
NODE_ENV=production
FRONT_ENV_EOF

cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip wheel setuptools
pip install -r requirements.txt
pip install "bcrypt<4.0.0"
if [[ "$INSTALL_EMERGENT_INTEGRATIONS" =~ ^[OoYy]$ ]]; then
  pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ || true
fi

ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASS="$ADMIN_PASS" CREATE_SECONDARY_ADMIN="$CREATE_SECONDARY_ADMIN" SECONDARY_ADMIN_EMAIL="$SECONDARY_ADMIN_EMAIL" SECONDARY_ADMIN_PASS="$SECONDARY_ADMIN_PASS" DB_NAME="$DB_NAME" python3 << 'PYEOF'
import asyncio, os, bcrypt
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
modules=['dashboard','workOrders','assets','preventiveMaintenance','inventory','reports','people','settings','surveillance','presquaccident','documentations','chatLive','sensors','iotDashboard','mqttLogs','purchaseRequests','mes','loto']
def hp(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt(rounds=10)).decode()
def payload(email,pw,nom,prenom):
    return {'email':email,'hashed_password':hp(pw),'nom':nom,'prenom':prenom,'role':'ADMIN','telephone':None,'service':None,'statut':'actif','dateCreation':datetime.now(timezone.utc).isoformat(),'derniereConnexion':None,'firstLogin':False,'permissions':{m:{'view':True,'edit':True,'delete':True} for m in modules},'responsable_hierarchique_id':None}
async def upsert(db,p):
    await db.users.update_one({'email':p['email']},{'$set':p},upsert=True)
    print('Admin créé ou mis à jour :',p['email'])
async def main():
    client=AsyncIOMotorClient(os.environ.get('MONGO_URL','mongodb://localhost:27017'))
    db=client[os.environ.get('DB_NAME','fsao_iris')]
    await upsert(db,payload(os.environ['ADMIN_EMAIL'],os.environ['ADMIN_PASS'],'Admin','Principal'))
    if os.environ.get('CREATE_SECONDARY_ADMIN','n').lower() in {'o','y','oui','yes'}:
        await upsert(db,payload(os.environ['SECONDARY_ADMIN_EMAIL'],os.environ['SECONDARY_ADMIN_PASS'],'Admin','Secours'))
    client.close()
asyncio.run(main())
PYEOF
if [ -f scripts/ensure_mes_indexes.py ]; then python3 scripts/ensure_mes_indexes.py || true; fi
deactivate

cd "$APP_DIR/frontend"
yarn install 2>&1 | tee /var/log/fsao-iris-yarn-install.log
CI=false yarn build 2>&1 | tee /var/log/fsao-iris-yarn-build.log

cd "$APP_DIR"
cat > backend/post-update.sh << 'POSTUPDATE'
#!/bin/bash
set -Eeuo pipefail
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_DIR="$APP_ROOT/frontend"
VENV_DIR="$BACKEND_DIR/venv"
[ -d "$VENV_DIR" ] || python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip wheel setuptools
"$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
"$VENV_DIR/bin/pip" install "bcrypt<4.0.0"
if grep -q '^INSTALL_EMERGENT_INTEGRATIONS=[oOyY]' "$BACKEND_DIR/.env" 2>/dev/null; then "$VENV_DIR/bin/pip" install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ || true; fi
cd "$FRONTEND_DIR"
CI=false yarn install
CI=false yarn build
supervisorctl restart gmao-iris-backend || true
POSTUPDATE
chmod +x backend/post-update.sh

cat > update.sh << 'UPDATESH'
#!/bin/bash
set -Eeuo pipefail
echo "Cette installation a été déployée par archive sans dossier .git."
echo "Pour mettre à jour, préparez une nouvelle archive depuis l'hôte Proxmox puis redéployez l'application."
echo "Après remplacement des fichiers, lancez : bash /opt/gmao-iris/backend/post-update.sh"
exit 1
UPDATESH
chmod +x update.sh
APP_EOF
}

configure_services() {
  msg "Configuration Supervisor et Nginx..."
  pct exec "$CTID" -- tee /etc/supervisor/conf.d/gmao-iris-backend.conf >/dev/null << 'SUPERVISOR_EOF'
[program:gmao-iris-backend]
directory=/opt/gmao-iris/backend
command=/opt/gmao-iris/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
user=root
autostart=true
autorestart=true
stderr_logfile=/var/log/gmao-iris-backend.err.log
stdout_logfile=/var/log/gmao-iris-backend.out.log
environment=PYTHONUNBUFFERED=1
SUPERVISOR_EOF
  pct exec "$CTID" -- supervisorctl reread
  pct exec "$CTID" -- supervisorctl update
  pct exec "$CTID" -- rm -f /etc/nginx/sites-enabled/default
  pct exec "$CTID" -- tee /etc/nginx/sites-available/gmao-iris >/dev/null << 'NGINX_EOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 200M;
    location / { root /opt/gmao-iris/frontend/build; try_files $uri $uri/ /index.html; }
    location /api/ssh/ws { proxy_pass http://127.0.0.1:8001; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_read_timeout 3600s; proxy_send_timeout 3600s; proxy_buffering off; }
    location /api { proxy_pass http://127.0.0.1:8001; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_read_timeout 300s; proxy_send_timeout 300s; proxy_buffering off; }
    location /ws/chat/ { proxy_pass http://127.0.0.1:8001; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_read_timeout 86400; proxy_send_timeout 86400; }
    location /ws/whiteboard/ { proxy_pass http://127.0.0.1:8001; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_read_timeout 86400; proxy_send_timeout 86400; }
}
NGINX_EOF
  pct exec "$CTID" -- ln -sf /etc/nginx/sites-available/gmao-iris /etc/nginx/sites-enabled/
  pct exec "$CTID" -- nginx -t
  pct exec "$CTID" -- systemctl reload nginx
  pct exec "$CTID" -- bash -c 'ufw --force enable >/dev/null 2>&1 || true; ufw allow 22/tcp >/dev/null 2>&1 || true; ufw allow 80/tcp >/dev/null 2>&1 || true; ufw allow 443/tcp >/dev/null 2>&1 || true'
}

final_summary() {
  local backend_status
  backend_status=$(pct exec "$CTID" -- supervisorctl status gmao-iris-backend 2>/dev/null | grep RUNNING || true)
  echo ""
  echo "Installation ${APP_NAME} terminée."
  echo "URL principale : ${FRONTEND_URL}"
  echo "URL locale     : http://${CONTAINER_IP}"
  [[ -n "${TAILSCALE_IP:-}" ]] && echo "URL Tailscale  : http://${TAILSCALE_IP}"
  echo "Admin principal : ${ADMIN_EMAIL}"
  [[ "$CREATE_SECONDARY_ADMIN" == "o" ]] && echo "Admin secours   : ${SECONDARY_ADMIN_EMAIL}"
  [[ "$backend_status" == *RUNNING* ]] && ok "Backend RUNNING" || warn "Backend à vérifier"
  echo "Journal : ${LOG_FILE}"
}

main() {
  banner
  require_proxmox
  detect_template
  detect_storage
  select_bridge
  configure_network
  select_source_method
  prepare_source_archive

  CTID=100
  while pct status "$CTID" >/dev/null 2>&1; do CTID=$((CTID+1)); done
  CTID=$(read_tty "ID conteneur" "$CTID")
  pct status "$CTID" >/dev/null 2>&1 && err "Le conteneur $CTID existe déjà."
  RAM=$(read_tty "RAM (Mo)" "4096")
  CORES=$(read_tty "CPU cores" "2")
  DISK_SIZE=$(read_tty "Taille disque (Go)" "20")

  ADMIN_EMAIL=$(read_tty "Email admin principal")
  ADMIN_PASS=$(read_secret_tty "Mot de passe admin principal")
  [[ ${#ADMIN_PASS} -lt 8 ]] && err "Mot de passe admin trop court."
  CREATE_SECONDARY_ADMIN="n"; SECONDARY_ADMIN_EMAIL=""; SECONDARY_ADMIN_PASS=""
  if yes_no "Créer un compte administrateur de secours ?" "n"; then
    CREATE_SECONDARY_ADMIN="o"
    SECONDARY_ADMIN_EMAIL=$(read_tty "Email admin de secours")
    SECONDARY_ADMIN_PASS=$(read_secret_tty "Mot de passe admin de secours")
    [[ ${#SECONDARY_ADMIN_PASS} -lt 8 ]] && err "Mot de passe admin secours trop court."
  fi
  ROOT_PASS=$(read_secret_tty "Mot de passe root conteneur")
  [[ ${#ROOT_PASS} -lt 8 ]] && err "Mot de passe root trop court."
  DOCS_PASS=$(read_secret_tty "Mot de passe documentation API / Swagger")
  [[ -z "$DOCS_PASS" ]] && DOCS_PASS=$(openssl rand -hex 18)

  INSTALL_EMERGENT_INTEGRATIONS="n"
  yes_no "Installer la dépendance optionnelle emergentintegrations ?" "n" && INSTALL_EMERGENT_INTEGRATIONS="o"
  INSTALL_TAILSCALE="n"; TAILSCALE_AUTH_KEY=""; MANUAL_URL=""
  if yes_no "Configurer Tailscale ?" "n"; then INSTALL_TAILSCALE="o"; TAILSCALE_AUTH_KEY=$(read_secret_tty "Clé Tailscale"); fi
  MANUAL_URL=$(read_tty "URL publique/manuelle optionnelle" "")

  echo "Produit: $APP_NAME $APP_VERSION"
  echo "Conteneur: $CTID - $RAM Mo - $CORES CPU - ${DISK_SIZE} Go"
  echo "Réseau: $IP_CONFIG"
  echo "Source méthode: $SOURCE_METHOD"
  echo "Branche/source: $BRANCH"
  echo "Base MongoDB: $DB_NAME"
  yes_no "Confirmer l'installation ?" "n" || err "Installation annulée."

  create_container
  check_network
  install_system
  verify_mongodb
  resolve_ip
  FRONTEND_URL="http://${CONTAINER_IP}"
  [[ -n "$MANUAL_URL" ]] && FRONTEND_URL="$MANUAL_URL"
  install_tailscale
  [[ -n "${TAILSCALE_IP:-}" && -z "$MANUAL_URL" ]] && FRONTEND_URL="http://${TAILSCALE_IP}"
  push_source_archive
  deploy_app
  configure_services
  final_summary
}

main "$@"
