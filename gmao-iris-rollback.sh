#!/usr/bin/env bash
###############################################################################
# FSAO Iris v1.12.0 - Rollback d'une mise à jour par archive
#
# Usage :
#   ./gmao-iris-rollback.sh
#
# Ce script restaure une sauvegarde applicative créée par gmao-iris-update.sh.
# Il ne restaure pas MongoDB : il agit uniquement sur les fichiers applicatifs.
###############################################################################

set -Eeuo pipefail

APP_NAME="FSAO Iris"
APP_TECH_SLUG="gmao-iris"
APP_DIR="/opt/${APP_TECH_SLUG}"
BACKUP_ROOT="/opt/${APP_TECH_SLUG}-backups"
SERVICE="gmao-iris-backend"
LOG_FILE="/tmp/fsao-iris-rollback-$(date +%Y%m%d_%H%M%S).log"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

msg() { echo -e "${BLUE}▶${NC} $1"; }
ok() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; exit 1; }

trap 'echo -e "${RED}✗ Erreur ligne $LINENO. Journal : ${LOG_FILE}${NC}" >&2' ERR
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
  clear || true
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║              ${APP_NAME} - Rollback applicatif                 ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Journal : ${LOG_FILE}"
  echo ""
}

require_proxmox() {
  [[ "$(id -u)" -eq 0 ]] || err "Ce script doit être exécuté en root sur l'hôte Proxmox."
  command -v pct >/dev/null 2>&1 || err "La commande pct est introuvable. Exécuter ce script sur Proxmox."
}

detect_default_ctid() {
  pct list 2>/dev/null | awk -v slug="$APP_TECH_SLUG" 'NR>1 && $3==slug {print $1; exit}' || true
}

select_container() {
  local default_ctid status
  default_ctid=$(detect_default_ctid)

  msg "Conteneurs LXC disponibles :"
  pct list || true
  echo ""

  CTID=$(read_tty "ID du conteneur FSAO Iris" "$default_ctid")
  [[ -z "$CTID" ]] && err "ID conteneur obligatoire."
  pct status "$CTID" >/dev/null 2>&1 || err "Conteneur $CTID introuvable."

  status=$(pct status "$CTID" | awk '{print $2}')
  if [[ "$status" != "running" ]]; then
    if yes_no "Le conteneur $CTID est arrêté. Le démarrer ?" "o"; then
      pct start "$CTID"
      sleep 5
    else
      err "Rollback impossible si le conteneur est arrêté."
    fi
  fi
}

select_backup() {
  msg "Recherche des sauvegardes disponibles..."
  pct exec "$CTID" -- test -d "$BACKUP_ROOT" || err "Aucun dossier de sauvegarde trouvé : $BACKUP_ROOT"

  mapfile -t BACKUPS < <(pct exec "$CTID" -- bash -c "find '$BACKUP_ROOT' -mindepth 2 -maxdepth 2 -type d -name app | sort -r" | tr -d '\r')
  [[ "${#BACKUPS[@]}" -eq 0 ]] && err "Aucune sauvegarde applicative trouvée."

  echo ""
  echo "Sauvegardes disponibles :"
  local i=1
  for backup in "${BACKUPS[@]}"; do
    echo "  $i) $backup"
    i=$((i + 1))
  done
  echo ""

  local choice
  choice=$(read_tty "Numéro de la sauvegarde à restaurer" "1")
  [[ ! "$choice" =~ ^[0-9]+$ ]] && err "Choix invalide."
  [[ "$choice" -lt 1 || "$choice" -gt "${#BACKUPS[@]}" ]] && err "Choix hors plage."
  SELECTED_BACKUP="${BACKUPS[$((choice - 1))]}"
  ok "Sauvegarde sélectionnée : $SELECTED_BACKUP"
}

run_rollback() {
  msg "Restauration de la sauvegarde..."
  pct exec "$CTID" -- env APP_DIR="$APP_DIR" SELECTED_BACKUP="$SELECTED_BACKUP" SERVICE="$SERVICE" bash << 'ROLLBACK_EOF'
set -Eeuo pipefail
TS=$(date +%Y%m%d_%H%M%S)
CURRENT_BACKUP="${APP_DIR}-pre-rollback-${TS}"

[[ -d "$SELECTED_BACKUP" ]] || { echo "Sauvegarde introuvable : $SELECTED_BACKUP"; exit 1; }

if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl stop "$SERVICE" || true
fi

if [[ -d "$APP_DIR" ]]; then
  mv "$APP_DIR" "$CURRENT_BACKUP"
  echo "Installation actuelle sauvegardée dans : $CURRENT_BACKUP"
fi

cp -a "$SELECTED_BACKUP" "$APP_DIR"

if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl start "$SERVICE" || supervisorctl restart "$SERVICE"
  supervisorctl status "$SERVICE" || true
fi

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || true
fi

echo "Rollback terminé."
echo "Version remplacée conservée dans : $CURRENT_BACKUP"
ROLLBACK_EOF
  ok "Rollback appliqué."
}

main() {
  banner
  require_proxmox
  select_container
  select_backup
  echo ""
  warn "Ce rollback restaure les fichiers applicatifs mais ne restaure pas MongoDB."
  yes_no "Confirmer le rollback ?" "n" || err "Rollback annulé."
  run_rollback
  echo "Journal : $LOG_FILE"
}

main "$@"
