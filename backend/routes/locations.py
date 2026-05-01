"""
Routes des Emplacements - CRUD, Hierarchie
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
import logging

from models import ActionType, EntityType, Location, LocationCreate, LocationUpdate, MessageResponse
from dependencies import get_current_user, require_permission
from routes.shared import db, audit_service, serialize_doc, _get_realtime_manager

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Emplacements"])

@router.get("/locations",
    summary="Lister les emplacements", response_model=List[Location], tags=["Emplacements"])
async def get_locations(current_user: dict = Depends(require_permission("locations", "view"))):
    """Liste toutes les zones avec hiérarchie"""
    locations = await db.locations.find().to_list(1000)
    
    # Enrichir avec les informations de hiérarchie
    result = []
    for loc in locations:
        loc_data = serialize_doc(loc)
        
        # Calculer le niveau dans la hiérarchie
        level = 0
        parent_id = loc.get('parent_id')
        while parent_id and level < 3:
            parent = await db.locations.find_one({"_id": ObjectId(parent_id)})
            if parent:
                level += 1
                parent_id = parent.get('parent_id')
            else:
                break
        loc_data['level'] = level
        
        # Vérifier si cette zone a des enfants
        has_children = await db.locations.count_documents({"parent_id": loc_data['id']}) > 0
        loc_data['hasChildren'] = has_children
        
        # Ajouter les infos du parent si présent
        if loc.get('parent_id'):
            parent = await db.locations.find_one({"_id": ObjectId(loc.get('parent_id'))})
            if parent:
                loc_data['parent'] = {
                    "id": str(parent["_id"]),
                    "nom": parent.get("nom")
                }
        
        result.append(Location(**loc_data))
    
    return result

@router.get("/locations/{loc_id}/children", response_model=List[Location], tags=["Emplacements"])
async def get_location_children(loc_id: str, current_user: dict = Depends(require_permission("locations", "view"))):
    """Récupérer les sous-zones d'une zone"""
    children = await db.locations.find({"parent_id": loc_id}).to_list(100)
    result = []
    for child in children:
        child_data = serialize_doc(child)
        child_data['level'] = 1  # Simplifié pour l'instant
        child_data['hasChildren'] = await db.locations.count_documents({"parent_id": child_data['id']}) > 0
        result.append(Location(**child_data))
    return result

@router.post("/locations",
    summary="Creer un emplacement", response_model=Location, tags=["Emplacements"])
async def create_location(loc_create: LocationCreate, current_user: dict = Depends(require_permission("locations", "edit"))):
    """Créer une nouvelle zone"""
    loc_dict = loc_create.model_dump()
    loc_dict["dateCreation"] = datetime.utcnow()
    loc_dict["_id"] = ObjectId()
    
    # Vérifier le niveau de hiérarchie si parent_id est fourni
    if loc_dict.get('parent_id'):
        parent_id = loc_dict['parent_id']
        level = 0
        
        # Remonter la hiérarchie pour calculer le niveau
        while parent_id and level < 3:
            parent = await db.locations.find_one({"_id": ObjectId(parent_id)})
            if parent:
                level += 1
                parent_id = parent.get('parent_id')
            else:
                break
        
        # Limiter à 3 niveaux (0, 1, 2)
        if level >= 3:
            raise HTTPException(
                status_code=400, 
                detail="Limite de hiérarchie atteinte. Maximum 3 niveaux de sous-zones."
            )
    
    await db.locations.insert_one(loc_dict)
    
    loc_data = serialize_doc(loc_dict)
    loc_data['level'] = 0
    loc_data['hasChildren'] = False
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "zones",
        "created",
        loc_data,
        user_id=current_user["id"]
    )
    
    return Location(**loc_data)

@router.put("/locations/{loc_id}",
    summary="Modifier un emplacement", response_model=Location, tags=["Emplacements"])
async def update_location(loc_id: str, loc_update: LocationUpdate, current_user: dict = Depends(require_permission("locations", "edit"))):
    """Modifier une zone"""
    try:
        raw_data = loc_update.model_dump(exclude_unset=True)
        update_data = {}
        # Cas spécial : parent_id="" ou null signifie "déplacer vers racine"
        if "parent_id" in raw_data:
            pid = raw_data["parent_id"]
            update_data["parent_id"] = None if not pid else pid
        for k, v in raw_data.items():
            if k == "parent_id":
                continue
            if v is not None:
                update_data[k] = v
        
        # Si on change le parent_id, vérifier la hiérarchie ET les cycles
        if 'parent_id' in update_data and update_data['parent_id']:
            new_parent_id = update_data['parent_id']

            # 1. Empêcher de devenir son propre parent
            if new_parent_id == loc_id:
                raise HTTPException(
                    status_code=400,
                    detail="Une zone ne peut pas être son propre parent."
                )

            # 2. Empêcher les cycles : vérifier que le nouveau parent
            #    n'est pas un descendant de la zone qu'on déplace.
            descendants = set()
            stack = [loc_id]
            while stack:
                current = stack.pop()
                async for child in db.locations.find(
                    {"parent_id": current}, {"_id": 1}
                ):
                    cid = str(child["_id"])
                    if cid not in descendants:
                        descendants.add(cid)
                        stack.append(cid)
            if new_parent_id in descendants:
                raise HTTPException(
                    status_code=400,
                    detail="Impossible : le nouveau parent est un descendant de la zone que vous déplacez (cela créerait un cycle)."
                )

            # 3. Vérifier la limite de profondeur (max 3 niveaux)
            parent_id = new_parent_id
            level = 0
            while parent_id and level < 3:
                parent = await db.locations.find_one({"_id": ObjectId(parent_id)})
                if parent:
                    level += 1
                    parent_id = parent.get('parent_id')
                else:
                    break
            
            if level >= 3:
                raise HTTPException(
                    status_code=400,
                    detail="Limite de hiérarchie atteinte. Maximum 3 niveaux de sous-zones."
                )
        
        await db.locations.update_one(
            {"_id": ObjectId(loc_id)},
            {"$set": update_data}
        )
        
        loc = await db.locations.find_one({"_id": ObjectId(loc_id)})
        loc_data = serialize_doc(loc)
        
        # Calculer le niveau
        level = 0
        parent_id = loc.get('parent_id')
        while parent_id and level < 3:
            parent = await db.locations.find_one({"_id": ObjectId(parent_id)})
            if parent:
                level += 1
                parent_id = parent.get('parent_id')
            else:
                break
        loc_data['level'] = level
        loc_data['hasChildren'] = await db.locations.count_documents({"parent_id": loc_id}) > 0
        
        if loc.get('parent_id'):
            parent = await db.locations.find_one({"_id": ObjectId(loc.get('parent_id'))})
            if parent:
                loc_data['parent'] = {
                    "id": str(parent["_id"]),
                    "nom": parent.get("nom")
                }
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await _get_realtime_manager().emit_event(
            "zones",
            "updated",
            loc_data,
            user_id=current_user["id"]
        )
        
        return Location(**loc_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/locations/{loc_id}", response_model=MessageResponse,
    summary="Supprimer un emplacement", tags=["Emplacements"])
async def delete_location(loc_id: str, current_user: dict = Depends(require_permission("locations", "delete"))):
    """Supprimer une zone et ses sous-zones"""
    try:
        # Vérifier s'il y a des sous-zones
        children_count = await db.locations.count_documents({"parent_id": loc_id})
        if children_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Impossible de supprimer cette zone car elle contient {children_count} sous-zone(s). Supprimez d'abord les sous-zones."
            )
        
        # Vérifier s'il y a des équipements liés
        equipment_count = await db.equipments.count_documents({"emplacement_id": loc_id})
        if equipment_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Impossible de supprimer cette zone car elle contient {equipment_count} équipement(s)."
            )
        
        result = await db.locations.delete_one({"_id": ObjectId(loc_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Zone non trouvée")
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await _get_realtime_manager().emit_event(
            "zones",
            "deleted",
            {"id": loc_id},
            user_id=current_user["id"]
        )
        
        return {"message": "Zone supprimée"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

