"""
Routes LOTO (Lockout/Tagout) - Gestion des consignations de sécurité
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from bson import ObjectId
import base64

from dependencies import get_current_user, get_current_admin_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/loto", tags=["LOTO - Consignations"])

db = None
_realtime_manager = None
_audit_service = None

def init_loto_routes(database, audit_svc=None):
    global db, _realtime_manager, _audit_service
    db = database
    _audit_service = audit_svc
    try:
        from realtime_manager import realtime_manager
        _realtime_manager = realtime_manager
    except ImportError:
        pass
    logger.info("Routes LOTO initialisées")
    return router


async def _log_loto_audit(user: dict, action_type: str, entity_id: str = None, entity_name: str = None, details: str = None):
    """Log une action LOTO dans le journal d'audit."""
    if not _audit_service:
        return
    try:
        from models import ActionType, EntityType
        action_map = {
            "CREATE": ActionType.CREATE,
            "UPDATE": ActionType.UPDATE,
            "DELETE": ActionType.DELETE,
        }
        await _audit_service.log_action(
            user_id=user.get("id", ""),
            user_name=user.get("name", user.get("email", "")),
            user_email=user.get("email", ""),
            action=action_map.get(action_type, ActionType.UPDATE),
            entity_type=EntityType.LOTO,
            entity_id=entity_id,
            entity_name=entity_name,
            details=details
        )
    except Exception as e:
        logger.warning(f"Erreur log audit LOTO: {e}")


async def _emit_loto_event(action: str, data: dict = None):
    """Émet un événement WebSocket pour mettre à jour les composants en temps réel."""
    if _realtime_manager:
        try:
            await _realtime_manager.emit_event("loto", {
                "type": "loto_update",
                "action": action,
                "data": data or {},
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            logger.warning(f"Erreur emission WS LOTO: {e}")


# ===== Pydantic Models =====

class IsolationPoint(BaseModel):
    name: str
    type: str  # disjoncteur, vanne, interrupteur, etc.
    location: str = ""
    verified: bool = False

class CadenasEntry(BaseModel):
    numero: str = ""  # CAD-001, CAD-002, etc.
    owner_id: str
    owner_nom: str
    point_index: Optional[int] = None  # Index du point d'isolation (-1 ou None = global)
    cadenas_type: str = "normal"  # normal | superviseur
    pose_at: Optional[str] = None
    retire_at: Optional[str] = None
    signature_pose: Optional[str] = None  # base64
    signature_retire: Optional[str] = None  # base64

class SignatureData(BaseModel):
    data: Optional[str] = None  # base64
    signer_id: Optional[str] = None
    signer_nom: Optional[str] = None
    timestamp: Optional[str] = None
    pin_validated: bool = False

class IntervenantEntry(BaseModel):
    id: str
    nom: str

class LOTOCreate(BaseModel):
    equipement_id: str
    equipement_nom: str
    sous_equipement_id: Optional[str] = None
    sous_equipement_nom: Optional[str] = None
    emplacement: str = ""
    linked_type: Optional[str] = None  # work_order, preventive_maintenance, improvement
    linked_id: Optional[str] = None
    linked_numero: Optional[str] = None
    energy_types: List[str] = []
    isolation_points: List[IsolationPoint] = []
    responsable_id: str
    responsable_nom: str
    intervenants: List[IntervenantEntry] = []
    duree_prevue_heures: Optional[float] = None
    motif: str = ""
    notes: str = ""

class LOTOUpdate(BaseModel):
    energy_types: Optional[List[str]] = None
    isolation_points: Optional[List[IsolationPoint]] = None
    intervenants: Optional[List[IntervenantEntry]] = None
    duree_prevue_heures: Optional[float] = None
    motif: Optional[str] = None
    notes: Optional[str] = None

class WorkflowAction(BaseModel):
    action: str  # consigner, deconsigner, annuler
    signature: Optional[SignatureData] = None
    pin: Optional[str] = None
    notes: Optional[str] = None

class CadenasAction(BaseModel):
    action: str  # poser, retirer
    signature: Optional[str] = None  # base64
    point_index: Optional[int] = None  # Index du point d'isolation (None = global)
    cadenas_type: str = "normal"  # normal | superviseur
    cadenas_numero: Optional[str] = None  # Pour retirer un cadenas specifique

class VerifyIsolationPoint(BaseModel):
    point_index: int
    verified: bool


# ===== Helpers =====

async def _get_next_numero():
    """Génère le prochain numéro LOTO via le compteur atomique partagé.
    Anti-collision via routes.shared.get_next_loto_numero (retry-on-conflict).
    """
    from routes.shared import get_next_loto_numero
    return await get_next_loto_numero()

def _serialize(doc):
    if doc and "_id" in doc:
        del doc["_id"]
    return doc


# ===== CRUD =====

@router.get("/")
async def get_consignations(
    status: Optional[str] = None,
    equipement_id: Optional[str] = None,
    linked_type: Optional[str] = None,
    linked_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if equipement_id:
        query["equipement_id"] = equipement_id
    if linked_type:
        query["linked_type"] = linked_type
    if linked_id:
        query["linked_id"] = linked_id

    docs = await db.loto_consignations.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@router.get("/by-equipment/{equipement_id}")
async def get_by_equipment(equipement_id: str, current_user: dict = Depends(get_current_user)):
    docs = await db.loto_consignations.find(
        {"equipement_id": equipement_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return docs


@router.get("/active")
async def get_active_consignations(current_user: dict = Depends(get_current_user)):
    docs = await db.loto_consignations.find(
        {"status": {"$in": ["DEMANDE", "CONSIGNE", "INTERVENTION"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return docs


@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    results = await db.loto_consignations.aggregate(pipeline).to_list(10)
    stats = {r["_id"]: r["count"] for r in results}
    total = sum(stats.values())
    return {
        "total": total,
        "demande": stats.get("DEMANDE", 0),
        "consigne": stats.get("CONSIGNE", 0),
        "intervention": stats.get("INTERVENTION", 0),
        "deconsigne": stats.get("DECONSIGNE", 0),
        "annule": stats.get("ANNULE", 0),
        "active": stats.get("DEMANDE", 0) + stats.get("CONSIGNE", 0) + stats.get("INTERVENTION", 0)
    }


@router.get("/by-linked")
async def get_loto_by_linked_ids(current_user: dict = Depends(get_current_user)):
    """Retourne un dictionnaire {linked_id: {status, numero, id}} pour toutes les consignations."""
    docs = await db.loto_consignations.find(
        {"linked_id": {"$ne": None}},
        {"_id": 0, "id": 1, "numero": 1, "status": 1, "linked_id": 1, "linked_type": 1, "equipement_nom": 1}
    ).to_list(500)
    result = {}
    for d in docs:
        lid = d.get("linked_id")
        if lid:
            existing = result.get(lid)
            priority = {"CONSIGNE": 3, "INTERVENTION": 3, "DEMANDE": 2, "DECONSIGNE": 1, "ANNULE": 0}
            if not existing or priority.get(d["status"], 0) > priority.get(existing["status"], 0):
                result[lid] = {
                    "id": d["id"],
                    "numero": d["numero"],
                    "status": d["status"],
                    "linked_type": d.get("linked_type"),
                    "equipement_nom": d.get("equipement_nom", "")
                }
    return result


@router.get("/pin/check")
async def check_pin(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "loto_pin": 1})
    return {"has_pin": bool(user and user.get("loto_pin"))}


@router.get("/{loto_id}")
async def get_consignation(loto_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.loto_consignations.find_one({"id": loto_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Consignation introuvable")
    return doc


@router.post("/")
async def create_consignation(data: LOTOCreate, current_user: dict = Depends(get_current_user)):
    numero, seq = await _get_next_numero()
    now = datetime.now(timezone.utc).isoformat()

    # Si un sous-équipement est sélectionné, il devient l'équipement réel de la consignation
    actual_equipement_id = data.sous_equipement_id or data.equipement_id
    actual_equipement_nom = data.sous_equipement_nom or data.equipement_nom

    doc = {
        "id": str(uuid.uuid4()),
        "numero": numero,
        "numero_seq": seq,
        "equipement_id": actual_equipement_id,
        "equipement_nom": actual_equipement_nom,
        # Conserver la référence au parent et au sous-équipement pour l'affichage
        "parent_equipement_id": data.equipement_id if data.sous_equipement_id else None,
        "parent_equipement_nom": data.equipement_nom if data.sous_equipement_id else None,
        "emplacement": data.emplacement,
        "linked_type": data.linked_type,
        "linked_id": data.linked_id,
        "linked_numero": data.linked_numero,
        "energy_types": data.energy_types,
        "isolation_points": [p.dict() for p in data.isolation_points],
        "status": "DEMANDE",
        "demandeur_id": current_user["id"],
        "demandeur_nom": current_user.get("name", current_user.get("email", "")),
        "responsable_id": data.responsable_id,
        "responsable_nom": data.responsable_nom,
        "intervenants": [i.dict() for i in data.intervenants],
        "cadenas": [],
        "signature_consignation": None,
        "signature_deconsignation": None,
        "date_demande": now,
        "date_consignation": None,
        "date_deconsignation": None,
        "duree_prevue_heures": data.duree_prevue_heures,
        "motif": data.motif,
        "notes": data.notes,
        "historique": [{
            "action": "CREATION",
            "user_id": current_user["id"],
            "user_nom": current_user.get("name", ""),
            "timestamp": now,
            "details": f"Demande de consignation créée pour {actual_equipement_nom}"
        }],
        "created_at": now,
        "updated_at": now
    }

    await db.loto_consignations.insert_one(doc)
    del doc["_id"]
    await _emit_loto_event("create", {"id": doc["id"], "status": doc["status"]})
    await _log_loto_audit(current_user, "CREATE", doc["id"], doc["numero"],
                          f"Création consignation {doc['numero']} pour {actual_equipement_nom}")
    return doc


@router.put("/{loto_id}")
async def update_consignation(loto_id: str, data: LOTOUpdate, current_user: dict = Depends(get_current_user)):
    doc = await db.loto_consignations.find_one({"id": loto_id})
    if not doc:
        raise HTTPException(404, "Consignation introuvable")
    if doc["status"] not in ["DEMANDE"]:
        raise HTTPException(400, "Modification possible uniquement en statut DEMANDE")

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ["energy_types", "isolation_points", "intervenants", "duree_prevue_heures", "motif", "notes"]:
        val = getattr(data, field, None)
        if val is not None:
            if field in ["isolation_points", "intervenants"]:
                update[field] = [item.dict() for item in val]
            else:
                update[field] = val

    await db.loto_consignations.update_one({"id": loto_id}, {"$set": update})
    updated = await db.loto_consignations.find_one({"id": loto_id}, {"_id": 0})
    await _emit_loto_event("update", {"id": loto_id, "status": updated.get("status")})
    return updated


@router.delete("/{loto_id}")
async def delete_consignation(loto_id: str, current_user: dict = Depends(get_current_admin_user)):
    doc = await db.loto_consignations.find_one({"id": loto_id})
    if not doc:
        raise HTTPException(404, "Consignation introuvable")
    if doc["status"] not in ["DEMANDE", "ANNULE", "DECONSIGNE"]:
        raise HTTPException(400, "Suppression impossible : consignation active")

    numero = doc.get("numero", "")
    equipement = doc.get("equipement_nom", "")
    await db.loto_consignations.delete_one({"id": loto_id})
    await _emit_loto_event("delete", {"id": loto_id})
    await _log_loto_audit(current_user, "DELETE", loto_id, numero,
                          f"Suppression consignation {numero} ({equipement})")
    return {"success": True, "message": "Consignation supprimée"}


# ===== Workflow =====

@router.post("/{loto_id}/workflow")
async def execute_workflow(loto_id: str, action: WorkflowAction, current_user: dict = Depends(get_current_user)):
    doc = await db.loto_consignations.find_one({"id": loto_id})
    if not doc:
        raise HTTPException(404, "Consignation introuvable")

    now = datetime.now(timezone.utc).isoformat()
    update = {"updated_at": now}
    hist_entry = {
        "user_id": current_user["id"],
        "user_nom": current_user.get("name", ""),
        "timestamp": now
    }

    # Validate PIN if provided
    if action.pin:
        user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "loto_pin": 1})
        if user and user.get("loto_pin"):
            if action.pin != user["loto_pin"]:
                raise HTTPException(400, "Code PIN incorrect")

    sig_data = None
    if action.signature:
        sig_data = {
            "data": action.signature.data,
            "signer_id": current_user["id"],
            "signer_nom": current_user.get("name", ""),
            "timestamp": now,
            "pin_validated": bool(action.pin)
        }

    if action.action == "consigner":
        if doc["status"] != "DEMANDE":
            raise HTTPException(400, "L'équipement doit être en statut DEMANDE")
        # Verify all isolation points are verified
        all_verified = all(p.get("verified", False) for p in doc.get("isolation_points", []))
        if doc.get("isolation_points") and not all_verified:
            raise HTTPException(400, "Tous les points d'isolation doivent être vérifiés")

        update["status"] = "CONSIGNE"
        update["date_consignation"] = now
        update["signature_consignation"] = sig_data
        hist_entry["action"] = "CONSIGNATION"
        hist_entry["details"] = "Équipement consigné - Énergie zéro vérifiée"

        # Mark equipment as consigned
        if doc.get("equipement_id"):
            await db.equipments.update_one(
                {"id": doc["equipement_id"]},
                {"$set": {"loto_active": True, "loto_id": loto_id, "loto_numero": doc["numero"]}}
            )

    elif action.action == "debut_intervention":
        if doc["status"] != "CONSIGNE":
            raise HTTPException(400, "L'équipement doit être CONSIGNÉ avant l'intervention")
        update["status"] = "INTERVENTION"
        hist_entry["action"] = "DEBUT_INTERVENTION"
        hist_entry["details"] = "Intervention démarrée sur équipement consigné"

    elif action.action == "deconsigner":
        if doc["status"] not in ["CONSIGNE", "INTERVENTION"]:
            raise HTTPException(400, "L'équipement doit être CONSIGNÉ ou en INTERVENTION")
        # Check all padlocks removed
        cadenas_actifs = [c for c in doc.get("cadenas", []) if not c.get("retire_at")]
        if cadenas_actifs:
            raise HTTPException(400, f"{len(cadenas_actifs)} cadenas encore en place. Tous doivent être retirés.")

        update["status"] = "DECONSIGNE"
        update["date_deconsignation"] = now
        update["signature_deconsignation"] = sig_data
        hist_entry["action"] = "DECONSIGNATION"
        hist_entry["details"] = "Équipement déconsigné - Remise en service"

        # Remove LOTO flag from equipment
        if doc.get("equipement_id"):
            await db.equipments.update_one(
                {"id": doc["equipement_id"]},
                {"$unset": {"loto_active": "", "loto_id": "", "loto_numero": ""}}
            )

    elif action.action == "annuler":
        if doc["status"] in ["DECONSIGNE", "ANNULE"]:
            raise HTTPException(400, "Impossible d'annuler une consignation terminée")
        update["status"] = "ANNULE"
        hist_entry["action"] = "ANNULATION"
        hist_entry["details"] = action.notes or "Consignation annulée"

        if doc.get("equipement_id"):
            await db.equipments.update_one(
                {"id": doc["equipement_id"]},
                {"$unset": {"loto_active": "", "loto_id": "", "loto_numero": ""}}
            )

    else:
        raise HTTPException(400, f"Action inconnue: {action.action}")

    if action.notes:
        hist_entry["notes"] = action.notes

    await db.loto_consignations.update_one(
        {"id": loto_id},
        {"$set": update, "$push": {"historique": hist_entry}}
    )

    updated = await db.loto_consignations.find_one({"id": loto_id}, {"_id": 0})
    await _emit_loto_event("workflow", {"id": loto_id, "action": action.action, "status": updated.get("status")})
    await _log_loto_audit(current_user, "UPDATE", loto_id, doc.get("numero", ""),
                          f"{hist_entry['action']} - {hist_entry.get('details', '')} ({doc.get('equipement_nom', '')})")
    return updated


# ===== Cadenas (Padlocks) - Multi-cadenas par point d'isolation =====

@router.post("/{loto_id}/cadenas")
async def manage_cadenas(loto_id: str, data: CadenasAction, current_user: dict = Depends(get_current_user)):
    doc = await db.loto_consignations.find_one({"id": loto_id})
    if not doc:
        raise HTTPException(404, "Consignation introuvable")

    now = datetime.now(timezone.utc).isoformat()
    user_id = current_user["id"]
    user_nom = current_user.get("name", "")
    user_role = current_user.get("role", "")

    if data.action == "poser":
        if doc["status"] not in ["CONSIGNE", "INTERVENTION"]:
            raise HTTPException(400, "Impossible de poser un cadenas : consignation non active")

        # Valider le point d'isolation si specifie
        if data.point_index is not None:
            points = doc.get("isolation_points", [])
            if data.point_index < 0 or data.point_index >= len(points):
                raise HTTPException(400, "Index de point d'isolation invalide")

        # Seuls les admins/responsables peuvent poser un cadenas superviseur
        if data.cadenas_type == "superviseur" and user_role.lower() not in ["admin", "manager"]:
            raise HTTPException(403, "Seuls les responsables et admins peuvent poser un cadenas superviseur")

        # Generer un numero unique pour le cadenas
        existing_cadenas = doc.get("cadenas", [])
        max_num = 0
        for c in existing_cadenas:
            num_str = c.get("numero", "")
            if num_str.startswith("CAD-"):
                try:
                    max_num = max(max_num, int(num_str.split("-")[1]))
                except (ValueError, IndexError):
                    pass
        cadenas_numero = f"CAD-{max_num + 1:03d}"

        point_name = ""
        if data.point_index is not None:
            points = doc.get("isolation_points", [])
            point_name = f" sur {points[data.point_index]['name']}"

        cadenas = {
            "numero": cadenas_numero,
            "owner_id": user_id,
            "owner_nom": user_nom,
            "point_index": data.point_index,
            "cadenas_type": data.cadenas_type,
            "pose_at": now,
            "retire_at": None,
            "signature_pose": data.signature,
            "signature_retire": None
        }
        await db.loto_consignations.update_one(
            {"id": loto_id},
            {
                "$push": {
                    "cadenas": cadenas,
                    "historique": {
                        "action": "CADENAS_POSE",
                        "user_id": user_id,
                        "user_nom": user_nom,
                        "timestamp": now,
                        "details": f"Cadenas {cadenas_numero} ({data.cadenas_type}) pose par {user_nom}{point_name}"
                    }
                },
                "$set": {"updated_at": now}
            }
        )

    elif data.action == "retirer":
        if doc["status"] not in ["CONSIGNE", "INTERVENTION"]:
            raise HTTPException(400, "Impossible de retirer un cadenas : consignation non active")

        cadenas_list = doc.get("cadenas", [])
        found = False

        for i, c in enumerate(cadenas_list):
            if c.get("retire_at"):
                continue  # deja retire

            # Si un numero est specifie, retirer ce cadenas precis
            if data.cadenas_numero:
                if c.get("numero") != data.cadenas_numero:
                    continue
            else:
                # Sans numero, retirer le premier cadenas actif de l'utilisateur
                if c["owner_id"] != user_id:
                    continue

            # Verifier les droits de retrait
            is_own = c["owner_id"] == user_id
            is_admin = user_role.lower() in ["admin"]
            is_superviseur_lock = c.get("cadenas_type") == "superviseur"

            if not is_own and not is_admin:
                raise HTTPException(403, f"Seul {c['owner_nom']} ou un admin peut retirer le cadenas {c.get('numero', '')}")
            if is_superviseur_lock and not is_own and not is_admin:
                raise HTTPException(403, f"Cadenas superviseur : seul {c['owner_nom']} ou un admin peut le retirer")

            cadenas_list[i]["retire_at"] = now
            cadenas_list[i]["signature_retire"] = data.signature
            found = True

            point_name = ""
            if c.get("point_index") is not None:
                points = doc.get("isolation_points", [])
                if 0 <= c["point_index"] < len(points):
                    point_name = f" de {points[c['point_index']]['name']}"

            await db.loto_consignations.update_one(
                {"id": loto_id},
                {
                    "$set": {"cadenas": cadenas_list, "updated_at": now},
                    "$push": {
                        "historique": {
                            "action": "CADENAS_RETIRE",
                            "user_id": user_id,
                            "user_nom": user_nom,
                            "timestamp": now,
                            "details": f"Cadenas {c.get('numero', '?')} retire par {user_nom}{point_name}"
                        }
                    }
                }
            )
            break

        if not found:
            raise HTTPException(400, "Aucun cadenas actif trouve" + (f" avec le numero {data.cadenas_numero}" if data.cadenas_numero else " pour cet utilisateur"))

    else:
        raise HTTPException(400, f"Action cadenas inconnue: {data.action}")

    updated = await db.loto_consignations.find_one({"id": loto_id}, {"_id": 0})
    action_label = "Cadenas pose" if data.action == "poser" else "Cadenas retire"
    await _log_loto_audit(current_user, "UPDATE", loto_id, doc.get("numero", ""),
                          f"{action_label} par {user_nom} ({doc.get('equipement_nom', '')})")
    return updated


# ===== Verification points d'isolation =====

@router.post("/{loto_id}/verify-point")
async def verify_isolation_point(loto_id: str, data: VerifyIsolationPoint, current_user: dict = Depends(get_current_user)):
    doc = await db.loto_consignations.find_one({"id": loto_id})
    if not doc:
        raise HTTPException(404, "Consignation introuvable")
    if doc["status"] != "DEMANDE":
        raise HTTPException(400, "Vérification possible uniquement en statut DEMANDE")

    points = doc.get("isolation_points", [])
    if data.point_index < 0 or data.point_index >= len(points):
        raise HTTPException(400, "Index de point invalide")

    points[data.point_index]["verified"] = data.verified
    now = datetime.now(timezone.utc).isoformat()

    await db.loto_consignations.update_one(
        {"id": loto_id},
        {"$set": {"isolation_points": points, "updated_at": now}}
    )

    updated = await db.loto_consignations.find_one({"id": loto_id}, {"_id": 0})
    return updated


# ===== PIN Management =====

@router.post("/pin/set")
async def set_pin(pin: dict, current_user: dict = Depends(get_current_user)):
    code = pin.get("pin", "")
    if not code or len(code) < 4:
        raise HTTPException(400, "Le code PIN doit contenir au moins 4 caractères")

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"loto_pin": code}}
    )
    return {"success": True, "message": "Code PIN LOTO défini"}
