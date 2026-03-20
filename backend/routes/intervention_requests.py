"""
Routes des Demandes d'Intervention (DI) - CRUD, Attachments, Refusal
Extrait de server.py pour une meilleure maintenabilite.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from bson import ObjectId
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
import uuid
import os
import mimetypes
import aiofiles
import logging

from models import (
    InterventionRequest, InterventionRequestCreate, InterventionRequestUpdate,
    AttachmentResponse, MessageResponse,
    ActionType, EntityType
)
from pydantic import BaseModel
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc, find_user_flexible

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Demandes d'Intervention"])

IR_UPLOAD_DIR = Path("/app/backend/uploads/intervention-requests")
IR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _get_realtime_manager():
    from realtime_manager import realtime_manager
    return realtime_manager



@router.post("/intervention-requests", response_model=InterventionRequest, status_code=201, tags=["Demandes Intervention"])
async def create_intervention_request(
    request: InterventionRequestCreate,
    current_user: dict = Depends(require_permission("interventionRequests", "edit"))
):
    """Créer une nouvelle demande d'intervention"""
    try:
        request_id = str(uuid.uuid4())
        request_data = request.model_dump()
        request_data["id"] = request_id
        request_data["date_creation"] = datetime.utcnow()
        request_data["created_by"] = current_user["id"]
        request_data["created_by_name"] = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        request_data["work_order_id"] = None
        request_data["work_order_date_limite"] = None
        request_data["converted_at"] = None
        request_data["converted_by"] = None
        request_data["attachments"] = []
        request_data["refused"] = False
        request_data["refused_reason"] = None
        request_data["refused_at"] = None
        request_data["refused_by"] = None
        request_data["refused_by_name"] = None
        
        # Récupérer les informations de l'équipement si fourni
        if request_data.get("equipement_id"):
            eq_info = await get_equipment_by_id(request_data["equipement_id"])
            if eq_info:
                request_data["equipement"] = eq_info
        
        # Récupérer les informations de l'emplacement si fourni
        if request_data.get("emplacement_id"):
            loc_info = await get_location_by_id(request_data["emplacement_id"])
            if loc_info:
                request_data["emplacement"] = loc_info
        
        await db.intervention_requests.insert_one(request_data)
        
        # Broadcast WebSocket pour la synchronisation temps réel
        # Ne pas exclure l'utilisateur pour permettre la sync multi-appareils
        broadcast_data = {k: v for k, v in request_data.items() if k != '_id'}
        broadcast_data = _clean_ir_attachments(broadcast_data)
        await _get_realtime_manager().emit_event(
            "intervention_requests",
            "created",
            broadcast_data
        )
        
        # Audit log
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
            user_email=current_user["email"],
            action=ActionType.CREATE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=request_id,
            entity_name=request.titre,
            details="Création demande d'intervention"
        )
        
        return InterventionRequest(**request_data)
    except Exception as e:
        logger.error(f"Erreur création demande d'intervention: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def _clean_ir_attachments(req):
    """Nettoyer les ObjectId dans les attachments d'une demande d'intervention"""
    if "attachments" in req and req["attachments"]:
        cleaned = []
        for att in req["attachments"]:
            clean_att = {k: v for k, v in att.items() if k != "_id"}
            if "_id" in att:
                clean_att["id"] = str(att["_id"])
                clean_att["url"] = f"/api/intervention-requests/{req.get('id', '')}/attachments/{str(att['_id'])}"
            elif "id" in att and att["id"]:
                # Old public format: keep the id, build url
                clean_att["url"] = f"/api/intervention-requests/{req.get('id', '')}/attachments/{att['id']}"
            cleaned.append(clean_att)
        req["attachments"] = cleaned
    else:
        req["attachments"] = []
    return req

@router.get("/intervention-requests", response_model=List[InterventionRequest], tags=["Demandes Intervention"])
async def get_all_intervention_requests(current_user: dict = Depends(require_permission("interventionRequests", "view"))):
    """Récupérer toutes les demandes d'intervention"""
    try:
        query = {"deleted_at": {"$exists": False}}
        
        # Collecter les work_order_ids pour vérifier les OT supprimés en un seul appel
        all_reqs = []
        wo_ids = set()
        async for req in db.intervention_requests.find(query).sort("date_creation", -1):
            req = _clean_ir_attachments(req)
            if req.get("work_order_id"):
                wo_ids.add(req["work_order_id"])
            all_reqs.append(req)
        
        # Vérifier quels OT liés sont soft-deleted
        deleted_wo_ids = set()
        if wo_ids:
            async for wo in db.work_orders.find(
                {"id": {"$in": list(wo_ids)}, "deleted_at": {"$exists": True}},
                {"id": 1, "_id": 0}
            ):
                deleted_wo_ids.add(wo["id"])
        
        requests = []
        for req in all_reqs:
            if req.get("work_order_id") and req["work_order_id"] in deleted_wo_ids:
                req["is_work_order_deleted"] = True
            # Convertir tous les ObjectId en string (données restaurées)
            for key, val in req.items():
                if isinstance(val, ObjectId):
                    req[key] = str(val)
            # Compléter les champs obligatoires manquants (données restaurées)
            if "id" not in req:
                req["id"] = str(req.get("_id", ""))
            if "titre" not in req:
                req["titre"] = req.get("title", "Sans titre")
            if "description" not in req:
                req["description"] = req.get("desc", "")
            if "created_by" not in req:
                req["created_by"] = req.get("createdBy", req.get("demandeur_id", "inconnu"))
            if "date_creation" not in req:
                req["date_creation"] = req.get("dateCreation", req.get("created_at", datetime.utcnow()))
            if "priorite" not in req:
                req["priorite"] = req.get("priority", "AUCUNE")
            elif isinstance(req.get("priorite"), str):
                req["priorite"] = req["priorite"].upper()
            try:
                requests.append(InterventionRequest(**req))
            except Exception as e:
                logger.warning(f"DI {req.get('id','?')} invalide, tentative correction: {str(e)[:100]}")
                req.setdefault("titre", "Sans titre")
                req.setdefault("description", "")
                req.setdefault("priorite", "AUCUNE")
                req.setdefault("created_by", "inconnu")
                req.setdefault("date_creation", datetime.utcnow())
                if isinstance(req.get("priorite"), str):
                    req["priorite"] = req["priorite"].upper()
                try:
                    requests.append(InterventionRequest(**req))
                except Exception as e2:
                    logger.error(f"DI {req.get('id','?')} définitivement invalide: {str(e2)[:200]}")
        return requests
    except Exception as e:
        logger.error(f"Erreur récupération demandes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/intervention-requests/stats/kpi", tags=["Demandes Intervention"])
async def get_intervention_requests_kpi(current_user: dict = Depends(require_permission("interventionRequests", "view"))):
    """KPI des demandes d'intervention : temps de reponse, taux de conversion, etc."""
    try:
        all_irs = await db.intervention_requests.find({"deleted_at": {"$exists": False}}, {"_id": 0}).to_list(5000)
        total = len(all_irs)
        if total == 0:
            return {
                "total": 0,
                "en_attente": 0,
                "converties": 0,
                "refusees": 0,
                "taux_conversion": 0,
                "taux_refus": 0,
                "temps_moyen_reponse_heures": None,
                "temps_moyen_reponse_label": "-",
                "publiques": 0,
                "authentifiees": 0,
            }

        en_attente = sum(1 for ir in all_irs if not ir.get("work_order_id") and not ir.get("refused"))
        converties = sum(1 for ir in all_irs if ir.get("work_order_id"))
        refusees = sum(1 for ir in all_irs if ir.get("refused"))
        publiques = sum(1 for ir in all_irs if ir.get("created_by") == "PUBLIC")
        authentifiees = total - publiques

        # Temps moyen de reponse (entre date_creation et converted_at ou refused_at)
        response_times = []
        for ir in all_irs:
            creation = ir.get("date_creation")
            if not creation:
                continue
            if isinstance(creation, str):
                try:
                    creation = datetime.fromisoformat(creation.replace('Z', '+00:00'))
                except Exception:
                    continue

            response_time = None
            if ir.get("converted_at"):
                rt = ir["converted_at"]
                if isinstance(rt, str):
                    try:
                        rt = datetime.fromisoformat(rt.replace('Z', '+00:00'))
                    except Exception:
                        continue
                response_time = rt
            elif ir.get("refused_at"):
                rt = ir["refused_at"]
                if isinstance(rt, str):
                    try:
                        rt = datetime.fromisoformat(rt.replace('Z', '+00:00'))
                    except Exception:
                        continue
                response_time = rt

            if response_time:
                # Make both offset-aware or offset-naive
                if creation.tzinfo is None and response_time.tzinfo is not None:
                    creation = creation.replace(tzinfo=timezone.utc)
                elif creation.tzinfo is not None and response_time.tzinfo is None:
                    response_time = response_time.replace(tzinfo=timezone.utc)
                delta = (response_time - creation).total_seconds() / 3600
                if delta >= 0:
                    response_times.append(delta)

        temps_moyen = round(sum(response_times) / len(response_times), 1) if response_times else None
        if temps_moyen is not None:
            if temps_moyen < 1:
                label = f"{int(temps_moyen * 60)} min"
            elif temps_moyen < 24:
                label = f"{temps_moyen:.1f} h"
            else:
                label = f"{temps_moyen / 24:.1f} j"
        else:
            label = "-"

        taux_conversion = round((converties / total) * 100, 1) if total > 0 else 0
        taux_refus = round((refusees / total) * 100, 1) if total > 0 else 0

        return {
            "total": total,
            "en_attente": en_attente,
            "converties": converties,
            "refusees": refusees,
            "taux_conversion": taux_conversion,
            "taux_refus": taux_refus,
            "temps_moyen_reponse_heures": temps_moyen,
            "temps_moyen_reponse_label": label,
            "publiques": publiques,
            "authentifiees": authentifiees,
        }
    except Exception as e:
        logger.error(f"Erreur KPI DI: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/intervention-requests/{request_id}", response_model=InterventionRequest, tags=["Demandes Intervention"])
async def get_intervention_request(request_id: str, current_user: dict = Depends(require_permission("interventionRequests", "view"))):
    """Récupérer une demande d'intervention spécifique"""
    req = await db.intervention_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    req = _clean_ir_attachments(req)
    return InterventionRequest(**req)

@router.put("/intervention-requests/{request_id}", response_model=InterventionRequest, tags=["Demandes Intervention"])
async def update_intervention_request(
    request_id: str,
    request_update: InterventionRequestUpdate,
    current_user: dict = Depends(require_permission("interventionRequests", "edit"))
):
    """Mettre à jour une demande d'intervention"""
    req = await db.intervention_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    update_data = {k: v for k, v in request_update.model_dump().items() if v is not None}
    
    # Mettre à jour l'équipement si nécessaire
    if "equipement_id" in update_data:
        if update_data["equipement_id"]:
            eq_info = await get_equipment_by_id(update_data["equipement_id"])
            if eq_info:
                update_data["equipement"] = eq_info
        else:
            update_data["equipement"] = None
    
    # Mettre à jour l'emplacement si nécessaire
    if "emplacement_id" in update_data:
        if update_data["emplacement_id"]:
            loc_info = await get_location_by_id(update_data["emplacement_id"])
            if loc_info:
                update_data["emplacement"] = loc_info
        else:
            update_data["emplacement"] = None
    
    await db.intervention_requests.update_one({"id": request_id}, {"$set": update_data})
    
    # Récupérer la demande mise à jour
    updated_req = await db.intervention_requests.find_one({"id": request_id})
    
    # Broadcast WebSocket pour la synchronisation temps réel
    broadcast_data = {k: v for k, v in dict(updated_req).items() if k != '_id'}
    broadcast_data = _clean_ir_attachments(broadcast_data)
    await _get_realtime_manager().emit_event(
        "intervention_requests",
        "updated",
        broadcast_data
    )
    
    # Audit log
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
        user_email=current_user["email"],
        action=ActionType.UPDATE,
        entity_type=EntityType_Audit.WORK_ORDER,
        entity_id=request_id,
        entity_name=updated_req['titre'],
        details="Modification demande d'intervention"
    )
    
    updated_req = _clean_ir_attachments(updated_req)
    return InterventionRequest(**updated_req)

@router.delete("/intervention-requests/{request_id}", response_model=MessageResponse, tags=["Demandes Intervention"])
async def delete_intervention_request(request_id: str, current_user: dict = Depends(require_permission("interventionRequests", "delete"))):
    """Supprimer une demande d'intervention"""
    req = await db.intervention_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    req_title = req.get('titre', 'Sans titre')
    
    await db.intervention_requests.update_one(
        {"id": request_id},
        {"$set": {
            "deleted_at": datetime.now(timezone.utc),
            "deleted_by": current_user["id"],
            "deleted_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        }}
    )
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "intervention_requests",
        "deleted",
        {"id": request_id, "titre": req_title}
    )
    
    # Audit log
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
        user_email=current_user["email"],
        action=ActionType.DELETE,
        entity_type=EntityType_Audit.WORK_ORDER,
        entity_id=request_id,
        entity_name=req_title,
        details="Suppression demande d'intervention"
    )
    
    return {"message": "Demande supprimée"}

# ==================== INTERVENTION REQUEST ATTACHMENTS ====================

@router.post("/intervention-requests/{request_id}/attachments",
    summary="Uploader une piece jointe a une demande d'intervention", response_model=AttachmentResponse, tags=["Demandes Intervention"])
async def upload_ir_attachment(
    request_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("interventionRequests", "edit"))
):
    """Uploader une piece jointe a une demande d'intervention (max 25MB)"""
    try:
        req = await db.intervention_requests.find_one({"id": request_id})
        if not req:
            raise HTTPException(status_code=404, detail="Demande d'intervention non trouvee")
        
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 25MB)")
        
        # Compression automatique des images
        from image_compressor import get_compression_settings, compress_image
        comp_settings = await get_compression_settings(db)
        content, compressed_filename, new_mime, was_compressed = compress_image(content, file.filename, comp_settings)
        
        file_ext = Path(compressed_filename).suffix if was_compressed else Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = IR_IR_UPLOAD_DIR / unique_filename
        
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        
        attachment = {
            "_id": ObjectId(),
            "filename": unique_filename,
            "original_filename": file.filename,
            "size": len(content),
            "mime_type": new_mime if was_compressed else (file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"),
            "uploaded_at": datetime.utcnow()
        }
        
        await db.intervention_requests.update_one(
            {"id": request_id},
            {"$push": {"attachments": attachment}}
        )
        
        attachment_response = {
            "id": str(attachment["_id"]),
            "filename": attachment["filename"],
            "original_filename": attachment["original_filename"],
            "size": attachment["size"],
            "mime_type": attachment["mime_type"],
            "uploaded_at": attachment["uploaded_at"],
            "url": f"/api/intervention-requests/{request_id}/attachments/{str(attachment['_id'])}"
        }
        
        return attachment_response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur upload piece jointe DI: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/intervention-requests/{request_id}/attachments/{attachment_id}",
    summary="Telecharger une piece jointe", tags=["Demandes Intervention"])
async def download_ir_attachment(
    request_id: str,
    attachment_id: str,
    current_user: dict = Depends(require_permission("interventionRequests", "view"))
):
    """Telecharger une piece jointe d'une demande d'intervention"""
    try:
        req = await db.intervention_requests.find_one({"id": request_id})
        if not req:
            raise HTTPException(status_code=404, detail="Demande non trouvee")
        
        attachment = None
        for att in req.get("attachments", []):
            # Support both formats: _id (standard) and id (old public)
            att_id_str = str(att.get("_id", "")) if att.get("_id") else att.get("id", "")
            if att_id_str == attachment_id:
                attachment = att
                break
        
        if not attachment:
            raise HTTPException(status_code=404, detail="Piece jointe non trouvee")
        
        file_path = IR_IR_UPLOAD_DIR / attachment["filename"]
        
        # Fallback: check old public upload path
        if not file_path.exists():
            old_path = Path(f"/app/backend/uploads/intervention_requests/{request_id}") / attachment["filename"]
            if old_path.exists():
                file_path = old_path
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Fichier non trouve sur le disque")
        
        from starlette.responses import FileResponse
        return FileResponse(
            path=str(file_path),
            filename=attachment["original_filename"],
            media_type=attachment.get("mime_type", "application/octet-stream")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur download piece jointe DI: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/intervention-requests/{request_id}/attachments/{attachment_id}",
    summary="Supprimer une piece jointe", response_model=MessageResponse, tags=["Demandes Intervention"])
async def delete_ir_attachment(
    request_id: str,
    attachment_id: str,
    current_user: dict = Depends(require_permission("interventionRequests", "edit"))
):
    """Supprimer une piece jointe d'une demande d'intervention"""
    try:
        req = await db.intervention_requests.find_one({"id": request_id})
        if not req:
            raise HTTPException(status_code=404, detail="Demande non trouvee")
        
        attachment = None
        for att in req.get("attachments", []):
            if str(att.get("_id")) == attachment_id:
                attachment = att
                break
        
        if not attachment:
            raise HTTPException(status_code=404, detail="Piece jointe non trouvee")
        
        # Delete file from disk
        file_path = IR_IR_UPLOAD_DIR / attachment["filename"]
        if file_path.exists():
            file_path.unlink()
        
        # Remove from DB
        await db.intervention_requests.update_one(
            {"id": request_id},
            {"$pull": {"attachments": {"_id": attachment["_id"]}}}
        )
        
        return {"message": "Piece jointe supprimee"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur suppression piece jointe DI: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== INTERVENTION REQUEST REFUSAL ====================

class RefuseInterventionRequest(BaseModel):
    motif: str

@router.post("/intervention-requests/{request_id}/refuse", response_model=dict, tags=["Demandes Intervention"])
async def refuse_intervention_request(
    request_id: str,
    refuse_data: RefuseInterventionRequest,
    current_user: dict = Depends(require_permission("interventionRequests", "edit"))
):
    """Refuser une demande d'intervention avec un motif"""
    try:
        req = await db.intervention_requests.find_one({"id": request_id})
        if not req:
            raise HTTPException(status_code=404, detail="Demande non trouvee")
        
        refused_by_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        
        update_data = {
            "refused": True,
            "refused_reason": refuse_data.motif,
            "refused_at": datetime.utcnow(),
            "refused_by": current_user["id"],
            "refused_by_name": refused_by_name
        }
        
        await db.intervention_requests.update_one(
            {"id": request_id},
            {"$set": update_data}
        )
        
        # Envoyer email au demandeur
        try:
            creator_id = req.get("created_by")
            if creator_id:
                creator = await db.users.find_one({"id": creator_id})
                if creator and creator.get("email"):
                    subject = f"Demande d'intervention refusee - {req.get('titre', '')}"
                    html_content = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background-color: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                            <h2 style="margin: 0;">Demande d'intervention refusee</h2>
                        </div>
                        <div style="padding: 20px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p>Bonjour {creator.get('prenom', '')} {creator.get('nom', '')},</p>
                            <p>Votre demande d'intervention a ete refusee.</p>
                            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 15px 0;">
                                <p><strong>Titre :</strong> {req.get('titre', '')}</p>
                                <p><strong>Description :</strong> {req.get('description', '')}</p>
                                <p style="color: #dc2626;"><strong>Motif du refus :</strong> {refuse_data.motif}</p>
                                <p><strong>Refuse par :</strong> {refused_by_name}</p>
                            </div>
                            <p>Cordialement,<br>FSAO Iris - GMAO</p>
                        </div>
                    </div>
                    """
                    email_service.send_email(creator["email"], subject, html_content)
        except Exception as email_err:
            logger.warning(f"Erreur envoi email refus DI: {str(email_err)}")
        
        # Audit log
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=request_id,
            entity_name=req.get('titre', ''),
            details=f"Refus demande d'intervention - Motif: {refuse_data.motif}"
        )
        
        # Broadcast WebSocket
        updated_req = await db.intervention_requests.find_one({"id": request_id})
        broadcast_data = {k: v for k, v in dict(updated_req).items() if k != '_id'}
        broadcast_data = _clean_ir_attachments(broadcast_data)
        await _get_realtime_manager().emit_event(
            "intervention_requests",
            "updated",
            broadcast_data
        )
        
        return {"message": "Demande d'intervention refusee", "request_id": request_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur refus demande d'intervention: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/intervention-requests/{request_id}/convert-to-work-order", response_model=dict, tags=["Demandes Intervention"])
async def convert_to_work_order(
    request_id: str,
    assignee_id: Optional[str] = None,
    date_limite: Optional[str] = None,
    assignee_type: Optional[str] = None,
    assignee_service: Optional[str] = None,
    temps_estime: Optional[float] = None,
    current_user: dict = Depends(require_permission("interventionRequests", "edit"))
):
    """Convertir une demande d'intervention en ordre de travail (Admin/Technicien uniquement)"""
    # Vérifier que l'utilisateur est admin ou technicien
    if current_user.get("role") not in ["ADMIN", "TECHNICIEN"]:
        raise HTTPException(status_code=403, detail="Accès refusé : Seuls les administrateurs et techniciens peuvent convertir des demandes")
    
    try:
        # Récupérer la demande
        req = await db.intervention_requests.find_one({"id": request_id})
        if not req:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Vérifier si déjà convertie
        if req.get("work_order_id"):
            raise HTTPException(status_code=400, detail="Cette demande a déjà été convertie en ordre de travail")
        
        # Créer l'ordre de travail
        work_order_id = str(uuid.uuid4())
        
        # Générer le numéro d'ordre (comme pour les créations normales)
        count = await db.work_orders.count_documents({})
        numero = str(5800 + count + 1)
        
        # Utiliser la date limite fournie ou celle de la demande
        date_limite_ordre = None
        if date_limite:
            date_limite_ordre = datetime.fromisoformat(date_limite.replace('Z', '+00:00'))
        elif req.get("date_limite_desiree"):
            date_limite_ordre = req.get("date_limite_desiree")
        
        work_order_data = {
            "id": work_order_id,
            "numero": numero,
            "titre": req["titre"],
            "description": req["description"],
            "statut": "OUVERT",
            "priorite": req["priorite"],
            "equipement_id": req.get("equipement_id"),
            "equipement": req.get("equipement"),
            "emplacement_id": req.get("emplacement_id"),
            "emplacement": req.get("emplacement"),
            "assigne_a_id": assignee_id,
            "assigne_type": assignee_type,
            "assigne_service": assignee_service,
            "assigneA": None,
            "dateLimite": date_limite_ordre,
            "tempsEstime": temps_estime,
            "dateCreation": datetime.utcnow(),
            "createdBy": req["created_by"],
            "createdByName": req.get("created_by_name"),
            "tempsReel": None,
            "dateTermine": None,
            "attachments": [],
            "comments": []
        }
        
        # Transférer les pièces jointes de la DI vers l'OT
        ir_attachments = req.get("attachments", [])
        if ir_attachments:
            import shutil
            WO_UPLOAD_DIR = Path("/app/backend/uploads/work-orders")
            WO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            for att in ir_attachments:
                try:
                    src_path = IR_IR_UPLOAD_DIR / att["filename"]
                    # Fallback: check old public upload path
                    if not src_path.exists():
                        old_path = Path(f"/app/backend/uploads/intervention_requests/{request_id}") / att["filename"]
                        if old_path.exists():
                            src_path = old_path
                    if src_path.exists():
                        new_filename = f"{uuid.uuid4()}{Path(att['filename']).suffix}"
                        dst_path = WO_IR_UPLOAD_DIR / new_filename
                        shutil.copy2(str(src_path), str(dst_path))
                        wo_attachment = {
                            "_id": ObjectId(),
                            "filename": new_filename,
                            "original_filename": att.get("original_filename", att["filename"]),
                            "size": att.get("size", 0),
                            "mime_type": att.get("mime_type", "application/octet-stream"),
                            "uploaded_at": datetime.utcnow()
                        }
                        work_order_data["attachments"].append(wo_attachment)
                    else:
                        logger.warning(f"Piece jointe DI introuvable: {att['filename']}")
                except Exception as copy_err:
                    logger.warning(f"Erreur copie piece jointe DI->OT: {str(copy_err)}")
        
        # Récupérer les informations de l'assigné si fourni
        if assignee_id:
            assignee = await db.users.find_one({"id": assignee_id})
            if assignee:
                work_order_data["assigneA"] = {
                    "id": assignee["id"],
                    "nom": assignee["nom"],
                    "prenom": assignee["prenom"]
                }
        
        await db.work_orders.insert_one(work_order_data)
        
        # Mettre à jour la demande avec les informations de l'ordre créé
        await db.intervention_requests.update_one(
            {"id": request_id},
            {"$set": {
                "work_order_id": work_order_id,
                "work_order_numero": numero,
                "work_order_date_limite": date_limite_ordre,
                "converted_at": datetime.utcnow(),
                "converted_by": current_user["id"]
            }}
        )
        
        # Émettre un événement pour rafraîchir les notifications
        # Note: Dans une vraie application, on utiliserait des WebSockets
        
        return {
            "message": "Demande convertie en ordre de travail avec succès",
            "work_order_id": work_order_id,
            "request_id": request_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur conversion demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


