"""
Routes du gestionnaire de service - Status, equipes, stats
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
import logging

from models import ActionType, EntityType
from dependencies import get_current_user, require_permission
from openapi_config import STANDARD_ERRORS
from routes.shared import db, audit_service, serialize_doc

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Service Manager"])


@router.get("/service-manager/status", tags=["Service Manager"],
    summary="Statut du service",
    description="Retourne le statut operationnel du service : equipements en maintenance, ordres de travail en cours, alertes actives.",
    responses={**STANDARD_ERRORS}
)
async def get_service_manager_status(current_user: dict = Depends(get_current_user)):
    """Vérifie si l'utilisateur est un responsable de service et retourne ses services"""
    from service_filter import is_service_manager, get_user_managed_services, get_user_service_filter
    
    is_manager = await is_service_manager(current_user)
    managed_services = await get_user_managed_services(current_user)
    service_filter = await get_user_service_filter(current_user)
    
    return {
        "is_service_manager": is_manager,
        "managed_services": managed_services,
        "service_filter": service_filter,
        "user_service": current_user.get("service"),
        "user_role": current_user.get("role")
    }


@router.get("/service-manager/team", tags=["Service Manager"],
    summary="Equipe du service",
    description="Retourne la liste des membres de l'equipe du service avec leur activite recente.",
    responses={**STANDARD_ERRORS}
)
async def get_service_team(current_user: dict = Depends(get_current_user)):
    """Récupère les membres de l'équipe du responsable de service"""
    from service_filter import is_service_manager, get_service_team_members
    
    is_manager = await is_service_manager(current_user)
    if not is_manager:
        raise HTTPException(status_code=403, detail="Vous n'êtes pas responsable de service")
    
    team = await get_service_team_members(current_user)
    
    # Nettoyer les données sensibles
    for member in team:
        member.pop("password", None)
        member.pop("hashed_password", None)
    
    return {
        "team_count": len(team),
        "team_members": team
    }


@router.get("/service-manager/stats", tags=["Service Manager"],
    summary="Statistiques du service",
    description="Retourne les KPIs du service : nombre d'OT, temps moyen de resolution, taux de completion.",
    responses={**STANDARD_ERRORS}
)
async def get_service_manager_stats(current_user: dict = Depends(get_current_user)):
    """Statistiques du service pour le responsable"""
    from service_filter import is_service_manager, get_user_service_filter
    
    is_manager = await is_service_manager(current_user)
    if not is_manager:
        raise HTTPException(status_code=403, detail="Vous n'êtes pas responsable de service")
    
    service_filter = await get_user_service_filter(current_user)
    
    # Construire la requête de filtrage
    query = {}
    if service_filter:
        query["service"] = service_filter
    
    # Statistiques des ordres de travail
    ot_total = await db.work_orders.count_documents(query)
    ot_en_cours = await db.work_orders.count_documents({**query, "status": "EN_COURS"})
    ot_en_attente = await db.work_orders.count_documents({**query, "status": "EN_ATTENTE"})
    ot_termines = await db.work_orders.count_documents({**query, "status": {"$in": ["TERMINE", "CLOTURE"]}})
    
    # Statistiques des équipements
    eq_total = await db.equipments.count_documents(query)
    eq_panne = await db.equipments.count_documents({**query, "status": "EN_PANNE"})
    
    # Statistiques des demandes d'intervention (exclure les supprimees)
    di_en_attente = await db.intervention_requests.count_documents({**query, "status": "EN_ATTENTE", "deleted_at": {"$exists": False}})
    
    # Membres de l'équipe
    team_count = await db.users.count_documents(query) if service_filter else 0
    
    return {
        "service": service_filter or "Tous",
        "work_orders": {
            "total": ot_total,
            "en_cours": ot_en_cours,
            "en_attente": ot_en_attente,
            "termines": ot_termines,
            "taux_completion": round((ot_termines / ot_total * 100) if ot_total > 0 else 0, 1)
        },
        "equipments": {
            "total": eq_total,
            "en_panne": eq_panne,
            "taux_disponibilite": round(((eq_total - eq_panne) / eq_total * 100) if eq_total > 0 else 100, 1)
        },
        "demandes_intervention": {
            "en_attente": di_en_attente
        },
        "team": {
            "count": team_count
        }
    }




@router.get("/assignment-targets", tags=["Utilisateurs"])
async def get_assignment_targets(current_user: dict = Depends(get_current_user)):
    """Retourne les cibles d'assignation : services (pôles) en premier, puis utilisateurs triés par ordre alphabétique."""
    import re
    # Récupérer la liste canonique des services depuis service_responsables
    service_entries = await db.service_responsables.find({}, {"_id": 0}).to_list(length=200)
    service_names = sorted(set(e.get("service", "") for e in service_entries if e.get("service")))

    poles = []
    for svc in service_names:
        # Compter les vrais membres du service depuis users.service (insensible a la casse)
        svc_regex = re.compile(f"^{re.escape(svc)}$", re.IGNORECASE)
        member_count = await db.users.count_documents({
            "service": svc_regex,
            "$or": [{"actif": True}, {"statut": "actif"}],
            "deleted_at": {"$exists": False}
        })
        poles.append({
            "id": f"service:{svc}",
            "nom": svc,
            "type": "service",
            "membres": member_count
        })

    # Récupérer les utilisateurs actifs triés par nom
    users_cursor = db.users.find(
        {"$or": [{"actif": True}, {"statut": "actif"}], "deleted_at": {"$exists": False}},
        {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "role": 1, "email": 1}
    ).sort([("nom", 1), ("prenom", 1)])
    users = []
    async for u in users_cursor:
        user_id = u.get("id", "")
        if not user_id:
            continue
        users.append({
            "id": user_id,
            "nom": u.get("nom", ""),
            "prenom": u.get("prenom", ""),
            "role": u.get("role", ""),
            "type": "user"
        })

    return {"poles": poles, "users": users}


