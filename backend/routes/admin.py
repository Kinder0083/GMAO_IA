"""
Routes d'administration - Reset sections, Maintenance mode, Corbeille, Changelog
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import logging

from models import ActionType, EntityType, MessageResponse
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Administration"])


RESET_COLLECTIONS = {
    "work_orders": "Ordres de travail",
    "intervention_requests": "Demandes d'intervention",
    "improvement_requests": "Demandes d'amélioration",
    "improvements": "Améliorations",
    "equipments": "Équipements",
    "inventory": "Inventaire",
    "locations": "Zones / Emplacements",
    "preventive_maintenance": "Maintenance préventive",
    "vendors": "Fournisseurs",
    "purchase_history": "Historique d'achat",
    "purchase_requests": "Demandes d'achat",
    "sensors": "Capteurs MQTT",
    "chat_messages": "Messages Chat Live",
    "users": "Utilisateurs",
    "surveillance_items": "Plan de surveillance",
    "presqu_accident_items": "Presqu'accidents",
}

@router.delete("/admin/reset/{section}",
    summary="Reinitialiser une section", response_model=ResetSectionResponse, tags=["Administration"])
async def reset_section(section: str, current_user: dict = Depends(get_current_admin_user)):
    """Réinitialiser une section (admin uniquement)"""
    if section not in RESET_COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Section inconnue: {section}")
    
    query = {}
    if section == "users":
        query = {"_id": {"$ne": ObjectId(current_user["id"])}}
    
    result = await db[section].delete_many(query)
    
    # Log d'audit via le service centralisé
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
        user_email=current_user["email"],
        action=ActionType.DELETE,
        entity_type=EntityType.USER,
        entity_name=RESET_COLLECTIONS[section],
        details=f"Réinitialisation de {RESET_COLLECTIONS[section]}: {result.deleted_count} éléments supprimés"
    )
    
    return {
        "success": True,
        "section": RESET_COLLECTIONS[section],
        "deleted_count": result.deleted_count
    }

@router.delete("/admin/reset-all",
    summary="Reinitialiser toutes les donnees", response_model=ResetAllResponse, tags=["Administration"])
async def reset_all(current_user: dict = Depends(get_current_admin_user)):
    """Réinitialiser toutes les données (admin uniquement)"""
    details = {}
    total = 0
    
    for section, label in RESET_COLLECTIONS.items():
        query = {}
        if section == "users":
            query = {"_id": {"$ne": ObjectId(current_user["id"])}}
        
        result = await db[section].delete_many(query)
        details[label] = result.deleted_count
        total += result.deleted_count
    
    # Log d'audit via le service centralisé
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
        user_email=current_user["email"],
        action=ActionType.DELETE,
        entity_type=EntityType.USER,
        entity_name="Toutes les données",
        details=f"Réinitialisation complète: {total} éléments supprimés"
    )
    
    return {
        "success": True,
        "total_deleted": total,
        "details": details
    }


# Include the router in the main app (MUST be after all endpoint definitions)
