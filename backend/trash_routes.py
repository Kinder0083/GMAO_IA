"""Routes pour la gestion de la corbeille (soft delete / restore)"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()
db = None

# Mapping collection <-> label
TRASH_COLLECTIONS = {
    "work_orders": {"label": "Ordre de Travail", "name_field": "titre"},
    "improvement_requests": {"label": "Amelioration", "name_field": "titre"},
    "intervention_requests": {"label": "Demande d'Intervention", "name_field": "titre"},
    "equipments": {"label": "Equipement", "name_field": "nom"},
    "presqu_accident_items": {"label": "Presqu'accident", "name_field": "titre"},
    "users": {"label": "Utilisateur", "name_field": "email"},
    "surveillance_items": {"label": "Plan de surveillance", "name_field": "titre"},
    "form_templates": {"label": "Modèle de formulaire", "name_field": "nom"},
}

class TrashSettingsUpdate(BaseModel):
    retention_days: int

def init_trash_routes(database):
    global db
    db = database

async def get_retention_days():
    settings = await db.app_settings.find_one({"key": "trash_retention_days"})
    if settings:
        return settings.get("value", 2)
    return 2

async def purge_expired_trash():
    """Supprime definitivement les elements dont le delai de retention est depasse"""
    try:
        retention_days = await get_retention_days()
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        total_purged = 0
        for col_name in TRASH_COLLECTIONS:
            result = await db[col_name].delete_many({
                "deleted_at": {"$ne": None, "$exists": True, "$lt": cutoff}
            })
            if result.deleted_count > 0:
                logger.info(f"Corbeille: {result.deleted_count} elements purges de {col_name}")
                total_purged += result.deleted_count
        if total_purged > 0:
            logger.info(f"Purge corbeille terminee: {total_purged} elements supprimes (retention: {retention_days}j)")
        return total_purged
    except Exception as e:
        logger.error(f"Erreur purge corbeille: {e}")
        return 0
