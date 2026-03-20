"""
Routes de disponibilite des equipements
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import logging

from models import ActionType, EntityType
from dependencies import get_current_user, require_permission
from routes.shared import db, audit_service, serialize_doc

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Disponibilite"])

@router.get("/availabilities",
    summary="Lister les disponibilites", tags=["Disponibilites"])
async def get_availabilities(
    start_date: str = None,
    end_date: str = None,
    user_id: str = None,
    current_user: dict = Depends(require_permission("planning", "view"))
):
    """Récupérer les disponibilités du personnel"""
    query = {}
    
    if user_id:
        query["user_id"] = user_id
    
    if start_date and end_date:
        query["date"] = {
            "$gte": datetime.fromisoformat(start_date),
            "$lte": datetime.fromisoformat(end_date)
        }
    
    availabilities = await db.availabilities.find(query).to_list(1000)
    
    for avail in availabilities:
        avail["id"] = str(avail["_id"])
        del avail["_id"]
        if avail.get("user_id"):
            avail["user"] = await get_user_by_id(avail["user_id"])
    
    return availabilities

@router.post("/availabilities",
    summary="Creer une disponibilite", tags=["Disponibilites"])
async def create_availability(
    availability: UserAvailabilityCreate,
    current_user: dict = Depends(get_current_admin_user)
):
    """Créer une disponibilité (admin uniquement)"""
    avail_dict = availability.model_dump()
    avail_dict["_id"] = ObjectId()
    
    await db.availabilities.insert_one(avail_dict)
    
    avail = serialize_doc(avail_dict)
    if avail.get("user_id"):
        avail["user"] = await get_user_by_id(avail["user_id"])
    
    # Émettre l'événement WebSocket
    try:
        from realtime_events import EntityType as RealtimeEntityType, EventType as RealtimeEventType
        await _get_realtime_manager().emit_event(
            RealtimeEntityType.AVAILABILITIES.value,
            RealtimeEventType.CREATED.value,
            avail,
            current_user.get("id")
        )
    except Exception as e:
        logger.error(f"Erreur émission événement WebSocket availabilities: {e}")
    
    return avail

@router.put("/availabilities/{avail_id}",
    summary="Modifier une disponibilite", tags=["Disponibilites"])
async def update_availability(
    avail_id: str,
    availability_update: UserAvailabilityUpdate,
    current_user: dict = Depends(get_current_admin_user)
):
    """Mettre à jour une disponibilité (admin uniquement)"""
    try:
        # Utiliser model_dump() pour obtenir toutes les valeurs, y compris None
        # On accepte explicitement les valeurs null pour pouvoir remettre à blanc
        update_data = {}
        raw_dict = availability_update.model_dump()
        
        # Pour chaque champ de disponibilité, vérifier s'il a été envoyé
        for field in ['disponible', 'disponible_matin', 'disponible_aprem', 'disponible_nuit', 'motif']:
            if field in raw_dict:
                update_data[field] = raw_dict[field]
        
        if update_data:
            await db.availabilities.update_one(
                {"_id": ObjectId(avail_id)},
                {"$set": update_data}
            )
        
        avail = await db.availabilities.find_one({"_id": ObjectId(avail_id)})
        avail = serialize_doc(avail)
        
        if avail.get("user_id"):
            avail["user"] = await get_user_by_id(avail["user_id"])
        
        # Émettre l'événement WebSocket
        try:
            from realtime_events import EntityType as RealtimeEntityType, EventType as RealtimeEventType
            await _get_realtime_manager().emit_event(
                RealtimeEntityType.AVAILABILITIES.value,
                RealtimeEventType.UPDATED.value,
                avail,
                current_user.get("id")
            )
        except Exception as e:
            logger.error(f"Erreur émission événement WebSocket availabilities: {e}")
        
        return avail
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/availabilities/{avail_id}", response_model=MessageResponse,
    summary="Supprimer une disponibilite", tags=["Disponibilites"])
async def delete_availability(
    avail_id: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """Supprimer une disponibilité (admin uniquement)"""
    try:
        result = await db.availabilities.delete_one({"_id": ObjectId(avail_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Disponibilité non trouvée")
        
        # Émettre l'événement WebSocket
        try:
            from realtime_events import EntityType as RealtimeEntityType, EventType as RealtimeEventType
            await _get_realtime_manager().emit_event(
                RealtimeEntityType.AVAILABILITIES.value,
                RealtimeEventType.DELETED.value,
                {"id": avail_id},
                current_user.get("id")
            )
        except Exception as e:
            logger.error(f"Erreur émission événement WebSocket availabilities: {e}")
        
        return {"message": "Disponibilité supprimée"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

