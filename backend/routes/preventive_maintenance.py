"""
Routes de la Maintenance Preventive - CRUD, Attachments, Checklists
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional
import uuid
import os
import mimetypes
import aiofiles
import logging

from models import (
    ActionType, EntityType, MessageResponse, SuccessResponse,
    PreventiveMaintenance, PreventiveMaintenanceCreate, PreventiveMaintenanceUpdate,
    ChecklistTemplate, ChecklistTemplateCreate, ChecklistTemplateUpdate,
    ChecklistExecution, ChecklistExecutionCreate, ChecklistExecutionUpdate
)
from dependencies import get_current_user, get_current_admin_user, require_permission, require_admin_for_module
from routes.shared import db, audit_service, serialize_doc, _get_realtime_manager, get_equipment_by_id, get_user_by_id

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Maintenance Preventive"])

PM_UPLOAD_DIR = Path("/app/backend/uploads/preventive-maintenance")
PM_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.get("/preventive-maintenance",
    summary="Lister les maintenances preventives", response_model=List[PreventiveMaintenance], tags=["Maintenance Preventive"])
async def get_preventive_maintenance(current_user: dict = Depends(require_permission("preventiveMaintenance", "view"))):
    """Liste toutes les maintenances préventives avec filtrage par service"""
    from service_filter import apply_service_filter
    
    query = {}
    # Appliquer le filtre par service
    query = await apply_service_filter(query, current_user, "service")
    
    pm_list = await db.preventive_maintenances.find(query).to_list(1000)
    
    for pm in pm_list:
        pm["id"] = str(pm["_id"])
        del pm["_id"]
        
        if pm.get("equipement_id"):
            pm["equipement"] = await get_equipment_by_id(pm["equipement_id"])
        if pm.get("assigne_a_id"):
            pm["assigneA"] = await get_user_by_id(pm["assigne_a_id"])
    
    return [PreventiveMaintenance(**pm) for pm in pm_list]

@router.post("/preventive-maintenance",
    summary="Creer une maintenance preventive", response_model=PreventiveMaintenance, tags=["Maintenance Preventive"])
async def create_preventive_maintenance(pm_create: PreventiveMaintenanceCreate, current_user: dict = Depends(require_permission("preventiveMaintenance", "edit"))):
    """Créer une nouvelle maintenance préventive"""
    pm_dict = pm_create.model_dump()
    pm_dict["dateCreation"] = datetime.utcnow()
    pm_dict["derniereMaintenance"] = None
    pm_dict["_id"] = ObjectId()
    
    await db.preventive_maintenances.insert_one(pm_dict)
    
    pm = serialize_doc(pm_dict)
    if pm.get("equipement_id"):
        pm["equipement"] = await get_equipment_by_id(pm["equipement_id"])
    if pm.get("assigne_a_id"):
        pm["assigneA"] = await get_user_by_id(pm["assigne_a_id"])
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "preventive_maintenance",
        "created",
        pm,
        user_id=current_user.get("id")
    )
    
    return PreventiveMaintenance(**pm)

@router.put("/preventive-maintenance/{pm_id}",
    summary="Modifier une maintenance preventive", response_model=PreventiveMaintenance, tags=["Maintenance Preventive"])
async def update_preventive_maintenance(pm_id: str, pm_update: PreventiveMaintenanceUpdate, current_user: dict = Depends(require_permission("preventiveMaintenance", "edit"))):
    """Modifier une maintenance préventive"""
    try:
        update_data = {k: v for k, v in pm_update.model_dump().items() if v is not None}
        
        await db.preventive_maintenances.update_one(
            {"_id": ObjectId(pm_id)},
            {"$set": update_data}
        )
        
        pm = await db.preventive_maintenances.find_one({"_id": ObjectId(pm_id)})
        pm = serialize_doc(pm)
        
        if pm.get("equipement_id"):
            pm["equipement"] = await get_equipment_by_id(pm["equipement_id"])
        if pm.get("assigne_a_id"):
            pm["assigneA"] = await get_user_by_id(pm["assigne_a_id"])
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await _get_realtime_manager().emit_event(
            "preventive_maintenance",
            "updated",
            pm,
            user_id=current_user.get("id")
        )
        
        return PreventiveMaintenance(**pm)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/preventive-maintenance/{pm_id}", response_model=MessageResponse,
    summary="Supprimer une maintenance preventive", tags=["Maintenance Preventive"])
async def delete_preventive_maintenance(pm_id: str, current_user: dict = Depends(require_permission("preventiveMaintenance", "delete"))):
    """Supprimer une maintenance préventive"""
    try:
        # Récupérer la maintenance avant suppression pour le broadcast
        pm = await db.preventive_maintenances.find_one({"_id": ObjectId(pm_id)})
        pm_nom = pm.get("nom", "Inconnu") if pm else "Inconnu"
        
        result = await db.preventive_maintenances.delete_one({"_id": ObjectId(pm_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Maintenance préventive non trouvée")
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await _get_realtime_manager().emit_event(
            "preventive_maintenance",
            "deleted",
            {"id": pm_id, "nom": pm_nom},
            user_id=current_user.get("id")
        )
        
        return {"message": "Maintenance préventive supprimée"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== PREVENTIVE MAINTENANCE - ATTACHMENTS ====================

@router.post("/preventive-maintenance/{pm_id}/attachments", tags=["Maintenance Preventive"])
async def upload_pm_attachment(
    pm_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("preventiveMaintenance", "edit"))
):
    """Upload une pièce jointe pour une maintenance préventive"""
    import os
    import uuid as uuid_mod
    
    try:
        # Vérifier que la maintenance existe
        pm = await db.preventive_maintenances.find_one({"_id": ObjectId(pm_id)})
        if not pm:
            raise HTTPException(status_code=404, detail="Maintenance préventive non trouvée")
        
        # Créer le répertoire uploads/preventive-maintenance si nécessaire
        upload_dir = "/app/backend/uploads/preventive-maintenance"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Générer un nom de fichier unique
        file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
        attachment_id = str(uuid_mod.uuid4())
        unique_filename = f"{attachment_id}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        # Lire et sauvegarder le fichier
        content = await file.read()
        
        # Compression automatique des images
        from image_compressor import get_compression_settings, compress_image
        comp_settings = await get_compression_settings(db)
        content, compressed_filename, new_mime, was_compressed = compress_image(content, file.filename, comp_settings)
        
        file_size = len(content)
        
        file_ext = os.path.splitext(compressed_filename)[1] if was_compressed else (os.path.splitext(file.filename)[1] if file.filename else "")
        attachment_id = str(uuid_mod.uuid4())
        unique_filename = f"{attachment_id}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Créer l'objet attachment
        new_attachment = {
            "id": attachment_id,
            "filename": unique_filename,
            "original_filename": file.filename,
            "path": file_path,
            "mime_type": new_mime if was_compressed else (file.content_type or "application/octet-stream"),
            "size": file_size,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "uploaded_by": current_user.get("id")
        }
        
        # Ajouter au tableau attachments
        await db.preventive_maintenances.update_one(
            {"_id": ObjectId(pm_id)},
            {"$push": {"attachments": new_attachment}}
        )
        
        logger.info(f"Pièce jointe ajoutée à la maintenance préventive {pm_id}: {file.filename}")
        
        return {
            "success": True,
            "attachment": new_attachment
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur upload pièce jointe maintenance préventive: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preventive-maintenance/{pm_id}/attachments", tags=["Maintenance Preventive"])
async def get_pm_attachments(
    pm_id: str,
    current_user: dict = Depends(require_permission("preventiveMaintenance", "view"))
):
    """Récupérer les pièces jointes d'une maintenance préventive"""
    try:
        pm = await db.preventive_maintenances.find_one({"_id": ObjectId(pm_id)})
        if not pm:
            raise HTTPException(status_code=404, detail="Maintenance préventive non trouvée")
        
        return pm.get("attachments", [])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération pièces jointes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preventive-maintenance/{pm_id}/attachments/{attachment_id}", tags=["Maintenance Preventive"])
async def download_pm_attachment(
    pm_id: str,
    attachment_id: str,
    preview: bool = False,
    current_user: dict = Depends(require_permission("preventiveMaintenance", "view"))
):
    """Télécharger ou prévisualiser une pièce jointe d'une maintenance préventive"""
    import os
    
    try:
        pm = await db.preventive_maintenances.find_one({"_id": ObjectId(pm_id)})
        if not pm:
            raise HTTPException(status_code=404, detail="Maintenance préventive non trouvée")
        
        # Trouver la pièce jointe
        attachment = None
        for att in pm.get("attachments", []):
            if att.get("id") == attachment_id:
                attachment = att
                break
        
        if not attachment:
            raise HTTPException(status_code=404, detail="Pièce jointe non trouvée")
        
        file_path = attachment.get("path")
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Fichier non trouvé sur le serveur")
        
        disposition = "inline" if preview else "attachment"
        return FileResponse(
            path=file_path,
            filename=attachment.get("original_filename", attachment.get("filename")),
            media_type=attachment.get("mime_type", "application/octet-stream"),
            content_disposition_type=disposition
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur téléchargement pièce jointe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/preventive-maintenance/{pm_id}/attachments/{attachment_id}", response_model=SuccessResponse, tags=["Maintenance Preventive"])
async def delete_pm_attachment(
    pm_id: str,
    attachment_id: str,
    current_user: dict = Depends(require_permission("preventiveMaintenance", "edit"))
):
    """Supprimer une pièce jointe d'une maintenance préventive"""
    import os
    
    try:
        pm = await db.preventive_maintenances.find_one({"_id": ObjectId(pm_id)})
        if not pm:
            raise HTTPException(status_code=404, detail="Maintenance préventive non trouvée")
        
        # Trouver la pièce jointe
        attachment = None
        for att in pm.get("attachments", []):
            if att.get("id") == attachment_id:
                attachment = att
                break
        
        if not attachment:
            raise HTTPException(status_code=404, detail="Pièce jointe non trouvée")
        
        # Supprimer le fichier physique
        file_path = attachment.get("path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        
        # Retirer du tableau attachments
        await db.preventive_maintenances.update_one(
            {"_id": ObjectId(pm_id)},
            {"$pull": {"attachments": {"id": attachment_id}}}
        )
        
        logger.info(f"Pièce jointe supprimée de la maintenance préventive {pm_id}: {attachment_id}")
        
        return {"success": True, "message": "Pièce jointe supprimée"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur suppression pièce jointe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def calculate_next_maintenance_date(current_date: datetime, frequency: str) -> datetime:
    """Calcule la prochaine date de maintenance selon la fréquence"""
    if frequency == "QUOTIDIENNE":
        return current_date + timedelta(days=1)
    elif frequency == "HEBDOMADAIRE":
        return current_date + timedelta(weeks=1)
    elif frequency == "MENSUELLE":
        # Ajouter un mois
        month = current_date.month
        year = current_date.year
        if month == 12:
            month = 1
            year += 1
        else:
            month += 1
        return current_date.replace(year=year, month=month)
    elif frequency == "ANNUELLE":
        return current_date.replace(year=current_date.year + 1)
    else:
        # Par défaut, mensuelle
        return current_date + timedelta(days=30)

@router.post("/preventive-maintenance/check-and-execute", response_model=SuccessResponse, tags=["Maintenance Preventive"])
async def check_and_execute_due_maintenances(current_user: dict = Depends(require_admin_for_module("preventiveMaintenance"))):
    """Vérifie et exécute MANUELLEMENT les maintenances échues (admin ou droits édition maintenance préventive)"""
    try:
        logger.info(f"🔄 Vérification MANUELLE déclenchée par {current_user.get('email', 'Unknown')}")
        await auto_check_preventive_maintenance()
        return {"success": True, "message": "Vérification manuelle effectuée - Consultez les logs pour les détails"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/preventive-maintenance/check-and-execute-OLD", tags=["Maintenance Preventive"])
async def check_and_execute_due_maintenances_old(current_user: dict = Depends(require_admin_for_module("preventiveMaintenance"))):
    """Version détaillée pour debug (admin ou droits édition maintenance préventive)"""
    try:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Trouver toutes les maintenances actives dont la date est aujourd'hui ou passée
        pm_list = await db.preventive_maintenances.find({
            "statut": "ACTIF",
            "prochaineMaintenance": {"$lte": today + timedelta(days=1)}
        }).to_list(length=None)
        
        created_count = 0
        updated_count = 0
        errors = []
        
        for pm in pm_list:
            try:
                # Récupérer l'équipement
                equipement = await db.equipments.find_one({"_id": ObjectId(pm["equipement_id"])})
                
                # Créer le bon de travail
                wo_id = str(uuid.uuid4())
                work_order = {
                    "_id": ObjectId(),
                    "id": wo_id,
                    "numero": f"PM-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}",
                    "titre": f"Maintenance préventive: {pm['titre']}",
                    "description": "Maintenance automatique générée depuis la planification préventive",
                    "type": "PREVENTIF",
                    "priorite": "NORMALE",
                    "statut": "OUVERT",
                    "equipement_id": pm["equipement_id"],
                    "emplacement_id": equipement.get("emplacement_id") if equipement else None,
                    "assigne_a_id": pm.get("assigne_a_id"),
                    "tempsEstime": pm.get("duree"),
                    "dateLimite": datetime.utcnow() + timedelta(days=7),
                    "dateCreation": datetime.utcnow(),
                    "createdBy": "system",
                    "comments": [],
                    "attachments": [],
                    "historique": []
                }
                
                await db.work_orders.insert_one(work_order)
                created_count += 1
                
                # Calculer la prochaine date de maintenance
                next_date = calculate_next_maintenance_date(pm["prochaineMaintenance"], pm["frequence"])
                
                # Mettre à jour la maintenance préventive
                await db.preventive_maintenances.update_one(
                    {"_id": pm["_id"]},
                    {
                        "$set": {
                            "prochaineMaintenance": next_date,
                            "derniereMaintenance": datetime.utcnow()
                        }
                    }
                )
                updated_count += 1
                
            except Exception as e:
                errors.append(f"Erreur pour PM {pm.get('titre', 'Unknown')}: {str(e)}")
        
        return {
            "success": True,
            "workOrdersCreated": created_count,
            "maintenancesUpdated": updated_count,
            "errors": errors
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CHECKLIST ROUTES ====================

@router.get("/checklists/templates",
    summary="Lister les modeles de checklist", response_model=List[ChecklistTemplate], tags=["Checklists"])
async def get_checklist_templates(current_user: dict = Depends(require_permission("preventiveMaintenance", "view"))):
    """Liste tous les modèles de checklists"""
    templates = await db.checklist_templates.find().to_list(1000)
    return [ChecklistTemplate(**serialize_doc(t)) for t in templates]

@router.get("/checklists/templates/{template_id}",
    summary="Detail d'un modele", response_model=ChecklistTemplate, tags=["Checklists"])
async def get_checklist_template(template_id: str, current_user: dict = Depends(require_permission("preventiveMaintenance", "view"))):
    """Récupère un modèle de checklist par ID"""
    try:
        template = await db.checklist_templates.find_one({"_id": ObjectId(template_id)})
        if not template:
            # Essayer avec l'ID string
            template = await db.checklist_templates.find_one({"id": template_id})
        if not template:
            raise HTTPException(status_code=404, detail="Modèle de checklist non trouvé")
        return ChecklistTemplate(**serialize_doc(template))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/checklists/templates",
    summary="Creer un modele", response_model=ChecklistTemplate, tags=["Checklists"])
async def create_checklist_template(template_create: ChecklistTemplateCreate, current_user: dict = Depends(require_permission("preventiveMaintenance", "edit"))):
    """Créer un nouveau modèle de checklist"""
    try:
        template_dict = template_create.model_dump()
        template_dict["id"] = str(uuid.uuid4())
        template_dict["created_by_id"] = current_user.get("id")
        template_dict["created_by_name"] = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
        template_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        template_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.checklist_templates.insert_one(template_dict)
        return ChecklistTemplate(**template_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/checklists/templates/{template_id}",
    summary="Modifier un modele", response_model=ChecklistTemplate, tags=["Checklists"])
async def update_checklist_template(template_id: str, template_update: ChecklistTemplateUpdate, current_user: dict = Depends(require_permission("preventiveMaintenance", "edit"))):
    """Mettre à jour un modèle de checklist"""
    try:
        update_data = {k: v for k, v in template_update.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # Essayer avec ObjectId d'abord
        result = await db.checklist_templates.update_one(
            {"_id": ObjectId(template_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            # Essayer avec l'ID string
            result = await db.checklist_templates.update_one(
                {"id": template_id},
                {"$set": update_data}
            )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Modèle de checklist non trouvé")
        
        template = await db.checklist_templates.find_one({"_id": ObjectId(template_id)})
        if not template:
            template = await db.checklist_templates.find_one({"id": template_id})
        return ChecklistTemplate(**serialize_doc(template))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/checklists/templates/{template_id}", response_model=MessageResponse,
    summary="Supprimer un modele", tags=["Checklists"])
async def delete_checklist_template(template_id: str, current_user: dict = Depends(require_permission("preventiveMaintenance", "delete"))):
    """Supprimer un modèle de checklist"""
    try:
        result = await db.checklist_templates.delete_one({"_id": ObjectId(template_id)})
        if result.deleted_count == 0:
            result = await db.checklist_templates.delete_one({"id": template_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Modèle de checklist non trouvé")
        return {"message": "Modèle de checklist supprimé"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# === Exécutions de checklists ===

@router.get("/checklists/executions", response_model=List[ChecklistExecution], tags=["Checklists"])
async def get_checklist_executions(
    work_order_id: Optional[str] = None,
    preventive_maintenance_id: Optional[str] = None,
    current_user: dict = Depends(require_permission("preventiveMaintenance", "view"))
):
    """Liste les exécutions de checklists, avec filtres optionnels"""
    query = {}
    if work_order_id:
        query["work_order_id"] = work_order_id
    if preventive_maintenance_id:
        query["preventive_maintenance_id"] = preventive_maintenance_id
    
    executions = await db.checklist_executions.find(query).sort("started_at", -1).to_list(1000)
    return [ChecklistExecution(**serialize_doc(e)) for e in executions]

@router.get("/checklists/executions/{execution_id}", response_model=ChecklistExecution, tags=["Checklists"])
async def get_checklist_execution(execution_id: str, current_user: dict = Depends(require_permission("preventiveMaintenance", "view"))):
    """Récupère une exécution de checklist par ID"""
    try:
        execution = await db.checklist_executions.find_one({"_id": ObjectId(execution_id)})
        if not execution:
            execution = await db.checklist_executions.find_one({"id": execution_id})
        if not execution:
            raise HTTPException(status_code=404, detail="Exécution de checklist non trouvée")
        return ChecklistExecution(**serialize_doc(execution))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/checklists/executions", response_model=ChecklistExecution, tags=["Checklists"])
async def create_checklist_execution(execution_create: ChecklistExecutionCreate, current_user: dict = Depends(require_permission("preventiveMaintenance", "edit"))):
    """Démarrer une nouvelle exécution de checklist"""
    try:
        # Récupérer le template
        template = await db.checklist_templates.find_one({"id": execution_create.checklist_template_id})
        if not template:
            template = await db.checklist_templates.find_one({"_id": ObjectId(execution_create.checklist_template_id)})
        if not template:
            raise HTTPException(status_code=404, detail="Modèle de checklist non trouvé")
        
        # Récupérer l'équipement si spécifié
        equipment_name = None
        if execution_create.equipment_id:
            equipment = await db.equipments.find_one({"_id": ObjectId(execution_create.equipment_id)})
            if equipment:
                equipment_name = equipment.get("nom", "")
        
        execution_dict = {
            "id": str(uuid.uuid4()),
            "checklist_template_id": execution_create.checklist_template_id,
            "checklist_name": template.get("name", ""),
            "work_order_id": execution_create.work_order_id,
            "preventive_maintenance_id": execution_create.preventive_maintenance_id,
            "equipment_id": execution_create.equipment_id,
            "equipment_name": equipment_name,
            "responses": [],
            "total_items": len(template.get("items", [])),
            "completed_items": 0,
            "compliant_items": 0,
            "non_compliant_items": 0,
            "general_comment": None,
            "general_photos": [],
            "status": "in_progress",
            "executed_by_id": current_user.get("id"),
            "executed_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None
        }
        
        await db.checklist_executions.insert_one(execution_dict)
        return ChecklistExecution(**execution_dict)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/checklists/executions/{execution_id}", response_model=ChecklistExecution, tags=["Checklists"])
async def update_checklist_execution(execution_id: str, execution_update: ChecklistExecutionUpdate, current_user: dict = Depends(require_permission("preventiveMaintenance", "edit"))):
    """Mettre à jour une exécution de checklist (ajouter des réponses)"""
    try:
        update_data = {k: v for k, v in execution_update.model_dump().items() if v is not None}
        
        # Si on passe des réponses, convertir en dict
        if "responses" in update_data:
            update_data["responses"] = [r.model_dump() if hasattr(r, 'model_dump') else r for r in update_data["responses"]]
            
            # Calculer les statistiques
            responses = update_data["responses"]
            completed = sum(1 for r in responses if r.get("value_yes_no") is not None or r.get("value_numeric") is not None or r.get("value_text"))
            compliant = sum(1 for r in responses if r.get("is_compliant", True))
            non_compliant = sum(1 for r in responses if not r.get("is_compliant", True))
            
            update_data["completed_items"] = completed
            update_data["compliant_items"] = compliant
            update_data["non_compliant_items"] = non_compliant
        
        # Si le statut passe à "completed", ajouter la date de fin
        if update_data.get("status") == "completed":
            update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
        
        # Essayer d'abord avec l'ID custom
        result = await db.checklist_executions.update_one(
            {"id": execution_id},
            {"$set": update_data}
        )
        
        # Si pas trouvé, essayer avec ObjectId (pour compatibilité)
        if result.matched_count == 0:
            try:
                result = await db.checklist_executions.update_one(
                    {"_id": ObjectId(execution_id)},
                    {"$set": update_data}
                )
            except:
                pass
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Exécution de checklist non trouvée")
        
        # Récupérer l'exécution mise à jour
        execution = await db.checklist_executions.find_one({"id": execution_id})
        if not execution:
            try:
                execution = await db.checklist_executions.find_one({"_id": ObjectId(execution_id)})
            except:
                pass
        if not execution:
            raise HTTPException(status_code=404, detail="Exécution de checklist non trouvée")
        return ChecklistExecution(**serialize_doc(execution))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/checklists/history",
    summary="Historique des checklists executees", tags=["Checklists"])
async def get_checklist_history(
    equipment_id: Optional[str] = None,
    template_id: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(require_permission("preventiveMaintenance", "view"))
):
    """Récupère l'historique des exécutions de checklists"""
    query = {"status": "completed"}
    if equipment_id:
        query["equipment_id"] = equipment_id
    if template_id:
        query["checklist_template_id"] = template_id
    
    executions = await db.checklist_executions.find(query).sort("completed_at", -1).to_list(limit)
    return [serialize_doc(e) for e in executions]

