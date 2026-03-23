"""
Routes des Ordres de Travail (Work Orders) - CRUD, Attachments, Comments, Admin edits
Extrait de server.py pour une meilleure maintenabilité.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from bson import ObjectId
from datetime import datetime, timezone
from pathlib import Path
from typing import List
import uuid
import os
import mimetypes
import asyncio
import aiofiles
import logging

from models import (
    WorkOrder, WorkOrderCreate, WorkOrderUpdate, WorkOrderStatus,
    AddTimeSpent, TimeEntryUpdate, CommentUpdate,
    CommentWithPartsCreate, PartUsedCreate,
    AttachmentResponse, MessageResponse, Comment,
    ActionType, EntityType
)

# Alias utilisé dans server.py
EntityType_Audit = EntityType
from dependencies import get_current_user, get_current_admin_user, require_permission
from openapi_config import STANDARD_ERRORS
from routes.shared import (
    db, audit_service, serialize_doc,
    find_work_order_flexible, find_user_flexible,
    get_user_by_id, get_location_by_id, get_equipment_by_id,
    get_next_work_order_numero, NOT_DELETED
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Ordres de Travail"])

# Répertoire d'upload pour les pièces jointes
WO_UPLOAD_DIR = Path("/app/backend/uploads/work-orders")
WO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB


async def notify_service_assignment(wo_dict: dict, service_name: str, current_user_id: str):
    """Notifie tous les utilisateurs d'un service lorsqu'un OT leur est assigné."""
    try:
        from notifications import notify_work_order_assigned
        from web_push import notify_work_order_assigned_web
        import re
        service_regex = re.compile(f"^{re.escape(service_name)}$", re.IGNORECASE)
        members = await db.users.find({
            "service": service_regex,
            "$or": [{"actif": True}, {"statut": "actif"}],
            **NOT_DELETED
        }, {"_id": 0, "id": 1}).to_list(length=200)

        notified = 0
        for member in members:
            uid = member.get("id")
            if uid and uid != current_user_id:
                asyncio.create_task(
                    notify_work_order_assigned(
                        db=db,
                        work_order_id=wo_dict.get("id", ""),
                        work_order_title=wo_dict.get("titre", ""),
                        work_order_numero=wo_dict.get("numero", ""),
                        assigned_user_id=uid
                    )
                )
                asyncio.create_task(
                    notify_work_order_assigned_web(db, wo_dict, uid, current_user_id)
                )
                notified += 1
        logger.info(f"[PUSH] Notification service {service_name}: {notified} membre(s) notifié(s) (sur {len(members)} trouvé(s))")
    except Exception as e:
        logger.error(f"[PUSH] Erreur notification service: {e}")


# ==================== WORK ORDERS CRUD ====================

@router.get("/work-orders", response_model=List[WorkOrder],
    summary="Lister les ordres de travail",
    description="Retourne la liste des ordres de travail avec filtres optionnels par date.",
    responses={**STANDARD_ERRORS})
async def get_work_orders(
    date_debut: str = None,
    date_fin: str = None,
    date_type: str = "creation",
    current_user: dict = Depends(require_permission("workOrders", "view"))
):
    """Liste tous les ordres de travail avec filtrage par date"""
    query = {**NOT_DELETED}
    date_field = "dateCreation" if date_type == "creation" else "dateLimite"

    if date_debut and date_fin:
        query[date_field] = {
            "$gte": datetime.fromisoformat(date_debut),
            "$lte": datetime.fromisoformat(date_fin)
        }

    work_orders = await db.work_orders.find(query).to_list(1000)

    # Tri robuste : gère dateCreation mixte (datetime et string) — récent en premier
    def _sort_key(wo):
        dc = wo.get("dateCreation")
        if isinstance(dc, datetime):
            return dc
        if isinstance(dc, str):
            try:
                return datetime.fromisoformat(dc)
            except Exception:
                pass
        return datetime.min

    work_orders.sort(key=_sort_key, reverse=True)

    VALID_STATUTS = {"OUVERT", "EN_COURS", "ATT_MATERIEL", "ATT_DECISION", "TERMINE", "EN_ATTENTE"}
    STATUT_MAP = {"en_attente": "ATT_MATERIEL", "att_materiel": "ATT_MATERIEL", "att_decision": "ATT_DECISION", "en_cours": "EN_COURS", "ouvert": "OUVERT", "termine": "TERMINE"}
    VALID_PRIORITES = {"URGENTE", "HAUTE", "MOYENNE", "NORMALE", "BASSE", "AUCUNE"}

    for wo in work_orders:
        wo = serialize_doc(wo)

        raw_statut = wo.get("statut", "")
        if raw_statut and raw_statut not in VALID_STATUTS:
            wo["statut"] = STATUT_MAP.get(raw_statut.lower(), raw_statut.upper() if raw_statut.upper() in VALID_STATUTS else "ATT_MATERIEL")
        raw_prio = wo.get("priorite", "")
        if raw_prio and raw_prio.upper() in VALID_PRIORITES and raw_prio not in VALID_PRIORITES:
            wo["priorite"] = raw_prio.upper()

        if "attachments" not in wo:
            wo["attachments"] = []
        else:
            cleaned_attachments = []
            for att in wo["attachments"]:
                if not isinstance(att, dict):
                    continue
                if "_id" in att and isinstance(att["_id"], ObjectId):
                    att["_id"] = str(att["_id"])
                for key, value in att.items():
                    if isinstance(value, ObjectId):
                        att[key] = str(value)
                cleaned_attachments.append(att)
            wo["attachments"] = cleaned_attachments

        if wo.get("assigne_a_id"):
            wo["assigneA"] = await get_user_by_id(wo["assigne_a_id"])
        if wo.get("emplacement_id"):
            wo["emplacement"] = await get_location_by_id(wo["emplacement_id"])
        if wo.get("equipement_id"):
            wo["equipement"] = await get_equipment_by_id(wo["equipement_id"])

        if wo.get("createdBy"):
            try:
                creator = await db.users.find_one({"_id": ObjectId(wo["createdBy"])})
                if creator:
                    wo["createdByName"] = f"{creator.get('prenom', '')} {creator.get('nom', '')}".strip()
                else:
                    creator = await db.users.find_one({"id": wo["createdBy"]})
                    if creator:
                        wo["createdByName"] = f"{creator.get('prenom', '')} {creator.get('nom', '')}".strip()
            except Exception as e:
                logger.error(f"Erreur lors de la recherche du créateur {wo.get('createdBy')}: {e}")

    for wo in work_orders:
        if "numero" not in wo or not wo["numero"]:
            wo["numero"] = "N/A"

    result = []
    for wo in work_orders:
        wo.setdefault("id", str(wo.get("_id", "")))
        wo.setdefault("titre", wo.get("title", "Sans titre"))
        wo.setdefault("description", wo.get("desc", ""))
        wo.setdefault("statut", wo.get("status", "OUVERT"))
        wo.setdefault("priorite", wo.get("priority", "AUCUNE"))
        wo.setdefault("dateCreation", wo.get("date_creation", datetime.utcnow()))
        wo.setdefault("createdBy", wo.get("created_by", "inconnu"))
        if isinstance(wo.get("priorite"), str):
            wo["priorite"] = wo["priorite"].upper()
        if isinstance(wo.get("statut"), str) and wo["statut"] not in VALID_STATUTS:
            wo["statut"] = STATUT_MAP.get(wo["statut"].lower(), wo["statut"].upper())
        try:
            result.append(WorkOrder(**wo))
        except Exception as e:
            logger.warning(f"OT {wo.get('id','?')} invalide: {str(e)[:150]}")
    return result


@router.get("/work-orders/{wo_id}",
    summary="Detail d'un ordre de travail", response_model=WorkOrder)
async def get_work_order(wo_id: str, current_user: dict = Depends(require_permission("workOrders", "view"))):
    """Détails d'un ordre de travail"""
    try:
        wo = await db.work_orders.find_one({"id": wo_id})
        if not wo:
            try:
                wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
            except Exception:
                pass

        if not wo:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo = serialize_doc(wo)

        VALID_STATUTS = {"OUVERT", "EN_COURS", "ATT_MATERIEL", "ATT_DECISION", "TERMINE", "EN_ATTENTE"}
        STATUT_MAP = {"en_attente": "ATT_MATERIEL", "att_materiel": "ATT_MATERIEL", "att_decision": "ATT_DECISION", "en_cours": "EN_COURS", "ouvert": "OUVERT", "termine": "TERMINE"}
        raw_statut = wo.get("statut", "")
        if raw_statut and raw_statut not in VALID_STATUTS:
            wo["statut"] = STATUT_MAP.get(raw_statut.lower(), raw_statut.upper() if raw_statut.upper() in VALID_STATUTS else "ATT_MATERIEL")

        if wo.get("assigne_a_id"):
            wo["assigneA"] = await get_user_by_id(wo["assigne_a_id"])
        if wo.get("emplacement_id"):
            wo["emplacement"] = await get_location_by_id(wo["emplacement_id"])
        if wo.get("equipement_id"):
            wo["equipement"] = await get_equipment_by_id(wo["equipement_id"])

        if wo.get("createdBy"):
            try:
                creator = await db.users.find_one({"_id": ObjectId(wo["createdBy"])})
                if creator:
                    wo["createdByName"] = f"{creator.get('prenom', '')} {creator.get('nom', '')}".strip()
                else:
                    creator = await db.users.find_one({"id": wo["createdBy"]})
                    if creator:
                        wo["createdByName"] = f"{creator.get('prenom', '')} {creator.get('nom', '')}".strip()
            except Exception:
                pass

        if "numero" not in wo or not wo["numero"]:
            wo["numero"] = "N/A"

        return WorkOrder(**wo)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/work-orders", response_model=WorkOrder,
    summary="Creer un ordre de travail")
async def create_work_order(wo_create: WorkOrderCreate, current_user: dict = Depends(require_permission("workOrders", "edit"))):
    """Créer un nouvel ordre de travail"""
    numero = await get_next_work_order_numero()

    wo_dict = wo_create.model_dump()
    wo_dict["numero"] = numero
    wo_dict["dateCreation"] = datetime.utcnow()
    wo_dict["tempsReel"] = None
    wo_dict["dateTermine"] = None
    wo_dict["attachments"] = []
    wo_dict["comments"] = []
    wo_dict["parts_used"] = []
    wo_dict["createdBy"] = current_user.get("id")
    wo_dict["_id"] = ObjectId()
    wo_dict["id"] = str(wo_dict["_id"])

    await db.work_orders.insert_one(wo_dict)

    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=f"{current_user['prenom']} {current_user['nom']}",
        user_email=current_user["email"],
        action=ActionType.CREATE,
        entity_type=EntityType_Audit.WORK_ORDER,
        entity_id=wo_dict.get("id"),
        entity_name=wo_dict["titre"],
        details=f"Ordre de travail #{numero} créé"
    )

    wo = serialize_doc(wo_dict)
    if wo.get("assigne_a_id"):
        wo["assigneA"] = await get_user_by_id(wo["assigne_a_id"])
    if wo.get("emplacement_id"):
        wo["emplacement"] = await get_location_by_id(wo["emplacement_id"])
    if wo.get("equipement_id"):
        wo["equipement"] = await get_equipment_by_id(wo["equipement_id"])

    # Notification push
    logger.info(f"[PUSH TRIGGER CREATE] assigne_a_id={wo_create.assigne_a_id}, assigne_type={wo_create.assigne_type}, assigne_service={wo_create.assigne_service}")
    if wo_create.assigne_type == "service" and wo_create.assigne_service:
        asyncio.create_task(
            notify_service_assignment(wo, wo_create.assigne_service, current_user.get("id"))
        )
    elif wo_create.assigne_a_id and wo_create.assigne_a_id != current_user.get("id"):
        from notifications import notify_work_order_assigned
        from web_push import notify_work_order_assigned_web
        logger.info(f"[PUSH TRIGGER CREATE] Envoi notification a {wo_create.assigne_a_id}")
        asyncio.create_task(
            notify_work_order_assigned(
                db=db, work_order_id=wo.get("id", ""),
                work_order_title=wo_create.titre, work_order_numero=numero,
                assigned_user_id=wo_create.assigne_a_id
            )
        )
        asyncio.create_task(
            notify_work_order_assigned_web(db, wo, wo_create.assigne_a_id, current_user.get("id"))
        )
    elif wo_create.assigne_a_id == current_user.get("id"):
        logger.info("[PUSH TRIGGER CREATE] Auto-assignation, pas de notification")

    from realtime_manager import realtime_manager
    from realtime_events import EntityType as RealtimeEntityType, EventType as RealtimeEventType
    await realtime_manager.emit_event(
        RealtimeEntityType.WORK_ORDERS.value,
        RealtimeEventType.CREATED.value,
        wo, user_id=current_user.get("id")
    )

    return WorkOrder(**wo)


@router.put("/work-orders/{wo_id}",
    summary="Modifier un ordre de travail", response_model=WorkOrder)
async def update_work_order(wo_id: str, wo_update: WorkOrderUpdate, current_user: dict = Depends(require_permission("workOrders", "view"))):
    """Modifier un ordre de travail"""
    from dependencies import can_edit_work_order_status

    try:
        existing_wo = await db.work_orders.find_one({"id": wo_id})
        if not existing_wo:
            try:
                existing_wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
            except Exception:
                pass

        if not existing_wo:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        existing_wo["id"] = str(existing_wo["_id"])

        user_role = current_user.get("role")
        user_id = current_user.get("id")
        created_by = existing_wo.get("createdBy")

        update_fields = set(wo_update.model_dump(exclude_unset=True).keys())
        is_status_only = update_fields <= {'statut', 'att_materiel_info', 'att_decision_info'}

        if user_role == "ADMIN":
            can_full_edit = True
        elif user_role == "TECHNICIEN":
            can_full_edit = (created_by == user_id)
        else:
            can_full_edit = False
            if not is_status_only:
                raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que le statut de cet ordre de travail")

        if not can_full_edit:
            if not is_status_only:
                raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que le statut de cet ordre de travail")

        update_data = {}
        sent_data = wo_update.model_dump(exclude_unset=True)
        for k, v in wo_update.model_dump().items():
            if v is not None:
                update_data[k] = v
            elif k in sent_data and k in ['assigne_a_id', 'assigne_type', 'assigne_service', 'equipement_id', 'emplacement_id', 'dateLimite']:
                update_data[k] = None

        if 'assigne_a_id' in update_data and update_data['assigne_a_id'] is None:
            update_data['assigneA'] = None
        if 'assigne_type' in update_data and update_data['assigne_type'] is None:
            update_data['assigne_service'] = None
        if 'equipement_id' in update_data and update_data['equipement_id'] is None:
            update_data['equipement'] = None
        if 'emplacement_id' in update_data and update_data['emplacement_id'] is None:
            update_data['emplacement'] = None

        if wo_update.statut == WorkOrderStatus.TERMINE and "dateTermine" not in update_data:
            update_data["dateTermine"] = datetime.utcnow()

        wo_filter = {"_id": existing_wo["_id"]}
        await db.work_orders.update_one(wo_filter, {"$set": update_data})

        changes_desc = ", ".join([f"{k}: {v}" for k, v in update_data.items()])
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=existing_wo.get("id"),
            entity_name=existing_wo["titre"],
            details=f"Modifications: {changes_desc}",
            changes=update_data
        )

        wo = await db.work_orders.find_one(wo_filter)
        wo = serialize_doc(wo)

        VALID_STATUTS = {"OUVERT", "EN_COURS", "ATT_MATERIEL", "ATT_DECISION", "TERMINE", "EN_ATTENTE"}
        STATUT_MAP = {"en_attente": "ATT_MATERIEL", "att_materiel": "ATT_MATERIEL", "att_decision": "ATT_DECISION", "en_cours": "EN_COURS", "ouvert": "OUVERT", "termine": "TERMINE"}
        raw_statut = wo.get("statut", "")
        if raw_statut and raw_statut not in VALID_STATUTS:
            wo["statut"] = STATUT_MAP.get(raw_statut.lower(), raw_statut.upper() if raw_statut.upper() in VALID_STATUTS else "ATT_MATERIEL")
        if "numero" not in wo or not wo["numero"]:
            wo["numero"] = "N/A"

        if wo.get("assigne_a_id"):
            wo["assigneA"] = await get_user_by_id(wo["assigne_a_id"])
        if wo.get("emplacement_id"):
            wo["emplacement"] = await get_location_by_id(wo["emplacement_id"])
        if wo.get("equipement_id"):
            wo["equipement"] = await get_equipment_by_id(wo["equipement_id"])

        # Notifications push
        from notifications import notify_work_order_assigned, notify_work_order_status_changed
        from web_push import notify_work_order_assigned_web, notify_work_order_status_changed_web

        logger.info(f"[PUSH TRIGGER UPDATE] update_data keys={list(update_data.keys())}")
        if "assigne_type" in update_data and update_data.get("assigne_type") == "service" and update_data.get("assigne_service"):
            asyncio.create_task(notify_service_assignment(wo, update_data["assigne_service"], current_user.get("id")))
        elif "assigne_a_id" in update_data and update_data.get("assigne_a_id"):
            new_assigne = update_data["assigne_a_id"]
            old_assigne = existing_wo.get("assigne_a_id")
            logger.info(f"[PUSH TRIGGER UPDATE] Assignation: old={old_assigne} -> new={new_assigne}")
            if new_assigne != old_assigne:
                asyncio.create_task(
                    notify_work_order_assigned(
                        db=db, work_order_id=wo.get("id", ""),
                        work_order_title=existing_wo.get("titre", ""),
                        work_order_numero=existing_wo.get("numero", ""),
                        assigned_user_id=new_assigne
                    )
                )
                asyncio.create_task(notify_work_order_assigned_web(db, wo, new_assigne, current_user.get("id")))

        if "statut" in update_data and existing_wo.get("statut") != update_data["statut"]:
            notify_ids = []
            if existing_wo.get("createdBy"):
                notify_ids.append(str(existing_wo["createdBy"]))
            if existing_wo.get("assigne_a_id"):
                notify_ids.append(str(existing_wo["assigne_a_id"]))
            notify_ids = list(set(notify_ids) - {str(current_user.get("id"))})
            if notify_ids:
                asyncio.create_task(
                    notify_work_order_status_changed(
                        db=db, work_order_id=wo.get("id", ""),
                        work_order_title=existing_wo.get("titre", ""),
                        work_order_numero=existing_wo.get("numero", ""),
                        old_status=existing_wo.get("statut", ""),
                        new_status=update_data["statut"],
                        notify_user_ids=notify_ids
                    )
                )
                asyncio.create_task(
                    notify_work_order_status_changed_web(db, wo, existing_wo.get("statut", ""), update_data["statut"], current_user.get("id"))
                )

        from realtime_manager import realtime_manager
        from realtime_events import EntityType as RealtimeEntityType, EventType as RealtimeEventType

        if "statut" in update_data and existing_wo.get("statut") != update_data["statut"]:
            await realtime_manager.emit_event(
                RealtimeEntityType.WORK_ORDERS.value,
                RealtimeEventType.STATUS_CHANGED.value,
                {"id": wo["id"], "old_status": existing_wo.get("statut"), "new_status": update_data["statut"], "work_order": wo},
                user_id=current_user.get("id")
            )

        await realtime_manager.emit_event(
            RealtimeEntityType.WORK_ORDERS.value,
            RealtimeEventType.UPDATED.value,
            wo, user_id=current_user.get("id")
        )

        return WorkOrder(**wo)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/work-orders/{wo_id}/add-time",
    summary="Ajouter du temps passe", response_model=WorkOrder)
async def add_time_to_work_order(wo_id: str, time_data: AddTimeSpent, current_user: dict = Depends(require_permission("workOrders", "view"))):
    """Ajouter du temps passé à un ordre de travail"""
    try:
        existing_wo = await find_work_order_flexible(wo_id)
        if not existing_wo:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo_oid = existing_wo["_id"]
        time_to_add = time_data.hours + (time_data.minutes / 60.0)
        current_time = existing_wo.get("tempsReel", 0) or 0
        new_time = current_time + time_to_add

        time_entry = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "user_name": f"{current_user['prenom']} {current_user['nom']}",
            "hours": time_to_add,
            "timestamp": datetime.now(timezone.utc)
        }

        await db.work_orders.update_one(
            {"_id": wo_oid},
            {"$set": {"tempsReel": new_time}, "$push": {"time_entries": time_entry}}
        )

        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=str(wo_oid),
            entity_name=existing_wo["titre"],
            details=f"Ajout de temps passé: {time_data.hours}h{time_data.minutes:02d}min",
            changes={"tempsReel_old": current_time, "tempsReel_new": new_time, "time_added": time_to_add}
        )

        wo = await db.work_orders.find_one({"_id": wo_oid})
        wo = serialize_doc(wo)

        if wo.get("assigne_a_id"):
            wo["assigneA"] = await get_user_by_id(wo["assigne_a_id"])
        if wo.get("emplacement_id"):
            wo["emplacement"] = await get_location_by_id(wo["emplacement_id"])
        if wo.get("equipement_id"):
            wo["equipement"] = await get_equipment_by_id(wo["equipement_id"])

        return WorkOrder(**wo)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de l'ajout de temps : {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/work-orders/{wo_id}", response_model=MessageResponse,
    summary="Supprimer un ordre de travail")
async def delete_work_order(wo_id: str, current_user: dict = Depends(require_permission("workOrders", "delete"))):
    """Supprimer un ordre de travail"""
    try:
        wo = await find_work_order_flexible(wo_id)
        if not wo:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo_oid = wo["_id"]

        await db.work_orders.update_one(
            {"_id": wo_oid},
            {"$set": {
                "deleted_at": datetime.now(timezone.utc),
                "deleted_by": current_user["id"],
                "deleted_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
            }}
        )

        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.DELETE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=wo.get("id"),
            entity_name=wo.get("titre", ""),
            details=f"Ordre de travail #{wo.get('numero')} supprimé"
        )

        from realtime_manager import realtime_manager
        from realtime_events import EntityType as RealtimeEntityType, EventType as RealtimeEventType
        await realtime_manager.emit_event(
            RealtimeEntityType.WORK_ORDERS.value,
            RealtimeEventType.DELETED.value,
            {"id": str(wo["_id"])},
            user_id=current_user.get("id")
        )

        return {"message": "Ordre de travail supprimé"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== WORK ORDER ATTACHMENTS ====================

@router.post("/work-orders/{wo_id}/attachments",
    summary="Uploader une piece jointe", response_model=AttachmentResponse)
async def upload_attachment(
    wo_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("workOrders", "edit"))
):
    """Uploader une pièce jointe (max 25MB)"""
    try:
        wo = await find_work_order_flexible(wo_id)
        if not wo:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo_oid = wo["_id"]

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 25MB)")

        from image_compressor import get_compression_settings, compress_image
        comp_settings = await get_compression_settings(db)
        content, compressed_filename, new_mime, was_compressed = compress_image(content, file.filename, comp_settings)

        file_ext = Path(compressed_filename).suffix if was_compressed else Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = WO_UPLOAD_DIR / unique_filename

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

        await db.work_orders.update_one({"_id": wo_oid}, {"$push": {"attachments": attachment}})

        return {
            "id": str(attachment["_id"]),
            "filename": attachment["filename"],
            "original_filename": attachment["original_filename"],
            "size": attachment["size"],
            "mime_type": attachment["mime_type"],
            "uploaded_at": attachment["uploaded_at"],
            "url": f"/api/work-orders/{wo_id}/attachments/{str(attachment['_id'])}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/work-orders/{wo_id}/attachments",
    summary="Lister les pieces jointes", response_model=List[AttachmentResponse])
async def get_attachments(wo_id: str, current_user: dict = Depends(require_permission("workOrders", "view"))):
    """Lister les pièces jointes d'un ordre de travail"""
    try:
        wo = await db.work_orders.find_one({"id": wo_id})
        if not wo:
            try:
                wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
            except Exception:
                pass

        if not wo:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        attachments = wo.get("attachments", [])
        result = []
        for att in attachments:
            att_id = str(att.get("_id", att.get("id", "")))
            result.append({
                "id": att_id,
                "filename": att.get("filename", ""),
                "original_filename": att.get("original_filename", att.get("filename", "")),
                "size": att.get("size", 0),
                "mime_type": att.get("mime_type", att.get("type", "application/octet-stream")),
                "uploaded_at": att.get("uploaded_at", att.get("uploadedAt", "")),
                "url": f"/api/work-orders/{wo_id}/attachments/{att_id}"
            })

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/work-orders/{wo_id}/attachments/{attachment_id}",
    summary="Telecharger une piece jointe")
async def download_attachment(
    wo_id: str, attachment_id: str, preview: bool = False,
    current_user: dict = Depends(require_permission("workOrders", "view"))
):
    """Télécharger ou prévisualiser une pièce jointe"""
    try:
        wo = await db.work_orders.find_one({"id": wo_id})
        if not wo:
            try:
                wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
            except Exception:
                pass

        if not wo:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        attachment = None
        for att in wo.get("attachments", []):
            att_id = str(att.get("_id", att.get("id", "")))
            if att_id == attachment_id:
                attachment = att
                break

        if not attachment:
            raise HTTPException(status_code=404, detail="Pièce jointe non trouvée")

        file_path = attachment.get("path")
        if not file_path:
            file_path = str(WO_UPLOAD_DIR / attachment.get("filename", ""))

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Fichier non trouvé sur le serveur")

        disposition = "inline" if preview else "attachment"
        return FileResponse(
            path=file_path,
            filename=attachment.get("original_filename", attachment.get("filename", "file")),
            media_type=attachment.get("mime_type", attachment.get("type", "application/octet-stream")),
            content_disposition_type=disposition
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/work-orders/{wo_id}/attachments/{attachment_id}",
    summary="Supprimer une piece jointe", response_model=MessageResponse)
async def delete_attachment(
    wo_id: str, attachment_id: str,
    current_user: dict = Depends(require_permission("workOrders", "edit"))
):
    """Supprimer une pièce jointe"""
    try:
        wo = await db.work_orders.find_one({"id": wo_id})
        if not wo:
            try:
                wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
            except Exception:
                pass

        if not wo:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        attachment = None
        for att in wo.get("attachments", []):
            att_id = str(att.get("_id", att.get("id", "")))
            if att_id == attachment_id:
                attachment = att
                break

        if not attachment:
            raise HTTPException(status_code=404, detail="Pièce jointe non trouvée")

        file_path = attachment.get("path")
        if not file_path:
            file_path = str(WO_UPLOAD_DIR / attachment.get("filename", ""))

        if os.path.exists(file_path):
            os.remove(file_path)

        wo_filter = {"id": wo.get("id")} if wo.get("id") else {"_id": wo["_id"]}

        if "_id" in attachment:
            await db.work_orders.update_one(wo_filter, {"$pull": {"attachments": {"_id": attachment["_id"]}}})
        else:
            await db.work_orders.update_one(wo_filter, {"$pull": {"attachments": {"id": attachment_id}}})

        return {"message": "Pièce jointe supprimée"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== WORK ORDER COMMENTS ====================

@router.post("/work-orders/{work_order_id}/comments")
async def add_work_order_comment(
    work_order_id: str,
    comment: CommentWithPartsCreate,
    current_user: dict = Depends(require_permission("workOrders", "view"))
):
    """Ajoute un commentaire et des pièces utilisées à un ordre de travail"""
    try:
        work_order = await find_work_order_flexible(work_order_id)
        if not work_order:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo_oid = work_order["_id"]

        new_comment = {
            "id": str(uuid.uuid4()),
            "user_id": current_user.get("id", str(work_order["_id"])),
            "user_name": f"{current_user['prenom']} {current_user['nom']}",
            "text": comment.text,
            "timestamp": datetime.now(timezone.utc)
        }

        parts_used_list = []
        logger.info(f"Traitement de {len(comment.parts_used)} pièces utilisées")
        for part in comment.parts_used:
            part_data = {
                "id": str(uuid.uuid4()),
                "inventory_item_id": part.inventory_item_id,
                "inventory_item_name": part.inventory_item_name,
                "custom_part_name": part.custom_part_name,
                "quantity": part.quantity,
                "user_name": f"{current_user['prenom']} {current_user['nom']}",
                "timestamp": datetime.now(timezone.utc)
            }

            if hasattr(part, 'source_equipment_id') and part.source_equipment_id:
                part_data["source_equipment_id"] = part.source_equipment_id
                part_data["source_equipment_name"] = part.source_equipment_name
            if hasattr(part, 'custom_source') and part.custom_source:
                part_data["custom_source"] = part.custom_source

            parts_used_list.append(part_data)

            if part.inventory_item_id:
                inventory_item = await db.inventory.find_one({"_id": ObjectId(part.inventory_item_id)})
                if inventory_item:
                    new_quantity = inventory_item["quantite"] - part.quantity
                    await db.inventory.update_one(
                        {"_id": ObjectId(part.inventory_item_id)},
                        {"$set": {"quantite": new_quantity}}
                    )

        if parts_used_list:
            await db.work_orders.update_one(
                {"_id": wo_oid},
                {"$push": {"comments": new_comment, "parts_used": {"$each": parts_used_list}}}
            )
        else:
            await db.work_orders.update_one({"_id": wo_oid}, {"$push": {"comments": new_comment}})

        details_text = f"Commentaire ajouté: {comment.text[:50]}..."
        if parts_used_list:
            details_text += f" | {len(parts_used_list)} pièce(s) utilisée(s)"

        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=work_order_id,
            entity_name=work_order.get("titre", ""),
            details=details_text
        )

        return {"comment": new_comment, "parts_used": parts_used_list}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de l'ajout du commentaire: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'ajout du commentaire")


@router.post("/work-orders/{work_order_id}/parts-used")
async def add_work_order_parts(
    work_order_id: str,
    parts: List[PartUsedCreate],
    current_user: dict = Depends(require_permission("workOrders", "edit"))
):
    """Ajoute des pièces utilisées à un ordre de travail SANS créer de commentaire"""
    try:
        work_order = await find_work_order_flexible(work_order_id)
        if not work_order:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo_oid = work_order["_id"]

        parts_used_list = []
        for part in parts:
            part_data = {
                "id": str(uuid.uuid4()),
                "inventory_item_id": part.inventory_item_id,
                "inventory_item_name": part.inventory_item_name,
                "custom_part_name": part.custom_part_name,
                "quantity": part.quantity,
                "user_name": f"{current_user['prenom']} {current_user['nom']}",
                "timestamp": datetime.now(timezone.utc)
            }

            if hasattr(part, 'source_equipment_id') and part.source_equipment_id:
                part_data["source_equipment_id"] = part.source_equipment_id
                part_data["source_equipment_name"] = part.source_equipment_name
            if hasattr(part, 'custom_source') and part.custom_source:
                part_data["custom_source"] = part.custom_source

            parts_used_list.append(part_data)

            if part.inventory_item_id:
                inventory_item = await db.inventory.find_one({"_id": ObjectId(part.inventory_item_id)})
                if inventory_item:
                    new_quantity = inventory_item["quantite"] - part.quantity
                    await db.inventory.update_one(
                        {"_id": ObjectId(part.inventory_item_id)},
                        {"$set": {"quantite": new_quantity}}
                    )

        await db.work_orders.update_one(
            {"_id": wo_oid},
            {"$push": {"parts_used": {"$each": parts_used_list}}}
        )

        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=work_order_id,
            entity_name=work_order.get("titre", ""),
            details=f"{len(parts_used_list)} pièce(s) utilisée(s) ajoutée(s)"
        )

        return {"parts_used": parts_used_list, "count": len(parts_used_list)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de l'ajout des pièces: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'ajout des pièces")


@router.get("/work-orders/{work_order_id}/comments")
async def get_work_order_comments(
    work_order_id: str,
    current_user: dict = Depends(require_permission("workOrders", "view"))
):
    """Récupère tous les commentaires d'un ordre de travail"""
    try:
        work_order = await find_work_order_flexible(work_order_id)
        if not work_order:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        comments = work_order.get("comments", [])
        return {"comments": comments}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des commentaires: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la récupération des commentaires")


# ==================== ADMIN: EDIT/DELETE TIME ENTRIES & COMMENTS ====================

@router.put("/work-orders/{work_order_id}/time-entries/{entry_id}",
    summary="Modifier une entree de temps")
async def update_time_entry(
    work_order_id: str, entry_id: str,
    update_data: TimeEntryUpdate,
    current_user: dict = Depends(require_permission("workOrders", "delete"))
):
    """Modifier une entrée de temps d'un OT (edit+delete workOrders ou admin)"""
    try:
        work_order = await find_work_order_flexible(work_order_id)
        if not work_order:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo_oid = work_order["_id"]
        time_entries = work_order.get("time_entries", [])

        old_entry = next((e for e in time_entries if e.get("id") == entry_id), None)
        if not old_entry:
            raise HTTPException(status_code=404, detail="Entrée de temps non trouvée")

        old_hours = old_entry.get("hours", 0)
        new_hours = update_data.hours
        diff = new_hours - old_hours

        current_total = work_order.get("tempsReel", 0) or 0
        new_total = max(0, current_total + diff)

        update_set = {"time_entries.$.hours": new_hours, "tempsReel": new_total}
        details_parts = [f"temps: {old_hours:.2f}h -> {new_hours:.2f}h"]

        if update_data.timestamp:
            # Convertir en datetime pour compatibilité avec les requêtes $gte/$lte des rapports
            try:
                new_ts = datetime.fromisoformat(update_data.timestamp.replace('Z', '+00:00').replace('+00:00', ''))
            except Exception:
                new_ts = datetime.fromisoformat(update_data.timestamp[:19])
            update_set["time_entries.$.timestamp"] = new_ts
            old_ts = old_entry.get("timestamp", "?")
            if isinstance(old_ts, datetime):
                old_ts = old_ts.strftime("%d/%m/%Y")
            elif isinstance(old_ts, str):
                old_ts = old_ts[:10]
            details_parts.append(f"date: {old_ts} -> {new_ts.strftime('%d/%m/%Y')}")

        await db.work_orders.update_one(
            {"_id": wo_oid, "time_entries.id": entry_id},
            {"$set": update_set}
        )

        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=work_order_id,
            entity_name=work_order.get("titre", ""),
            details=f"Modification {', '.join(details_parts)} (entrée de {old_entry.get('user_name', '?')})"
        )

        return {"message": "Entrée de temps modifiée", "new_total": new_total}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur modification time entry: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la modification")


@router.delete("/work-orders/{work_order_id}/time-entries/{entry_id}",
    summary="Supprimer une entree de temps")
async def delete_time_entry(
    work_order_id: str, entry_id: str,
    current_user: dict = Depends(require_permission("workOrders", "delete"))
):
    """Supprimer une entrée de temps d'un OT (edit+delete workOrders ou admin)"""
    try:
        work_order = await find_work_order_flexible(work_order_id)
        if not work_order:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo_oid = work_order["_id"]
        time_entries = work_order.get("time_entries", [])

        old_entry = next((e for e in time_entries if e.get("id") == entry_id), None)
        if not old_entry:
            raise HTTPException(status_code=404, detail="Entrée de temps non trouvée")

        old_hours = old_entry.get("hours", 0)
        current_total = work_order.get("tempsReel", 0) or 0
        new_total = max(0, current_total - old_hours)

        await db.work_orders.update_one(
            {"_id": wo_oid},
            {"$pull": {"time_entries": {"id": entry_id}}, "$set": {"tempsReel": new_total}}
        )

        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.DELETE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=work_order_id,
            entity_name=work_order.get("titre", ""),
            details=f"Suppression temps: {old_hours:.2f}h de {old_entry.get('user_name', '?')}"
        )

        return {"message": "Entrée de temps supprimée", "new_total": new_total}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur suppression time entry: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la suppression")


@router.put("/work-orders/{work_order_id}/comments/{comment_id}",
    summary="Modifier un commentaire (admin)")
async def update_comment(
    work_order_id: str, comment_id: str,
    update_data: CommentUpdate,
    current_user: dict = Depends(get_current_admin_user)
):
    """Modifier un commentaire d'un OT (admin uniquement)"""
    try:
        work_order = await find_work_order_flexible(work_order_id)
        if not work_order:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo_oid = work_order["_id"]
        comments_list = work_order.get("comments", [])

        old_comment = next((c for c in comments_list if c.get("id") == comment_id), None)
        if not old_comment:
            raise HTTPException(status_code=404, detail="Commentaire non trouvé")

        await db.work_orders.update_one(
            {"_id": wo_oid, "comments.id": comment_id},
            {"$set": {"comments.$.text": update_data.text}}
        )

        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=work_order_id,
            entity_name=work_order.get("titre", ""),
            details=f"Modification commentaire de {old_comment.get('user_name', '?')}: '{old_comment.get('text', '')[:30]}...' -> '{update_data.text[:30]}...'"
        )

        return {"message": "Commentaire modifié"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur modification commentaire: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la modification")


@router.delete("/work-orders/{work_order_id}/comments/{comment_id}",
    summary="Supprimer un commentaire (admin)")
async def delete_comment(
    work_order_id: str, comment_id: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """Supprimer un commentaire d'un OT (admin uniquement)"""
    try:
        work_order = await find_work_order_flexible(work_order_id)
        if not work_order:
            raise HTTPException(status_code=404, detail="Ordre de travail non trouvé")

        wo_oid = work_order["_id"]
        comments_list = work_order.get("comments", [])

        old_comment = next((c for c in comments_list if c.get("id") == comment_id), None)
        if not old_comment:
            raise HTTPException(status_code=404, detail="Commentaire non trouvé")

        await db.work_orders.update_one(
            {"_id": wo_oid},
            {"$pull": {"comments": {"id": comment_id}}}
        )

        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.DELETE,
            entity_type=EntityType_Audit.WORK_ORDER,
            entity_id=work_order_id,
            entity_name=work_order.get("titre", ""),
            details=f"Suppression commentaire de {old_comment.get('user_name', '?')}: '{old_comment.get('text', '')[:50]}...'"
        )

        return {"message": "Commentaire supprimé"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur suppression commentaire: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la suppression")
