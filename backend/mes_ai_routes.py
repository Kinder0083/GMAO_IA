"""
Routes IA pour le module M.E.S.
- POST /mes/ai/analyze-payload : analyse un JSON et propose des mappings
- POST /mes/ai/sniff-mqtt      : capture en direct sur un topic (lit mqtt_messages)
- GET/PUT /mes/ai/config       : config admin du modele LLM utilise
- POST /mes/ai/test-mapping/{machine_id} : extrait du dernier message les valeurs mappees
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from dependencies import get_current_user, get_current_admin_user, get_database
from models import (
    MESPayloadAnalysisRequest,
    MESPayloadAnalysisResult,
    MESSniffRequest,
    MESSniffResult,
    MESAIConfig,
    MESAIConfigUpdate,
    MESTestMappingResult,
)
from mes_ai_service import MESAIService, extract_value_from_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mes/ai", tags=["MES AI"])


def _service(db) -> MESAIService:
    return MESAIService(db)


@router.get("/config", response_model=MESAIConfig,
    summary="Recuperer la config IA MES",
    description="Renvoie le modele LLM (provider + model) actuellement utilise pour l'auto-mapping de payload JSON M.E.S.")
async def get_ai_config(current_user: dict = Depends(get_current_user), db=Depends(get_database)):
    cfg = await _service(db).get_config()
    return MESAIConfig(**cfg)


@router.put("/config", response_model=MESAIConfig,
    summary="Mettre a jour la config IA MES",
    description="Admin uniquement. Modifie le provider/model utilise pour l'auto-mapping.")
async def update_ai_config(
    payload: MESAIConfigUpdate,
    current_user: dict = Depends(get_current_admin_user),
    db=Depends(get_database),
):
    data = payload.model_dump(exclude_unset=True)
    cfg = await _service(db).update_config(data)
    return MESAIConfig(**cfg)


@router.post("/analyze-payload", response_model=MESPayloadAnalysisResult,
    summary="Analyser un payload JSON et proposer un mapping",
    description="Recoit un payload JSON brut et utilise l'IA (Claude/GPT) pour proposer un mapping de champs vers les destinations MES (cadence, total, etat, etc.). En cas d'indisponibilite du LLM, une heuristique locale est utilisee.")
async def analyze_payload(
    body: MESPayloadAnalysisRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    try:
        result = await _service(db).analyze_payload(
            body.payload, machine_name=body.machine_name, machine_type=body.machine_type
        )
        return MESPayloadAnalysisResult(**result)
    except Exception as e:
        logger.exception("[MES AI] analyze_payload echec")
        raise HTTPException(status_code=500, detail=f"Echec analyse payload : {e}")


@router.post("/sniff-mqtt", response_model=MESSniffResult,
    summary="Capture live d'un topic MQTT",
    description="Ecoute un topic MQTT pendant N secondes (par defaut 95s) et renvoie tous les messages recus. Utilise pour la detection automatique du format JSON.")
async def sniff_mqtt(
    body: MESSniffRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    if not body.topic:
        raise HTTPException(status_code=400, detail="Topic requis")
    duration = max(5, min(int(body.duration_seconds or 95), 300))

    # On lit dans la collection `mqtt_messages` qui est aliemente par mqtt_manager.
    # Avant l'attente, on memorise l'instant de demarrage pour ne capturer que les
    # messages recus durant la fenetre.
    started_at = datetime.now(timezone.utc).isoformat()

    # On souscrit au topic via mqtt_manager si existant pour s'assurer que les
    # messages publies pendant la fenetre seront bien stockes.
    try:
        from mqtt_manager import mqtt_manager  # type: ignore
        if mqtt_manager and getattr(mqtt_manager, "is_connected", False):
            try:
                mqtt_manager.subscribe(body.topic, callback=None)
            except Exception:
                pass
    except Exception:
        pass

    # Attente bloquante (max 5 minutes)
    await asyncio.sleep(duration)

    ended_at = datetime.now(timezone.utc).isoformat()
    cursor = db.mqtt_messages.find(
        {
            "topic": body.topic,
            "received_at": {"$gte": started_at, "$lte": ended_at},
        },
        {"_id": 0, "topic": 1, "payload": 1, "received_at": 1},
    ).sort("received_at", 1)
    messages = await cursor.to_list(length=200)

    return MESSniffResult(
        success=True,
        topic=body.topic,
        duration_seconds=duration,
        messages=messages,
        count=len(messages),
    )


@router.get("/last-message", response_model=MESSniffResult,
    summary="Dernier message MQTT recu sur un topic",
    description="Retourne le dernier message recu sur un topic donne (utile pour 'Tester le mapping').")
async def last_message(
    topic: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    if not topic:
        raise HTTPException(status_code=400, detail="Topic requis")
    msg = await db.mqtt_messages.find_one(
        {"topic": topic},
        {"_id": 0, "topic": 1, "payload": 1, "received_at": 1},
        sort=[("received_at", -1)],
    )
    return MESSniffResult(
        success=True,
        topic=topic,
        duration_seconds=0,
        messages=[msg] if msg else [],
        count=1 if msg else 0,
    )


@router.post("/test-mapping/{machine_id}", response_model=MESTestMappingResult,
    summary="Tester le mapping configure sur le dernier message",
    description="Recupere le dernier message MQTT recu sur le topic unifie de la machine, applique les field_mappings et renvoie les valeurs extraites + manquantes.")
async def test_mapping(
    machine_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
):
    from bson import ObjectId
    try:
        machine = await db.mes_machines.find_one({"_id": ObjectId(machine_id)})
    except Exception:
        machine = None
    if not machine:
        raise HTTPException(status_code=404, detail="Machine non trouvee")

    topic = machine.get("unified_topic") or machine.get("mqtt_topic")
    if not topic:
        return MESTestMappingResult(success=False, error="Aucun topic MQTT configure", extracted={}, missing=[])

    msg = await db.mqtt_messages.find_one(
        {"topic": topic},
        sort=[("received_at", -1)],
    )
    if not msg:
        return MESTestMappingResult(success=False, error=f"Aucun message recu sur '{topic}'", extracted={}, missing=[])

    payload_str = msg.get("payload", "")
    try:
        data = json.loads(payload_str) if isinstance(payload_str, str) else payload_str
    except json.JSONDecodeError:
        return MESTestMappingResult(
            success=False,
            raw_payload=payload_str,
            received_at=str(msg.get("received_at")),
            extracted={},
            missing=[],
            error="Le dernier message n'est pas un JSON valide",
        )

    field_mappings = machine.get("field_mappings", []) or []
    extracted = {}
    missing = []
    for fm in field_mappings:
        if not fm.get("enabled", True):
            continue
        path = fm.get("json_path")
        key = fm.get("key") or path
        val = extract_value_from_path(data, path) if path else None
        if val is None:
            missing.append(key)
        else:
            extracted[key] = val

    return MESTestMappingResult(
        success=True,
        raw_payload=payload_str,
        received_at=str(msg.get("received_at")),
        extracted=extracted,
        missing=missing,
    )
