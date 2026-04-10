"""
Routes API pour la gestion d'équipe et le pointage
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import uuid
import logging

from models import (
    TeamMember, TeamMemberCreate, TeamMemberUpdate, MemberType,
    TimeEntry, TimeEntryCreate, TimeEntryManual, TimeEntryStatus, TimeEntrySource,
    Absence, AbsenceCreate, AbsenceType,
    OvertimeBalance, WorkRhythm, WorkRhythmCreate, WorkRhythmConfig
)
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/team", tags=["Team Management"])

# Variable globale pour la base de données
db = None

def set_database(database):
    """Initialise la connexion à la base de données"""
    global db
    db = database


def serialize_doc(doc):
    """Convert MongoDB document to JSON serializable format"""
    if doc is None:
        return None
    if "_id" in doc:
        del doc["_id"]
    return doc


# Rythmes de travail par défaut
DEFAULT_WORK_RHYTHMS = {
    "journee": {
        "code": "journee",
        "name": "Journée",
        "config": {
            "default_start": "08:00",
            "default_end": "17:00",
            "break_start": "12:00",
            "break_end": "13:00",
            "break_duration_minutes": 60,
            "weekly_hours": 35.0
        },
        "is_system": True
    },
    "2x8_matin": {
        "code": "2x8_matin",
        "name": "2x8 Matin",
        "config": {
            "default_start": "05:00",
            "default_end": "13:00",
            "break_start": "09:00",
            "break_end": "09:30",
            "break_duration_minutes": 30,
            "weekly_hours": 35.0
        },
        "is_system": True
    },
    "2x8_aprem": {
        "code": "2x8_aprem",
        "name": "2x8 Après-midi",
        "config": {
            "default_start": "13:00",
            "default_end": "21:00",
            "break_start": "17:00",
            "break_end": "17:30",
            "break_duration_minutes": 30,
            "weekly_hours": 35.0
        },
        "is_system": True
    },
    "3x8_matin": {
        "code": "3x8_matin",
        "name": "3x8 Matin",
        "config": {
            "default_start": "05:00",
            "default_end": "13:00",
            "break_start": "09:00",
            "break_end": "09:20",
            "break_duration_minutes": 20,
            "weekly_hours": 35.0
        },
        "is_system": True
    },
    "3x8_aprem": {
        "code": "3x8_aprem",
        "name": "3x8 Après-midi",
        "config": {
            "default_start": "13:00",
            "default_end": "21:00",
            "break_start": "17:00",
            "break_end": "17:20",
            "break_duration_minutes": 20,
            "weekly_hours": 35.0
        },
        "is_system": True
    },
    "3x8_nuit": {
        "code": "3x8_nuit",
        "name": "3x8 Nuit",
        "config": {
            "default_start": "21:00",
            "default_end": "05:00",
            "break_start": "01:00",
            "break_end": "01:20",
            "break_duration_minutes": 20,
            "weekly_hours": 35.0
        },
        "is_system": True
    },
    "nuit": {
        "code": "nuit",
        "name": "Nuit",
        "config": {
            "default_start": "21:00",
            "default_end": "05:00",
            "break_start": "01:00",
            "break_end": "01:30",
            "break_duration_minutes": 30,
            "weekly_hours": 35.0
        },
        "is_system": True
    }
}


async def get_user_service(current_user: dict) -> Optional[str]:
    """Récupère le service de l'utilisateur (via responsable ou user)"""
    user_role = current_user.get("role")
    user_id = current_user.get("id")
    
    if user_role == "ADMIN":
        return None  # Admin voit tout
    
    # Vérifier si responsable de service
    responsable = await db.service_responsables.find_one({"user_id": user_id})
    if responsable:
        return responsable.get("service")
    
    # Sinon, utiliser le service de l'utilisateur
    return current_user.get("service")


async def check_team_access(current_user: dict, service: str = None, member_id: str = None):
    """Vérifie l'accès à la gestion d'équipe"""
    user_role = current_user.get("role")
    user_id = current_user.get("id")
    
    if user_role == "ADMIN":
        return True
    
    # Vérifier si responsable de service
    responsable = await db.service_responsables.find_one({"user_id": user_id})
    if not responsable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous devez être responsable de service pour gérer l'équipe"
        )
    
    user_service = responsable.get("service")
    
    if service and service != user_service:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous ne pouvez gérer que votre propre service"
        )
    
    if member_id:
        member = await db.team_members.find_one({"id": member_id})
        if member and member.get("service") != user_service:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ce membre n'appartient pas à votre service"
            )
    
    return user_service


def calculate_worked_hours(clock_in: str, clock_out: str, break_duration_minutes: int) -> float:
    """Calcule les heures travaillées"""
    if not clock_in or not clock_out:
        return 0.0
    
    try:
        start = datetime.strptime(clock_in, "%H:%M")
        end = datetime.strptime(clock_out, "%H:%M")
        
        # Gestion du passage de minuit
        if end < start:
            end += timedelta(days=1)
        
        total_minutes = (end - start).total_seconds() / 60
        worked_minutes = total_minutes - break_duration_minutes
        
        return round(worked_minutes / 60, 2)
    except:
        return 0.0


def get_work_rhythm_config(rhythm_code: str) -> dict:
    """Récupère la configuration d'un rythme de travail"""
    if rhythm_code in DEFAULT_WORK_RHYTHMS:
        return DEFAULT_WORK_RHYTHMS[rhythm_code]["config"]
    return DEFAULT_WORK_RHYTHMS["journee"]["config"]


# ==================== WORK RHYTHMS ====================

@router.get("/work-rhythms")
async def get_work_rhythms(current_user: dict = Depends(get_current_user)):
    """Liste des rythmes de travail disponibles"""
    rhythms = []
    
    # Ajouter les rythmes par défaut
    for code, rhythm in DEFAULT_WORK_RHYTHMS.items():
        rhythms.append({
            "id": code,
            "code": rhythm["code"],
            "name": rhythm["name"],
            "config": rhythm["config"],
            "is_system": rhythm["is_system"]
        })
    
    # Ajouter les rythmes personnalisés depuis la DB
    custom_rhythms = await db.work_rhythms.find({}).to_list(50)
    for r in custom_rhythms:
        rhythms.append(serialize_doc(r))
    
    return rhythms


# ==================== TEAM MEMBERS ====================

@router.get("/members")
async def get_team_members(
    service: Optional[str] = None,
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Liste des membres de l'équipe (permanents + temporaires)"""
    user_service = await get_user_service(current_user)
    
    # Construire le filtre
    query = {}
    if user_service:
        query["service"] = user_service
    elif service:
        query["service"] = service
    
    if not include_inactive:
        query["is_active"] = True
    
    # Récupérer les membres temporaires
    temp_members = await db.team_members.find(query).to_list(200)
    
    # Récupérer les utilisateurs permanents du service (actifs uniquement)
    user_query = {"service": query.get("service")} if query.get("service") else {}
    # Exclure les inactifs (nouveau champ statut + legacy actif=False)
    user_query["statut"] = {"$not": {"$regex": "^inactif$", "$options": "i"}}
    user_query["actif"] = {"$ne": False}
    users = await db.users.find(user_query, {"password": 0}).to_list(200)
    
    result = []
    
    # Ajouter les utilisateurs permanents
    for user in users:
        user_id = str(user.get("_id", "")) if user.get("_id") else user.get("id", "")
        result.append({
            "id": user_id,
            "type": "user",
            "user_id": user_id,
            "nom": user.get("nom", ""),
            "prenom": user.get("prenom", ""),
            "service": user.get("service", ""),
            "poste": user.get("poste", user.get("role", "")),
            "email": user.get("email", ""),
            "work_rhythm": user.get("work_rhythm", "journee"),
            "work_rhythm_config": get_work_rhythm_config(user.get("work_rhythm", "journee")),
            "competences": user.get("competences", []),
            "is_active": user.get("is_active", True),
            "mission_start": None,
            "mission_end": None
        })
    
    # Ajouter les membres temporaires
    for member in temp_members:
        member_data = serialize_doc(member)
        member_data["type"] = "temporary"
        # S'assurer que work_rhythm_config est présent
        if not member_data.get("work_rhythm_config"):
            member_data["work_rhythm_config"] = get_work_rhythm_config(member_data.get("work_rhythm", "journee"))
        result.append(member_data)
    
    return result


@router.post("/members", response_model=TeamMember)
async def create_team_member(
    member: TeamMemberCreate,
    current_user: dict = Depends(get_current_user)
):
    """Ajouter un membre temporaire (intérimaire)"""
    await check_team_access(current_user, service=member.service)
    
    # Si pas de config de rythme spécifiée, utiliser celle par défaut
    rhythm_config = member.work_rhythm_config
    if not rhythm_config:
        rhythm_config = WorkRhythmConfig(**get_work_rhythm_config(member.work_rhythm))
    
    member_data = {
        "id": str(uuid.uuid4()),
        "type": MemberType.TEMPORARY.value,
        "user_id": None,
        "nom": member.nom,
        "prenom": member.prenom,
        "service": member.service,
        "poste": member.poste,
        "mission_start": member.mission_start,
        "mission_end": member.mission_end,
        "work_rhythm": member.work_rhythm,
        "work_rhythm_config": rhythm_config.model_dump() if hasattr(rhythm_config, 'model_dump') else rhythm_config,
        "competences": member.competences,
        "badge_id": member.badge_id,
        "notes": member.notes,
        "is_active": True,
        "created_by": current_user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.team_members.insert_one(member_data)
    
    logger.info(f"👤 Membre temporaire ajouté: {member.prenom} {member.nom} ({member.service})")
    
    return TeamMember(**serialize_doc(member_data))


@router.get("/members/{member_id}")
async def get_team_member(
    member_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer un membre spécifique"""
    # Essayer de trouver dans team_members (temporaires)
    member = await db.team_members.find_one({"id": member_id})
    
    if member:
        await check_team_access(current_user, service=member.get("service"))
        return serialize_doc(member)
    
    # Sinon chercher dans users
    user = await db.users.find_one({"id": member_id}, {"password": 0})
    if not user:
        try:
            user = await db.users.find_one({"_id": ObjectId(member_id)}, {"password": 0})
        except:
            pass
    
    if user:
        user_service = user.get("service")
        await check_team_access(current_user, service=user_service)
        
        user_id = str(user.get("_id", "")) if user.get("_id") else user.get("id", "")
        return {
            "id": user_id,
            "type": "user",
            "user_id": user_id,
            "nom": user.get("nom", ""),
            "prenom": user.get("prenom", ""),
            "service": user.get("service", ""),
            "poste": user.get("poste", ""),
            "work_rhythm": user.get("work_rhythm", "journee"),
            "work_rhythm_config": get_work_rhythm_config(user.get("work_rhythm", "journee")),
            "is_active": user.get("is_active", True)
        }
    
    raise HTTPException(status_code=404, detail="Membre non trouvé")


@router.put("/members/{member_id}", response_model=TeamMember)
async def update_team_member(
    member_id: str,
    member_update: TeamMemberUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Modifier un membre temporaire"""
    member = await db.team_members.find_one({"id": member_id})
    
    if not member:
        raise HTTPException(status_code=404, detail="Membre temporaire non trouvé")
    
    await check_team_access(current_user, service=member.get("service"))
    
    update_data = {k: v for k, v in member_update.model_dump().items() if v is not None}
    
    if "work_rhythm_config" in update_data and hasattr(update_data["work_rhythm_config"], 'model_dump'):
        update_data["work_rhythm_config"] = update_data["work_rhythm_config"].model_dump()
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.team_members.update_one({"id": member_id}, {"$set": update_data})
    
    updated_member = await db.team_members.find_one({"id": member_id})
    
    logger.info(f"👤 Membre temporaire modifié: {member_id}")
    
    return TeamMember(**serialize_doc(updated_member))


@router.delete("/members/{member_id}")
async def delete_team_member(
    member_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Supprimer un membre temporaire"""
    member = await db.team_members.find_one({"id": member_id})
    
    if not member:
        raise HTTPException(status_code=404, detail="Membre temporaire non trouvé")
    
    await check_team_access(current_user, service=member.get("service"))
    
    await db.team_members.delete_one({"id": member_id})
    
    logger.info(f"👤 Membre temporaire supprimé: {member_id}")
    
    return {"message": "Membre supprimé avec succès"}


# ==================== PRESENCE / STATUS ====================

@router.get("/presence")
async def get_team_presence(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer l'état de présence de l'équipe pour une date"""
    user_service = await get_user_service(current_user)
    
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Récupérer tous les membres de l'équipe
    members = await get_team_members(service=user_service, current_user=current_user)
    
    # Récupérer les pointages du jour
    time_query = {"date": date}
    if user_service:
        time_query["service"] = user_service
    
    time_entries = await db.time_entries.find(time_query).to_list(200)
    time_entries_map = {te["member_id"]: serialize_doc(te) for te in time_entries}
    
    # Récupérer les absences actives
    absence_query = {
        "start_date": {"$lte": date},
        "end_date": {"$gte": date}
    }
    if user_service:
        absence_query["service"] = user_service
    
    absences = await db.absences.find(absence_query).to_list(200)
    absences_map = {a["member_id"]: serialize_doc(a) for a in absences}
    
    result = []
    for member in members:
        member_id = member["id"]
        time_entry = time_entries_map.get(member_id)
        absence = absences_map.get(member_id)
        
        presence_status = "not_started"
        if absence:
            presence_status = "absent"
        elif time_entry:
            if time_entry.get("clock_in") and time_entry.get("clock_out"):
                presence_status = "complete"
            elif time_entry.get("clock_in"):
                presence_status = "working"
        
        result.append({
            "member": member,
            "time_entry": time_entry,
            "absence": absence,
            "presence_status": presence_status
        })
    
    return {
        "date": date,
        "service": user_service,
        "members": result,
        "summary": {
            "total": len(result),
            "present": sum(1 for r in result if r["presence_status"] in ["working", "complete"]),
            "absent": sum(1 for r in result if r["presence_status"] == "absent"),
            "not_started": sum(1 for r in result if r["presence_status"] == "not_started")
        }
    }


# ==================== WORKLOAD ====================

@router.get("/workload")
async def get_team_workload(
    current_user: dict = Depends(get_current_user)
):
    """Vue globale de la charge de travail de l'équipe"""
    user_service = await get_user_service(current_user)
    
    # Récupérer les membres
    members = await get_team_members(service=user_service, current_user=current_user)
    
    result = []
    for member in members:
        member_id = member["id"]
        
        # Compter les OT assignés
        wo_query = {"assigne_a_id": member_id, "statut": {"$nin": ["TERMINE", "CLOTURE"]}}
        if user_service:
            wo_query["service"] = user_service
        
        assigned_wos = await db.work_orders.find(wo_query).to_list(50)
        
        # Calculer les heures estimées
        estimated_hours = sum(wo.get("tempsEstime", 0) or 0 for wo in assigned_wos)
        
        # Heures théoriques hebdo
        rhythm_config = member.get("work_rhythm_config", {})
        weekly_hours = rhythm_config.get("weekly_hours", 35)
        
        # Charge en pourcentage
        load_percentage = round((estimated_hours / weekly_hours * 100) if weekly_hours > 0 else 0, 1)
        
        result.append({
            "member": member,
            "assigned_work_orders": len(assigned_wos),
            "estimated_hours": estimated_hours,
            "weekly_capacity": weekly_hours,
            "load_percentage": min(load_percentage, 200),  # Cap à 200%
            "work_orders": [
                {
                    "id": wo.get("id"),
                    "numero": wo.get("numero"),
                    "titre": wo.get("titre"),
                    "priorite": wo.get("priorite"),
                    "temps_estime": wo.get("tempsEstime", 0)
                }
                for wo in assigned_wos[:10]  # Limiter à 10
            ]
        })
    
    # Trier par charge décroissante
    result.sort(key=lambda x: x["load_percentage"], reverse=True)
    
    return {
        "service": user_service,
        "members": result,
        "summary": {
            "total_members": len(result),
            "overloaded": sum(1 for r in result if r["load_percentage"] > 100),
            "underloaded": sum(1 for r in result if r["load_percentage"] < 50),
            "average_load": round(sum(r["load_percentage"] for r in result) / len(result) if result else 0, 1)
        }
    }


# ==================== DASHBOARD ====================

@router.get("/dashboard")
async def get_team_dashboard(
    period: str = "week",  # day, week, month
    current_user: dict = Depends(get_current_user)
):
    """Tableau de bord de l'équipe avec KPIs"""
    user_service = await get_user_service(current_user)
    
    # Calculer les dates selon la période
    today = datetime.now(timezone.utc)
    if period == "day":
        start_date = today.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_date = today - timedelta(days=today.weekday())
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    else:  # month
        start_date = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    start_date_str = start_date.strftime("%Y-%m-%d")
    end_date_str = today.strftime("%Y-%m-%d")
    
    # Récupérer les membres
    members = await get_team_members(service=user_service, current_user=current_user)
    total_members = len(members)
    
    # Pointages de la période
    time_query = {
        "date": {"$gte": start_date_str, "$lte": end_date_str}
    }
    if user_service:
        time_query["service"] = user_service
    
    time_entries = await db.time_entries.find(time_query).to_list(1000)
    
    # Calculer les stats
    total_worked_hours = sum(te.get("worked_hours", 0) for te in time_entries)
    total_overtime = sum(te.get("overtime_hours", 0) for te in time_entries if te.get("overtime_hours", 0) > 0)
    
    # Présences par jour
    presence_by_day = {}
    for te in time_entries:
        day = te.get("date")
        if day not in presence_by_day:
            presence_by_day[day] = 0
        if te.get("status") != "absent":
            presence_by_day[day] += 1
    
    avg_presence_rate = round(
        (sum(presence_by_day.values()) / (len(presence_by_day) * total_members) * 100)
        if presence_by_day and total_members > 0 else 0, 1
    )
    
    # OT terminés dans la période
    wo_query = {
        "statut": {"$in": ["TERMINE", "CLOTURE"]},
        "dateTermine": {"$gte": start_date.isoformat()}
    }
    if user_service:
        wo_query["service"] = user_service
    
    completed_wos = await db.work_orders.count_documents(wo_query)
    
    # Absences
    absence_query = {
        "start_date": {"$lte": end_date_str},
        "end_date": {"$gte": start_date_str}
    }
    if user_service:
        absence_query["service"] = user_service
    
    absences = await db.absences.find(absence_query).to_list(100)
    absence_days = sum(a.get("days_count", 1) for a in absences)
    
    return {
        "period": period,
        "start_date": start_date_str,
        "end_date": end_date_str,
        "service": user_service,
        "kpis": {
            "total_members": total_members,
            "presence_rate": avg_presence_rate,
            "total_worked_hours": round(total_worked_hours, 1),
            "total_overtime_hours": round(total_overtime, 1),
            "completed_work_orders": completed_wos,
            "absence_days": absence_days
        },
        "charts_data": {
            "presence_by_day": [
                {"date": day, "count": count}
                for day, count in sorted(presence_by_day.items())
            ]
        }
    }


# ==================== OVERTIME ====================

@router.get("/overtime")
async def get_team_overtime(
    year: int = None,
    month: int = None,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer les heures supplémentaires de l'équipe"""
    user_service = await get_user_service(current_user)
    
    if not year:
        year = datetime.now(timezone.utc).year
    if not month:
        month = datetime.now(timezone.utc).month
    
    # Calculer les dates du mois
    start_date = f"{year}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{month + 1:02d}-01"
    
    # Récupérer les pointages du mois
    time_query = {
        "date": {"$gte": start_date, "$lt": end_date}
    }
    if user_service:
        time_query["service"] = user_service
    
    time_entries = await db.time_entries.find(time_query).to_list(1000)
    
    # Agréger par membre
    overtime_by_member = {}
    for te in time_entries:
        member_id = te.get("member_id")
        if member_id not in overtime_by_member:
            overtime_by_member[member_id] = {
                "member_id": member_id,
                "member_name": te.get("member_name", ""),
                "total_worked": 0,
                "total_overtime": 0,
                "days_worked": 0
            }
        
        overtime_by_member[member_id]["total_worked"] += te.get("worked_hours", 0)
        overtime_by_member[member_id]["total_overtime"] += max(0, te.get("overtime_hours", 0))
        overtime_by_member[member_id]["days_worked"] += 1
    
    result = list(overtime_by_member.values())
    result.sort(key=lambda x: x["total_overtime"], reverse=True)
    
    return {
        "year": year,
        "month": month,
        "service": user_service,
        "members": result,
        "summary": {
            "total_overtime_hours": round(sum(r["total_overtime"] for r in result), 1),
            "members_with_overtime": sum(1 for r in result if r["total_overtime"] > 0)
        }
    }
