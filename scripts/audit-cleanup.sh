#!/usr/bin/env bash
###############################################################################
# FSAO Iris - Audit rapide du depot
#
# Objectif : identifier les traces de nommage obsolète, scripts tiers,
# secrets probables et valeurs par défaut à corriger avant mise en service.
###############################################################################

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}>>>${NC} $1"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[A VERIFIER]${NC} $1"; }
fail() { echo -e "${RED}[ALERTE]${NC} $1"; }

EXCLUDE_DIRS=(
  "--exclude-dir=.git"
  "--exclude-dir=node_modules"
  "--exclude-dir=venv"
  "--exclude-dir=.venv"
  "--exclude-dir=build"
  "--exclude-dir=dist"
  "--exclude-dir=__pycache__"
)

FOUND=0

scan_pattern() {
  local label="$1"
  local pattern="$2"
  local level="${3:-warn}"

  echo ""
  info "$label"

  if grep -RIn "${EXCLUDE_DIRS[@]}" -- "$pattern" . >/tmp/fsao_audit_matches.txt 2>/dev/null; then
    FOUND=1
    if [ "$level" = "fail" ]; then
      fail "Occurrences trouvees :"
    else
      warn "Occurrences trouvees :"
    fi
    cat /tmp/fsao_audit_matches.txt
  else
    ok "Aucune occurrence"
  fi
}

scan_pattern "Ancien nom produit : GMAO Iris" "GMAO Iris" warn
scan_pattern "Ancien nom API : FSAO Atlas" "FSAO Atlas" warn
scan_pattern "Badge ou scripts Emergent frontend" "Made with Emergent\|assets.emergent.sh\|rrweb-recorder" fail
scan_pattern "PostHog / analytics frontend" "posthog\|phc_" fail
scan_pattern "Cles JWT faibles connues" "your_jwt_secret_key_change_in_production\|change_me\|dev-secret" fail
scan_pattern "Mot de passe admin connu" "Admin2024!" fail
scan_pattern "Ancienne base MongoDB" "DB_NAME=gmao_iris\|gmao_iris" warn
scan_pattern "Depot historique GMAO" "github.com/Kinder0083/GMAO\|REPO_NAME=.*GMAO" warn

rm -f /tmp/fsao_audit_matches.txt

echo ""
echo "=================================================================="
if [ "$FOUND" -eq 0 ]; then
  ok "Audit termine : aucune occurrence surveillee trouvee."
else
  warn "Audit termine : des elements restent a verifier."
  echo "Les occurrences ne sont pas toutes des erreurs : certains chemins techniques historiques peuvent rester volontairement en gmao-iris."
fi
