"""
Routes pour la gestion des consignes avec notification MQTT
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from bson import ObjectId
import json
import asyncio

# Import direct de la dépendance d'authentification
from dependencies import get_current_user
# Import du websocket manager pour vérifier le statut en ligne
from websocket_manager import manager as chat_ws_manager
from routes.shared import find_user_flexible

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

router = APIRouter(prefix="/consignes", tags=["Consignes"])

# Variables globales initialisées par init_consignes_routes
db = None
mqtt_manager = None
audit_service = None

# WebSocket connections pour les consignes
consigne_connections = {}  # user_id -> WebSocket


class ConsigneCreate(BaseModel):
    recipient_id: str
    message: str


class ConsigneGroupCreate(BaseModel):
    service: str  # Nom du service ou "ALL" pour tous
    message: str


class ConsigneResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    recipient_id: str
    recipient_name: str
    message: str
    created_at: str
    acknowledged: bool
    acknowledged_at: Optional[str] = None


class ConsigneGroupResponse(BaseModel):
    success: bool
    total_sent: int
    online_count: int
    offline_count: int
    mqtt_sent_count: int
    service: str
    recipients: list


def init_consignes_routes(database, current_user_dep, mqtt_mgr, audit_svc):
    """Initialise les routes avec les dépendances"""
    global db, mqtt_manager, audit_service
    db = database
    mqtt_manager = mqtt_mgr
    audit_service = audit_svc
    logger.info("✅ Routes consignes initialisées")
    logger.info(f"   - DB: {db is not None}")
    logger.info(f"   - MQTT Manager: {mqtt_manager is not None}")
    logger.info(f"   - Audit Service: {audit_service is not None}")
    return router


@router.post("/send")
async def send_consigne(
    data: ConsigneCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Envoyer une consigne à un utilisateur
    - Stocke la consigne en base
    - Notifie via WebSocket si l'utilisateur est connecté
    - Envoie un message MQTT sur le topic de l'utilisateur
    """
    logger.info(f"📩 Tentative d'envoi de consigne")
    logger.debug(f"   - Destinataire ID: {data.recipient_id}")
    logger.debug(f"   - Message (aperçu): {data.message[:50] if len(data.message) > 50 else data.message}...")
    logger.debug(f"   - Utilisateur courant: {current_user.get('email') if current_user else 'None'}")
    
    try:
        # Vérifier que la DB est initialisée
        if db is None:
            logger.error("❌ Base de données non initialisée!")
            raise HTTPException(status_code=500, detail="Base de données non initialisée")
        
        # Récupérer les infos du destinataire (supporte ObjectId ET UUID)
        logger.debug(f"   - Recherche du destinataire: {data.recipient_id}")
        recipient = await find_user_flexible(data.recipient_id)
        if not recipient:
            logger.error(f"Destinataire non trouvé: {data.recipient_id}")
            raise HTTPException(status_code=404, detail="Destinataire non trouvé")
        
        logger.debug(f"   - Destinataire trouvé: {recipient.get('email')}")
        
        recipient_name = f"{recipient.get('prenom', '')} {recipient.get('nom', '')}".strip()
        sender_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
        
        logger.info(f"📤 Envoi consigne de '{sender_name}' à '{recipient_name}'")
        
        # Normaliser le recipient_id pour matcher get_current_user (str(_id))
        normalized_recipient_id = str(recipient["_id"]) if "_id" in recipient else data.recipient_id

        # Créer la consigne
        consigne = {
            "sender_id": current_user.get("id"),
            "sender_name": sender_name,
            "sender_email": current_user.get("email"),
            "recipient_id": normalized_recipient_id,
            "recipient_name": recipient_name,
            "recipient_email": recipient.get("email"),
            "message": data.message,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "acknowledged": False,
            "acknowledged_at": None
        }
        
        # Insérer en base
        logger.debug("   - Insertion en base de données...")
        result = await db.consignes.insert_one(consigne)
        consigne_id = str(result.inserted_id)
        consigne["id"] = consigne_id
        logger.info(f"✅ Consigne créée avec ID: {consigne_id}")
        
        # Vérifier si l'utilisateur est en ligne via le WebSocket Manager du Chat
        recipient_online = chat_ws_manager.is_user_online(normalized_recipient_id) or chat_ws_manager.is_user_online(data.recipient_id)
        logger.debug(f"   - Destinataire en ligne (WebSocket check): {recipient_online}")
        
        # Notifier via WebSocket consigne si connecté à ce canal
        websocket_sent = False
        for rid in [normalized_recipient_id, data.recipient_id]:
            if rid in consigne_connections:
                try:
                    ws = consigne_connections[rid]
                    await ws.send_json({
                        "type": "new_consigne",
                        "consigne": {
                            "id": consigne_id,
                            "sender_name": sender_name,
                            "message": data.message,
                            "created_at": consigne["created_at"]
                        }
                    })
                    logger.info(f"✅ Consigne envoyée via WebSocket consigne à {recipient_name}")
                    websocket_sent = True
                    break
                except Exception as e:
                    logger.error(f"❌ Erreur envoi WebSocket consigne: {e}")
        
        # Envoyer les messages MQTT (même si utilisateur hors ligne)
        mqtt_sent = False
        mqtt_topic = recipient.get("mqtt_topic")
        mqtt_action_reception = recipient.get("mqtt_action_reception", "")
        mqtt_topic_discret = recipient.get("mqtt_topic_discret", "")
        
        logger.debug(f"   - MQTT Topic: {mqtt_topic}")
        logger.debug(f"   - MQTT Action Reception (payload): {mqtt_action_reception}")
        logger.debug(f"   - MQTT Topic Discret: {mqtt_topic_discret}")
        logger.debug(f"   - MQTT Manager disponible: {mqtt_manager is not None}")
        
        if mqtt_manager:
            # 1. Envoyer le payload simple sur le topic principal
            if mqtt_topic and mqtt_action_reception:
                try:
                    logger.debug(f"   - Publication payload simple sur: {mqtt_topic}")
                    mqtt_sent = mqtt_manager.publish(
                        topic=mqtt_topic,
                        payload=mqtt_action_reception,  # Payload simple (ex: "ON")
                        qos=1,
                        retain=False
                    )
                    
                    if mqtt_sent:
                        logger.info(f"✅ Payload '{mqtt_action_reception}' envoyé sur {mqtt_topic}")
                        
                        # Enregistrer dans l'historique MQTT
                        await db.mqtt_publish_history.insert_one({
                            "topic": mqtt_topic,
                            "payload": mqtt_action_reception,
                            "qos": 1,
                            "retain": False,
                            "published_at": datetime.now(timezone.utc).isoformat(),
                            "published_by": current_user.get("id"),
                            "user_email": current_user.get("email"),
                            "context": "consigne_reception_action"
                        })
                    else:
                        logger.warning(f"⚠️ Échec publication payload simple")
                except Exception as e:
                    logger.error(f"❌ Erreur envoi payload simple: {e}")
            
            # 2. Envoyer le JSON détaillé sur le topic discret
            if mqtt_topic_discret:
                try:
                    json_payload = json.dumps({
                        "type": "consigne_received",
                        "sender": sender_name,
                        "message": data.message,
                        "timestamp": consigne["created_at"],
                        "consigne_id": consigne_id
                    })
                    
                    logger.debug(f"   - Publication JSON détaillé sur: {mqtt_topic_discret}")
                    discret_sent = mqtt_manager.publish(
                        topic=mqtt_topic_discret,
                        payload=json_payload,
                        qos=1,
                        retain=False
                    )
                    
                    if discret_sent:
                        logger.info(f"✅ JSON détaillé envoyé sur {mqtt_topic_discret}")
                        
                        # Enregistrer dans l'historique MQTT
                        await db.mqtt_publish_history.insert_one({
                            "topic": mqtt_topic_discret,
                            "payload": json_payload,
                            "qos": 1,
                            "retain": False,
                            "published_at": datetime.now(timezone.utc).isoformat(),
                            "published_by": current_user.get("id"),
                            "user_email": current_user.get("email"),
                            "context": "consigne_reception_discret"
                        })
                    else:
                        logger.warning(f"⚠️ Échec publication JSON discret")
                except Exception as e:
                    logger.error(f"❌ Erreur envoi JSON discret: {e}")
        else:
            logger.debug("   - MQTT Manager non disponible")
        
        # Log dans le journal d'audit
        if audit_service:
            try:
                await audit_service.log_action(
                    user_id=current_user.get("id"),
                    user_name=sender_name,
                    user_email=current_user.get("email"),
                    action="CREATE",
                    entity_type="CONSIGNE",
                    entity_id=consigne_id,
                    entity_name=f"Consigne à {recipient_name}",
                    details={
                        "recipient_id": data.recipient_id,
                        "recipient_name": recipient_name,
                        "message_preview": data.message[:100] if len(data.message) > 100 else data.message
                    }
                )
                logger.debug("   - Audit log créé")
            except Exception as e:
                logger.warning(f"⚠️ Erreur audit consigne: {e}")
        
        response = {
            "success": True,
            "consigne_id": consigne_id,
            "recipient_online": recipient_online,
            "mqtt_sent": mqtt_sent,
            "message": f"Consigne envoyée à {recipient_name}" + 
                      (" (hors ligne - stockée)" if not recipient_online else " (en ligne)")
        }
        
        logger.info(f"✅ Consigne envoyée avec succès: {response}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur inattendue envoi consigne: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur envoi consigne: {str(e)}")


@router.get("/pending")
async def get_pending_consignes(
    current_user: dict = Depends(get_current_user)
):
    """Récupérer les consignes non acquittées pour l'utilisateur connecté"""
    try:
        if db is None:
            logger.error("❌ Base de données non initialisée!")
            raise HTTPException(status_code=500, detail="Base de données non initialisée")
        
        user_id = current_user.get("id")
        logger.debug(f"📋 Récupération consignes en attente pour user: {user_id}")

        # Chercher aussi par l'ID custom de l'utilisateur (pour les consignes legacy)
        user_doc = await db.users.find_one({"_id": ObjectId(user_id)}) if user_id else None
        possible_ids = [user_id]
        if user_doc and user_doc.get("id") and user_doc["id"] != user_id:
            possible_ids.append(user_doc["id"])

        consignes = await db.consignes.find({
            "recipient_id": {"$in": possible_ids},
            "acknowledged": False
        }).sort("created_at", 1).to_list(100)
        
        result = []
        for c in consignes:
            result.append({
                "id": str(c["_id"]),
                "sender_id": c.get("sender_id"),
                "sender_name": c.get("sender_name"),
                "message": c.get("message"),
                "created_at": c.get("created_at")
            })
        
        logger.debug(f"   - {len(result)} consigne(s) en attente")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur récupération consignes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{consigne_id}/acknowledge")
async def acknowledge_consigne(
    consigne_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Acquitter une consigne (clic sur OK)
    - Met à jour le statut en base
    - Envoie le message MQTT "Action OK"
    - Envoie un message dans le Chat Live
    """
    logger.info(f"✅ Acquittement consigne: {consigne_id}")
    
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Base de données non initialisée")
        
        user_id = current_user.get("id")
        user_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
        
        # Récupérer la consigne
        try:
            consigne_oid = ObjectId(consigne_id)
        except:
            raise HTTPException(status_code=400, detail="ID consigne invalide")
        
        consigne = await db.consignes.find_one({
            "_id": consigne_oid,
            "recipient_id": user_id
        })
        
        if not consigne:
            logger.error(f"❌ Consigne non trouvée: {consigne_id} pour user {user_id}")
            raise HTTPException(status_code=404, detail="Consigne non trouvée")
        
        if consigne.get("acknowledged"):
            logger.debug("   - Consigne déjà acquittée")
            return {"success": True, "message": "Consigne déjà acquittée"}
        
        ack_time = datetime.now(timezone.utc)
        
        # Mettre à jour la consigne
        await db.consignes.update_one(
            {"_id": consigne_oid},
            {"$set": {
                "acknowledged": True,
                "acknowledged_at": ack_time.isoformat()
            }}
        )
        logger.debug("   - Consigne mise à jour en base")
        
        # Récupérer les infos utilisateur pour MQTT
        user = await find_user_flexible(user_id)
        mqtt_sent = False
        
        if user and mqtt_manager:
            mqtt_topic = user.get("mqtt_topic")
            mqtt_action_ok = user.get("mqtt_action_ok", "")
            mqtt_topic_discret = user.get("mqtt_topic_discret", "")
            
            # 1. Envoyer le payload simple sur le topic principal
            if mqtt_topic and mqtt_action_ok:
                try:
                    mqtt_sent = mqtt_manager.publish(
                        topic=mqtt_topic,
                        payload=mqtt_action_ok,  # Payload simple (ex: "OFF")
                        qos=1,
                        retain=False
                    )
                    
                    if mqtt_sent:
                        logger.info(f"✅ Payload '{mqtt_action_ok}' envoyé sur {mqtt_topic}")
                        
                        # Enregistrer dans l'historique MQTT
                        await db.mqtt_publish_history.insert_one({
                            "topic": mqtt_topic,
                            "payload": mqtt_action_ok,
                            "qos": 1,
                            "retain": False,
                            "published_at": ack_time.isoformat(),
                            "published_by": user_id,
                            "user_email": user.get("email"),
                            "context": "consigne_ack_action"
                        })
                except Exception as e:
                    logger.error(f"❌ Erreur envoi payload ACK: {e}")
            
            # 2. Envoyer le JSON détaillé sur le topic discret
            if mqtt_topic_discret:
                try:
                    json_payload = json.dumps({
                        "type": "consigne_acknowledged",
                        "consigne_id": consigne_id,
                        "acknowledged_by": user_name,
                        "timestamp": ack_time.isoformat(),
                        "original_sender": consigne.get("sender_name")
                    })
                    
                    discret_sent = mqtt_manager.publish(
                        topic=mqtt_topic_discret,
                        payload=json_payload,
                        qos=1,
                        retain=False
                    )
                    
                    if discret_sent:
                        logger.info(f"✅ JSON ACK envoyé sur {mqtt_topic_discret}")
                        
                        # Enregistrer dans l'historique MQTT
                        await db.mqtt_publish_history.insert_one({
                            "topic": mqtt_topic_discret,
                            "payload": json_payload,
                            "qos": 1,
                            "retain": False,
                            "published_at": ack_time.isoformat(),
                            "published_by": user_id,
                            "user_email": user.get("email"),
                            "context": "consigne_ack_discret"
                        })
                except Exception as e:
                    logger.error(f"❌ Erreur envoi JSON ACK discret: {e}")
        
        # Envoyer un message dans le Chat Live
        sender_name = consigne.get("sender_name", "Expéditeur")
        ack_message = f"📋 {user_name} a lu la consigne de {sender_name} à {ack_time.strftime('%d/%m/%Y %H:%M')}"
        
        try:
            # Créer le message chat
            chat_message = {
                "user_id": "system",
                "user_name": "Système",
                "user_email": "system@gmao.local",
                "message": ack_message,
                "timestamp": ack_time.isoformat(),
                "is_private": False,
                "recipients": [],
                "is_system": True,
                "attachments": []
            }
            
            # Insérer en base de données
            result = await db.chat_messages.insert_one(chat_message)
            chat_message["id"] = str(result.inserted_id)
            
            # Broadcaster via WebSocket à tous les utilisateurs connectés
            await chat_ws_manager.broadcast({
                "type": "new_message",
                "message": {
                    "id": chat_message["id"],
                    "user_id": "system",
                    "user_name": "Système",
                    "message": ack_message,
                    "timestamp": ack_time.isoformat(),
                    "is_private": False,
                    "is_system": True,
                    "attachments": []
                }
            })
            
            logger.info(f"✅ Message Chat Live broadcasté: {ack_message}")
        except Exception as e:
            logger.warning(f"⚠️ Erreur envoi message Chat: {e}")
        
        # Log dans le journal d'audit
        if audit_service:
            try:
                await audit_service.log_action(
                    user_id=user_id,
                    user_name=user_name,
                    user_email=current_user.get("email"),
                    action="UPDATE",
                    entity_type="CONSIGNE",
                    entity_id=consigne_id,
                    entity_name=f"Acquittement consigne de {sender_name}",
                    details={
                        "acknowledged_at": ack_time.isoformat(),
                        "sender_name": sender_name
                    }
                )
            except Exception as e:
                logger.warning(f"⚠️ Erreur audit acquittement: {e}")
        
        return {
            "success": True,
            "message": "Consigne acquittée",
            "mqtt_sent": mqtt_sent,
            "acknowledged_at": ack_time.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur acquittement consigne: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_consignes_history(
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer l'historique des consignes (envoyées et reçues)"""
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Base de données non initialisée")
        
        user_id = current_user.get("id")
        
        # Consignes envoyées
        sent = await db.consignes.find({
            "sender_id": user_id
        }).sort("created_at", -1).to_list(limit)
        
        # Consignes reçues
        received = await db.consignes.find({
            "recipient_id": user_id
        }).sort("created_at", -1).to_list(limit)
        
        def format_consigne(c, direction):
            return {
                "id": str(c["_id"]),
                "direction": direction,
                "sender_name": c.get("sender_name"),
                "recipient_name": c.get("recipient_name"),
                "message": c.get("message"),
                "created_at": c.get("created_at"),
                "acknowledged": c.get("acknowledged", False),
                "acknowledged_at": c.get("acknowledged_at")
            }
        
        result = {
            "sent": [format_consigne(c, "sent") for c in sent],
            "received": [format_consigne(c, "received") for c in received]
        }
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur historique consignes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/services")
async def get_services_list(
    current_user: dict = Depends(get_current_user)
):
    """Récupérer la liste des services utilisés (pour la consigne générale)"""
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Base de données non initialisée")
        
        # Récupérer tous les services distincts des utilisateurs
        services = await db.users.distinct("service")
        
        # Filtrer les valeurs vides et trier
        services = sorted([s for s in services if s and s.strip()])
        
        logger.debug(f"📋 Services trouvés: {services}")
        
        return {
            "success": True,
            "services": services
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur récupération services: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send-group")
async def send_consigne_group(
    data: ConsigneGroupCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Envoyer une consigne à tous les utilisateurs d'un service (ou tous les services)
    """
    logger.info(f"📩 Envoi consigne de groupe - Service: {data.service}")
    
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Base de données non initialisée")
        
        sender_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
        sender_id = current_user.get("id")
        
        # Construire la requête pour trouver les utilisateurs
        # Exclure l'expéditeur par _id OU par champ id (supporte ObjectId et UUID)
        exclude_sender = {"$and": [{"id": {"$ne": sender_id}}]}
        try:
            exclude_sender = {"$and": [
                {"_id": {"$ne": ObjectId(sender_id)}},
                {"id": {"$ne": sender_id}}
            ]}
        except Exception:
            pass

        if data.service == "ALL":
            query = exclude_sender
            service_label = "Tous les services"
        else:
            query = {
                "service": data.service,
                **exclude_sender
            }
            service_label = data.service
        
        # Récupérer les utilisateurs
        recipients = await db.users.find(query).to_list(length=None)
        
        if not recipients:
            return {
                "success": True,
                "total_sent": 0,
                "online_count": 0,
                "offline_count": 0,
                "mqtt_sent_count": 0,
                "service": service_label,
                "recipients": [],
                "message": "Aucun utilisateur trouvé dans ce service"
            }
        
        logger.info(f"📤 Envoi à {len(recipients)} utilisateur(s) - Service: {service_label}")
        
        # Compteurs pour le récapitulatif
        online_count = 0
        offline_count = 0
        mqtt_sent_count = 0
        recipients_info = []
        created_at = datetime.now(timezone.utc).isoformat()
        
        # Créer une consigne pour chaque utilisateur
        for recipient in recipients:
            recipient_id = str(recipient["_id"])
            recipient_name = f"{recipient.get('prenom', '')} {recipient.get('nom', '')}".strip()
            
            # Créer la consigne
            consigne = {
                "sender_id": sender_id,
                "sender_name": sender_name,
                "sender_email": current_user.get("email"),
                "recipient_id": recipient_id,
                "recipient_name": recipient_name,
                "recipient_email": recipient.get("email"),
                "message": data.message,
                "created_at": created_at,
                "acknowledged": False,
                "acknowledged_at": None,
                "is_group_consigne": True,
                "group_service": data.service
            }
            
            # Insérer en base
            result = await db.consignes.insert_one(consigne)
            consigne_id = str(result.inserted_id)
            
            # Vérifier statut en ligne
            is_online = chat_ws_manager.is_user_online(recipient_id)
            if is_online:
                online_count += 1
            else:
                offline_count += 1
            
            # Notifier via WebSocket consigne si connecté
            if recipient_id in consigne_connections:
                try:
                    ws = consigne_connections[recipient_id]
                    await ws.send_json({
                        "type": "new_consigne",
                        "consigne": {
                            "id": consigne_id,
                            "sender_name": sender_name,
                            "message": data.message,
                            "created_at": created_at
                        }
                    })
                except Exception as e:
                    logger.error(f"❌ Erreur WebSocket pour {recipient_name}: {e}")
            
            # Envoyer MQTT
            mqtt_sent = False
            mqtt_topic = recipient.get("mqtt_topic")
            mqtt_action_reception = recipient.get("mqtt_action_reception", "")
            mqtt_topic_discret = recipient.get("mqtt_topic_discret", "")
            
            if mqtt_manager:
                # 1. Payload simple sur topic principal
                if mqtt_topic and mqtt_action_reception:
                    try:
                        if mqtt_manager.publish(topic=mqtt_topic, payload=mqtt_action_reception, qos=1, retain=False):
                            mqtt_sent = True
                            await db.mqtt_publish_history.insert_one({
                                "topic": mqtt_topic,
                                "payload": mqtt_action_reception,
                                "qos": 1,
                                "retain": False,
                                "published_at": created_at,
                                "published_by": sender_id,
                                "user_email": current_user.get("email"),
                                "context": "consigne_group_reception_action"
                            })
                    except Exception as e:
                        logger.error(f"❌ Erreur MQTT action pour {recipient_name}: {e}")
                
                # 2. JSON détaillé sur topic discret
                if mqtt_topic_discret:
                    try:
                        json_payload = json.dumps({
                            "type": "consigne_received",
                            "sender": sender_name,
                            "message": data.message,
                            "timestamp": created_at,
                            "consigne_id": consigne_id,
                            "is_group": True,
                            "service": data.service
                        })
                        if mqtt_manager.publish(topic=mqtt_topic_discret, payload=json_payload, qos=1, retain=False):
                            mqtt_sent = True
                            await db.mqtt_publish_history.insert_one({
                                "topic": mqtt_topic_discret,
                                "payload": json_payload,
                                "qos": 1,
                                "retain": False,
                                "published_at": created_at,
                                "published_by": sender_id,
                                "user_email": current_user.get("email"),
                                "context": "consigne_group_reception_discret"
                            })
                    except Exception as e:
                        logger.error(f"❌ Erreur MQTT discret pour {recipient_name}: {e}")
            
            if mqtt_sent:
                mqtt_sent_count += 1
            
            recipients_info.append({
                "id": recipient_id,
                "name": recipient_name,
                "online": is_online,
                "mqtt_sent": mqtt_sent
            })
        
        # Log dans le journal d'audit
        if audit_service:
            try:
                await audit_service.log_action(
                    user_id=sender_id,
                    user_name=sender_name,
                    user_email=current_user.get("email"),
                    action="CREATE",
                    entity_type="CONSIGNE_GROUP",
                    entity_id=f"group_{data.service}_{created_at}",
                    entity_name=f"Consigne générale - {service_label}",
                    details={
                        "service": data.service,
                        "recipients_count": len(recipients),
                        "message_preview": data.message[:100] if len(data.message) > 100 else data.message
                    }
                )
            except Exception as e:
                logger.warning(f"⚠️ Erreur audit consigne groupe: {e}")
        
        response = {
            "success": True,
            "total_sent": len(recipients),
            "online_count": online_count,
            "offline_count": offline_count,
            "mqtt_sent_count": mqtt_sent_count,
            "service": service_label,
            "recipients": recipients_info,
            "message": f"Consigne envoyée à {len(recipients)} utilisateur(s)"
        }
        
        logger.info(f"✅ Consigne groupe envoyée: {response}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur envoi consigne groupe: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur envoi consigne: {str(e)}")


# WebSocket pour les notifications de consignes en temps réel
async def consignes_websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket pour recevoir les consignes en temps réel"""
    import jwt
    import os
    
    user_id = None
    
    try:
        # Vérifier le token
        secret = os.environ.get("JWT_SECRET", "your-secret-key")
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        
        if not user_id:
            logger.warning("❌ WebSocket consignes: token sans user_id")
            await websocket.close(code=4001)
            return
        
        await websocket.accept()
        logger.info(f"🔔 WebSocket consignes connecté: user {user_id}")
        
        # Enregistrer la connexion
        consigne_connections[user_id] = websocket
        
        try:
            while True:
                # Maintenir la connexion avec des heartbeats
                data = await asyncio.wait_for(websocket.receive_json(), timeout=60)
                
                if data.get("type") == "heartbeat":
                    await websocket.send_json({"type": "heartbeat_ack"})
                    
        except asyncio.TimeoutError:
            # Envoyer un ping
            try:
                await websocket.send_json({"type": "ping"})
            except:
                pass
            
    except WebSocketDisconnect:
        logger.info(f"🔌 WebSocket consignes déconnecté: user {user_id}")
    except jwt.ExpiredSignatureError:
        logger.warning("❌ WebSocket consignes: token expiré")
        try:
            await websocket.close(code=4001)
        except:
            pass
    except jwt.InvalidTokenError as e:
        logger.warning(f"❌ WebSocket consignes: token invalide - {e}")
        try:
            await websocket.close(code=4001)
        except:
            pass
    except Exception as e:
        logger.error(f"❌ Erreur WebSocket consignes: {e}")
    finally:
        # Nettoyer la connexion
        if user_id and user_id in consigne_connections:
            del consigne_connections[user_id]
            logger.debug(f"   - Connexion WebSocket nettoyée pour {user_id}")
