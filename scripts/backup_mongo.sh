#!/bin/bash
# ============================================================
#  backup_mongo.sh — Sauvegarde automatique MongoDB (GMAO Iris)
#  Auteur : GMAO Iris / Emergent
#  Usage  : bash /root/backup_mongo.sh
#           ou via cron : 0 2 * * * root bash /root/backup_mongo.sh
# ============================================================

# ---------- CONFIGURATION ----------
DB_NAME="gmao_iris"
BACKUP_ROOT="/root/backups/mongo"
RETENTION_DAYS=7          # Nombre de jours de sauvegardes à conserver
LOG_FILE="/var/log/mongodump_gmao.log"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

# Seuil d'alerte espace disque (en %) — log un avertissement si dépassé
DISK_THRESHOLD=80
# -----------------------------------

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ---- 1. Vérifications préalables ----

# Créer le dossier de sauvegarde si inexistant
mkdir -p "$BACKUP_DIR"
if [ $? -ne 0 ]; then
    log "ERREUR : Impossible de créer le dossier $BACKUP_DIR"
    exit 1
fi

# Vérifier que mongodump est disponible
if ! command -v mongodump &> /dev/null; then
    log "ERREUR : mongodump introuvable. Installez mongodb-database-tools."
    exit 1
fi

# Vérifier l'espace disque disponible
DISK_USAGE=$(df "$BACKUP_ROOT" | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_USAGE" -ge "$DISK_THRESHOLD" ]; then
    log "AVERTISSEMENT : Espace disque à ${DISK_USAGE}% sur $BACKUP_ROOT (seuil : ${DISK_THRESHOLD}%)"
fi

# ---- 2. Sauvegarde ----
log "--------------------------------------"
log "Début sauvegarde — Base : $DB_NAME"
log "Destination : $BACKUP_DIR"

mongodump \
    --db "$DB_NAME" \
    --out "$BACKUP_DIR" \
    --gzip \
    --quiet

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    log "ERREUR : mongodump a échoué (code $EXIT_CODE)"
    rm -rf "$BACKUP_DIR"
    exit 1
fi

# Taille de la sauvegarde
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "Sauvegarde réussie — Taille : $BACKUP_SIZE"

# ---- 3. Rotation : suppression des sauvegardes trop anciennes ----
log "Rotation : suppression des sauvegardes de plus de $RETENTION_DAYS jours..."

DELETED_COUNT=0
while IFS= read -r old_dir; do
    rm -rf "$old_dir"
    log "  Supprimé : $old_dir"
    DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d -mtime +$RETENTION_DAYS)

if [ $DELETED_COUNT -eq 0 ]; then
    log "  Aucune ancienne sauvegarde à supprimer."
else
    log "  $DELETED_COUNT ancienne(s) sauvegarde(s) supprimée(s)."
fi

# ---- 4. Résumé des sauvegardes conservées ----
KEPT=$(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | wc -l)
log "Sauvegardes conservées : $KEPT (rétention : $RETENTION_DAYS jours)"
log "Fin sauvegarde — OK"
log "--------------------------------------"

exit 0
