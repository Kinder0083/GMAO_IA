#!/bin/bash
# ============================================================
# DIAGNOSTIC APPLICATION FSAO-IRIS
# Usage : bash /tmp/diag_app.sh 2>&1 | tee /tmp/rapport_app.txt
# ============================================================
APP="/opt/gmao-iris"
BACKEND="$APP/backend"
FRONTEND="$APP/frontend"

SEP="============================================================"
OK="[OK]"; WARN="[WARN]"; ERR="[ERR]"; INFO="[INFO]"

echo "$SEP"
echo "  DIAGNOSTIC APPLICATION FSAO-IRIS — $(date '+%d/%m/%Y %H:%M:%S')"
echo "$SEP"

# ── 1. RESSOURCES SYSTÈME ──────────────────────────────────
echo ""
echo "=== 1. RESSOURCES SYSTEME ==="

# CPU
CPU_IDLE=$(timeout 3 top -bn1 2>/dev/null | grep "Cpu(s)" | awk '{print $8}' | cut -d'%' -f1)
CPU_USED=$(echo "100 - ${CPU_IDLE:-0}" | bc 2>/dev/null || echo "?")
[ "${CPU_USED//[^0-9]/}" -gt 80 ] 2>/dev/null && echo "$ERR CPU : ${CPU_USED}% utilisé — SURCHARGE" || echo "$OK  CPU : ${CPU_USED}% utilisé"

# RAM
RAM_INFO=$(timeout 3 free -m 2>/dev/null | grep "^Mem")
RAM_TOTAL=$(echo $RAM_INFO | awk '{print $2}')
RAM_USED=$(echo $RAM_INFO | awk '{print $3}')
RAM_PCT=$(( RAM_TOTAL > 0 ? RAM_USED * 100 / RAM_TOTAL : 0 ))
[ $RAM_PCT -gt 85 ] && echo "$ERR RAM : ${RAM_USED}MB / ${RAM_TOTAL}MB (${RAM_PCT}%) — CRITIQUE" || echo "$OK  RAM : ${RAM_USED}MB / ${RAM_TOTAL}MB (${RAM_PCT}%)"

# SWAP
SWAP_INFO=$(timeout 3 free -m 2>/dev/null | grep "^Swap")
SWAP_USED=$(echo $SWAP_INFO | awk '{print $3}')
SWAP_TOTAL=$(echo $SWAP_INFO | awk '{print $2}')
[ "${SWAP_USED:-0}" -gt 100 ] 2>/dev/null && echo "$WARN SWAP : ${SWAP_USED}MB / ${SWAP_TOTAL}MB utilisé" || echo "$OK  SWAP : ${SWAP_USED:-0}MB / ${SWAP_TOTAL:-0}MB"

# Disque
DISK_ROOT=$(timeout 3 df -h / 2>/dev/null | tail -1 | awk '{print $5, $4}')
DISK_PCT=$(echo $DISK_ROOT | awk '{print $1}' | tr -d '%')
[ "${DISK_PCT:-0}" -gt 90 ] && echo "$ERR DISQUE / : ${DISK_ROOT} — PRESQUE PLEIN" || echo "$OK  DISQUE / : ${DISK_ROOT} libre"

# Disque uploads
DISK_UPL=$(timeout 3 du -sh "$BACKEND/uploads" 2>/dev/null | cut -f1)
echo "$INFO Uploads : ${DISK_UPL:-N/A}"

# ── 2. PROCESSUS APPLICATION ───────────────────────────────
echo ""
echo "=== 2. PROCESSUS APPLICATION ==="

# Backend Python
BACKEND_PID=$(timeout 3 pgrep -f "uvicorn\|gunicorn\|python.*server" 2>/dev/null | head -1)
if [ -n "$BACKEND_PID" ]; then
    BACKEND_MEM=$(timeout 3 ps -p $BACKEND_PID -o rss= 2>/dev/null | awk '{printf "%.0f MB", $1/1024}')
    BACKEND_CPU=$(timeout 3 ps -p $BACKEND_PID -o %cpu= 2>/dev/null)
    echo "$OK  Backend Python  : PID $BACKEND_PID — RAM: $BACKEND_MEM — CPU: ${BACKEND_CPU}%"
else
    echo "$ERR Backend Python  : NON TROUVÉ — l'application est peut-être arrêtée"
fi

# Frontend (Node/nginx/serve)
FRONT_PID=$(timeout 3 pgrep -f "node\|nginx\|serve" 2>/dev/null | head -1)
[ -n "$FRONT_PID" ] && echo "$OK  Frontend        : PID $FRONT_PID" || echo "$WARN Frontend        : NON TROUVÉ (normal si servi par nginx)"

# MongoDB
MONGO_PID=$(timeout 3 pgrep -f "mongod" 2>/dev/null | head -1)
if [ -n "$MONGO_PID" ]; then
    MONGO_MEM=$(timeout 3 ps -p $MONGO_PID -o rss= 2>/dev/null | awk '{printf "%.0f MB", $1/1024}')
    MONGO_CPU=$(timeout 3 ps -p $MONGO_PID -o %cpu= 2>/dev/null)
    echo "$OK  MongoDB         : PID $MONGO_PID — RAM: $MONGO_MEM — CPU: ${MONGO_CPU}%"
else
    echo "$ERR MongoDB         : NON TROUVÉ — BASE DE DONNÉES INACCESSIBLE"
fi

# Nginx / reverse proxy
NGINX_PID=$(timeout 3 pgrep nginx 2>/dev/null | head -1)
[ -n "$NGINX_PID" ] && echo "$OK  Nginx           : PID $NGINX_PID" || echo "$WARN Nginx           : non actif"

# Supervisor
SUPERVISOR_STATUS=$(timeout 5 supervisorctl status 2>/dev/null)
if [ -n "$SUPERVISOR_STATUS" ]; then
    echo "$INFO Supervisor :"
    echo "$SUPERVISOR_STATUS" | while read line; do
        echo "        $line"
    done
fi

# ── 3. TOP PROCESSUS GOURMANDS ─────────────────────────────
echo ""
echo "=== 3. TOP 5 PROCESSUS (CPU + RAM) ==="
timeout 5 ps aux --sort=-%cpu 2>/dev/null | head -6 | awk 'NR>1 {printf "  %-20s CPU:%-6s RAM:%-8s %s\n", $1, $3"%", $4"%", $11}'

# ── 4. CHARGE SYSTÈME (load average) ──────────────────────
echo ""
echo "=== 4. CHARGE SYSTEME ==="
LOAD=$(timeout 3 cat /proc/loadavg 2>/dev/null)
NCPU=$(timeout 3 nproc 2>/dev/null || echo "1")
LOAD1=$(echo $LOAD | awk '{print $1}')
echo "$INFO Load average : $LOAD1 / $LOAD (CPU dispo: $NCPU)"
LOAD_INT=${LOAD1%.*}
[ "${LOAD_INT:-0}" -gt "$NCPU" ] && echo "$ERR Charge supérieure au nombre de CPUs — SYSTÈME SATURÉ"

# ── 5. RÉSEAU & PORTS ─────────────────────────────────────
echo ""
echo "=== 5. PORTS EN ECOUTE ==="
timeout 5 ss -tlnp 2>/dev/null | grep -E "LISTEN" | grep -E "8001|3000|27017|80|443" | while read line; do
    echo "  $line"
done

# Test réponse HTTP locale
HTTP_CODE=$(timeout 5 curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/health 2>/dev/null || echo "TIMEOUT")
echo "$INFO Backend HTTP /health : $HTTP_CODE"
HTTP_CODE2=$(timeout 5 curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/ 2>/dev/null || echo "TIMEOUT")
echo "$INFO Backend HTTP /       : $HTTP_CODE2"

# ── 6. LOGS ERREURS RÉCENTES ──────────────────────────────
echo ""
echo "=== 6. ERREURS DANS LES LOGS (24h) ==="

# Logs supervisor/journalctl
if command -v journalctl &>/dev/null; then
    echo "$INFO Erreurs service backend (dernières 24h) :"
    timeout 5 journalctl -u gmao-iris --since "24 hours ago" -p err 2>/dev/null | tail -10 | while read l; do echo "  $l"; done
fi

# Logs Python directement
for logfile in "$BACKEND"/*.log "$BACKEND"/logs/*.log /var/log/gmao*.log /var/log/supervisor/backend*.log; do
    [ -f "$logfile" ] || continue
    ERRS=$(timeout 3 grep -c "ERROR\|CRITICAL\|Exception\|Traceback" "$logfile" 2>/dev/null || echo 0)
    [ "$ERRS" -gt 0 ] && echo "$WARN $logfile : $ERRS erreurs trouvées"
    timeout 3 grep -i "ERROR\|CRITICAL" "$logfile" 2>/dev/null | tail -5 | while read l; do echo "  >> $l"; done
done

# ── 7. MONGODB SANTÉ ──────────────────────────────────────
echo ""
echo "=== 7. MONGODB ==="
MONGO_ALIVE=$(timeout 5 mongosh --quiet --eval "db.runCommand({ping:1}).ok" 2>/dev/null || timeout 5 mongo --quiet --eval "db.runCommand({ping:1}).ok" 2>/dev/null || echo "ERREUR")
[ "$MONGO_ALIVE" = "1" ] && echo "$OK  MongoDB répond au ping" || echo "$ERR MongoDB ne répond pas : $MONGO_ALIVE"

MONGO_CONN=$(timeout 5 mongosh --quiet --eval "db.serverStatus().connections.current" 2>/dev/null || echo "?")
echo "$INFO Connexions MongoDB actives : $MONGO_CONN"

# ── 8. REDÉMARRAGES RÉCENTS ───────────────────────────────
echo ""
echo "=== 8. REDEMARRAGES / PLANTAGES ==="
timeout 5 last reboot 2>/dev/null | head -5 | while read l; do echo "  $l"; done
echo ""
timeout 5 journalctl --since "48 hours ago" -p crit 2>/dev/null | grep -i "killed\|oom\|segfault\|panic" | tail -10 | while read l; do echo "  $l"; done

# OOM Killer
OOM=$(timeout 5 dmesg 2>/dev/null | grep -c "oom-kill\|Out of memory" 2>/dev/null || echo 0)
[ "${OOM:-0}" -gt 0 ] && echo "$ERR OOM Killer déclenché $OOM fois — MÉMOIRE INSUFFISANTE"

echo ""
echo "$SEP"
echo "  DIAGNOSTIC TERMINÉ — $(date '+%d/%m/%Y %H:%M:%S')"
echo "  Rapport sauvegardé dans : /tmp/rapport_app.txt"
echo "$SEP"
