"""
Routes API pour les Autorisations Particulières de Travaux
Format: MAINT_FE_003_V03
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging
from bson import ObjectId

from models import AutorisationParticuliere, AutorisationParticuliereCreate, AutorisationParticuliereUpdate, SuccessResponse
from dependencies import get_current_user, get_current_user_optional
from auth import decode_access_token
from autorisation_template import generate_autorisation_html
from autorisation_particuliere_v4_template import generate_autorisation_v4_html

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/autorisations", tags=["autorisations"])

# Collection MongoDB
from motor.motor_asyncio import AsyncIOMotorClient
import os

client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
db = client.gmao_iris


# ==================== CRUD ====================

@router.get("/")
async def get_autorisations(
    pole_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer toutes les autorisations (filtrées par pôle optionnellement)"""
    try:
        query = {}
        if pole_id:
            query["pole_id"] = pole_id
        
        autorisations = await db.autorisations_particulieres.find(query).to_list(length=None)
        # Serialize documents to handle ObjectId and other MongoDB types
        serialized_autorisations = []
        for autorisation in autorisations:
            if "_id" in autorisation:
                # Only set id from _id if id field doesn't exist
                if "id" not in autorisation:
                    autorisation["id"] = str(autorisation["_id"])
                del autorisation["_id"]
            serialized_autorisations.append(autorisation)
        return serialized_autorisations
    except Exception as e:
        logger.error(f"Erreur récupération autorisations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/by-bon-travail/{bon_travail_id}")
async def get_autorisations_by_bon_travail(
    bon_travail_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer toutes les autorisations liées à un bon de travail"""
    try:
        autorisations = await db.autorisations_particulieres.find(
            {"bons_travail_ids": bon_travail_id}
        ).to_list(length=None)
        
        # Serialize documents to handle ObjectId and other MongoDB types
        serialized_autorisations = []
        for autorisation in autorisations:
            if "_id" in autorisation:
                if "id" not in autorisation:
                    autorisation["id"] = str(autorisation["_id"])
                del autorisation["_id"]
            serialized_autorisations.append(autorisation)
        return serialized_autorisations
    except Exception as e:
        logger.error(f"Erreur récupération autorisations par bon: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{autorisation_id}")
async def get_autorisation(
    autorisation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer une autorisation spécifique"""
    try:
        autorisation = await db.autorisations_particulieres.find_one({"id": autorisation_id})
        if not autorisation:
            raise HTTPException(status_code=404, detail="Autorisation non trouvée")
        # Serialize document to handle ObjectId and other MongoDB types
        if "_id" in autorisation:
            # Only set id from _id if id field doesn't exist
            if "id" not in autorisation:
                autorisation["id"] = str(autorisation["_id"])
            del autorisation["_id"]
        return autorisation
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération autorisation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_autorisation(
    autorisation: AutorisationParticuliereCreate,
    current_user: dict = Depends(get_current_user)
):
    """Créer une nouvelle autorisation"""
    try:
        # Générer le numéro d'autorisation (>= 8000)
        last_autorisation = await db.autorisations_particulieres.find_one(
            sort=[("numero", -1)]
        )
        next_numero = 8000 if not last_autorisation else last_autorisation.get("numero", 7999) + 1
        
        data = autorisation.model_dump()
        data["id"] = str(uuid.uuid4())
        data["numero"] = next_numero
        data["date_etablissement"] = datetime.now(timezone.utc).strftime("%d/%m/%Y")
        data["created_by"] = current_user.get("id")
        data["created_at"] = datetime.now(timezone.utc).isoformat()
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        data["statut"] = "BROUILLON"
        data["_id"] = ObjectId()
        
        await db.autorisations_particulieres.insert_one(data)
        logger.info(f"Autorisation créée: {data['id']} (numéro: {next_numero})")
        
        # Remove _id from response to avoid serialization issues
        if "_id" in data:
            del data["_id"]
        return data
    except Exception as e:
        logger.error(f"Erreur création autorisation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{autorisation_id}")
async def update_autorisation(
    autorisation_id: str,
    autorisation: AutorisationParticuliereUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Mettre à jour une autorisation"""
    try:
        existing = await db.autorisations_particulieres.find_one({"id": autorisation_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Autorisation non trouvée")
        
        # Ne garder que les champs non-null
        data = {k: v for k, v in autorisation.model_dump().items() if v is not None}
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.autorisations_particulieres.update_one(
            {"id": autorisation_id},
            {"$set": data}
        )
        
        # Récupérer l'autorisation mise à jour
        updated = await db.autorisations_particulieres.find_one({"id": autorisation_id})
        
        # Serialize document to handle ObjectId and other MongoDB types
        if updated and "_id" in updated:
            # Only set id from _id if id field doesn't exist
            if "id" not in updated:
                updated["id"] = str(updated["_id"])
            del updated["_id"]
        
        logger.info(f"Autorisation mise à jour: {autorisation_id}")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur mise à jour autorisation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{autorisation_id}", response_model=SuccessResponse)
async def delete_autorisation(
    autorisation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Supprimer une autorisation"""
    try:
        result = await db.autorisations_particulieres.delete_one({"id": autorisation_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Autorisation non trouvée")
        
        logger.info(f"Autorisation supprimée: {autorisation_id}")
        return {"success": True, "message": "Autorisation supprimée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur suppression autorisation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PDF GENERATION ====================

@router.get("/{autorisation_id}/pdf")
async def generate_autorisation_pdf(
    autorisation_id: str,
    token: str = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """Générer le PDF de l'autorisation particulière - Format MAINT_FE_003_V03"""
    try:
        # Vérifier l'authentification
        if not current_user and token:
            payload = decode_access_token(token)
            if payload is None:
                raise HTTPException(status_code=401, detail="Token invalide")
        elif not current_user and not token:
            raise HTTPException(status_code=401, detail="Non authentifié")
        
        autorisation = await db.autorisations_particulieres.find_one({"id": autorisation_id})
        if not autorisation:
            raise HTTPException(status_code=404, detail="Autorisation non trouvée")
        
        # Sélectionner le bon template selon la version
        if autorisation.get("form_version") == 4 and autorisation.get("form_data"):
            # Nouvelle autorisation V4 — utiliser le template MAINT/FE/003 V4
            html_content = generate_autorisation_v4_html(autorisation["form_data"])
        elif autorisation.get("form_version") == 4:
            # V4 sans form_data (format de sauvegarde direct)
            clean = {k: v for k, v in autorisation.items() if k not in ("_id", "id", "pole_id", "form_version", "created_at", "updated_at", "created_by", "titre", "statut")}
            html_content = generate_autorisation_v4_html(clean)
        else:
            # Ancienne autorisation — conserver l'ancien template
            html_content = generate_autorisation_html(autorisation)
        
        return HTMLResponse(content=html_content)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur génération PDF autorisation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
