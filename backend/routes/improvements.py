"""
Routes des Demandes d'Amelioration et Ameliorations - CRUD
Extrait de server.py.
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
    ActionType, EntityType, AddTimeSpent, MessageResponse,
    Improvement, ImprovementCreate, ImprovementUpdate,
    ImprovementRequest, ImprovementRequestCreate,
    ImprovementRequestUpdate, ImprovementRequestStatusUpdate
)
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc, find_user_flexible

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Ameliorations"])


def _get_realtime_manager():
    from realtime_manager import realtime_manager
    return realtime_manager



@router.post("/improvement-requests", response_model=ImprovementRequest, status_code=201, tags=["Demandes Amelioration"])
async def create_improvement_request(
    request: ImprovementRequestCreate,
    current_user: dict = Depends(require_permission("improvementRequests", "edit"))
):
    """Créer une nouvelle demande d'amélioration"""
    try:
        request_id = str(uuid.uuid4())
        request_data = request.model_dump()
        request_data["id"] = request_id
        request_data["date_creation"] = datetime.utcnow()
        request_data["created_by"] = current_user["id"]
        request_data["created_by_name"] = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        request_data["service"] = current_user.get("service")  # Service du demandeur
        request_data["status"] = "SOUMISE"  # Statut initial
        request_data["history"] = [{
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user["id"],
            "user_name": request_data["created_by_name"],
            "action": "Création de la demande",
            "old_status": None,
            "new_status": "SOUMISE"
        }]
        request_data["improvement_id"] = None
        request_data["improvement_numero"] = None
        request_data["improvement_date_limite"] = None
        request_data["converted_at"] = None
        request_data["converted_by"] = None
        request_data["_id"] = ObjectId()
        
        if request_data.get("equipement_id"):
            equipment = await db.equipments.find_one({"id": request_data["equipement_id"]})
            if equipment:
                request_data["equipement"] = {"id": equipment["id"], "nom": equipment["nom"]}
        
        if request_data.get("emplacement_id"):
            location = await db.locations.find_one({"id": request_data["emplacement_id"]})
            if location:
                request_data["emplacement"] = {"id": location["id"], "nom": location["nom"]}
        
        await db.improvement_requests.insert_one(request_data)
        
        # Serialize for response but preserve the original UUID id
        original_id = request_data["id"]
        request_data = serialize_doc(request_data)
        request_data["id"] = original_id
        
        # Envoyer email au responsable de service pour validation
        try:
            from improvement_request_email_service import send_improvement_request_email_to_manager
            
            user_service = current_user.get("service")
            recipients = []
            
            if user_service:
                # Chercher le(s) responsable(s) de ce service
                service_managers = await db.service_responsables.find(
                    {"service": user_service}
                ).to_list(100)
                
                for manager_entry in service_managers:
                    manager = await db.users.find_one(
                        {"id": manager_entry["user_id"], "statut": "actif"},
                        {"_id": 0, "id": 1, "email": 1, "nom": 1, "prenom": 1}
                    )
                    if manager and manager.get("email"):
                        recipients.append(manager)
            
            # Si pas de responsable, envoyer aux admins
            if not recipients:
                admins = await db.users.find(
                    {"role": "ADMIN", "statut": "actif"},
                    {"_id": 0, "id": 1, "email": 1, "nom": 1, "prenom": 1}
                ).to_list(10)
                recipients = [a for a in admins if a.get("email")]
            
            # Récupérer les pièces jointes (si uploadées)
            attachments = request_data.get("attachments", [])
            
            # Envoyer l'email avec boutons d'action
            for recipient in recipients:
                await send_improvement_request_email_to_manager(
                    request_data=request_data,
                    recipient=recipient,
                    attachments=attachments
                )
                
        except Exception as email_error:
            logger.warning(f"Erreur envoi email notification création demande: {email_error}")
            # On ne bloque pas la création si l'email échoue
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await _get_realtime_manager().emit_event(
            "improvement_requests",
            "created",
            request_data,
            user_id=current_user["id"]
        )
        
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
            user_email=current_user["email"],
            action=ActionType.CREATE,
            entity_type=EntityType_Audit.IMPROVEMENT_REQUEST,
            entity_id=request_id,
            entity_name=request.titre,
            details="Création demande d'amélioration"
        )
        
        return ImprovementRequest(**request_data)
    except Exception as e:
        logger.error(f"Erreur création demande d'amélioration: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/improvement-requests", tags=["Demandes Amelioration"])
async def get_all_improvement_requests(current_user: dict = Depends(require_permission("improvementRequests", "view"))):
    """Récupérer toutes les demandes d'amélioration"""
    try:
        query = {"deleted_at": {"$exists": False}}
            
        
        requests = []
        async for req in db.improvement_requests.find(query).sort("date_creation", -1):
            req_dict = serialize_doc(req)
            # Enrichir avec les informations du créateur
            if req.get("created_by_id"):
                creator = await db.users.find_one({"id": req["created_by_id"]})
                if creator:
                    req_dict["created_by_prenom"] = creator.get("prenom", "")
                    req_dict["created_by_nom"] = creator.get("nom", "")
            
            # Enrichir avec les informations de l'ordre de travail associé
            if req.get("work_order_id"):
                work_order = await db.work_orders.find_one({"id": req["work_order_id"]})
                if work_order:
                    req_dict["work_order_temps_reel"] = work_order.get("tempsReel", 0)
            
            requests.append(req_dict)
        return requests
    except Exception as e:
        logger.error(f"Erreur récupération demandes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/improvement-requests/pending-validation", response_model=List[dict], tags=["Demandes Amelioration"])
async def get_pending_improvement_requests(
    current_user: dict = Depends(require_permission("improvementRequests", "view"))
):
    """Récupérer les demandes d'amélioration en attente de validation pour le responsable"""
    from service_filter import is_service_manager, get_user_managed_services
    
    try:
        is_admin = current_user.get("role") == "ADMIN"
        is_manager = await is_service_manager(current_user)
        
        if not is_admin and not is_manager:
            return []  # Pas de permissions pour voir les demandes en attente
        
        query = {"$or": [{"status": "SOUMISE"}, {"status": {"$exists": False}}, {"status": None}]}
        
        # Si responsable (non admin), filtrer par service
        if not is_admin and is_manager:
            managed_services = await get_user_managed_services(current_user)
            if managed_services:
                # Récupérer les IDs des utilisateurs de ces services
                service_users = await db.users.find(
                    {"service": {"$in": managed_services}},
                    {"id": 1, "_id": 0}
                ).to_list(1000)
                user_ids = [u["id"] for u in service_users]
                
                query = {
                    "$and": [
                        {"$or": [{"status": "SOUMISE"}, {"status": {"$exists": False}}, {"status": None}]},
                        {"$or": [
                            {"created_by": {"$in": user_ids}},
                            {"service": {"$in": managed_services}}
                        ]}
                    ]
                }
        
        requests = await db.improvement_requests.find(query, {"_id": 0}).sort("date_creation", -1).to_list(1000)
        
        # Enrichir avec les infos créateur
        for req in requests:
            if req.get("created_by"):
                creator = await db.users.find_one({"id": req["created_by"]}, {"_id": 0, "service": 1})
                if creator:
                    req["service"] = creator.get("service")
        
        return requests
        
    except Exception as e:
        logger.error(f"Erreur récupération demandes en attente: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/improvement-requests/{request_id}", response_model=ImprovementRequest, tags=["Demandes Amelioration"])
async def get_improvement_request(request_id: str, current_user: dict = Depends(require_permission("improvementRequests", "view"))):
    """Récupérer une demande d'amélioration spécifique"""
    req = await db.improvement_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    req = serialize_doc(req)
    return ImprovementRequest(**req)

@router.put("/improvement-requests/{request_id}", response_model=ImprovementRequest, tags=["Demandes Amelioration"])
async def update_improvement_request(
    request_id: str,
    request_update: ImprovementRequestUpdate,
    current_user: dict = Depends(require_permission("improvementRequests", "edit"))
):
    """Mettre à jour une demande d'amélioration"""
    req = await db.improvement_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    update_data = {k: v for k, v in request_update.model_dump().items() if v is not None}
    
    if "equipement_id" in update_data:
        if update_data["equipement_id"]:
            equipment = await db.equipments.find_one({"id": update_data["equipement_id"]})
            if equipment:
                update_data["equipement"] = {"id": equipment["id"], "nom": equipment["nom"]}
        else:
            update_data["equipement"] = None
    
    if "emplacement_id" in update_data:
        if update_data["emplacement_id"]:
            location = await db.locations.find_one({"id": update_data["emplacement_id"]})
            if location:
                update_data["emplacement"] = {"id": location["id"], "nom": location["nom"]}
        else:
            update_data["emplacement"] = None
    
    await db.improvement_requests.update_one({"id": request_id}, {"$set": update_data})
    updated_req = await db.improvement_requests.find_one({"id": request_id})
    updated_req = serialize_doc(updated_req)
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "improvement_requests",
        "updated",
        updated_req,
        user_id=current_user["id"]
    )
    
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
        user_email=current_user["email"],
        action=ActionType.UPDATE,
        entity_type=EntityType_Audit.IMPROVEMENT_REQUEST,
        entity_id=request_id,
        entity_name=updated_req['titre'],
        details="Modification demande d'amélioration"
    )
    
    return ImprovementRequest(**updated_req)

@router.delete("/improvement-requests/{request_id}", response_model=MessageResponse, tags=["Demandes Amelioration"])
async def delete_improvement_request(request_id: str, current_user: dict = Depends(require_permission("improvementRequests", "delete"))):
    """Supprimer une demande d'amélioration"""
    # Essayer d'abord avec le champ 'id' (pour les nouveaux documents avec UUID)
    req = await db.improvement_requests.find_one({"id": request_id})
    
    # Si non trouvé, essayer avec _id (pour les anciens documents)
    if not req:
        try:
            req = await db.improvement_requests.find_one({"_id": ObjectId(request_id)})
        except:
            pass
    
    if not req:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    req_title = req.get('titre', 'Sans titre')
    
    # Soft delete: marquer comme supprime au lieu de supprimer definitivement
    soft_delete = {
        "deleted_at": datetime.now(timezone.utc),
        "deleted_by": current_user["id"],
        "deleted_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
    }
    await db.improvement_requests.update_one({"_id": req["_id"]}, {"$set": soft_delete})
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "improvement_requests",
        "deleted",
        {"id": request_id, "titre": req_title},
        user_id=current_user["id"]
    )
    
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
        user_email=current_user["email"],
        action=ActionType.DELETE,
        entity_type=EntityType_Audit.IMPROVEMENT_REQUEST,
        entity_id=request_id,
        entity_name=req_title,
        details="Suppression demande d'amélioration"
    )
    
    return {"message": "Demande supprimée"}


@router.put("/improvement-requests/{request_id}/status", response_model=dict, tags=["Demandes Amelioration"])
async def update_improvement_request_status(
    request_id: str,
    status_update: ImprovementRequestStatusUpdate,
    current_user: dict = Depends(require_permission("improvementRequests", "edit"))
):
    """Valider ou rejeter une demande d'amélioration (Responsable de service ou Admin)"""
    from service_filter import is_service_manager, get_user_managed_services
    
    try:
        # Récupérer la demande
        req = await db.improvement_requests.find_one({"id": request_id})
        if not req:
            try:
                req = await db.improvement_requests.find_one({"_id": ObjectId(request_id)})
            except:
                pass
        
        if not req:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Vérifier que le statut actuel permet la validation
        current_status = req.get("status", "SOUMISE")
        if current_status not in ["SOUMISE", None]:
            raise HTTPException(
                status_code=400, 
                detail=f"Cette demande ne peut pas être modifiée (statut actuel: {current_status})"
            )
        
        # Vérifier les permissions
        is_admin = current_user.get("role") == "ADMIN"
        is_manager = await is_service_manager(current_user)
        
        if not is_admin and not is_manager:
            raise HTTPException(
                status_code=403, 
                detail="Seuls les administrateurs et responsables de service peuvent valider/rejeter"
            )
        
        # Si responsable de service, vérifier que la demande est dans son service
        if not is_admin and is_manager:
            managed_services = await get_user_managed_services(current_user)
            request_service = req.get("service")
            
            # Récupérer le service du demandeur si non présent sur la demande
            if not request_service:
                creator = await db.users.find_one({"id": req.get("created_by")}, {"service": 1})
                request_service = creator.get("service") if creator else None
            
            if request_service and request_service not in managed_services:
                raise HTTPException(
                    status_code=403, 
                    detail="Vous ne pouvez valider que les demandes de votre service"
                )
        
        # Valider le nouveau statut
        new_status = status_update.status.upper()
        if new_status not in ["VALIDEE", "REJETEE"]:
            raise HTTPException(status_code=400, detail="Statut invalide. Utilisez VALIDEE ou REJETEE")
        
        # Préparer la mise à jour
        user_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        now = datetime.now(timezone.utc)
        
        history_entry = {
            "timestamp": now.isoformat(),
            "user_id": current_user["id"],
            "user_name": user_name,
            "action": "Validation" if new_status == "VALIDEE" else "Rejet",
            "old_status": current_status,
            "new_status": new_status,
            "comment": status_update.comment
        }
        
        update_data = {
            "status": new_status,
            "validated_at": now.isoformat(),
            "validated_by": current_user["id"],
            "validated_by_name": user_name
        }
        
        if new_status == "REJETEE" and status_update.comment:
            update_data["rejection_reason"] = status_update.comment
        
        # Mettre à jour dans la DB
        query_filter = {"id": request_id} if req.get("id") == request_id else {"_id": ObjectId(request_id)}
        await db.improvement_requests.update_one(
            query_filter,
            {
                "$set": update_data,
                "$push": {"history": history_entry}
            }
        )
        
        # Notifier le demandeur par email
        try:
            creator = await db.users.find_one({"id": req.get("created_by")}, {"_id": 0, "email": 1, "nom": 1, "prenom": 1})
            if creator and creator.get("email"):
                status_label = "validée" if new_status == "VALIDEE" else "rejetée"
                subject = f"Demande d'amélioration {status_label}: {req['titre']}"
                
                body = f"""
                <h2>Votre demande d'amélioration a été {status_label}</h2>
                <p><strong>Titre :</strong> {req['titre']}</p>
                <p><strong>Par :</strong> {user_name}</p>
                """
                if status_update.comment:
                    body += f"<p><strong>Commentaire :</strong> {status_update.comment}</p>"
                
                if new_status == "VALIDEE":
                    body += "<p>Votre demande sera prochainement convertie en projet d'amélioration.</p>"
                else:
                    body += "<p>Vous pouvez soumettre une nouvelle demande avec les modifications suggérées.</p>"
                
                email_service.send_email(
                    to_email=creator["email"],
                    subject=subject,
                    html_content=body
                )
        except Exception as e:
            logger.warning(f"Erreur envoi email notification: {e}")
        
        # Broadcast WebSocket
        updated_req = await db.improvement_requests.find_one(query_filter)
        if updated_req:
            updated_req = serialize_doc(updated_req)
            await _get_realtime_manager().emit_event(
                "improvement_requests",
                "status_changed",
                updated_req,
                user_id=current_user["id"]
            )
        
        logger.info(f"✅ Demande d'amélioration {req['titre']} {new_status.lower()} par {user_name}")
        
        return {
            "message": f"Demande {new_status.lower()} avec succès",
            "status": new_status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur validation demande d'amélioration: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Endpoints pour action via email (sans authentification) ============

@router.get("/improvement-requests/email-action/validate/{token}", tags=["Demandes Amelioration"])
async def validate_improvement_request_email_token(token: str):
    """Valide un token d'approbation et retourne les informations de la demande"""
    from improvement_request_email_service import validate_approval_token
    
    try:
        token_data = await validate_approval_token(token)
        
        if not token_data:
            raise HTTPException(status_code=400, detail="Token invalide ou expiré")
        
        if token_data.get("request_type") != "improvement_request":
            raise HTTPException(status_code=400, detail="Token non valide pour ce type de demande")
        
        # Récupérer la demande
        request_id = token_data.get("request_id")
        req = await db.improvement_requests.find_one({"id": request_id}, {"_id": 0})
        
        if not req:
            req = await db.improvement_requests.find_one({"_id": ObjectId(request_id)})
            if req:
                req = serialize_doc(req)
        
        if not req:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Vérifier que la demande n'a pas déjà été traitée
        if req.get("status") not in ["SOUMISE", None]:
            raise HTTPException(status_code=400, detail="Cette demande a déjà été traitée")
        
        return {
            "token_data": {
                "action": token_data.get("action"),
                "expiration": token_data.get("expiration")
            },
            "request": req
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur validation token: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/improvement-requests/email-action/{token}", tags=["Demandes Amelioration"])
async def process_improvement_request_email_action(token: str, action_data: dict = None):
    """Traite une action d'approbation/rejet via le lien email"""
    from improvement_request_email_service import validate_approval_token, mark_token_used, send_validation_notification_email
    
    try:
        token_data = await validate_approval_token(token)
        
        if not token_data:
            raise HTTPException(status_code=400, detail="Token invalide ou expiré")
        
        if token_data.get("request_type") != "improvement_request":
            raise HTTPException(status_code=400, detail="Token non valide pour ce type de demande")
        
        request_id = token_data.get("request_id")
        user_id = token_data.get("user_id")
        
        # Récupérer la demande
        req = await db.improvement_requests.find_one({"id": request_id})
        query_filter = {"id": request_id}
        
        if not req:
            try:
                req = await db.improvement_requests.find_one({"_id": ObjectId(request_id)})
                query_filter = {"_id": ObjectId(request_id)}
            except:
                pass
        
        if not req:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Vérifier que la demande n'a pas déjà été traitée
        current_status = req.get("status", "SOUMISE")
        if current_status not in ["SOUMISE", None]:
            raise HTTPException(status_code=400, detail="Cette demande a déjà été traitée")
        
        # Récupérer l'utilisateur qui a validé
        validator = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not validator:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        validator_name = f"{validator.get('prenom', '')} {validator.get('nom', '')}"
        
        # Déterminer l'action (depuis le body ou depuis le token)
        action = "reject"
        if action_data and action_data.get("action"):
            action = action_data.get("action")
        elif token_data.get("action") == "approve":
            action = "approve"
        
        new_status = "VALIDEE" if action == "approve" else "REJETEE"
        comment = action_data.get("comment") if action_data else None
        
        now = datetime.now(timezone.utc)
        
        # Créer l'entrée d'historique
        history_entry = {
            "timestamp": now.isoformat(),
            "user_id": user_id,
            "user_name": validator_name,
            "action": "Validation via email" if new_status == "VALIDEE" else "Rejet via email",
            "old_status": current_status,
            "new_status": new_status,
            "comment": comment
        }
        
        # Mettre à jour la demande
        update_data = {
            "status": new_status,
            "validated_at": now.isoformat(),
            "validated_by": user_id,
            "validated_by_name": validator_name
        }
        
        if new_status == "REJETEE" and comment:
            update_data["rejection_reason"] = comment
        
        await db.improvement_requests.update_one(
            query_filter,
            {
                "$set": update_data,
                "$push": {"history": history_entry}
            }
        )
        
        # Marquer le token comme utilisé
        await mark_token_used(token)
        
        # Envoyer notification au demandeur
        try:
            creator = await db.users.find_one({"id": req.get("created_by")}, {"_id": 0})
            if creator:
                await send_validation_notification_email(req, creator, new_status, validator_name, comment)
        except Exception as email_error:
            logger.warning(f"Erreur envoi email notification: {email_error}")
        
        # Broadcast WebSocket
        updated_req = await db.improvement_requests.find_one(query_filter)
        if updated_req:
            updated_req = serialize_doc(updated_req)
            await _get_realtime_manager().emit_event(
                "improvement_requests",
                "status_changed",
                updated_req
            )
        
        logger.info(f"✅ Demande d'amélioration {req['titre']} {new_status.lower()} via email par {validator_name}")
        
        return {
            "message": f"Demande {new_status.lower()} avec succès",
            "status": new_status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur action email: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/improvement-requests/{request_id}/convert-to-improvement", response_model=dict, tags=["Demandes Amelioration"])
async def convert_to_improvement(
    request_id: str,
    assignee_id: Optional[str] = None,
    date_limite: Optional[str] = None,
    current_user: dict = Depends(require_permission("improvementRequests", "edit"))
):
    """Convertir une demande d'amélioration en amélioration (Admin/Technicien uniquement)"""
    if current_user.get("role") not in ["ADMIN", "TECHNICIEN"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Essayer d'abord avec le champ 'id' (nouveaux documents UUID)
        req = await db.improvement_requests.find_one({"id": request_id})
        query_field = "id"
        
        # Si non trouvé, essayer avec _id (anciens documents ObjectId)
        if not req:
            try:
                req = await db.improvement_requests.find_one({"_id": ObjectId(request_id)})
                query_field = "_id"
            except:
                pass
        
        if not req:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        if req.get("improvement_id"):
            raise HTTPException(status_code=400, detail="Cette demande a déjà été convertie")
        
        improvement_id = str(uuid.uuid4())
        count = await db.improvements.count_documents({})
        numero = str(7000 + count + 1)
        
        date_limite_imp = None
        if date_limite:
            date_limite_imp = datetime.fromisoformat(date_limite.replace('Z', '+00:00'))
        elif req.get("date_limite_desiree"):
            date_limite_imp = req.get("date_limite_desiree")
        
        improvement_data = {
            "id": improvement_id,
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
            "assigneA": None,
            "dateLimite": date_limite_imp,
            "tempsEstime": None,
            "dateCreation": datetime.utcnow(),
            "createdBy": req["created_by"],
            "createdByName": req.get("created_by_name"),
            "tempsReel": None,
            "dateTermine": None,
            "attachments": [],
            "comments": []
        }
        
        if assignee_id:
            assignee = await db.users.find_one({"id": assignee_id})
            if assignee:
                improvement_data["assigneA"] = {
                    "id": assignee["id"],
                    "nom": assignee["nom"],
                    "prenom": assignee["prenom"]
                }
        
        await db.improvements.insert_one(improvement_data)
        
        # Utiliser le bon champ pour la mise à jour
        if query_field == "id":
            update_query = {"id": request_id}
        else:
            update_query = {"_id": req["_id"]}
        
        await db.improvement_requests.update_one(
            update_query,
            {"$set": {
                "improvement_id": improvement_id,
                "improvement_numero": numero,
                "improvement_date_limite": date_limite_imp,
                "converted_at": datetime.utcnow(),
                "converted_by": current_user["id"]
            }}
        )
        
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
            user_email=current_user.get("email", ""),
            action=ActionType.CREATE,
            entity_type=EntityType.IMPROVEMENT,
            entity_id=improvement_id,
            entity_name=f"Amélioration #{numero}",
            details=f"Converti depuis demande: {req['titre']}"
        )
        
        return {
            "message": "Demande convertie en amélioration avec succès",
            "improvement_id": improvement_id,
            "improvement_numero": numero,
            "request_id": request_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur conversion demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== GENERIC ATTACHMENT HELPERS ====================

async def upload_attachment_generic(item_id: str, file: UploadFile, collection_name: str, current_user: dict):
    """Upload generique de piece jointe avec compression d'image automatique"""
    try:
        upload_dir = Path(f"/app/backend/uploads/{collection_name}")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 25MB)")
        
        # Compression automatique des images
        from image_compressor import get_compression_settings, compress_image
        comp_settings = await get_compression_settings(db)
        content, compressed_filename, new_mime, was_compressed = compress_image(content, file.filename, comp_settings)
        
        file_ext = Path(compressed_filename).suffix if was_compressed else Path(file.filename).suffix
        attachment_id = str(uuid.uuid4())
        unique_filename = f"{attachment_id}{file_ext}"
        file_path = upload_dir / unique_filename
        
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        
        new_attachment = {
            "id": attachment_id,
            "filename": unique_filename,
            "original_filename": file.filename,
            "path": str(file_path),
            "mime_type": new_mime if was_compressed else (file.content_type or "application/octet-stream"),
            "size": len(content),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "uploaded_by": current_user.get("id")
        }
        
        await db[collection_name].update_one(
            {"id": item_id},
            {"$push": {"attachments": new_attachment}}
        )
        
        return {"success": True, "attachment": new_attachment}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur upload attachment {collection_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def download_attachment_generic(item_id: str, filename: str, collection_name: str):
    """Download generique de piece jointe"""
    file_path = Path(f"/app/backend/uploads/{collection_name}") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier non trouve")
    return FileResponse(str(file_path))


# Attachments et Comments pour Improvement Requests
@router.post("/improvement-requests/{request_id}/attachments", tags=["Demandes Amelioration"])
async def upload_improvement_request_attachment(
    request_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("improvementRequests", "edit"))
):
    """Upload fichier pour une demande d'amélioration"""
    req = await db.improvement_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    return await upload_attachment_generic(request_id, file, "improvement_requests", current_user)

@router.get("/improvement-requests/{request_id}/attachments/{filename}", tags=["Demandes Amelioration"])
async def download_improvement_request_attachment(request_id: str, filename: str, current_user: dict = Depends(require_permission("improvementRequests", "view"))):
    """Télécharger un fichier d'une demande d'amélioration"""
    return await download_attachment_generic(request_id, filename, "improvement_requests")

@router.post("/improvement-requests/{request_id}/comments", tags=["Demandes Amelioration"])
async def add_improvement_request_comment(
    request_id: str,
    comment_data: dict,
    current_user: dict = Depends(require_permission("improvementRequests", "edit"))
):
    """Ajouter un commentaire à une demande d'amélioration"""
    req = await db.improvement_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    comment = {
        "id": str(uuid.uuid4()),
        "text": comment_data.get("text", ""),
        "user_id": current_user["id"],
        "user_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
        "timestamp": datetime.utcnow().isoformat()
    }
    
    await db.improvement_requests.update_one(
        {"id": request_id},
        {"$push": {"comments": comment}}
    )
    
    return comment

@router.get("/improvement-requests/{request_id}/comments", tags=["Demandes Amelioration"])
async def get_improvement_request_comments(request_id: str, current_user: dict = Depends(require_permission("improvementRequests", "view"))):
    """Récupérer les commentaires d'une demande d'amélioration"""
    req = await db.improvement_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    return req.get("comments", [])

# Attachments pour Improvements
@router.post("/improvements/{imp_id}/attachments", tags=["Ameliorations"])
async def upload_improvement_attachment(
    imp_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("improvements", "edit"))
):
    """Upload fichier pour une amélioration"""
    imp = await db.improvements.find_one({"id": imp_id})
    if not imp:
        raise HTTPException(status_code=404, detail="Amélioration non trouvée")
    
    return await upload_attachment_generic(imp_id, file, "improvements", current_user)


@router.get("/improvements/{imp_id}/attachments", tags=["Ameliorations"])
async def get_improvement_attachments(
    imp_id: str,
    current_user: dict = Depends(require_permission("improvements", "view"))
):
    """Récupérer la liste des pièces jointes d'une amélioration"""
    imp = await db.improvements.find_one({"id": imp_id})
    if not imp:
        raise HTTPException(status_code=404, detail="Amélioration non trouvée")
    
    attachments = imp.get("attachments", [])
    result = []
    for att in attachments:
        result.append({
            "id": att.get("id", ""),
            "filename": att.get("filename", ""),
            "original_filename": att.get("filename", att.get("original_filename", "")),
            "size": att.get("size", 0),
            "mime_type": att.get("type", att.get("mime_type", "application/octet-stream")),
            "uploaded_at": att.get("uploadedAt", att.get("uploaded_at", ""))
        })
    
    return result


@router.get("/improvements/{imp_id}/attachments/{attachment_id}", tags=["Ameliorations"])
async def download_improvement_attachment(
    imp_id: str, 
    attachment_id: str, 
    preview: bool = False,
    current_user: dict = Depends(require_permission("improvements", "view"))
):
    """Télécharger ou prévisualiser un fichier d'une amélioration"""
    imp = await db.improvements.find_one({"id": imp_id})
    if not imp:
        raise HTTPException(status_code=404, detail="Amélioration non trouvée")
    
    # Trouver l'attachment par son id
    attachment = None
    for att in imp.get("attachments", []):
        if att.get("id") == attachment_id:
            attachment = att
            break
    
    if not attachment:
        # Fallback: chercher par filename (ancien format)
        return await download_attachment_generic(imp_id, attachment_id, "improvements")
    
    file_path = attachment.get("path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Fichier non trouvé sur le serveur")
    
    disposition = "inline" if preview else "attachment"
    return FileResponse(
        path=file_path,
        filename=attachment.get("filename", attachment.get("original_filename", "file")),
        media_type=attachment.get("type", attachment.get("mime_type", "application/octet-stream")),
        content_disposition_type=disposition
    )


@router.delete("/improvements/{imp_id}/attachments/{attachment_id}", tags=["Ameliorations"])
async def delete_improvement_attachment(
    imp_id: str,
    attachment_id: str,
    current_user: dict = Depends(require_permission("improvements", "edit"))
):
    """Supprimer une pièce jointe d'une amélioration"""
    imp = await db.improvements.find_one({"id": imp_id})
    if not imp:
        raise HTTPException(status_code=404, detail="Amélioration non trouvée")
    
    # Trouver l'attachment
    attachment = None
    for att in imp.get("attachments", []):
        if att.get("id") == attachment_id:
            attachment = att
            break
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Pièce jointe non trouvée")
    
    # Supprimer le fichier physique
    file_path = attachment.get("path")
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
    
    # Retirer de la base de données
    await db.improvements.update_one(
        {"id": imp_id},
        {"$pull": {"attachments": {"id": attachment_id}}}
    )
    
    return {"success": True, "message": "Pièce jointe supprimée"}


# Comments pour Improvements
@router.post("/improvements/{imp_id}/comments", tags=["Ameliorations"])
async def add_improvement_comment(
    imp_id: str,
    comment_data: dict,
    current_user: dict = Depends(require_permission("improvements", "edit"))
):
    """Ajouter un commentaire à une amélioration"""
    imp = await db.improvements.find_one({"id": imp_id})
    if not imp:
        raise HTTPException(status_code=404, detail="Amélioration non trouvée")
    
    comment = {
        "id": str(uuid.uuid4()),
        "text": comment_data.get("text", ""),
        "user_id": current_user["id"],
        "user_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
        "timestamp": datetime.utcnow().isoformat()
    }
    
    await db.improvements.update_one(
        {"id": imp_id},
        {"$push": {"comments": comment}}
    )
    
    return comment

@router.get("/improvements/{imp_id}/comments", tags=["Ameliorations"])
async def get_improvement_comments(imp_id: str, current_user: dict = Depends(require_permission("improvements", "view"))):
    """Récupérer les commentaires d'une amélioration"""
    imp = await db.improvements.find_one({"id": imp_id})
    if not imp:
        raise HTTPException(status_code=404, detail="Amélioration non trouvée")
    
    return imp.get("comments", [])

# ==================== NOTIFICATIONS: Routes extraites dans routes/notifications.py ====================

# ==================== IMPROVEMENTS (AMÉLIORATIONS) ENDPOINTS ====================

@router.get("/improvements", response_model=List[Improvement], tags=["Ameliorations"])
async def get_improvements(
    current_user: dict = Depends(require_permission("improvements", "view")),
    statut: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_type: str = "creation"
):
    """Récupérer toutes les améliorations avec filtres"""
    try:
        query = {}
        
        if statut:
            query["statut"] = statut
        
        if start_date or end_date:
            date_field = "dateCreation" if date_type == "creation" else "dateLimite"
            date_filter = {}
            if start_date:
                date_filter["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            if end_date:
                date_filter["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query[date_field] = date_filter
        
        improvements = []
        async for imp in db.improvements.find(query).sort("dateCreation", -1):
            if imp.get("assigne_a_id"):
                imp["assigneA"] = await get_user_by_id(imp["assigne_a_id"])
            if imp.get("emplacement_id"):
                imp["emplacement"] = await get_location_by_id(imp["emplacement_id"])
            if imp.get("equipement_id"):
                imp["equipement"] = await get_equipment_by_id(imp["equipement_id"])
            
            if imp.get("createdBy"):
                try:
                    creator = await db.users.find_one({"id": imp["createdBy"]})
                    if creator:
                        imp["createdByName"] = f"{creator.get('prenom', '')} {creator.get('nom', '')}".strip()
                except Exception as e:
                    logger.error(f"Erreur recherche créateur: {e}")
            
            if "numero" not in imp or not imp["numero"]:
                imp["numero"] = "N/A"
            
            improvements.append(Improvement(**imp))
        
        return improvements
    except Exception as e:
        logger.error(f"Erreur récupération améliorations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/improvements/{imp_id}", response_model=Improvement, tags=["Ameliorations"])
async def get_improvement(imp_id: str, current_user: dict = Depends(require_permission("improvements", "view"))):
    """Détails d'une amélioration"""
    try:
        imp = await db.improvements.find_one({"id": imp_id})
        if not imp:
            raise HTTPException(status_code=404, detail="Amélioration non trouvée")
        
        imp = serialize_doc(imp)
        if imp.get("assigne_a_id"):
            imp["assigneA"] = await get_user_by_id(imp["assigne_a_id"])
        if imp.get("emplacement_id"):
            imp["emplacement"] = await get_location_by_id(imp["emplacement_id"])
        if imp.get("equipement_id"):
            imp["equipement"] = await get_equipment_by_id(imp["equipement_id"])
        
        if imp.get("createdBy"):
            try:
                creator = await db.users.find_one({"id": imp["createdBy"]})
                if creator:
                    imp["createdByName"] = f"{creator.get('prenom', '')} {creator.get('nom', '')}".strip()
            except Exception as e:
                logger.error(f"Erreur recherche créateur: {e}")
        
        if "numero" not in imp or not imp["numero"]:
            imp["numero"] = "N/A"
        
        return Improvement(**imp)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/improvements", response_model=Improvement, tags=["Ameliorations"])
async def create_improvement(imp_create: ImprovementCreate, current_user: dict = Depends(require_permission("improvements", "edit"))):
    """Créer une nouvelle amélioration"""
    count = await db.improvements.count_documents({})
    numero = str(7000 + count + 1)
    
    improvement_id = str(uuid.uuid4())
    improvement_data = imp_create.model_dump()
    improvement_data["id"] = improvement_id
    improvement_data["numero"] = numero
    improvement_data["statut"] = "OUVERT"
    improvement_data["dateCreation"] = datetime.utcnow()
    improvement_data["createdBy"] = current_user["id"]
    improvement_data["createdByName"] = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
    improvement_data["tempsReel"] = None
    improvement_data["dateTermine"] = None
    improvement_data["attachments"] = []
    improvement_data["comments"] = []
    
    if improvement_data.get("assigne_a_id"):
        assignee = await db.users.find_one({"id": improvement_data["assigne_a_id"]})
        if assignee:
            improvement_data["assigneA"] = {
                "id": assignee["id"],
                "nom": assignee["nom"],
                "prenom": assignee["prenom"]
            }
    
    if improvement_data.get("equipement_id"):
        equipment = await db.equipments.find_one({"id": improvement_data["equipement_id"]})
        if equipment:
            improvement_data["equipement"] = {"id": equipment["id"], "nom": equipment["nom"]}
    
    if improvement_data.get("emplacement_id"):
        location = await db.locations.find_one({"id": improvement_data["emplacement_id"]})
        if location:
            improvement_data["emplacement"] = {"id": location["id"], "nom": location["nom"]}
    
    await db.improvements.insert_one(improvement_data)
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "improvements",
        "created",
        improvement_data,
        user_id=current_user["id"]
    )
    
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=f"{current_user.get('nom', '')} {current_user.get('prenom', '')}",
        user_email=current_user["email"],
        action=ActionType.CREATE,
        entity_type=EntityType.IMPROVEMENT,
        entity_id=improvement_id,
        entity_name=imp_create.titre,
        details="Création amélioration"
    )
    
    return Improvement(**improvement_data)

@router.put("/improvements/{imp_id}", response_model=Improvement, tags=["Ameliorations"])
async def update_improvement(
    imp_id: str,
    imp_update: ImprovementUpdate,
    current_user: dict = Depends(require_permission("improvements", "edit"))
):
    """Mettre à jour une amélioration"""
    imp = await db.improvements.find_one({"id": imp_id})
    if not imp:
        raise HTTPException(status_code=404, detail="Amélioration non trouvée")
    
    # Gérer les champs qui peuvent être explicitement vidés (mis à null)
    update_data = {}
    sent_data = imp_update.model_dump(exclude_unset=True)
    for k, v in imp_update.model_dump().items():
        if v is not None:
            update_data[k] = v
        elif k in sent_data and k in ['assigne_a_id', 'equipement_id', 'emplacement_id', 'dateLimite']:
            update_data[k] = None
    
    if update_data.get("statut") == "TERMINE" and "dateTermine" not in update_data:
        update_data["dateTermine"] = datetime.utcnow()
    
    if "assigne_a_id" in update_data:
        if update_data["assigne_a_id"]:
            assignee = await db.users.find_one({"id": update_data["assigne_a_id"]})
            if assignee:
                update_data["assigneA"] = {
                    "id": assignee["id"],
                    "nom": assignee["nom"],
                    "prenom": assignee["prenom"]
                }
        else:
            update_data["assigneA"] = None
    
    if "equipement_id" in update_data:
        if update_data["equipement_id"]:
            equipment = await db.equipments.find_one({"id": update_data["equipement_id"]})
            if equipment:
                update_data["equipement"] = {"id": equipment["id"], "nom": equipment["nom"]}
        else:
            update_data["equipement"] = None
    
    if "emplacement_id" in update_data:
        if update_data["emplacement_id"]:
            location = await db.locations.find_one({"id": update_data["emplacement_id"]})
            if location:
                update_data["emplacement"] = {"id": location["id"], "nom": location["nom"]}
        else:
            update_data["emplacement"] = None
    
    await db.improvements.update_one({"id": imp_id}, {"$set": update_data})
    updated_imp = await db.improvements.find_one({"id": imp_id})
    
    updated_imp = serialize_doc(updated_imp)
    if updated_imp.get("assigne_a_id"):
        updated_imp["assigneA"] = await get_user_by_id(updated_imp["assigne_a_id"])
    if updated_imp.get("emplacement_id"):
        updated_imp["emplacement"] = await get_location_by_id(updated_imp["emplacement_id"])
    if updated_imp.get("equipement_id"):
        updated_imp["equipement"] = await get_equipment_by_id(updated_imp["equipement_id"])
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "improvements",
        "updated",
        updated_imp,
        user_id=current_user["id"]
    )
    
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=f"{current_user.get('nom', '')} {current_user.get('prenom', '')}",
        user_email=current_user["email"],
        action=ActionType.UPDATE,
        entity_type=EntityType.IMPROVEMENT,
        entity_id=imp_id,
        entity_name=updated_imp["titre"],
        details="Modification amélioration"
    )
    
    return Improvement(**updated_imp)

@router.delete("/improvements/{imp_id}", response_model=MessageResponse, tags=["Ameliorations"])
async def delete_improvement(imp_id: str, current_user: dict = Depends(require_permission("improvements", "delete"))):
    """Supprimer une amélioration"""
    imp = await db.improvements.find_one({"id": imp_id})
    if not imp:
        raise HTTPException(status_code=404, detail="Amélioration non trouvée")
    
    imp_titre = imp.get("titre", "Sans titre")
    
    await db.improvements.delete_one({"id": imp_id})
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "improvements",
        "deleted",
        {"id": imp_id, "titre": imp_titre},
        user_id=current_user["id"]
    )
    
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=f"{current_user.get('nom', '')} {current_user.get('prenom', '')}",
        user_email=current_user["email"],
        action=ActionType.DELETE,
        entity_type=EntityType.IMPROVEMENT,
        entity_id=imp_id,
        entity_name=imp_titre,
        details="Suppression amélioration"
    )
    
    return {"message": "Amélioration supprimée"}

@router.post("/improvements/{imp_id}/add-time", tags=["Ameliorations"])
async def add_time_to_improvement(imp_id: str, time_data: AddTimeSpent, current_user: dict = Depends(require_permission("improvements", "edit"))):
    """Ajouter du temps passé à une amélioration"""
    try:
        # Récupérer l'amélioration existante
        existing_imp = await db.improvements.find_one({"id": imp_id})
        if not existing_imp:
            raise HTTPException(status_code=404, detail="Amélioration non trouvée")
        
        # Convertir le temps en heures décimales
        time_to_add = time_data.hours + (time_data.minutes / 60.0)
        
        # Récupérer le temps réel actuel (0 si None)
        current_time = existing_imp.get("tempsReel", 0) or 0
        
        # Calculer le nouveau temps réel
        new_time = current_time + time_to_add
        
        # Créer une entrée d'historique de temps avec l'utilisateur qui l'a saisi
        time_entry = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "user_name": f"{current_user['prenom']} {current_user['nom']}",
            "hours": time_to_add,
            "timestamp": datetime.now(timezone.utc)
        }
        
        # Mettre à jour l'amélioration avec le temps total ET l'entrée d'historique
        await db.improvements.update_one(
            {"id": imp_id},
            {
                "$set": {"tempsReel": new_time},
                "$push": {"time_entries": time_entry}
            }
        )
        
        # Log dans l'audit
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType.IMPROVEMENT,
            entity_id=str(existing_imp["id"]),
            entity_name=existing_imp["titre"],
            details=f"Ajout de temps passé: {time_data.hours}h{time_data.minutes:02d}min",
            changes={"tempsReel_old": current_time, "tempsReel_new": new_time, "time_added": time_to_add}
        )
        
        # Récupérer l'amélioration mise à jour
        imp = await db.improvements.find_one({"id": imp_id})
        imp = serialize_doc(imp)
        
        if imp.get("assigne_a_id"):
            imp["assigneA"] = await get_user_by_id(imp["assigne_a_id"])
        if imp.get("emplacement_id"):
            imp["emplacement"] = await get_location_by_id(imp["emplacement_id"])
        if imp.get("equipement_id"):
            imp["equipement"] = await get_equipment_by_id(imp["equipement_id"])
        
        return Improvement(**imp)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de l'ajout de temps : {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

    if not imp:
        raise HTTPException(status_code=404, detail="Amélioration non trouvée")
    
    await db.improvements.delete_one({"id": imp_id})
    
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=f"{current_user.get('nom', '')} {current_user.get('prenom', '')}",
        user_email=current_user["email"],
        action=ActionType.DELETE,
        entity_type=EntityType.IMPROVEMENT,
        entity_id=imp_id,
        entity_name=imp["titre"],
        details="Suppression amélioration"
    )
    
    return {"message": "Amélioration supprimée"}


