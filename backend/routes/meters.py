"""
Routes des Compteurs et Releves
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import uuid
import logging

from models import ActionType, EntityType, MessageResponse, Meter, MeterCreate, MeterUpdate, MeterReading, MeterReadingCreate
from dependencies import get_current_user, require_permission
from routes.shared import db, audit_service, serialize_doc, _get_realtime_manager

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

def _get_mqtt_meter_collector():
    from mqtt_meter_collector import mqtt_meter_collector
    return mqtt_meter_collector

router = APIRouter(tags=["Compteurs"])


@router.post("/meters",
    summary="Creer un compteur", response_model=Meter, status_code=201, tags=["Compteurs"])
async def create_meter(meter: MeterCreate, current_user: dict = Depends(require_permission("meters", "edit"))):
    """Créer un nouveau compteur"""
    try:
        meter_id = str(uuid.uuid4())
        meter_data = meter.model_dump()
        meter_data["id"] = meter_id
        meter_data["date_creation"] = datetime.utcnow()
        meter_data["actif"] = True
        
        # Récupérer les informations de l'emplacement si fourni
        if meter_data.get("emplacement_id"):
            location = await db.locations.find_one({"id": meter_data["emplacement_id"]})
            if location:
                meter_data["emplacement"] = {"id": location["id"], "nom": location["nom"]}
        
        await db.meters.insert_one(meter_data)
        
        # Rafraîchir les abonnements MQTT si activé
        if meter_data.get("mqtt_enabled"):
            await _get_mqtt_meter_collector().refresh_subscriptions()
        
        # Audit log
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
            user_email=current_user["email"],
            action=ActionType.CREATE,
            entity_type=EntityType_Audit.WORK_ORDER,  # Utilisons WORK_ORDER comme proxy
            entity_id=meter_id,
            entity_name=meter.nom
        )
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await _get_realtime_manager().emit_event(
            "counters",
            "created",
            meter_data,
            user_id=current_user["id"]
        )
        
        return Meter(**meter_data)
    except Exception as e:
        logger.error(f"Erreur création compteur: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/meters",
    summary="Lister les compteurs", response_model=List[Meter], tags=["Compteurs"])
async def get_all_meters(current_user: dict = Depends(require_permission("meters", "view"))):
    """Récupérer tous les compteurs"""
    try:
        meters = []
        async for meter in db.meters.find({"actif": True}).sort("date_creation", -1):
            meters.append(Meter(**meter))
        return meters
    except Exception as e:
        logger.error(f"Erreur récupération compteurs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/meters/{meter_id}",
    summary="Detail d'un compteur", response_model=Meter, tags=["Compteurs"])
async def get_meter(meter_id: str, current_user: dict = Depends(require_permission("meters", "view"))):
    """Récupérer un compteur spécifique"""
    meter = await db.meters.find_one({"id": meter_id})
    if not meter:
        raise HTTPException(status_code=404, detail="Compteur non trouvé")
    return Meter(**meter)

@router.put("/meters/{meter_id}",
    summary="Modifier un compteur", response_model=Meter, tags=["Compteurs"])
async def update_meter(
    meter_id: str,
    meter_update: MeterUpdate,
    current_user: dict = Depends(require_permission("meters", "edit"))
):
    """Mettre à jour un compteur"""
    meter = await db.meters.find_one({"id": meter_id})
    if not meter:
        raise HTTPException(status_code=404, detail="Compteur non trouvé")
    
    update_data = {k: v for k, v in meter_update.model_dump().items() if v is not None}
    
    # Mettre à jour l'emplacement si nécessaire
    if "emplacement_id" in update_data:
        if update_data["emplacement_id"]:
            location = await db.locations.find_one({"id": update_data["emplacement_id"]})
            if location:
                update_data["emplacement"] = {"id": location["id"], "nom": location["nom"]}
        else:
            update_data["emplacement"] = None
    
    await db.meters.update_one({"id": meter_id}, {"$set": update_data})
    
    # Récupérer le compteur mis à jour
    updated_meter = await db.meters.find_one({"id": meter_id})
    
    # Rafraîchir les abonnements MQTT si MQTT activé/modifié
    if "mqtt_enabled" in update_data or "mqtt_topic" in update_data:
        await _get_mqtt_meter_collector().refresh_subscriptions()
    
    # Audit log
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
        user_email=current_user["email"],
        action=ActionType.UPDATE,
        entity_type=EntityType_Audit.WORK_ORDER,
        entity_id=meter_id,
        entity_name=updated_meter["nom"]
    )
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "counters",
        "updated",
        dict(updated_meter),
        user_id=current_user["id"]
    )
    
    return Meter(**updated_meter)

@router.delete("/meters/{meter_id}", response_model=MessageResponse,
    summary="Supprimer un compteur", tags=["Compteurs"])
async def delete_meter(meter_id: str, current_user: dict = Depends(require_permission("meters", "delete"))):
    """Supprimer un compteur (soft delete)"""
    meter = await db.meters.find_one({"id": meter_id})
    if not meter:
        raise HTTPException(status_code=404, detail="Compteur non trouvé")
    
    # Soft delete
    await db.meters.update_one({"id": meter_id}, {"$set": {"actif": False}})
    
    # Audit log
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=current_user.get("nom", "") + " " + current_user.get("prenom", ""),
        user_email=current_user["email"],
        action=ActionType.DELETE,
        entity_type=EntityType_Audit.WORK_ORDER,
        entity_id=meter_id,
        entity_name=meter["nom"]
    )
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "counters",
        "deleted",
        {"id": meter_id, "nom": meter["nom"]},
        user_id=current_user["id"]
    )
    
    return {"message": "Compteur supprimé"}

# ==================== METER READINGS (RELEVÉS) ENDPOINTS ====================

@router.post("/meters/{meter_id}/readings", response_model=MeterReading, status_code=201, tags=["Compteurs"])
async def create_reading(
    meter_id: str,
    reading: MeterReadingCreate,
    current_user: dict = Depends(require_permission("meters", "edit"))
):
    """Créer un nouveau relevé pour un compteur"""
    try:
        # Vérifier que le compteur existe
        meter = await db.meters.find_one({"id": meter_id})
        if not meter:
            raise HTTPException(status_code=404, detail="Compteur non trouvé")
        
        # Récupérer le dernier relevé pour calculer la consommation
        last_reading = await db.meter_readings.find_one(
            {"meter_id": meter_id},
            sort=[("date_releve", -1)]
        )
        
        reading_id = str(uuid.uuid4())
        reading_data = reading.model_dump()
        reading_data["id"] = reading_id
        reading_data["meter_id"] = meter_id
        reading_data["created_by"] = current_user["id"]
        reading_data["created_by_name"] = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        reading_data["meter_nom"] = meter["nom"]
        reading_data["date_creation"] = datetime.utcnow()
        
        # Calculer la consommation
        if last_reading:
            consommation = reading_data["valeur"] - last_reading["valeur"]
            reading_data["consommation"] = max(0, consommation)  # Éviter les valeurs négatives
            
            # Calculer le coût si prix unitaire disponible
            prix = reading_data.get("prix_unitaire") or meter.get("prix_unitaire")
            if prix and reading_data["consommation"]:
                reading_data["cout"] = reading_data["consommation"] * prix
        else:
            reading_data["consommation"] = 0
            reading_data["cout"] = 0
        
        # Si pas de prix spécifié, utiliser celui du compteur
        if not reading_data.get("prix_unitaire"):
            reading_data["prix_unitaire"] = meter.get("prix_unitaire")
        if not reading_data.get("abonnement_mensuel"):
            reading_data["abonnement_mensuel"] = meter.get("abonnement_mensuel")
        
        await db.meter_readings.insert_one(reading_data)
        
        return MeterReading(**reading_data)
    except Exception as e:
        logger.error(f"Erreur création relevé: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/meters/{meter_id}/readings", response_model=List[MeterReading], tags=["Compteurs"])
async def get_meter_readings(
    meter_id: str,
    current_user: dict = Depends(require_permission("meters", "view")),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Récupérer tous les relevés d'un compteur"""
    try:
        query = {"meter_id": meter_id}
        
        # Filtrer par date si fourni
        if start_date or end_date:
            date_filter = {}
            if start_date:
                date_filter["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            if end_date:
                date_filter["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query["date_releve"] = date_filter
        
        readings = []
        async for reading in db.meter_readings.find(query).sort("date_releve", -1):
            readings.append(MeterReading(**reading))
        return readings
    except Exception as e:
        logger.error(f"Erreur récupération relevés: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/meters/{meter_id}/statistics", tags=["Compteurs"])
async def get_meter_statistics(
    meter_id: str,
    current_user: dict = Depends(require_permission("meters", "view")),
    period: str = "month"  # week, month, quarter, year
):
    """Obtenir les statistiques d'un compteur"""
    try:
        meter = await db.meters.find_one({"id": meter_id})
        if not meter:
            raise HTTPException(status_code=404, detail="Compteur non trouvé")
        
        # Calculer la période
        now = datetime.utcnow()
        if period == "week":
            start_date = now - timedelta(days=7)
        elif period == "month":
            start_date = now - timedelta(days=30)
        elif period == "quarter":
            start_date = now - timedelta(days=90)
        elif period == "year":
            start_date = now - timedelta(days=365)
        else:
            start_date = now - timedelta(days=30)
        
        # Récupérer les relevés de la période
        readings = []
        async for reading in db.meter_readings.find({
            "meter_id": meter_id,
            "date_releve": {"$gte": start_date}
        }).sort("date_releve", 1):
            readings.append(reading)
        
        if not readings:
            return {
                "meter_id": meter_id,
                "meter_nom": meter["nom"],
                "period": period,
                "total_consommation": 0,
                "total_cout": 0,
                "moyenne_journaliere": 0,
                "dernier_releve": None,
                "evolution": []
            }
        
        # Calculer les statistiques
        total_consommation = sum(r.get("consommation", 0) for r in readings if r.get("consommation"))
        total_cout = sum(r.get("cout", 0) for r in readings if r.get("cout"))
        
        # Calculer la moyenne journalière
        if len(readings) > 1:
            first_date = readings[0]["date_releve"]
            last_date = readings[-1]["date_releve"]
            days = (last_date - first_date).days or 1
            moyenne_journaliere = total_consommation / days
        else:
            moyenne_journaliere = 0
        
        # Préparer l'évolution
        evolution = [
            {
                "date": r["date_releve"].isoformat(),
                "valeur": r["valeur"],
                "consommation": r.get("consommation", 0),
                "cout": r.get("cout", 0)
            }
            for r in readings
        ]
        
        # Serialize the last reading to avoid ObjectId issues
        dernier_releve = None
        if readings:
            last_reading = readings[-1].copy()
            # Remove any ObjectId fields that might cause serialization issues
            if "_id" in last_reading:
                del last_reading["_id"]
            dernier_releve = last_reading
        
        return {
            "meter_id": meter_id,
            "meter_nom": meter["nom"],
            "period": period,
            "total_consommation": round(total_consommation, 2),
            "total_cout": round(total_cout, 2),
            "moyenne_journaliere": round(moyenne_journaliere, 2),
            "dernier_releve": dernier_releve,
            "evolution": evolution,
            "nombre_releves": len(readings)
        }
    except Exception as e:
        logger.error(f"Erreur calcul statistiques: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/readings/{reading_id}", response_model=MessageResponse, tags=["Compteurs"])
async def delete_reading(reading_id: str, current_user: dict = Depends(require_permission("meters", "delete"))):
    """Supprimer un relevé"""
    reading = await db.meter_readings.find_one({"id": reading_id})
    if not reading:
        raise HTTPException(status_code=404, detail="Relevé non trouvé")
    
    await db.meter_readings.delete_one({"id": reading_id})
    return {"message": "Relevé supprimé"}



