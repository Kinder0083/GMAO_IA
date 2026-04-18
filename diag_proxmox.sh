#!/bin/bash
# ============================================================
# DIAGNOSTIC NŒUD PROXMOX
# Usage : bash /tmp/diag_proxmox.sh 2>&1 | tee /tmp/rapport_proxmox.txt
# A exécuter directement sur l'hôte Proxmox (pas dans la VM/CT)
# ============================================================

SEP="============================================================"
OK="[OK]"; WARN="[WARN]"; ERR="[ERR]"; INFO="[INFO]"

echo "$SEP"
echo "  DIAGNOSTIC NOEUD PROXMOX — $(date '+%d/%m/%Y %H:%M:%S')"
echo "$SEP"

# ── 1. INFOS HÔTE ─────────────────────────────────────────
echo ""
echo "=== 1. INFORMATIONS HOTE ==="
echo "$INFO Hostname     : $(timeout 3 hostname 2>/dev/null)"
echo "$INFO Kernel       : $(timeout 3 uname -r 2>/dev/null)"
echo "$INFO Proxmox VE   : $(timeout 3 pveversion 2>/dev/null | head -1 || echo 'non détecté')"
echo "$INFO Uptime       : $(timeout 3 uptime -p 2>/dev/null)"

# ── 2. RESSOURCES HÔTE ────────────────────────────────────
echo ""
echo "=== 2. RESSOURCES HOTE ==="

# CPU
CPU_MODEL=$(timeout 3 grep "model name" /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | xargs)
NCPU=$(timeout 3 nproc 2>/dev/null)
echo "$INFO CPU          : $CPU_MODEL ($NCPU cœurs)"

LOAD=$(timeout 3 cat /proc/loadavg 2>/dev/null)
LOAD1=$(echo $LOAD | awk '{print $1}')
LOAD5=$(echo $LOAD | awk '{print $2}')
LOAD15=$(echo $LOAD | awk '{print $3}')
echo "$INFO Load average : 1min=$LOAD1 | 5min=$LOAD5 | 15min=$LOAD15 (${NCPU} CPUs dispo)"
[ "$(echo "$LOAD1 > $NCPU" | bc 2>/dev/null)" = "1" ] && echo "$ERR Charge CPU critique — système saturé !"

# RAM
RAM_INFO=$(timeout 3 free -m 2>/dev/null | grep "^Mem")
RAM_TOTAL=$(echo $RAM_INFO | awk '{print $2}')
RAM_USED=$(echo $RAM_INFO | awk '{print $3}')
RAM_FREE=$(echo $RAM_INFO | awk '{print $4}')
RAM_PCT=$(( RAM_TOTAL > 0 ? RAM_USED * 100 / RAM_TOTAL : 0 ))
[ $RAM_PCT -gt 90 ] && RSTATUS="$ERR CRITIQUE" || ([ $RAM_PCT -gt 75 ] && RSTATUS="$WARN ELEVE" || RSTATUS="$OK")
echo "$RSTATUS RAM          : ${RAM_USED}MB / ${RAM_TOTAL}MB utilisé (${RAM_PCT}%) — ${RAM_FREE}MB libre"

# SWAP
SWAP=$(timeout 3 free -m 2>/dev/null | grep "^Swap")
SWAP_T=$(echo $SWAP | awk '{print $2}')
SWAP_U=$(echo $SWAP | awk '{print $3}')
[ "${SWAP_U:-0}" -gt 500 ] && echo "$WARN SWAP         : ${SWAP_U}MB / ${SWAP_T}MB — utilisation élevée" || echo "$OK  SWAP         : ${SWAP_U:-0}MB / ${SWAP_T:-0}MB"

# ── 3. STOCKAGE ───────────────────────────────────────────
echo ""
echo "=== 3. STOCKAGE ==="
timeout 5 df -h 2>/dev/null | grep -v "tmpfs\|udev\|overlay" | while read line; do
    PCT=$(echo "$line" | awk '{print $5}' | tr -d '%')
    if [ "${PCT:-0}" -gt 90 ] 2>/dev/null; then
        echo "$ERR $line  ← PRESQUE PLEIN"
    elif [ "${PCT:-0}" -gt 75 ] 2>/dev/null; then
        echo "$WARN $line  ← ATTENTION"
    else
        echo "      $line"
    fi
done

# ── 4. ERREURS DISQUE (SMART / dmesg) ─────────────────────
echo ""
echo "=== 4. SANTE DISQUES ==="
# Erreurs I/O dans dmesg
IO_ERRORS=$(timeout 5 dmesg 2>/dev/null | grep -ci "I/O error\|bad sector\|hard resetting\|ata.*error\|EXT4-fs error" 2>/dev/null || echo 0)
[ "${IO_ERRORS:-0}" -gt 0 ] && echo "$ERR dmesg : ${IO_ERRORS} erreurs I/O disque détectées — DISQUE POTENTIELLEMENT CORROMPU" || echo "$OK  Aucune erreur I/O disque dans dmesg"

# Récentes erreurs disque
timeout 5 dmesg 2>/dev/null | grep -i "I/O error\|bad sector\|EXT4-fs error" 2>/dev/null | tail -5 | while read l; do
    echo "  >> $l"
done

# SMART sur les disques physiques
for disk in /dev/sd? /dev/nvme?n?; do
    [ -b "$disk" ] || continue
    if command -v smartctl &>/dev/null; then
        SMART=$(timeout 10 smartctl -H "$disk" 2>/dev/null | grep "SMART overall-health")
        if echo "$SMART" | grep -q "PASSED"; then
            echo "$OK  SMART $disk : PASSED"
        elif [ -n "$SMART" ]; then
            echo "$ERR SMART $disk : $SMART — DISQUE DÉFAILLANT"
        fi
    else
        echo "$WARN smartctl non installé (apt install smartmontools)"
    fi
done

# Filesystem checks
FS_ERRORS=$(timeout 5 dmesg 2>/dev/null | grep -c "filesystem error\|EXT4-fs error\|XFS.*error" 2>/dev/null || echo 0)
[ "${FS_ERRORS:-0}" -gt 0 ] && echo "$ERR Erreurs filesystem : $FS_ERRORS détectées" || echo "$OK  Filesystem : aucune erreur"

# ── 5. MÉMOIRE RAM PHYSIQUE ───────────────────────────────
echo ""
echo "=== 5. INTEGRITE MEMOIRE RAM ==="
MEM_ERRORS=$(timeout 5 dmesg 2>/dev/null | grep -ci "mce\|machine check\|memory error\|edac\|corrected\|uncorrected" 2>/dev/null || echo 0)
[ "${MEM_ERRORS:-0}" -gt 0 ] && echo "$ERR dmesg : ${MEM_ERRORS} erreurs mémoire détectées — RAM potentiellement défaillante" || echo "$OK  Aucune erreur mémoire dans dmesg"

OOM=$(timeout 5 dmesg 2>/dev/null | grep -c "oom-kill\|Out of memory" 2>/dev/null || echo 0)
[ "${OOM:-0}" -gt 0 ] && echo "$ERR OOM Killer déclenché $OOM fois — MÉMOIRE INSUFFISANTE" || echo "$OK  OOM Killer : aucun déclenchement"

# ── 6. VMs ET CONTAINERS PROXMOX ──────────────────────────
echo ""
echo "=== 6. VMs ET CONTAINERS ==="
if command -v qm &>/dev/null; then
    echo "$INFO VMs (QEMU) :"
    timeout 5 qm list 2>/dev/null | while read l; do echo "      $l"; done
fi
if command -v pct &>/dev/null; then
    echo "$INFO Containers (LXC) :"
    timeout 5 pct list 2>/dev/null | while read l; do echo "      $l"; done
fi

# Container gmao-iris spécifiquement
CT_ID=$(timeout 5 pct list 2>/dev/null | grep -i "gmao\|iris\|fsao" | awk '{print $1}' | head -1)
if [ -n "$CT_ID" ]; then
    echo "$INFO Container FSAO-Iris ID: $CT_ID"
    CT_STATUS=$(timeout 5 pct status $CT_ID 2>/dev/null)
    echo "      Status : $CT_STATUS"
    CT_RAM=$(timeout 5 pct config $CT_ID 2>/dev/null | grep "^memory" | cut -d: -f2)
    echo "      RAM allouée : ${CT_RAM}MB"
    CT_DISK=$(timeout 5 pct df $CT_ID 2>/dev/null | tail -5)
    echo "      Disque CT :"
    echo "$CT_DISK" | while read l; do echo "      $l"; done
fi

# ── 7. RÉSEAU ─────────────────────────────────────────────
echo ""
echo "=== 7. RESEAU ==="
timeout 3 ip addr show 2>/dev/null | grep "inet " | while read l; do echo "  $l"; done
# Test connectivité Internet
INET=$(timeout 5 curl -s -o /dev/null -w "%{http_code}" https://google.com 2>/dev/null || echo "TIMEOUT")
[ "$INET" = "200" ] && echo "$OK  Connexion Internet : OK" || echo "$WARN Connexion Internet : $INET"

# ── 8. LOGS PROXMOX ───────────────────────────────────────
echo ""
echo "=== 8. LOGS PROXMOX (erreurs 24h) ==="
if command -v journalctl &>/dev/null; then
    echo "$INFO Erreurs critiques :"
    timeout 5 journalctl --since "24 hours ago" -p err 2>/dev/null | grep -i "error\|fail\|crash\|panic\|kernel" | tail -10 | while read l; do echo "  $l"; done
fi
# Log Proxmox natif
[ -f "/var/log/pve/tasks/index" ] && timeout 3 tail -20 /var/log/pve/tasks/index 2>/dev/null | grep "ERR\|FAIL" | while read l; do echo "  $l"; done

# ── 9. TEMPÉRATURE CPU ────────────────────────────────────
echo ""
echo "=== 9. TEMPERATURE ==="
if command -v sensors &>/dev/null; then
    timeout 5 sensors 2>/dev/null | grep -E "Core|Package|temp" | while read l; do
        TEMP=$(echo "$l" | grep -o "+[0-9]*\.[0-9]*" | head -1 | tr -d '+')
        [ "${TEMP%.*}" -gt 80 ] 2>/dev/null && echo "$ERR $l  ← SURCHAUFFE" || echo "      $l"
    done
else
    # Fallback
    for f in /sys/class/thermal/thermal_zone*/temp; do
        [ -f "$f" ] || continue
        VAL=$(cat "$f" 2>/dev/null)
        DEG=$(( VAL / 1000 ))
        ZONE=$(echo $f | grep -o "thermal_zone[0-9]*")
        [ $DEG -gt 80 ] && echo "$ERR $ZONE : ${DEG}°C — SURCHAUFFE" || echo "      $ZONE : ${DEG}°C"
    done
fi

# ── 10. REDÉMARRAGES KERNEL / PANICS ─────────────────────
echo ""
echo "=== 10. STABILITE KERNEL ==="
timeout 5 last reboot 2>/dev/null | head -5 | while read l; do echo "  $l"; done
KERNEL_PANICS=$(timeout 5 dmesg 2>/dev/null | grep -c "Kernel panic\|BUG:\|OOPS" 2>/dev/null || echo 0)
[ "${KERNEL_PANICS:-0}" -gt 0 ] && echo "$ERR Kernel panic/BUG détecté $KERNEL_PANICS fois — CORRUPTION POSSIBLE" || echo "$OK  Aucun kernel panic détecté"

echo ""
echo "$SEP"
echo "  DIAGNOSTIC TERMINÉ — $(date '+%d/%m/%Y %H:%M:%S')"
echo "  Rapport sauvegardé dans : /tmp/rapport_proxmox.txt"
echo "$SEP"
