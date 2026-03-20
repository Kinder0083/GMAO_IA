"""
Routes des Rapports et Analytiques
Extrait de server.py pour une meilleure maintenabilité.
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from typing import List
import logging

from models import ActionType, EntityType
from dependencies import get_current_user, require_permission
from routes.shared import db, audit_service, serialize_doc, find_user_flexible

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Rapports"])

@router.get("/reports/analytics")
async def get_analytics(
    period: str = "MOIS",
    current_user: dict = Depends(require_permission("reports", "view"))
):
    """Obtenir les données analytiques générales, filtrées par période"""
    from datetime import datetime, timezone
    from dateutil.relativedelta import relativedelta

    now = datetime.now()

    # Calculer la date de début selon la période
    if period == "SEMAINE":
        # Lundi de la semaine en cours
        start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "TRIMESTRE":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start_date = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "ANNEE":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:  # MOIS par défaut
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    base_filter = {"deleted_at": {"$exists": False}}
    period_filter = {**base_filter, "dateCreation": {"$gte": start_date}}

    # Work orders stats filtrés par période
    wo_by_status = {}
    for s in ["OUVERT", "EN_COURS", "EN_ATTENTE", "TERMINE"]:
        wo_by_status[s] = await db.work_orders.count_documents({**period_filter, "statut": s})

    wo_by_priority = {}
    for p in ["HAUTE", "MOYENNE", "BASSE", "AUCUNE"]:
        wo_by_priority[p] = await db.work_orders.count_documents({**period_filter, "priorite": p})

    # Equipment stats (statut actuel, pas filtré par période)
    eq_by_status = {}
    for s in ["OPERATIONNEL", "EN_MAINTENANCE", "HORS_SERVICE"]:
        eq_by_status[s] = await db.equipments.count_documents({"statut": s})

    # Taux de réalisation sur la période
    total_wo_period = await db.work_orders.count_documents(period_filter)
    termine_wo_period = await db.work_orders.count_documents({**period_filter, "statut": "TERMINE"})
    taux_realisation = round((termine_wo_period / total_wo_period * 100) if total_wo_period > 0 else 0)

    # MTTR sur la période
    mttr_pipeline = [
        {"$match": {**period_filter, "statut": "TERMINE", "dateTermine": {"$exists": True}}},
        {"$project": {"duration": {"$subtract": ["$dateTermine", "$dateCreation"]}}},
        {"$group": {"_id": None, "avg_duration_ms": {"$avg": "$duration"}, "count": {"$sum": 1}}}
    ]
    mttr_result = await db.work_orders.aggregate(mttr_pipeline).to_list(1)
    mttr_hours = round(mttr_result[0]["avg_duration_ms"] / (1000 * 60 * 60), 1) if mttr_result and mttr_result[0].get("avg_duration_ms") else 0

    # Maintenances préventives sur la période
    prev_filter = {**period_filter, "categorie": "TRAVAUX_PREVENTIFS"}
    prev_total = await db.work_orders.count_documents(prev_filter)
    prev_termine = await db.work_orders.count_documents({**prev_filter, "statut": "TERMINE"})
    prev_pct = round((prev_termine / prev_total * 100) if prev_total > 0 else 0)

    # Maintenances correctives sur la période
    corr_filter = {**period_filter, "categorie": {"$in": ["TRAVAUX_CURATIF", None]}}
    corr_total = await db.work_orders.count_documents(corr_filter)
    corr_termine = await db.work_orders.count_documents({**corr_filter, "statut": "TERMINE"})
    corr_pct = round((corr_termine / corr_total * 100) if corr_total > 0 else 0)

    # Interventions par équipement sur la période
    equip_pipeline = [
        {"$match": {**period_filter, "equipement_id": {"$exists": True, "$ne": None}}},
        {"$group": {
            "_id": "$equipement_id",
            "interventions": {"$sum": 1},
            "temps_total": {"$sum": {"$ifNull": ["$tempsReel", 0]}}
        }}
    ]
    equip_stats_cursor = await db.work_orders.aggregate(equip_pipeline).to_list(None)
    equip_stats = {str(e["_id"]): {"interventions": e["interventions"], "temps_total": round(e["temps_total"], 1)} for e in equip_stats_cursor}

    analytics = {
        "workOrdersParStatut": wo_by_status,
        "workOrdersParPriorite": wo_by_priority,
        "equipementsParStatut": eq_by_status,
        "tauxRealisation": taux_realisation,
        "tauxRealisationDetail": {"termine": termine_wo_period, "total": total_wo_period},
        "mttrHeures": mttr_hours,
        "maintenancesPreventives": {"realise": prev_termine, "total": prev_total, "pourcentage": prev_pct},
        "maintenancesCorrectives": {"realise": corr_termine, "total": corr_total, "pourcentage": corr_pct},
        "equipementStats": equip_stats,
        "period": period
    }

    return analytics


@router.get("/reports/time-by-category")
async def get_time_by_category(start_month: str, current_user: dict = Depends(require_permission("reports", "view"))):
    """
    Obtenir le temps passé par catégorie sur 12 mois glissants
    start_month format: YYYY-MM (ex: 2025-09)
    """
    try:
        from datetime import datetime
        from dateutil.relativedelta import relativedelta
        
        # Parser le mois de départ
        start_date = datetime.strptime(start_month + "-01", "%Y-%m-%d")
        
        # Créer 12 mois de données
        months_data = []
        for i in range(12):
            current_month = start_date + relativedelta(months=i)
            month_start = current_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month_end = (month_start + relativedelta(months=1)) - relativedelta(seconds=1)
            
            # Requête pour récupérer tous les ordres de travail dans ce mois
            pipeline = [
                {
                    "$match": {
                        "dateCreation": {
                            "$gte": month_start,
                            "$lte": month_end
                        },
                        "categorie": {"$ne": None}  # Exclure les ordres sans catégorie
                    }
                },
                {
                    "$group": {
                        "_id": "$categorie",
                        "totalTime": {"$sum": {"$ifNull": ["$tempsReel", 0]}}
                    }
                }
            ]
            
            results = await db.work_orders.aggregate(pipeline).to_list(length=None)
            
            # Organiser par catégorie
            time_by_category = {
                "CHANGEMENT_FORMAT": 0,
                "TRAVAUX_PREVENTIFS": 0,
                "TRAVAUX_CURATIF": 0,
                "TRAVAUX_DIVERS": 0,
                "FORMATION": 0,
                "REGLAGE": 0
            }
            
            # Debug logging
            logger.info(f"Mois {current_month.strftime('%Y-%m')} - Résultats MongoDB: {results}")
            
            for result in results:
                category = result.get("_id")
                if category and category in time_by_category:
                    time_by_category[category] = round(result["totalTime"], 2)
                    logger.info(f"  Catégorie {category}: {result['totalTime']}h")
                else:
                    logger.warning(f"  Catégorie inconnue ou None: {category}")
            
            months_data.append({
                "month": current_month.strftime("%Y-%m"),
                "monthLabel": current_month.strftime("%B %Y"),
                "categories": time_by_category
            })
        
        return {
            "startMonth": start_month,
            "months": months_data
        }
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des stats par catégorie : {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/user-time-tracking")
async def get_user_time_tracking(
    user_ids: str = None,  # Comma-separated list of user IDs
    period: str = "weekly",  # daily, weekly, monthly, yearly, custom
    start_date: str = None,  # Format: YYYY-MM-DD
    end_date: str = None,  # Format: YYYY-MM-DD
    categories: str = None,  # Comma-separated list of categories, None = all
    current_user: dict = Depends(require_permission("reports", "view"))
):
    """
    Obtenir le temps passé par utilisateur par catégorie
    - user_ids: Liste des IDs utilisateurs séparés par des virgules (si vide, utilisateur courant)
    - period: daily, weekly, monthly, yearly, custom
    - start_date, end_date: Pour la période personnalisée
    - categories: Liste des catégories à inclure (si vide, toutes)
    """
    try:
        from datetime import datetime, timedelta
        from dateutil.relativedelta import relativedelta
        
        # Vérifier les permissions pour voir d'autres utilisateurs
        can_view_others = False
        user_role = current_user.get("role", "")
        user_permissions = current_user.get("permissions", {})
        
        # Admin ou responsable peuvent voir tous les utilisateurs
        if user_role == "ADMIN":
            can_view_others = True
        elif isinstance(user_permissions, dict):
            time_tracking_perm = user_permissions.get("timeTracking", {})
            if isinstance(time_tracking_perm, dict) and time_tracking_perm.get("view", False):
                can_view_others = True
        
        # Parser les user_ids
        if user_ids:
            requested_user_ids = [uid.strip() for uid in user_ids.split(",") if uid.strip()]
        else:
            requested_user_ids = [current_user["id"]]
        
        # Si l'utilisateur ne peut pas voir les autres, forcer son propre ID
        if not can_view_others:
            requested_user_ids = [current_user["id"]]
        
        # Déterminer les dates selon la période
        now = datetime.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        if period == "daily":
            # Afficher les 14 derniers jours, un point par jour
            date_start = today - timedelta(days=13)
            date_end = today + timedelta(days=1) - timedelta(seconds=1)
            time_labels = []
            for i in range(14):
                d = date_start + timedelta(days=i)
                day_names = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
                time_labels.append(f"{day_names[d.weekday()]} {d.day:02d}/{d.month:02d}")
            group_by = "dayIndex"
        elif period == "weekly":
            # Début de la semaine (lundi)
            days_since_monday = today.weekday()
            date_start = today - timedelta(days=days_since_monday)
            date_end = date_start + timedelta(days=7) - timedelta(seconds=1)
            time_labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
            group_by = "dayOfWeek"
        elif period == "monthly":
            date_start = today.replace(day=1)
            date_end = (date_start + relativedelta(months=1)) - timedelta(seconds=1)
            # Générer les labels pour chaque jour du mois
            days_in_month = (date_end.replace(day=1) + relativedelta(months=1) - date_end.replace(day=1)).days
            if hasattr(date_end, 'day'):
                days_in_month = date_end.day
            time_labels = [str(d) for d in range(1, days_in_month + 1)]
            group_by = "dayOfMonth"
        elif period == "yearly":
            date_start = today.replace(month=1, day=1)
            date_end = today.replace(month=12, day=31, hour=23, minute=59, second=59)
            time_labels = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]
            group_by = "month"
        elif period == "custom" and start_date and end_date:
            date_start = datetime.strptime(start_date, "%Y-%m-%d")
            date_end = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            # Calculer le nombre de jours
            delta = (date_end - date_start).days + 1
            if delta <= 7:
                time_labels = [(date_start + timedelta(days=i)).strftime("%d/%m") for i in range(delta)]
                group_by = "dayOfMonth"
            elif delta <= 31:
                time_labels = [(date_start + timedelta(days=i)).strftime("%d") for i in range(delta)]
                group_by = "dayOfMonth"
            else:
                # Grouper par mois
                time_labels = []
                current = date_start
                while current <= date_end:
                    time_labels.append(current.strftime("%b %Y"))
                    current = current + relativedelta(months=1)
                group_by = "month"
        else:
            # Par défaut: hebdomadaire
            days_since_monday = today.weekday()
            date_start = today - timedelta(days=days_since_monday)
            date_end = date_start + timedelta(days=7) - timedelta(seconds=1)
            time_labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
            group_by = "dayOfWeek"
        
        # Parser les catégories
        all_categories = ["CHANGEMENT_FORMAT", "TRAVAUX_PREVENTIFS", "TRAVAUX_CURATIF", "TRAVAUX_DIVERS", "FORMATION", "REGLAGE", "AMELIORATIONS"]
        if categories:
            selected_categories = [cat.strip() for cat in categories.split(",") if cat.strip() in all_categories]
        else:
            selected_categories = all_categories
        
        # Récupérer les informations des utilisateurs demandés
        users_info = {}
        for uid in requested_user_ids:
            try:
                user_doc = await db.users.find_one({"_id": ObjectId(uid)}, {"_id": 1, "nom": 1, "prenom": 1, "email": 1})
                if user_doc:
                    users_info[uid] = {
                        "id": uid,
                        "name": f"{user_doc.get('prenom', '')} {user_doc.get('nom', '')}".strip() or user_doc.get('email', 'Inconnu')
                    }
            except:
                pass
        
        # Si aucun utilisateur trouvé, utiliser l'utilisateur courant
        if not users_info:
            users_info[current_user["id"]] = {
                "id": current_user["id"],
                "name": current_user.get("name", current_user.get("email", "Moi"))
            }
        
        # Phase 1 : Découvrir automatiquement tous les utilisateurs ayant pointé du temps dans la période
        # Cela permet d'afficher par défaut tous les utilisateurs actifs, pas seulement celui connecté
        auto_discovered_user_ids = set()
        
        # Helper pour parser les timestamps (peuvent etre datetime ou string)
        def parse_ts(ts):
            if isinstance(ts, datetime):
                return ts
            if isinstance(ts, str):
                try:
                    return datetime.fromisoformat(ts.replace('Z', '+00:00').replace('+00:00', ''))
                except:
                    return None
            return None
        
        wo_discovery_match = {
            "deleted_at": {"$exists": False},
            "time_entries": {
                "$elemMatch": {
                    "timestamp": {"$gte": date_start, "$lte": date_end}
                }
            }
        }
        wo_disc_cursor = db.work_orders.find(wo_discovery_match, {"time_entries": 1})
        async for wo in wo_disc_cursor:
            for entry in wo.get("time_entries", []):
                ts = parse_ts(entry.get("timestamp"))
                if ts and date_start <= ts <= date_end:
                    uid = entry.get("user_id")
                    if uid:
                        auto_discovered_user_ids.add(uid)
        
        imp_disc_cursor = db.improvements.find(wo_discovery_match, {"time_entries": 1})
        async for imp in imp_disc_cursor:
            for entry in imp.get("time_entries", []):
                ts = parse_ts(entry.get("timestamp"))
                if ts and date_start <= ts <= date_end:
                    uid = entry.get("user_id")
                    if uid:
                        auto_discovered_user_ids.add(uid)
        
        # Si pas de user_ids explicitement demandés, remplacer par UNIQUEMENT les utilisateurs ayant des heures
        if not user_ids and can_view_others and auto_discovered_user_ids:
            users_info = {}
            for uid in auto_discovered_user_ids:
                try:
                    user_doc = await db.users.find_one({"_id": ObjectId(uid)}, {"_id": 1, "nom": 1, "prenom": 1, "email": 1})
                    if user_doc:
                        users_info[uid] = {
                            "id": uid,
                            "name": f"{user_doc.get('prenom', '')} {user_doc.get('nom', '')}".strip() or user_doc.get('email', 'Inconnu')
                        }
                except:
                    pass
        
        # Construire les données pour chaque utilisateur
        results = {}
        
        for user_id in users_info.keys():
            user_data = {cat: [0] * len(time_labels) for cat in selected_categories}
            
            # Requête pour les ordres de travail - basée sur time_entries.user_id (qui a pointé le temps)
            wo_categories = [cat for cat in selected_categories if cat != "AMELIORATIONS"]
            if wo_categories:
                wo_match = {
                    "deleted_at": {"$exists": False},
                    "categorie": {"$in": wo_categories},
                    "time_entries": {
                        "$elemMatch": {
                            "user_id": user_id,
                            "timestamp": {"$gte": date_start, "$lte": date_end}
                        }
                    }
                }
                
                wo_cursor = db.work_orders.find(wo_match, {"categorie": 1, "time_entries": 1})
                async for wo in wo_cursor:
                    category = wo.get("categorie")
                    time_entries = wo.get("time_entries", [])
                    if category and time_entries:
                        for entry in time_entries:
                            if entry.get("user_id") == user_id:
                                entry_timestamp = parse_ts(entry.get("timestamp"))
                                if entry_timestamp and date_start <= entry_timestamp <= date_end:
                                    idx = get_time_index(entry_timestamp, date_start, group_by, len(time_labels))
                                    if 0 <= idx < len(time_labels) and category in user_data:
                                        user_data[category][idx] += entry.get("hours", 0)
            
            # Requête pour les améliorations - basée sur time_entries.user_id
            if "AMELIORATIONS" in selected_categories:
                imp_match = {
                    "time_entries": {
                        "$elemMatch": {
                            "user_id": user_id,
                            "timestamp": {"$gte": date_start, "$lte": date_end}
                        }
                    }
                }
                
                imp_cursor = db.improvements.find(imp_match, {"time_entries": 1})
                async for imp in imp_cursor:
                    time_entries = imp.get("time_entries", [])
                    for entry in time_entries:
                        if entry.get("user_id") == user_id:
                            entry_timestamp = parse_ts(entry.get("timestamp"))
                            if entry_timestamp and date_start <= entry_timestamp <= date_end:
                                idx = get_time_index(entry_timestamp, date_start, group_by, len(time_labels))
                                if 0 <= idx < len(time_labels):
                                    user_data["AMELIORATIONS"][idx] += entry.get("hours", 0)
            
            # Arrondir les valeurs
            for cat in user_data:
                user_data[cat] = [round(v, 2) for v in user_data[cat]]
            
            results[user_id] = {
                "user": users_info[user_id],
                "data": user_data
            }
        
        # Récupérer la liste de tous les utilisateurs (pour le filtre)
        all_users = []
        if can_view_others:
            users_cursor = db.users.find({}, {"_id": 1, "nom": 1, "prenom": 1, "email": 1})
            async for user in users_cursor:
                all_users.append({
                    "id": str(user["_id"]),
                    "name": f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or user.get('email', 'Inconnu')
                })
        
        return {
            "period": period,
            "startDate": date_start.strftime("%Y-%m-%d"),
            "endDate": date_end.strftime("%Y-%m-%d"),
            "timeLabels": time_labels,
            "categories": selected_categories,
            "users": results,
            "allUsers": all_users if can_view_others else [],
            "canViewOthers": can_view_others
        }
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du pointage horaire : {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


def get_time_index(date, start_date, group_by, max_len):
    """Helper pour calculer l'index dans le tableau de temps"""
    from datetime import timedelta
    
    if group_by == "hour":
        return date.hour
    elif group_by == "dayOfWeek":
        return date.weekday()
    elif group_by == "dayIndex":
        return (date.replace(hour=0, minute=0, second=0, microsecond=0) - start_date.replace(hour=0, minute=0, second=0, microsecond=0)).days
    elif group_by == "dayOfMonth":
        return (date - start_date).days
    elif group_by == "month":
        months_diff = (date.year - start_date.year) * 12 + (date.month - start_date.month)
        return min(months_diff, max_len - 1)
    return 0


# ==================== IMPORT/EXPORT ROUTES ====================
# NOTE: Ces routes ont été modularisées dans import_export_routes.py
# Voir l'inclusion du router dans la section des includes (router.include_router)


