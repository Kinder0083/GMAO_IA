"""
Routes API pour les Pièces Jointes des Demandes d'Arrêt
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from typing import List
from datetime import datetime, timezone
import logging
import uuid
import mimetypes
import aiofiles
from pathlib import Path

from dependencies import get_current_user
from demande_arret_utils import db, serialize_doc, UPLOAD_DIR, MAX_FILE_SIZE
from models import MessageResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/demandes-arret", tags=["demandes-arret-attachments"])


@router.post("/{demande_id}/attachments")
async def upload_attachment(
    demande_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Uploader une pièce jointe pour une demande d'arrêt"""
    try:
        # Vérifier que la demande existe
        demande = await db.demandes_arret.find_one({"id": demande_id})
        if not demande:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Lire le contenu du fichier
        content = await file.read()
        
        # Vérifier la taille
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"Fichier trop volumineux (max {MAX_FILE_SIZE // (1024*1024)}MB)")
        
        # Compression automatique des images
        from image_compressor import get_compression_settings, compress_image
        comp_settings = await get_compression_settings(db)
        content, compressed_filename, new_mime, was_compressed = compress_image(content, file.filename, comp_settings)
        file_size = len(content)
        
        # Générer un ID unique et un nom de fichier sécurisé
        attachment_id = str(uuid.uuid4())
        safe_filename = f"{attachment_id}_{compressed_filename if was_compressed else file.filename}"
        file_path = UPLOAD_DIR / safe_filename
        
        # Sauvegarder le fichier
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        
        # Créer l'entrée de métadonnées
        now = datetime.now(timezone.utc)
        attachment_data = {
            "id": attachment_id,
            "filename": file.filename,
            "safe_filename": safe_filename,
            "content_type": new_mime if was_compressed else (file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"),
            "size": file_size,
            "uploaded_by_id": current_user.get("id"),
            "uploaded_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
            "uploaded_at": now.isoformat()
        }
        
        # Ajouter à la liste des pièces jointes de la demande
        await db.demandes_arret.update_one(
            {"id": demande_id},
            {
                "$push": {"attachments": attachment_data},
                "$set": {"updated_at": now.isoformat()}
            }
        )
        
        logger.info(f"Pièce jointe uploadée: {attachment_id} pour demande {demande_id}")
        return {
            "message": "Fichier uploadé avec succès",
            "attachment": attachment_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur upload pièce jointe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{demande_id}/attachments")
async def get_attachments(
    demande_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer la liste des pièces jointes d'une demande"""
    try:
        demande = await db.demandes_arret.find_one({"id": demande_id})
        if not demande:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        return {
            "demande_id": demande_id,
            "attachments": demande.get("attachments", [])
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération pièces jointes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{demande_id}/attachments/{attachment_id}")
async def download_attachment(
    demande_id: str,
    attachment_id: str,
    preview: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Télécharger ou prévisualiser une pièce jointe"""
    try:
        demande = await db.demandes_arret.find_one({"id": demande_id})
        if not demande:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Trouver la pièce jointe
        attachment = None
        for att in demande.get("attachments", []):
            if att.get("id") == attachment_id:
                attachment = att
                break
        
        if not attachment:
            raise HTTPException(status_code=404, detail="Pièce jointe non trouvée")
        
        file_path = UPLOAD_DIR / attachment["safe_filename"]
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Fichier non trouvé sur le serveur")
        
        disposition = "inline" if preview else "attachment"
        return FileResponse(
            path=str(file_path),
            filename=attachment["filename"],
            media_type=attachment.get("content_type", "application/octet-stream"),
            content_disposition_type=disposition
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur téléchargement pièce jointe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{demande_id}/attachments/{attachment_id}", response_model=MessageResponse)
async def delete_attachment(
    demande_id: str,
    attachment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Supprimer une pièce jointe"""
    try:
        demande = await db.demandes_arret.find_one({"id": demande_id})
        if not demande:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Trouver la pièce jointe
        attachment = None
        for att in demande.get("attachments", []):
            if att.get("id") == attachment_id:
                attachment = att
                break
        
        if not attachment:
            raise HTTPException(status_code=404, detail="Pièce jointe non trouvée")
        
        # Supprimer le fichier physique
        file_path = UPLOAD_DIR / attachment["safe_filename"]
        if file_path.exists():
            file_path.unlink()
        
        # Supprimer de la base de données
        now = datetime.now(timezone.utc)
        await db.demandes_arret.update_one(
            {"id": demande_id},
            {
                "$pull": {"attachments": {"id": attachment_id}},
                "$set": {"updated_at": now.isoformat()}
            }
        )
        
        logger.info(f"Pièce jointe supprimée: {attachment_id} de demande {demande_id}")
        return {"message": "Pièce jointe supprimée avec succès"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur suppression pièce jointe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
