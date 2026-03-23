from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import logging
from dependencies import get_current_user, get_current_admin_user, db
from datetime import datetime, timezone

router = APIRouter(prefix="/user-preferences", tags=["User Preferences"])
logger = logging.getLogger(__name__)

class PreferenceUpdate(BaseModel):
    key: str
    value: Any

class BulkPreferenceUpdate(BaseModel):
    preferences: Dict[str, Any]

@router.get("/", status_code=200)
@router.get("", status_code=200)
async def get_user_preferences(current_user: dict = Depends(get_current_user)):
    """
    Récupérer toutes les préférences de l'utilisateur
    """
    try:
        user_id = current_user.get("id")
        
        # Chercher les préférences de l'utilisateur
        prefs = await db.user_preferences.find_one({"user_id": user_id})
        
        if not prefs:
            # Créer des préférences par défaut
            default_prefs = {
                "user_id": user_id,
                "preferences": {},
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.user_preferences.insert_one(default_prefs)
            return {"preferences": {}}
        
        if "_id" in prefs:
            del prefs["_id"]
        
        return {"preferences": prefs.get("preferences", {})}
    
    except Exception as e:
        logger.error(f"Error getting user preferences: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{key}")
async def get_user_preference(
    key: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Récupérer une préférence spécifique
    """
    try:
        user_id = current_user.get("id")
        
        prefs = await db.user_preferences.find_one({"user_id": user_id})
        
        if not prefs or key not in prefs.get("preferences", {}):
            return {"key": key, "value": None}
        
        return {"key": key, "value": prefs["preferences"][key]}
    
    except Exception as e:
        logger.error(f"Error getting user preference: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", status_code=200)
@router.post("", status_code=200)
async def update_user_preference(
    preference: PreferenceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Mettre à jour une préférence utilisateur
    """
    try:
        user_id = current_user.get("id")
        
        # Vérifier si les préférences existent
        existing = await db.user_preferences.find_one({"user_id": user_id})
        
        if existing:
            # Mettre à jour la préférence
            await db.user_preferences.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        f"preferences.{preference.key}": preference.value,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
        else:
            # Créer nouveau document
            new_prefs = {
                "user_id": user_id,
                "preferences": {preference.key: preference.value},
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.user_preferences.insert_one(new_prefs)
        
        return {"success": True, "key": preference.key, "value": preference.value}
    
    except Exception as e:
        logger.error(f"Error updating user preference: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/", status_code=200)
@router.put("", status_code=200)
async def put_user_preferences(
    updates: dict,
    current_user: dict = Depends(get_current_user)
):
    """Mettre a jour plusieurs preferences (merge) et retourner les preferences completes."""
    try:
        user_id = current_user.get("id")
        existing = await db.user_preferences.find_one({"user_id": user_id})

        if existing:
            current_prefs = existing.get("preferences", {})
            current_prefs.update(updates)
            await db.user_preferences.update_one(
                {"user_id": user_id},
                {"$set": {"preferences": current_prefs, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            current_prefs = updates
            await db.user_preferences.insert_one({
                "user_id": user_id,
                "preferences": current_prefs,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })

        return current_prefs
    except Exception as e:
        logger.error(f"Error in put_user_preferences: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/bulk")
async def update_bulk_preferences(
    bulk: BulkPreferenceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Mettre à jour plusieurs préférences en une fois
    """
    try:
        user_id = current_user.get("id")
        
        # Vérifier si les préférences existent
        existing = await db.user_preferences.find_one({"user_id": user_id})
        
        if existing:
            # Fusionner les préférences existantes avec les nouvelles
            current_prefs = existing.get("preferences", {})
            current_prefs.update(bulk.preferences)
            
            await db.user_preferences.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        "preferences": current_prefs,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
        else:
            # Créer nouveau document
            new_prefs = {
                "user_id": user_id,
                "preferences": bulk.preferences,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.user_preferences.insert_one(new_prefs)
        
        return {"success": True, "updated_count": len(bulk.preferences)}
    
    except Exception as e:
        logger.error(f"Error updating bulk preferences: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{key}")
async def delete_user_preference(
    key: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Supprimer une préférence spécifique
    """
    try:
        user_id = current_user.get("id")
        
        await db.user_preferences.update_one(
            {"user_id": user_id},
            {
                "$unset": {f"preferences.{key}": ""},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        return {"success": True, "deleted_key": key}
    
    except Exception as e:
        logger.error(f"Error deleting user preference: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== WIDGET PERMISSIONS ====================

class WidgetPermissionUpdate(BaseModel):
    allowed_user_ids: List[str]


@router.get("/widget-permissions/all")
async def get_widget_permissions(current_user: dict = Depends(get_current_user)):
    """
    Récupérer les permissions de visibilité des widgets.
    - Admin : reçoit toutes les permissions pour la configuration
    - Non-admin : reçoit la liste des widgets qu'il peut voir
    """
    try:
        user_id = current_user.get("id")
        user_role = current_user.get("role", "")

        perms = await db.widget_permissions.find({}, {"_id": 0}).to_list(100)
        perm_map = {p["widget_id"]: p.get("allowed_user_ids", []) for p in perms}

        if user_role == "ADMIN":
            return {"permissions": perm_map, "is_admin": True}

        # Pour les non-admins : liste des widgets autorisés
        allowed = [wid for wid, uids in perm_map.items() if user_id in uids]
        return {"permissions": perm_map, "is_admin": False, "allowed_widgets": allowed}

    except Exception as e:
        logger.error(f"Error getting widget permissions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/widget-permissions/{widget_id}")
async def update_widget_permission(
    widget_id: str,
    data: WidgetPermissionUpdate,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Mettre à jour les utilisateurs autorisés pour un widget (admin uniquement).
    """
    try:
        await db.widget_permissions.update_one(
            {"widget_id": widget_id},
            {"$set": {
                "widget_id": widget_id,
                "allowed_user_ids": data.allowed_user_ids,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user.get("id")
            }},
            upsert=True
        )
        return {"success": True, "widget_id": widget_id, "allowed_user_ids": data.allowed_user_ids}

    except Exception as e:
        logger.error(f"Error updating widget permission: {e}")
        raise HTTPException(status_code=500, detail=str(e))
