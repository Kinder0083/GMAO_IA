"""
Service pour récupérer les données FSAO pour les widgets personnalisés
"""
import logging
from typing import Optional, Dict, Any, List, Union
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
import re

logger = logging.getLogger(__name__)

# Référence globale à la base de données
_db: AsyncIOMotorDatabase = None


def init_gmao_data_service(db: AsyncIOMotorDatabase):
    """Initialise le service avec la base de données"""
    global _db
    _db = db
    logger.info("Service données FSAO initialisé")


def parse_relative_date(date_str: str) -> datetime:
    """
    Parse une date relative et retourne une datetime
    
    Formats supportés:
    - -7d : il y a 7 jours
    - -1m : il y a 1 mois
    - -1y : il y a 1 an
    - today : aujourd'hui à 00:00
    - yesterday : hier à 00:00
    - start_of_month : début du mois en cours
    - start_of_year : début de l'année en cours
    """
    now = datetime.now(timezone.utc)
    
    if date_str == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif date_str == "yesterday":
        return (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif date_str == "start_of_month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif date_str == "start_of_year":
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Format relatif: -Xd, -Xm, -Xy
    match = re.match(r"^-(\d+)([dmy])$", date_str)
    if match:
        value = int(match.group(1))
        unit = match.group(2)
        
        if unit == "d":
            return now - timedelta(days=value)
        elif unit == "m":
            # Approximation: 1 mois = 30 jours
            return now - timedelta(days=value * 30)
        elif unit == "y":
            return now - timedelta(days=value * 365)
    
    # Essayer de parser comme date ISO
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        return now


async def get_gmao_data(
    data_type: str,
    service_filter: Optional[str] = None,
    status_filter: Optional[List[str]] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    group_by: Optional[str] = None,
    sensor_id: Optional[str] = None,
    meter_id: Optional[str] = None,
    **kwargs
) -> Union[float, Dict, List]:
    """
    Récupère les données FSAO selon le type demandé
    
    Args:
        data_type: Type de données FSAO (voir GmaoDataType enum)
        service_filter: Filtrer par service
        status_filter: Filtrer par statut(s)
        date_from: Date de début (relative ou ISO)
        date_to: Date de fin (relative ou ISO)
        group_by: Grouper les résultats
        sensor_id: ID du capteur pour les données IoT
        meter_id: ID du compteur pour les relevés
    
    Returns:
        Valeur numérique, dict ou liste selon le type de données
    """
    if _db is None:
        raise Exception("Service GMAO non initialisé")
    
    # Construire les filtres de date
    date_filter = {}
    if date_from:
        date_filter["$gte"] = parse_relative_date(date_from).isoformat()
    if date_to:
        date_filter["$lte"] = parse_relative_date(date_to).isoformat()
    
    # Router vers la bonne fonction selon le type
    handlers = {
        # Ordres de travail
        "work_orders_count": _get_work_orders_count,
        "work_orders_by_status": _get_work_orders_by_status,
        "work_orders_by_priority": _get_work_orders_by_priority,
        "work_orders_completion_rate": _get_work_orders_completion_rate,
        "work_orders_avg_duration": _get_work_orders_avg_duration,
        
        # Équipements
        "assets_count": _get_assets_count,
        "assets_by_status": _get_assets_by_status,
        "assets_by_type": _get_assets_by_type,
        "assets_availability_rate": _get_assets_availability_rate,
        
        # Maintenance préventive
        "preventive_completion_rate": _get_preventive_completion_rate,
        "preventive_overdue_count": _get_preventive_overdue_count,
        "preventive_upcoming_count": _get_preventive_upcoming_count,
        
        # Demandes
        "intervention_requests_count": _get_intervention_requests_count,
        "improvement_requests_count": _get_improvement_requests_count,
        "purchase_requests_count": _get_purchase_requests_count,
        
        # Presqu'accidents
        "near_miss_count": _get_near_miss_count,
        "near_miss_by_severity": _get_near_miss_by_severity,
        
        # Capteurs IoT et Compteurs
        "sensor_value": _get_sensor_value,
        "sensor_history": _get_sensor_history,
        "meter_value": _get_meter_value,
        "meter_history": _get_meter_history,
        
        # Inventaire
        "inventory_count": _get_inventory_count,
        "inventory_low_stock": _get_inventory_low_stock,
        "inventory_value": _get_inventory_value,
        
        # Surveillance
        "surveillance_compliance_rate": _get_surveillance_compliance_rate,
        "surveillance_overdue": _get_surveillance_overdue,
        
        # Utilisateurs
        "users_online_count": _get_users_online_count,
        "users_by_service": _get_users_by_service,
    }
    
    handler = handlers.get(data_type)
    if not handler:
        raise ValueError(f"Type de données FSAO inconnu: {data_type}")
    
    return await handler(
        service_filter=service_filter,
        status_filter=status_filter,
        date_filter=date_filter,
        group_by=group_by,
        sensor_id=sensor_id,
        meter_id=meter_id,
        **kwargs
    )


# === Fonctions pour les Ordres de Travail ===

async def _get_work_orders_count(service_filter=None, status_filter=None, date_filter=None, **kwargs):
    """Compte le nombre d'ordres de travail"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    if status_filter:
        query["status"] = {"$in": status_filter}
    if date_filter and len(date_filter) > 0:
        query["created_at"] = date_filter
    
    return await _db.work_orders.count_documents(query)


async def _get_work_orders_by_status(service_filter=None, date_filter=None, **kwargs):
    """Compte les ordres de travail par statut"""
    match_stage = {}
    if service_filter:
        match_stage["service"] = service_filter
    if date_filter and len(date_filter) > 0:
        match_stage["created_at"] = date_filter
    
    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await _db.work_orders.aggregate(pipeline).to_list(length=None)
    return {r["_id"]: r["count"] for r in results if r["_id"]}


async def _get_work_orders_by_priority(service_filter=None, date_filter=None, **kwargs):
    """Compte les ordres de travail par priorité"""
    match_stage = {}
    if service_filter:
        match_stage["service"] = service_filter
    if date_filter and len(date_filter) > 0:
        match_stage["created_at"] = date_filter
    
    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await _db.work_orders.aggregate(pipeline).to_list(length=None)
    return {r["_id"]: r["count"] for r in results if r["_id"]}


async def _get_work_orders_completion_rate(service_filter=None, date_filter=None, **kwargs):
    """Calcule le taux de complétion des ordres de travail"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    if date_filter and len(date_filter) > 0:
        query["created_at"] = date_filter
    
    total = await _db.work_orders.count_documents(query)
    if total == 0:
        return 0
    
    completed_query = {**query, "status": {"$in": ["TERMINE", "CLOTURE", "completed", "closed"]}}
    completed = await _db.work_orders.count_documents(completed_query)
    
    return round((completed / total) * 100, 1)


async def _get_work_orders_avg_duration(service_filter=None, status_filter=None, date_filter=None, **kwargs):
    """Calcule la durée moyenne des ordres de travail terminés (en heures)"""
    match_stage = {"status": {"$in": ["TERMINE", "CLOTURE", "completed", "closed"]}}
    if service_filter:
        match_stage["service"] = service_filter
    if date_filter and len(date_filter) > 0:
        match_stage["created_at"] = date_filter
    
    pipeline = [
        {"$match": match_stage},
        {"$match": {"completed_at": {"$exists": True}, "created_at": {"$exists": True}}},
        {"$project": {
            "duration": {
                "$divide": [
                    {"$subtract": [
                        {"$dateFromString": {"dateString": "$completed_at"}},
                        {"$dateFromString": {"dateString": "$created_at"}}
                    ]},
                    3600000  # Convertir en heures
                ]
            }
        }},
        {"$group": {"_id": None, "avg_duration": {"$avg": "$duration"}}}
    ]
    
    results = await _db.work_orders.aggregate(pipeline).to_list(length=1)
    if results and results[0].get("avg_duration"):
        return round(results[0]["avg_duration"], 1)
    return 0


# === Fonctions pour les Équipements ===

async def _get_assets_count(service_filter=None, status_filter=None, **kwargs):
    """Compte le nombre d'équipements"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    if status_filter:
        query["status"] = {"$in": status_filter}
    
    return await _db.assets.count_documents(query)


async def _get_assets_by_status(service_filter=None, **kwargs):
    """Compte les équipements par statut"""
    match_stage = {}
    if service_filter:
        match_stage["service"] = service_filter
    
    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await _db.assets.aggregate(pipeline).to_list(length=None)
    return {r["_id"]: r["count"] for r in results if r["_id"]}


async def _get_assets_by_type(service_filter=None, **kwargs):
    """Compte les équipements par type"""
    match_stage = {}
    if service_filter:
        match_stage["service"] = service_filter
    
    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await _db.assets.aggregate(pipeline).to_list(length=None)
    return {r["_id"]: r["count"] for r in results if r["_id"]}


async def _get_assets_availability_rate(service_filter=None, **kwargs):
    """Calcule le taux de disponibilité des équipements"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    
    total = await _db.assets.count_documents(query)
    if total == 0:
        return 0
    
    available_query = {**query, "status": {"$in": ["OPERATIONNEL", "DISPONIBLE", "available", "operational"]}}
    available = await _db.assets.count_documents(available_query)
    
    return round((available / total) * 100, 1)


# === Fonctions pour la Maintenance Préventive ===

async def _get_preventive_completion_rate(service_filter=None, date_filter=None, **kwargs):
    """Calcule le taux de réalisation de la maintenance préventive"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    if date_filter and len(date_filter) > 0:
        query["scheduled_date"] = date_filter
    
    total = await _db.preventive_maintenances.count_documents(query)
    if total == 0:
        return 0
    
    completed_query = {**query, "status": {"$in": ["REALISE", "completed", "done"]}}
    completed = await _db.preventive_maintenances.count_documents(completed_query)
    
    return round((completed / total) * 100, 1)


async def _get_preventive_overdue_count(service_filter=None, **kwargs):
    """Compte les maintenances préventives en retard"""
    now = datetime.now(timezone.utc).isoformat()
    query = {
        "scheduled_date": {"$lt": now},
        "status": {"$nin": ["REALISE", "completed", "done"]}
    }
    if service_filter:
        query["service"] = service_filter
    
    return await _db.preventive_maintenances.count_documents(query)


async def _get_preventive_upcoming_count(service_filter=None, **kwargs):
    """Compte les maintenances préventives à venir (7 jours)"""
    now = datetime.now(timezone.utc)
    future = (now + timedelta(days=7)).isoformat()
    now_str = now.isoformat()
    
    query = {
        "scheduled_date": {"$gte": now_str, "$lte": future},
        "status": {"$nin": ["REALISE", "completed", "done"]}
    }
    if service_filter:
        query["service"] = service_filter
    
    return await _db.preventive_maintenances.count_documents(query)


# === Fonctions pour les Demandes ===

async def _get_intervention_requests_count(service_filter=None, status_filter=None, date_filter=None, **kwargs):
    """Compte les demandes d'intervention"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    if status_filter:
        query["status"] = {"$in": status_filter}
    if date_filter and len(date_filter) > 0:
        query["created_at"] = date_filter
    
    return await _db.intervention_requests.count_documents(query)


async def _get_improvement_requests_count(service_filter=None, status_filter=None, date_filter=None, **kwargs):
    """Compte les demandes d'amélioration"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    if status_filter:
        query["status"] = {"$in": status_filter}
    if date_filter and len(date_filter) > 0:
        query["created_at"] = date_filter
    
    return await _db.improvement_requests.count_documents(query)


async def _get_purchase_requests_count(service_filter=None, status_filter=None, date_filter=None, **kwargs):
    """Compte les demandes d'achat"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    if status_filter:
        query["status"] = {"$in": status_filter}
    if date_filter and len(date_filter) > 0:
        query["created_at"] = date_filter
    
    return await _db.purchase_requests.count_documents(query)


# === Fonctions pour les Presqu'accidents ===

async def _get_near_miss_count(service_filter=None, status_filter=None, date_filter=None, **kwargs):
    """Compte les presqu'accidents"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    if status_filter:
        query["status"] = {"$in": status_filter}
    if date_filter and len(date_filter) > 0:
        query["date_incident"] = date_filter
    
    return await _db.presqu_accident.count_documents(query)


async def _get_near_miss_by_severity(service_filter=None, date_filter=None, **kwargs):
    """Compte les presqu'accidents par sévérité"""
    match_stage = {}
    if service_filter:
        match_stage["service"] = service_filter
    if date_filter and len(date_filter) > 0:
        match_stage["date_incident"] = date_filter
    
    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$group": {"_id": "$severite", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await _db.presqu_accident.aggregate(pipeline).to_list(length=None)
    return {r["_id"]: r["count"] for r in results if r["_id"]}


# === Fonctions pour les Capteurs IoT ===

async def _get_sensor_value(sensor_id=None, **kwargs):
    """Récupère la dernière valeur d'un capteur"""
    if not sensor_id:
        return None
    
    sensor = await _db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    if sensor:
        return sensor.get("current_value") or sensor.get("value")
    return None


async def _get_sensor_history(sensor_id=None, date_filter=None, **kwargs):
    """Récupère l'historique d'un capteur"""
    if not sensor_id:
        return []
    
    query = {"sensor_id": sensor_id}
    if date_filter and len(date_filter) > 0:
        query["timestamp"] = date_filter
    
    history = await _db.sensor_history.find(query, {"_id": 0}).sort("timestamp", -1).to_list(length=100)
    return history


# === Fonctions pour les Compteurs ===

async def _get_meter_value(meter_id=None, **kwargs):
    """Récupère la dernière valeur d'un compteur"""
    if not meter_id:
        return None
    
    meter = await _db.meters.find_one({"id": meter_id}, {"_id": 0})
    if meter:
        return meter.get("current_value") or meter.get("last_reading") or meter.get("value")
    return None


async def _get_meter_history(meter_id=None, date_filter=None, **kwargs):
    """Récupère l'historique d'un compteur"""
    if not meter_id:
        return []
    
    query = {"meter_id": meter_id}
    if date_filter and len(date_filter) > 0:
        query["timestamp"] = date_filter
    
    history = await _db.meter_readings.find(query, {"_id": 0}).sort("timestamp", -1).to_list(length=100)
    return history


# === Fonctions pour l'Inventaire ===

async def _get_inventory_count(service_filter=None, **kwargs):
    """Compte le nombre total d'articles en inventaire"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    
    return await _db.inventory.count_documents(query)


async def _get_inventory_low_stock(service_filter=None, **kwargs):
    """Compte les articles en rupture ou stock bas"""
    query = {"$expr": {"$lte": ["$quantity", "$min_quantity"]}}
    if service_filter:
        query["service"] = service_filter
    
    return await _db.inventory.count_documents(query)


async def _get_inventory_value(service_filter=None, **kwargs):
    """Calcule la valeur totale de l'inventaire"""
    match_stage = {}
    if service_filter:
        match_stage["service"] = service_filter
    
    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$project": {"total": {"$multiply": [{"$ifNull": ["$quantity", 0]}, {"$ifNull": ["$unit_price", 0]}]}}},
        {"$group": {"_id": None, "total_value": {"$sum": "$total"}}}
    ]
    
    results = await _db.inventory.aggregate(pipeline).to_list(length=1)
    if results:
        return round(results[0].get("total_value", 0), 2)
    return 0


# === Fonctions pour la Surveillance ===

async def _get_surveillance_compliance_rate(service_filter=None, date_filter=None, **kwargs):
    """Calcule le taux de conformité des contrôles de surveillance"""
    query = {}
    if service_filter:
        query["service"] = service_filter
    if date_filter and len(date_filter) > 0:
        query["date_controle"] = date_filter
    
    total = await _db.surveillance_controls.count_documents(query)
    if total == 0:
        return 0
    
    compliant_query = {**query, "is_compliant": True}
    compliant = await _db.surveillance_controls.count_documents(compliant_query)
    
    return round((compliant / total) * 100, 1)


async def _get_surveillance_overdue(service_filter=None, **kwargs):
    """Compte les contrôles de surveillance en retard"""
    now = datetime.now(timezone.utc).isoformat()
    query = {
        "next_control_date": {"$lt": now},
        "status": {"$nin": ["completed", "done"]}
    }
    if service_filter:
        query["service"] = service_filter
    
    return await _db.surveillance_plan.count_documents(query)


# === Fonctions pour les Utilisateurs ===

async def _get_users_online_count(**kwargs):
    """Compte les utilisateurs en ligne"""
    # Considérer en ligne si dernière activité < 5 minutes
    threshold = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    return await _db.users.count_documents({"last_activity": {"$gte": threshold}})


async def _get_users_by_service(**kwargs):
    """Compte les utilisateurs par service"""
    pipeline = [
        {"$group": {"_id": "$service", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await _db.users.aggregate(pipeline).to_list(length=None)
    return {r["_id"]: r["count"] for r in results if r["_id"]}


# === Fonction utilitaire pour lister les données disponibles ===

def get_available_gmao_data_types() -> List[Dict[str, Any]]:
    """Retourne la liste des types de données FSAO disponibles avec leur description"""
    return [
        # Ordres de travail
        {"type": "work_orders_count", "label": "Nombre d'ordres de travail", "category": "Interventions", "returns": "number"},
        {"type": "work_orders_by_status", "label": "OT par statut", "category": "Interventions", "returns": "dict"},
        {"type": "work_orders_by_priority", "label": "OT par priorité", "category": "Interventions", "returns": "dict"},
        {"type": "work_orders_completion_rate", "label": "Taux de complétion OT (%)", "category": "Interventions", "returns": "number"},
        {"type": "work_orders_avg_duration", "label": "Durée moyenne OT (h)", "category": "Interventions", "returns": "number"},
        
        # Équipements
        {"type": "assets_count", "label": "Nombre d'équipements", "category": "Équipements", "returns": "number"},
        {"type": "assets_by_status", "label": "Équipements par statut", "category": "Équipements", "returns": "dict"},
        {"type": "assets_by_type", "label": "Équipements par type", "category": "Équipements", "returns": "dict"},
        {"type": "assets_availability_rate", "label": "Taux de disponibilité (%)", "category": "Équipements", "returns": "number"},
        
        # Maintenance préventive
        {"type": "preventive_completion_rate", "label": "Taux réalisation M.Prev (%)", "category": "M. Préventive", "returns": "number"},
        {"type": "preventive_overdue_count", "label": "M.Prev en retard", "category": "M. Préventive", "returns": "number"},
        {"type": "preventive_upcoming_count", "label": "M.Prev à venir (7j)", "category": "M. Préventive", "returns": "number"},
        
        # Demandes
        {"type": "intervention_requests_count", "label": "Demandes d'intervention", "category": "Demandes", "returns": "number"},
        {"type": "improvement_requests_count", "label": "Demandes d'amélioration", "category": "Demandes", "returns": "number"},
        {"type": "purchase_requests_count", "label": "Demandes d'achat", "category": "Demandes", "returns": "number"},
        
        # Presqu'accidents
        {"type": "near_miss_count", "label": "Presqu'accidents", "category": "QHSE", "returns": "number"},
        {"type": "near_miss_by_severity", "label": "Presqu'accidents par sévérité", "category": "QHSE", "returns": "dict"},
        
        # Capteurs MQTT
        {"type": "sensor_value", "label": "Valeur d'un capteur MQTT", "category": "Capteurs MQTT", "returns": "number", "requires": ["sensor_id"], "requires_selection": "sensor"},
        {"type": "sensor_history", "label": "Historique d'un capteur", "category": "Capteurs MQTT", "returns": "list", "requires": ["sensor_id"], "requires_selection": "sensor"},
        
        # Compteurs
        {"type": "meter_value", "label": "Relevé d'un compteur", "category": "Compteurs", "returns": "number", "requires": ["meter_id"], "requires_selection": "meter"},
        {"type": "meter_history", "label": "Historique d'un compteur", "category": "Compteurs", "returns": "list", "requires": ["meter_id"], "requires_selection": "meter"},
        
        # Inventaire
        {"type": "inventory_count", "label": "Articles en stock", "category": "Inventaire", "returns": "number"},
        {"type": "inventory_low_stock", "label": "Articles en rupture", "category": "Inventaire", "returns": "number"},
        {"type": "inventory_value", "label": "Valeur du stock (€)", "category": "Inventaire", "returns": "number"},
        
        # Surveillance
        {"type": "surveillance_compliance_rate", "label": "Taux conformité surveillance (%)", "category": "Surveillance", "returns": "number"},
        {"type": "surveillance_overdue", "label": "Contrôles en retard", "category": "Surveillance", "returns": "number"},
        
        # Utilisateurs
        {"type": "users_online_count", "label": "Utilisateurs en ligne", "category": "Utilisateurs", "returns": "number"},
        {"type": "users_by_service", "label": "Utilisateurs par service", "category": "Utilisateurs", "returns": "dict"},
    ]
