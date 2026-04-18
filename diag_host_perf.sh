#!/bin/bash
# ============================================================
# DIAGNOSTIC PERFORMANCE HOTE PROXMOX (bas niveau)
# Usage : bash /tmp/diag_host_perf.sh 2>&1 | tee /tmp/rapport_host.txt
# A exécuter sur l'HOTE Proxmox directement (pas dans le CT/VM)
# ============================================================

SEP="============================================================"
OK="[OK]"; WARN="[WARN]"; ERR="[ERR]"; INFO="[INFO]"

echo "$SEP"
echo "  DIAGNOSTIC PERFORMANCE HOTE — $(date '+%d/%m/%Y %H:%M:%S')"
echo "$SEP"

# ── 1. FRÉQUENCE CPU (throttling ?) ───────────────────────
echo ""
echo "=== 1. FREQUENCE CPU (throttling / governor) ==="
for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    id=$(basename $cpu)
    gov=$(cat "$cpu/cpufreq/scaling_governor" 2>/dev/null || echo "N/A")
    cur=$(cat "$cpu/cpufreq/scaling_cur_freq" 2>/dev/null | awk '{printf "%.0f MHz", $1/1000}' || echo "N/A")
    min=$(cat "$cpu/cpufreq/scaling_min_freq" 2>/dev/null | awk '{printf "%.0f MHz", $1/1000}' || echo "N/A")
    max=$(cat "$cpu/cpufreq/scaling_max_freq" 2>/dev/null | awk '{printf "%.0f MHz", $1/1000}' || echo "N/A")
    echo "  $id : fréq=$cur  min=$min  max=$max  governor=$gov"
done

# Throttle thermique (CPU Intel P-state)
THROTTLE=$(dmesg 2>/dev/null | grep -ci "CPU.*throttl\|thermal throttl\|ACPI: Thermal" 2>/dev/null || echo 0)
[ "${THROTTLE:-0}" -gt 0 ] && echo "$ERR Throttling thermique détecté $THROTTLE fois" || echo "$OK  Aucun throttling thermique dans dmesg"

# iowait : si élevé = le CPU attend les disques
echo ""
echo "$INFO IOWait CPU (0% = pas d'attente disque, >20% = disque lent) :"
timeout 5 iostat -c 1 2 2>/dev/null | grep -A2 "avg-cpu" | tail -3 | while read l; do echo "  $l"; done
# Fallback si iostat absent
if ! command -v iostat &>/dev/null; then
    IOWAIT=$(timeout 3 top -bn2 2>/dev/null | grep "Cpu(s)" | tail -1 | grep -o "[0-9.]*wa" | head -1)
    echo "  IOWait (via top) : ${IOWAIT:-N/A}"
fi

# ── 2. VITESSE DISQUE (test réel) ─────────────────────────
echo ""
echo "=== 2. TEST VITESSE DISQUE ==="
# Écriture séquentielle
echo "$INFO Test écriture (500 MB) :"
WRITE_SPEED=$(timeout 30 dd if=/dev/zero of=/tmp/test_speed.bin bs=1M count=500 conv=fdatasync 2>&1 | tail -1)
echo "  $WRITE_SPEED"
rm -f /tmp/test_speed.bin

# Lecture séquentielle
echo "$INFO Test lecture séquentielle (/dev/sda) :"
READ_SPEED=$(timeout 15 hdparm -t /dev/sda 2>/dev/null | grep "Timing" || echo "hdparm absent")
echo "  $READ_SPEED"

# IOPS aléatoires (si fio dispo)
if command -v fio &>/dev/null; then
    echo "$INFO Test IOPS aléatoires (4K, 10s) :"
    timeout 15 fio --name=randread --rw=randread --bs=4k --size=50M --numjobs=1 --runtime=5 --time_based --filename=/tmp/fio_test.bin --output-format=terse 2>/dev/null | awk -F';' '{printf "  IOPS lect: %s | Lat moy: %s µs\n", $8, $40}' 2>/dev/null
    rm -f /tmp/fio_test.bin
else
    echo "$INFO fio non installé (apt install fio pour test IOPS précis)"
fi

# Iostat par disque
echo ""
echo "$INFO Utilisation disques (10s) :"
timeout 15 iostat -x 1 2 2>/dev/null | grep -v "^$\|^Linux\|Device" | tail -10 | while read l; do echo "  $l"; done

# ── 3. MÉMOIRE HOTE EN DÉTAIL ─────────────────────────────
echo ""
echo "=== 3. MEMOIRE HOTE (detail) ==="
timeout 3 free -h 2>/dev/null
echo ""
# ZFS ARC (si ZFS utilisé)
ZFS_ARC=$(cat /proc/spl/kstat/zfs/arcstats 2>/dev/null | grep "^size " | awk '{printf "%.0f MB", $3/1048576}')
[ -n "$ZFS_ARC" ] && echo "$INFO ZFS ARC (cache en RAM) : $ZFS_ARC — peut consommer beaucoup de RAM !" || echo "$INFO ZFS ARC : non utilisé ou N/A"

# Top processus par RAM
echo ""
echo "$INFO Top 10 processus par RAM :"
timeout 5 ps aux --sort=-%mem 2>/dev/null | head -11 | awk 'NR==1 || NR>1 {printf "  %-25s MEM:%-6s CPU:%-6s %s\n", $1, $4"%", $3"%", $11}'

# ── 4. CHARGE SYSTÈME DÉTAILLÉE ───────────────────────────
echo ""
echo "=== 4. CHARGE SYSTEME (vmstat) ==="
echo "$INFO vmstat 3 secondes (wa=iowait, si=swap-in, so=swap-out) :"
timeout 10 vmstat 1 5 2>/dev/null | while read l; do echo "  $l"; done

# ── 5. STOCKAGE PROXMOX (LVM/ZFS) ─────────────────────────
echo ""
echo "=== 5. STOCKAGE PROXMOX ==="
# ZFS pools
if command -v zpool &>/dev/null; then
    echo "$INFO Pools ZFS :"
    timeout 5 zpool status 2>/dev/null | while read l; do echo "  $l"; done
    echo ""
    echo "$INFO Stats ZFS (I/O) :"
    timeout 5 zpool iostat -v 2>/dev/null | head -20 | while read l; do echo "  $l"; done
fi

# LVM
if command -v lvs &>/dev/null; then
    echo "$INFO Volumes LVM :"
    timeout 5 lvs --units m 2>/dev/null | while read l; do echo "  $l"; done
fi

# ── 6. PROCESSUS PROXMOX EUX-MÊMES ───────────────────────
echo ""
echo "=== 6. PROCESSUS PROXMOX (charges) ==="
echo "$INFO Services Proxmox (CPU/RAM) :"
for svc in pvedaemon pveproxy pvestatd pvestored pvescheduler; do
    PID=$(pgrep $svc 2>/dev/null | head -1)
    if [ -n "$PID" ]; then
        STATS=$(timeout 3 ps -p $PID -o pid,pcpu,pmem,rss,comm --no-headers 2>/dev/null | awk '{printf "PID:%-6s CPU:%-5s RAM:%-5s RSS:%-8s %s", $1, $2"%", $3"%", int($4/1024)"MB", $5}')
        echo "  $STATS"
    else
        echo "  $svc : non trouvé"
    fi
done

# ── 7. ERREURS RÉCENTES SYSTÈME ──────────────────────────
echo ""
echo "=== 7. DMESG RECENT (erreurs I/O, MCE) ==="
echo "$INFO Erreurs kernel dernières 2h :"
timeout 5 dmesg --since "2 hours ago" 2>/dev/null | grep -iE "error|warn|fail|mce|ata|sata|nvme|mmc|i/o|corrupt|hung task|soft lockup" | tail -20 | while read l; do echo "  $l"; done

# Hung tasks (symptôme disque très lent ou kernel bloqué)
HUNG=$(timeout 5 dmesg 2>/dev/null | grep -c "hung_task\|soft lockup\|blocked for more than" 2>/dev/null || echo 0)
[ "${HUNG:-0}" -gt 0 ] && echo "$ERR $HUNG hung tasks / soft lockups détectés — CPU ou disque bloqué !" || echo "$OK  Aucun hung task détecté"

# ── 8. RÉSUMÉ RAPIDE ─────────────────────────────────────
echo ""
echo "$SEP"
echo "  DIAGNOSTIC PERFORMANCE TERMINÉ — $(date '+%d/%m/%Y %H:%M:%S')"
echo "  → Recherchez dans ce rapport :"
echo "    - governor=powersave (CPU bridé à 1.1GHz au lieu de 2.4GHz)"
echo "    - iowait > 20% (disque lent/saturé)"
echo "    - ZFS ARC > 1 GB sur 3.7 GB RAM total"
echo "    - Vitesse écriture < 50 MB/s (disque défaillant)"
echo "    - [ERR] hung task (blocage kernel)"
echo "  Rapport : /tmp/rapport_host.txt"
echo "$SEP"
