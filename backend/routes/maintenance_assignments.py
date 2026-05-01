"""
Routes des affectations d'activite maintenance.

Une 'MaintenanceAssignment' = un bloc de planning attribue a un technicien
pour une journee donnee. Type possibles :
  - WORK_ORDER : reference a un OT existant
  - IMPROVEMENT : reference a une amelioration
  - PREVENTIVE_MAINTENANCE : reference a une maintenance preventive
  - FREE_TASK : tache libre (Reunion / Formation / Astreinte / Autre)
  - CONGE : conge (synchronise bidirectionnellement avec /api/availabilities)

Permissions : ADMIN, responsables service Maintenance, ou utilisateurs avec
permission "planning" en mode admin/edit, peuvent creer/modifier/supprimer.
Tous les utilisateurs autorises a voir le planning peuvent lire.
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import uuid
import logging

from models import (
    MaintenanceAssignment, MaintenanceAssignmentCreate, MaintenanceAssignmentUpdate,
    MaintenanceAssignmentType, FreeTaskCategory, MessageResponse,
    ActionType, EntityType,
)
from dependencies import get_current_user, require_permission, require_admin_for_module
from routes.shared import db, audit_service, serialize_doc, _get_realtime_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Activite Maintenance"])

# Couleurs par defaut selon le type
DEFAULT_COLORS = {
    "WORK_ORDER": "#0ea5e9",          # bleu
    "IMPROVEMENT": "#10b981",         # vert
    "PREVENTIVE_MAINTENANCE": "#f59e0b",  # ambre
    "CONGE": "#9ca3af",               # gris
}
CATEGORY_COLORS = {
    "REUNION": "#3b82f6",     # bleu
    "FORMATION": "#8b5cf6",   # violet
    "ASTREINTE": "#f97316",   # orange
    "AUTRE": "#6b7280",       # gris fonce
}


def _resolve_color(assignment_type: str, category: Optional[str], explicit: Optional[str]) -> str:
    if explicit:
        return explicit
    if assignment_type == "FREE_TASK" and category:
        return CATEGORY_COLORS.get(category, CATEGORY_COLORS["AUTRE"])
    return DEFAULT_COLORS.get(assignment_type, "#6b7280")


async def _is_maintenance_admin(current_user: dict) -> bool:
    """Verifie si l'utilisateur peut creer/modifier/supprimer des affectations."""
    if current_user.get("role") == "ADMIN":
        return True
    perms = current_user.get("permissions", {}) or {}
    if isinstance(perms, dict):
        if perms.get("planning", {}).get("admin"):
            return True
        if perms.get("planning", {}).get("edit"):
            return True
    # Service manager Maintenance ?
    try:
        manager_entries = await db.service_responsables.find(
            {"user_id": current_user.get("id"), "service": "MAINTENANCE"}
        ).to_list(5)
        if manager_entries:
            return True
    except Exception:
        pass
    return False


def _user_full_name(u: dict) -> str:
    return f"{u.get('prenom', '')} {u.get('nom', '')}".strip() or u.get("email", "")


# ==================== CRUD ====================

@router.get("/maintenance-assignments", tags=["Activite Maintenance"])
async def get_maintenance_assignments(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: Optional[str] = None,
    service: Optional[str] = "MAINTENANCE",
    current_user: dict = Depends(require_permission("planning", "view"))
):
    """Liste des affectations sur une periode. Par defaut filtre service=MAINTENANCE."""
    query: dict = {}
    if user_id:
        query["user_id"] = user_id
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}

    cursor = db.maintenance_assignments.find(query).sort([("date", 1), ("start_hour", 1)])
    assignments = await cursor.to_list(5000)

    # Pre-filtre par service via user_id (uniquement si service fourni et != "ALL")
    user_ids = list({a.get("user_id") for a in assignments if a.get("user_id")})
    user_lookup = {}
    if user_ids:
        users_list = await db.users.find({"id": {"$in": user_ids}}, {
            "_id": 0, "id": 1, "nom": 1, "prenom": 1, "email": 1, "service": 1, "statut": 1
        }).to_list(500)
        for u in users_list:
            user_lookup[u["id"]] = u

    result = []
    for a in assignments:
        u = user_lookup.get(a.get("user_id"))
        # Filtrer service si demande
        if service and service != "ALL":
            if not u:
                continue
            if (u.get("service") or "").upper() != service.upper():
                continue
        a_dict = serialize_doc(a)
        if u:
            a_dict["user_name"] = _user_full_name(u)
            a_dict["user_service"] = u.get("service")
        result.append(a_dict)
    return result


@router.post("/maintenance-assignments", response_model=MaintenanceAssignment, tags=["Activite Maintenance"])
async def create_maintenance_assignment(
    payload: MaintenanceAssignmentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Creer une affectation (admin / responsable maintenance / planning.admin)."""
    if not await _is_maintenance_admin(current_user):
        raise HTTPException(status_code=403, detail="Acces refuse : droit d'affectation requis")

    # Valider que l'utilisateur cible existe
    target_user = await db.users.find_one({"id": payload.user_id}, {
        "_id": 0, "id": 1, "nom": 1, "prenom": 1, "email": 1, "service": 1
    })
    if not target_user:
        raise HTTPException(status_code=404, detail="Utilisateur cible introuvable")

    # Resoudre la couleur
    color = _resolve_color(payload.type.value, payload.category.value if payload.category else None, payload.color)

    # Valider la reference si OT/IMP/MP
    reference_numero = payload.reference_numero
    if payload.type in (MaintenanceAssignmentType.WORK_ORDER, MaintenanceAssignmentType.IMPROVEMENT, MaintenanceAssignmentType.PREVENTIVE_MAINTENANCE):
        if not payload.reference_id:
            raise HTTPException(status_code=400, detail=f"reference_id requis pour le type {payload.type.value}")
        coll_name = {
            MaintenanceAssignmentType.WORK_ORDER: "work_orders",
            MaintenanceAssignmentType.IMPROVEMENT: "improvements",
            MaintenanceAssignmentType.PREVENTIVE_MAINTENANCE: "preventive_maintenances",
        }[payload.type]
        ref = await db.get_collection(coll_name).find_one({"id": payload.reference_id})
        if not ref:
            try:
                ref = await db.get_collection(coll_name).find_one({"_id": ObjectId(payload.reference_id)})
            except Exception:
                ref = None
        if not ref:
            raise HTTPException(status_code=404, detail=f"Reference {payload.reference_id} introuvable dans {coll_name}")
        if not reference_numero:
            reference_numero = ref.get("numero") or ""

    assignment_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": assignment_id,
        "user_id": payload.user_id,
        "date": payload.date,
        "type": payload.type.value,
        "title": payload.title,
        "description": payload.description,
        "duration_hours": payload.duration_hours,
        "start_hour": payload.start_hour,
        "color": color,
        "reference_id": payload.reference_id,
        "reference_numero": reference_numero,
        "category": payload.category.value if payload.category else None,
        "created_by": current_user.get("id"),
        "created_by_name": _user_full_name(current_user),
        "created_at": now_iso,
        "linked_availability_id": None,
    }

    # Si CONGE -> creer/maj la dispo correspondante
    if payload.type == MaintenanceAssignmentType.CONGE:
        try:
            avail_date = datetime.fromisoformat(payload.date).replace(tzinfo=timezone.utc) if "T" not in payload.date else datetime.fromisoformat(payload.date)
            existing_avail = await db.availabilities.find_one({
                "user_id": payload.user_id,
                "date": {"$gte": datetime.combine(avail_date.date(), datetime.min.time()),
                         "$lt": datetime.combine(avail_date.date() + timedelta(days=1), datetime.min.time())}
            })
            if existing_avail:
                await db.availabilities.update_one(
                    {"_id": existing_avail["_id"]},
                    {"$set": {"disponible": False, "motif": payload.title or "Conge"}}
                )
                doc["linked_availability_id"] = str(existing_avail["_id"])
            else:
                avail_doc = {
                    "_id": ObjectId(),
                    "user_id": payload.user_id,
                    "date": datetime.combine(avail_date.date(), datetime.min.time()),
                    "disponible": False,
                    "motif": payload.title or "Conge",
                }
                await db.availabilities.insert_one(avail_doc)
                doc["linked_availability_id"] = str(avail_doc["_id"])
        except Exception as e:
            logger.warning(f"Erreur synchro availability pour CONGE: {e}")

    await db.maintenance_assignments.insert_one(doc)

    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=_user_full_name(current_user),
        user_email=current_user.get("email", ""),
        action=ActionType.CREATE,
        entity_type=EntityType.PLANNING,
        entity_id=assignment_id,
        entity_name=f"{payload.type.value}: {payload.title}",
        details=f"Affectation {payload.duration_hours}h le {payload.date} pour {target_user.get('prenom')} {target_user.get('nom')}"
    )

    try:
        await _get_realtime_manager().emit_event(
            "maintenance_assignments", "created", doc, user_id=current_user["id"]
        )
    except Exception:
        pass

    response = {**doc}
    response["user_name"] = _user_full_name(target_user)
    response["user_service"] = target_user.get("service")
    return response


@router.put("/maintenance-assignments/{assignment_id}", tags=["Activite Maintenance"])
async def update_maintenance_assignment(
    assignment_id: str,
    payload: MaintenanceAssignmentUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Mettre a jour une affectation."""
    if not await _is_maintenance_admin(current_user):
        raise HTTPException(status_code=403, detail="Acces refuse")

    existing = await db.maintenance_assignments.find_one({"id": assignment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Affectation non trouvee")

    update_data = payload.model_dump(exclude_unset=True)
    if "category" in update_data and update_data["category"] is not None:
        update_data["category"] = update_data["category"].value if hasattr(update_data["category"], "value") else update_data["category"]
    # Recalculer la couleur si type/category change
    if "color" not in update_data:
        new_category = update_data.get("category", existing.get("category"))
        update_data["color"] = _resolve_color(existing.get("type"), new_category, None)

    await db.maintenance_assignments.update_one({"id": assignment_id}, {"$set": update_data})

    # Re-synchro availability si CONGE et date change
    if existing.get("type") == "CONGE" and existing.get("linked_availability_id") and "date" in update_data:
        try:
            new_date = datetime.fromisoformat(update_data["date"])
            await db.availabilities.update_one(
                {"_id": ObjectId(existing["linked_availability_id"])},
                {"$set": {"date": datetime.combine(new_date.date(), datetime.min.time())}}
            )
        except Exception as e:
            logger.warning(f"Erreur resynchro availability: {e}")

    updated = await db.maintenance_assignments.find_one({"id": assignment_id})
    return serialize_doc(updated)


@router.delete("/maintenance-assignments/{assignment_id}", response_model=MessageResponse, tags=["Activite Maintenance"])
async def delete_maintenance_assignment(
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Supprimer une affectation."""
    if not await _is_maintenance_admin(current_user):
        raise HTTPException(status_code=403, detail="Acces refuse")

    existing = await db.maintenance_assignments.find_one({"id": assignment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Affectation non trouvee")

    # Si CONGE -> supprimer la dispo liee
    if existing.get("linked_availability_id"):
        try:
            await db.availabilities.delete_one({"_id": ObjectId(existing["linked_availability_id"])})
        except Exception as e:
            logger.warning(f"Erreur suppression dispo liee: {e}")

    await db.maintenance_assignments.delete_one({"id": assignment_id})

    try:
        await _get_realtime_manager().emit_event(
            "maintenance_assignments", "deleted", {"id": assignment_id}, user_id=current_user["id"]
        )
    except Exception:
        pass

    return {"message": "Affectation supprimee"}


# ==================== POOL DES TACHES NON AFFECTEES ====================

@router.get("/maintenance-assignments/unassigned-pool", tags=["Activite Maintenance"])
async def get_unassigned_pool(
    service: Optional[str] = "MAINTENANCE",
    current_user: dict = Depends(require_permission("planning", "view"))
):
    """Retourne les OT, ameliorations et MP non termines, classes par priorite et date limite,
    pour permettre l'affectation par drag & drop."""
    items = []

    # Work orders non termines
    wos = await db.work_orders.find(
        {"statut": {"$nin": ["TERMINE"]}, "deleted_at": {"$in": [None, "", False, 0]}},
        {"_id": 0, "id": 1, "numero": 1, "titre": 1, "priorite": 1, "dateLimite": 1, "tempsEstime": 1, "statut": 1, "assigne_a_id": 1, "assigne_service": 1}
    ).sort([("priorite", -1), ("dateLimite", 1)]).to_list(500)
    for wo in wos:
        wo_id = wo.get("id")
        if not wo_id:
            continue
        title = (wo.get("titre") or "").strip() or (f"#{wo.get('numero')}" if wo.get("numero") else "(Sans titre)")
        items.append({
            "type": "WORK_ORDER",
            "id": wo_id,
            "numero": wo.get("numero") or "",
            "title": title,
            "priorite": wo.get("priorite"),
            "dateLimite": wo.get("dateLimite").isoformat() if wo.get("dateLimite") and hasattr(wo.get("dateLimite"), "isoformat") else wo.get("dateLimite"),
            "duration_hours": float(wo.get("tempsEstime") or 1.0),
            "statut": wo.get("statut"),
            "assigne_a_id": wo.get("assigne_a_id"),
            "assigne_service": wo.get("assigne_service"),
        })

    # Improvements
    imps = await db.improvements.find(
        {"statut": {"$nin": ["TERMINE"]}, "deleted_at": {"$in": [None, "", False, 0]}},
        {"_id": 0, "id": 1, "numero": 1, "titre": 1, "priorite": 1, "dateLimite": 1, "tempsEstime": 1, "statut": 1, "assigne_a_id": 1}
    ).sort([("priorite", -1), ("dateLimite", 1)]).to_list(500)
    for imp in imps:
        imp_id = imp.get("id")
        if not imp_id:
            continue
        title = (imp.get("titre") or "").strip() or (f"#{imp.get('numero')}" if imp.get("numero") else "(Sans titre)")
        items.append({
            "type": "IMPROVEMENT",
            "id": imp_id,
            "numero": imp.get("numero") or "",
            "title": title,
            "priorite": imp.get("priorite"),
            "dateLimite": imp.get("dateLimite").isoformat() if imp.get("dateLimite") and hasattr(imp.get("dateLimite"), "isoformat") else imp.get("dateLimite"),
            "duration_hours": float(imp.get("tempsEstime") or 1.0),
            "statut": imp.get("statut"),
            "assigne_a_id": imp.get("assigne_a_id"),
        })

    # Preventive maintenances dont la prochaine echeance est dans les 30 prochains jours
    horizon = datetime.now(timezone.utc) + timedelta(days=30)
    pms = await db.preventive_maintenances.find(
        {"statut": "ACTIF", "prochaineMaintenance": {"$lte": horizon}},
        {"_id": 0, "id": 1, "titre": 1, "priorite": 1, "prochaineMaintenance": 1, "dureeEstimee": 1, "assigne_a_id": 1}
    ).sort("prochaineMaintenance", 1).to_list(200)
    for pm in pms:
        pm_id = pm.get("id")
        if not pm_id:
            continue
        title = (pm.get("titre") or "").strip() or "(MP sans titre)"
        items.append({
            "type": "PREVENTIVE_MAINTENANCE",
            "id": pm_id,
            "numero": "",
            "title": title,
            "priorite": pm.get("priorite") or "AUCUNE",
            "dateLimite": pm.get("prochaineMaintenance").isoformat() if pm.get("prochaineMaintenance") and hasattr(pm.get("prochaineMaintenance"), "isoformat") else pm.get("prochaineMaintenance"),
            "duration_hours": float(pm.get("dureeEstimee") or 1.0),
            "statut": "PLANIFIE",
            "assigne_a_id": pm.get("assigne_a_id"),
        })

    return items


# ==================== AUTO-FIT (Proposition C) ====================

@router.post("/maintenance-assignments/auto-suggest", tags=["Activite Maintenance"])
async def auto_suggest_assignments(
    start_date: str,
    end_date: str,
    apply: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Propose une repartition automatique des OT/IMP/PM non affectes sur la semaine
    selon priorite et capacite (8h/jour). Si apply=true, cree directement les affectations."""
    if not await _is_maintenance_admin(current_user):
        raise HTTPException(status_code=403, detail="Acces refuse")

    # Recuperer les techniciens du service Maintenance
    techs_raw = await db.users.find(
        {"service": "MAINTENANCE", "statut": {"$in": ["actif", "ACTIF"]}},
        {"_id": 0, "id": 1, "nom": 1, "prenom": 1}
    ).to_list(50)
    # Exclure les users legacy sans champ id (sinon KeyError plus bas)
    techs = [t for t in techs_raw if t.get("id")]
    if not techs:
        return {"suggestions": [], "warning": "Aucun technicien Maintenance actif trouve"}

    # Recuperer le pool
    pool = await get_unassigned_pool(service="MAINTENANCE", current_user=current_user)
    # Filtrer ce qui n'est pas deja affecte sur la periode
    existing = await db.maintenance_assignments.find({
        "date": {"$gte": start_date, "$lte": end_date},
        "type": {"$in": ["WORK_ORDER", "IMPROVEMENT", "PREVENTIVE_MAINTENANCE"]}
    }).to_list(5000)
    already_planned_ids = {a.get("reference_id") for a in existing if a.get("reference_id")}
    pool = [p for p in pool if p.get("id") not in already_planned_ids]

    # Tri par priorite : HAUTE > MOYENNE > BASSE > AUCUNE puis par dateLimite
    PRIO_RANK = {"HAUTE": 0, "MOYENNE": 1, "BASSE": 2, "AUCUNE": 3, "NORMALE": 3, None: 4}
    pool.sort(key=lambda x: (PRIO_RANK.get(x.get("priorite"), 4), x.get("dateLimite") or "9999"))

    # Generer les jours ouvres (Lun-Ven) entre start et end
    sd = datetime.fromisoformat(start_date).date()
    ed = datetime.fromisoformat(end_date).date()
    days = []
    d = sd
    while d <= ed:
        if d.weekday() < 5:  # 0=lun, 4=ven
            days.append(d.isoformat())
        d += timedelta(days=1)

    # Charge actuelle par tech-jour
    load = {(t["id"], dy): 0.0 for t in techs for dy in days}
    for a in existing:
        key = (a.get("user_id"), a.get("date"))
        if key in load:
            load[key] += a.get("duration_hours", 0)

    # Detecter les conges/indispos
    indispos = set()
    avs = await db.availabilities.find({"disponible": False}).to_list(2000)
    for av in avs:
        try:
            day_str = av.get("date").date().isoformat() if hasattr(av.get("date"), "date") else str(av.get("date"))[:10]
            indispos.add((av.get("user_id"), day_str))
        except Exception:
            pass

    suggestions = []
    for item in pool:
        # Trouver le meilleur (tech, jour) avec charge la plus faible
        best = None
        best_load = 99
        target_user_id = item.get("assigne_a_id")  # privilegier l'assignee si defini
        candidates_techs = [t for t in techs if not target_user_id or t["id"] == target_user_id]
        if not candidates_techs:
            candidates_techs = techs
        for t in candidates_techs:
            for dy in days:
                if (t["id"], dy) in indispos:
                    continue
                if load[(t["id"], dy)] + item["duration_hours"] > 8.0:
                    continue
                if load[(t["id"], dy)] < best_load:
                    best_load = load[(t["id"], dy)]
                    best = (t, dy)
        if not best:
            continue
        t, dy = best
        load[(t["id"], dy)] += item["duration_hours"]
        suggestions.append({
            "user_id": t["id"],
            "user_name": _user_full_name(t),
            "date": dy,
            "type": item["type"],
            "reference_id": item["id"],
            "reference_numero": item.get("numero"),
            "title": item["title"],
            "duration_hours": item["duration_hours"],
        })

    if apply:
        for s in suggestions:
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": s["user_id"],
                "date": s["date"],
                "type": s["type"],
                "title": s["title"],
                "description": "Suggere par auto-fit",
                "duration_hours": s["duration_hours"],
                "start_hour": None,
                "color": _resolve_color(s["type"], None, None),
                "reference_id": s["reference_id"],
                "reference_numero": s["reference_numero"],
                "category": None,
                "created_by": current_user.get("id"),
                "created_by_name": _user_full_name(current_user),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "linked_availability_id": None,
            }
            await db.maintenance_assignments.insert_one(doc)

    return {"suggestions": suggestions, "applied": apply, "count": len(suggestions)}
