"""
Routes des Notifications - CRUD, Web Push, Abonnements
Extrait de server.py pour une meilleure maintenabilite.
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
import logging

from models import ActionType, EntityType, NotificationCountResponse
from dependencies import get_current_user, require_permission
from routes.shared import db, audit_service, serialize_doc, find_user_flexible

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Notifications"])


def _get_realtime_manager():
    from realtime_manager import realtime_manager
    return realtime_manager



# --- Push Notifications (routes pour l'app mobile Expo) ---
# Ces routes DOIVENT etre definies AVANT les routes /notifications/{notification_id}
# pour eviter que "register", "unregister", "test" soient captures comme des IDs
from notifications import (
    send_expo_push_notification,
    DeviceTokenCreate
)
from web_push import (
    send_web_push_to_user,
    notify_work_order_assigned_web,
    notify_work_order_status_changed_web,
    notify_equipment_alert_web,
    notify_chat_message_web
)

# ============================================================
# WEB PUSH (PWA) - Endpoints
# ============================================================

@router.get("/web-push/vapid-key", tags=["Web Push PWA"])
async def get_vapid_public_key():
    """Retourne la cle publique VAPID pour l'abonnement push."""
    key = os.environ.get("VAPID_PUBLIC_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="VAPID key not configured")
    return {"publicKey": key}

@router.post("/web-push/subscribe", tags=["Web Push PWA"])
async def web_push_subscribe(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Enregistre un abonnement web push pour l'utilisateur connecte."""
    body = await request.json()
    subscription = body.get("subscription")
    browser = body.get("browser", "unknown")
    
    if not subscription or not subscription.get("endpoint"):
        raise HTTPException(status_code=400, detail="Subscription invalide")
    
    user_id = str(current_user["id"])
    now = datetime.now(timezone.utc)
    endpoint = subscription["endpoint"]

    # Vérifier si cet endpoint était précédemment mort (HTTP 410/404/VAPID mismatch)
    # Dans ce cas, signaler au frontend qu'il faut un abonnement frais
    existing_dead = await db.web_push_subscriptions.find_one(
        {"subscription.endpoint": endpoint, "is_active": False,
         "deactivation_reason": {"$in": [
             "HTTP 410", "HTTP 404", "endpoint_gone",
             "vapid_key_mismatch", "vapid_key_changed"
         ]}}
    )
    needs_fresh = bool(existing_dead)
    
    # Desactiver les anciens abonnements du meme navigateur (endpoints différents)
    await db.web_push_subscriptions.update_many(
        {"user_id": user_id, "browser": browser, "subscription.endpoint": {"$ne": endpoint}},
        {"$set": {"is_active": False, "updated_at": now}}
    )
    
    # Upsert l'abonnement — supprimer raison de désactivation si réactivé
    await db.web_push_subscriptions.update_one(
        {"subscription.endpoint": endpoint},
        {"$set": {
            "user_id": user_id,
            "subscription": subscription,
            "browser": browser,
            "is_active": True,
            "updated_at": now
        },
        "$unset": {"deactivation_reason": "", "deactivated_at": ""},
        "$setOnInsert": {"created_at": now}},
        upsert=True
    )
    
    logger.info(f"[WEB PUSH] Abonnement enregistré pour user {user_id} ({browser}), fresh={not needs_fresh}")
    return {
        "message": "Abonnement enregistre",
        "status": "ok",
        "needs_fresh_subscription": needs_fresh
    }

@router.post("/web-push/unsubscribe", tags=["Web Push PWA"])
async def web_push_unsubscribe(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Desactive un abonnement web push."""
    body = await request.json()
    endpoint = body.get("endpoint")
    
    if endpoint:
        await db.web_push_subscriptions.update_one(
            {"subscription.endpoint": endpoint},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
    else:
        await db.web_push_subscriptions.update_many(
            {"user_id": str(current_user["id"])},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
    
    return {"message": "Desabonne"}

@router.post("/web-push/test", tags=["Web Push PWA"])
async def web_push_test(
    current_user: dict = Depends(get_current_user),
):
    """Envoie une notification de test a l'utilisateur connecte."""
    result = await send_web_push_to_user(
        db, str(current_user["id"]),
        title="Test de notification FSAO",
        body="Les notifications PWA fonctionnent correctement !",
        data={"type": "test"},
        tag="test-notification"
    )
    return result

@router.get("/web-push/users-status", tags=["Web Push PWA"])
async def web_push_users_status(
    current_user: dict = Depends(get_current_user),
):
    """Retourne le statut d'abonnement push pour tous les utilisateurs (admin only)."""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin uniquement")

    users = await db.users.find(
        {},
        {"_id": 1, "nom": 1, "prenom": 1, "email": 1, "role": 1}
    ).to_list(500)

    result = []
    for user in users:
        user_id = str(user["_id"])

        # Abonnement actif le plus récent
        active_sub = await db.web_push_subscriptions.find_one(
            {"user_id": user_id, "is_active": True},
            {"_id": 0, "browser": 1, "updated_at": 1}
        )

        # Si aucun actif, chercher le plus récent inactif pour savoir s'il s'est déjà abonné
        inactive_sub = None
        if not active_sub:
            cursor = db.web_push_subscriptions.find(
                {"user_id": user_id, "is_active": False},
                {"_id": 0, "browser": 1, "updated_at": 1, "deactivation_reason": 1}
            ).sort("updated_at", -1).limit(1)
            docs = await cursor.to_list(1)
            inactive_sub = docs[0] if docs else None

        def iso(dt):
            if not dt:
                return None
            return dt.isoformat() if hasattr(dt, 'isoformat') else str(dt)

        if active_sub:
            push_status = "active"
            browser = active_sub.get("browser", "?")
            last_update = iso(active_sub.get("updated_at"))
            deactivation_reason = None
        elif inactive_sub:
            push_status = "expired"
            browser = inactive_sub.get("browser", "?")
            last_update = iso(inactive_sub.get("updated_at"))
            deactivation_reason = inactive_sub.get("deactivation_reason")
        else:
            push_status = "never"
            browser = None
            last_update = None
            deactivation_reason = None

        result.append({
            "user_id": user_id,
            "nom": user.get("nom", ""),
            "prenom": user.get("prenom", ""),
            "email": user.get("email", ""),
            "role": user.get("role", "TECHNICIEN"),
            "push_status": push_status,
            "browser": browser,
            "last_update": last_update,
            "deactivation_reason": deactivation_reason,
        })

    # Trier : actifs en premier, puis expirés, puis jamais
    order = {"active": 0, "expired": 1, "never": 2}
    result.sort(key=lambda u: (order.get(u["push_status"], 3), u.get("nom", "")))
    return {"users": result}


async def web_push_list_subscriptions(
    current_user: dict = Depends(get_current_user),
):
    """Liste les abonnements web push."""
    is_admin = current_user.get("role") == "ADMIN"
    query = {} if is_admin else {"user_id": str(current_user["id"])}
    
    subs = []
    async for doc in db.web_push_subscriptions.find(query, {"_id": 0}):
        for k in ["created_at", "updated_at", "deactivated_at"]:
            if k in doc and hasattr(doc[k], 'isoformat'):
                doc[k] = doc[k].isoformat()
        # Masquer les details de la subscription pour la securite
        if "subscription" in doc:
            doc["endpoint_preview"] = doc["subscription"].get("endpoint", "")[:60] + "..."
            del doc["subscription"]
        subs.append(doc)
    
    return {"total": len(subs), "subscriptions": subs}

# ============================================================
# EXPO PUSH (Mobile) - Endpoints existants
# ============================================================

@router.post("/notifications/register", tags=["Push Notifications"])
async def mobile_register_device_token(
    token_data: DeviceTokenCreate,
    current_user: dict = Depends(get_current_user),
):
    """Register a device push token (mobile app endpoint).
    Un utilisateur + un appareil = un seul token actif.
    Les anciens tokens du meme device_name sont desactives."""
    try:
        user_id = str(current_user["id"])
        logger.info(f"[PUSH REGISTER] user_id={user_id}, token={token_data.push_token[:30]}..., platform={token_data.platform}, device={token_data.device_name}")
        now = datetime.now(timezone.utc)

        # Desactiver les anciens tokens du meme utilisateur + meme appareil
        if token_data.device_name:
            old_tokens = await db.device_tokens.update_many(
                {
                    "user_id": user_id,
                    "device_name": token_data.device_name,
                    "push_token": {"$ne": token_data.push_token}
                },
                {"$set": {"is_active": False, "updated_at": now}}
            )
            if old_tokens.modified_count > 0:
                logger.info(f"[PUSH REGISTER] Desactive {old_tokens.modified_count} ancien(s) token(s) pour {token_data.device_name}")

        # Upsert le nouveau token
        result = await db.device_tokens.update_one(
            {"push_token": token_data.push_token},
            {"$set": {
                "user_id": user_id,
                "platform": token_data.platform,
                "device_name": token_data.device_name,
                "updated_at": now,
                "is_active": True
            },
            "$setOnInsert": {
                "created_at": now
            }},
            upsert=True
        )

        if result.upserted_id:
            logger.info(f"[PUSH REGISTER] New token registered for user {user_id}: {str(result.upserted_id)}")
            return {"message": "Token registered", "token_id": str(result.upserted_id)}
        else:
            logger.info(f"[PUSH REGISTER] Token updated for user {user_id}")
            return {"message": "Token updated"}
    except Exception as e:
        logger.error(f"[PUSH REGISTER] ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur enregistrement token: {str(e)}")

@router.delete("/notifications/unregister", tags=["Push Notifications"])
async def mobile_unregister_device_token(
    push_token: str,
    current_user: dict = Depends(get_current_user),
):
    """Unregister a device push token (mobile app endpoint)."""
    user_id = str(current_user["id"])
    result = await db.device_tokens.update_one(
        {"user_id": user_id, "push_token": push_token},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"message": "Token unregistered"}

@router.post("/notifications/test", tags=["Push Notifications"])
async def mobile_test_notification(
    current_user: dict = Depends(get_current_user),
):
    """Send a test notification to the current user (mobile app endpoint)."""
    user_id = str(current_user["id"])
    tokens_cursor = db.device_tokens.find({"user_id": user_id, "is_active": True})
    tokens = [doc["push_token"] async for doc in tokens_cursor]
    if not tokens:
        raise HTTPException(status_code=404, detail="No registered devices")
    result = await send_expo_push_notification(
        push_tokens=tokens,
        title="Test de notification",
        body="Les notifications fonctionnent correctement !",
        data={"type": "test"},
        db=db
    )
    return result

@router.get("/notifications/devices", tags=["Push Notifications"])
async def get_registered_devices(
    current_user: dict = Depends(get_current_user),
):
    """Diagnostic: list all registered device tokens (admin: all users, other: own only)."""
    if current_user.get("role") == "ADMIN":
        cursor = db.device_tokens.find({}, {"_id": 0})
    else:
        cursor = db.device_tokens.find(
            {"user_id": str(current_user["id"])}, {"_id": 0}
        )
    devices = []
    async for doc in cursor:
        if "created_at" in doc:
            doc["created_at"] = doc["created_at"].isoformat()
        if "updated_at" in doc:
            doc["updated_at"] = doc["updated_at"].isoformat()
        devices.append(doc)
    return {"total": len(devices), "devices": devices}


@router.get("/notifications/diagnostic", tags=["Push Notifications"])
async def push_notification_diagnostic(
    current_user: dict = Depends(get_current_user),
):
    """Diagnostic complet des notifications push.
    Teste chaque token individuellement et retourne le resultat brut d'Expo."""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")
    import httpx
    
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "etapes": [],
        "tokens_db": [],
        "tokens_inactifs": [],
        "receipts_recents": [],
        "test_envoi": [],
        "conclusion": "",
        "actions_recommandees": []
    }
    
    # ETAPE 1: Lister TOUS les tokens (actifs + inactifs)
    all_tokens = []
    async for doc in db.device_tokens.find({}, {"_id": 0}):
        for k in ["created_at", "updated_at"]:
            if k in doc and hasattr(doc[k], 'isoformat'):
                doc[k] = doc[k].isoformat()
        all_tokens.append(doc)
    
    actifs = [t for t in all_tokens if t.get("is_active")]
    inactifs = [t for t in all_tokens if not t.get("is_active")]
    
    report["tokens_db"] = actifs
    report["tokens_inactifs"] = inactifs
    report["etapes"].append({
        "etape": "1. Tokens en base",
        "resultat": f"{len(actifs)} actif(s), {len(inactifs)} inactif(s), {len(all_tokens)} total",
        "statut": "OK" if actifs else "ERREUR - Aucun token actif"
    })
    
    if not actifs:
        report["conclusion"] = "ECHEC: Aucun token actif en base. L'application mobile n'a pas enregistre de token, ou le systeme de nettoyage les a supprimes."
        report["actions_recommandees"] = [
            "1. Ouvrir l'application mobile et se connecter",
            "2. Verifier que l'app appelle POST /api/notifications/register au demarrage",
            "3. Revenir ici et relancer le diagnostic"
        ]
        return report
    
    # ETAPE 2: Tester chaque token actif individuellement avec Expo
    for token_doc in actifs:
        push_token = token_doc["push_token"]
        test_result = {
            "token": push_token[:40] + "..." if len(push_token) > 40 else push_token,
            "user_id": token_doc.get("user_id"),
            "device_name": token_doc.get("device_name"),
            "platform": token_doc.get("platform"),
        }
        
        try:
            test_message = {
                "to": push_token,
                "title": "Diagnostic FSAO",
                "body": "Test de diagnostic automatique",
                "sound": "default",
                "priority": "high",
                "data": {"type": "diagnostic_test"}
            }
            
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=[test_message],
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                    timeout=15.0
                )
                expo_response = resp.json()
            
            test_result["expo_http_status"] = resp.status_code
            test_result["expo_reponse_brute"] = expo_response
            
            # Analyser la reponse
            tickets = expo_response.get("data", [])
            if tickets:
                ticket = tickets[0]
                ticket_status = ticket.get("status")
                ticket_id = ticket.get("id")
                
                test_result["ticket_status"] = ticket_status
                test_result["ticket_id"] = ticket_id
                
                if ticket_status == "ok":
                    test_result["verdict"] = "OK - Expo a accepte le message. Notification en cours de livraison."
                    
                    # Verifier le receipt immediatement (attendre 5s)
                    if ticket_id:
                        await asyncio.sleep(5)
                        try:
                            receipt_resp = await httpx.AsyncClient().post(
                                "https://exp.host/--/api/v2/push/getReceipts",
                                json={"ids": [ticket_id]},
                                headers={"Content-Type": "application/json"},
                                timeout=10.0
                            )
                            receipt_data = receipt_resp.json()
                            receipt_info = receipt_data.get("data", {}).get(ticket_id, {})
                            test_result["receipt_verification"] = receipt_info if receipt_info else "Pas encore disponible (normal, reessayer dans 15min)"
                            
                            if receipt_info.get("status") == "error":
                                error_detail = receipt_info.get("details", {}).get("error", "")
                                test_result["verdict"] = f"ECHEC LIVRAISON - Expo a accepte puis refuse: {error_detail}"
                                if error_detail == "DeviceNotRegistered":
                                    test_result["explication"] = "Le token n'est pas reconnu par FCM/APNs. L'app mobile doit etre recompiee avec les credentials Firebase."
                        except Exception as e:
                            test_result["receipt_verification"] = f"Erreur verification: {str(e)}"
                    
                elif ticket_status == "error":
                    error_detail = ticket.get("details", {}).get("error", "")
                    error_message = ticket.get("message", "")
                    test_result["verdict"] = f"REFUSE PAR EXPO - {error_detail}: {error_message}"
                    
                    if error_detail == "DeviceNotRegistered":
                        test_result["explication"] = "Token invalide. L'appareil n'est plus enregistre aupres de FCM."
                    elif error_detail == "InvalidCredentials":
                        test_result["explication"] = "Les credentials FCM du projet Expo sont invalides."
                    elif error_detail == "MessageTooBig":
                        test_result["explication"] = "Message trop gros (ne devrait pas arriver en diagnostic)."
                    else:
                        test_result["explication"] = f"Erreur Expo: {error_detail}"
            else:
                test_result["verdict"] = "REPONSE VIDE - Expo n'a retourne aucun ticket"
                
        except Exception as e:
            test_result["verdict"] = f"ERREUR RESEAU - Impossible de contacter Expo: {str(e)}"
        
        report["test_envoi"].append(test_result)
    
    report["etapes"].append({
        "etape": "2. Test envoi Expo",
        "resultat": f"{len(report['test_envoi'])} token(s) teste(s)",
        "statut": "Voir details dans test_envoi"
    })
    
    # ETAPE 3: Verifier les receipts recents
    recent_receipts = []
    async for doc in db.push_receipts.find({}).sort("created_at", -1).limit(20):
        for k in ["created_at", "checked_at"]:
            if k in doc and hasattr(doc[k], 'isoformat'):
                doc[k] = doc[k].isoformat()
        doc.pop("_id", None)
        recent_receipts.append(doc)
    report["receipts_recents"] = recent_receipts
    report["etapes"].append({
        "etape": "3. Receipts recents",
        "resultat": f"{len(recent_receipts)} receipt(s) en base",
        "statut": "OK" if recent_receipts else "INFO - Aucun receipt (normal si aucune notif n'a ete envoyee)"
    })
    
    # CONCLUSION
    verdicts = [t.get("verdict", "") for t in report["test_envoi"]]
    all_ok = all("OK" in v for v in verdicts)
    all_device_not_registered = all("DeviceNotRegistered" in v for v in verdicts)
    all_refused = all("REFUSE" in v or "ECHEC" in v for v in verdicts)
    
    if all_ok:
        report["conclusion"] = "SUCCES: Toutes les notifications ont ete acceptees par Expo. Si vous ne les recevez toujours pas, le probleme est cote appareil (mode silencieux, batterie, permissions)."
        report["actions_recommandees"] = [
            "1. Verifier les permissions de notification sur l'appareil",
            "2. Verifier que le mode 'Ne pas deranger' est desactive",
            "3. Verifier l'optimisation batterie pour l'app FSAO",
            "4. Forcer l'arret de l'app et la relancer"
        ]
    elif all_device_not_registered:
        report["conclusion"] = "ECHEC: Tous les tokens sont rejetes avec DeviceNotRegistered. Les credentials Firebase (FCM) ne sont pas configurees dans le projet Expo."
        report["actions_recommandees"] = [
            "1. Verifier que google-services.json est present dans le projet mobile",
            "2. Configurer la Server Key FCM dans Expo (expo push:android:upload)",
            "3. Recompiler l'app avec eas build (pas juste expo start)",
            "4. Reinstaller l'app sur l'appareil et se reconnecter",
            "5. Relancer ce diagnostic"
        ]
    elif all_refused:
        report["conclusion"] = "ECHEC: Toutes les notifications sont refusees par Expo. Voir les details dans test_envoi."
        report["actions_recommandees"] = [
            "Transmettre ce rapport complet au support technique"
        ]
    else:
        report["conclusion"] = "RESULTAT MIXTE: Certains tokens fonctionnent, d'autres non. Voir les details."
        report["actions_recommandees"] = [
            "Purger les tokens invalides et reconnecter les appareils"
        ]
    
    return report

@router.post("/notifications/send-raw-test", tags=["Push Notifications"])
async def send_raw_test_notification(
    push_token: str = None,
    user_id: str = None,
    current_user: dict = Depends(get_current_user),
):
    """Envoie un test brut a un token specifique ou a un utilisateur.
    Retourne la reponse Expo complete sans filtrage."""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")
    import httpx
    
    tokens = []
    if push_token:
        tokens = [push_token]
    elif user_id:
        async for doc in db.device_tokens.find({"user_id": user_id, "is_active": True}):
            tokens.append(doc["push_token"])
    else:
        raise HTTPException(status_code=400, detail="Fournir push_token ou user_id")
    
    if not tokens:
        return {"error": "Aucun token trouve", "tokens_trouves": 0}
    
    results = []
    for token in tokens:
        message = {
            "to": token,
            "title": "Test direct FSAO",
            "body": f"Test envoye a {datetime.now(timezone.utc).strftime('%H:%M:%S')} UTC",
            "sound": "default",
            "priority": "high",
            "data": {"type": "test"}
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=[message],
                    headers={"Accept": "application/json", "Content-Type": "application/json"},
                    timeout=15.0
                )
            results.append({
                "token": token[:40] + "...",
                "http_status": resp.status_code,
                "expo_response": resp.json()
            })
        except Exception as e:
            results.append({
                "token": token[:40] + "...",
                "error": str(e)
            })
    
    return {"tokens_testes": len(tokens), "resultats": results}


# --- Notifications in-app (routes existantes) ---

@router.get("/notifications",
    summary="Lister les notifications", tags=["Notifications"])
async def get_notifications(
    current_user: dict = Depends(get_current_user),
    unread_only: bool = False,
    limit: int = 50
):
    """Récupère les notifications de l'utilisateur connecté"""
    try:
        query = {"user_id": current_user.get("id")}
        if unread_only:
            query["read"] = False
        
        notifications = await db.notifications.find(query).sort("created_at", -1).limit(limit).to_list(limit)
        
        for notif in notifications:
            notif["id"] = str(notif.get("_id", notif.get("id", "")))
            if "_id" in notif:
                del notif["_id"]
        
        return notifications
    except Exception as e:
        logger.error(f"Erreur récupération notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/notifications/count",
    summary="Compteur de notifications non lues", response_model=NotificationCountResponse, tags=["Notifications"])
async def get_notifications_count(current_user: dict = Depends(get_current_user)):
    """Compte les notifications non lues"""
    try:
        count = await db.notifications.count_documents({
            "user_id": current_user.get("id"),
            "read": False
        })
        return {"unread_count": count}
    except Exception as e:
        logger.error(f"Erreur comptage notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/notifications/{notification_id}/read", tags=["Notifications"])
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Marque une notification comme lue"""
    try:
        result = await db.notifications.update_one(
            {"id": notification_id, "user_id": current_user.get("id")},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        if result.matched_count == 0:
            # Essayer avec _id
            result = await db.notifications.update_one(
                {"_id": ObjectId(notification_id), "user_id": current_user.get("id")},
                {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
            )
        return {"success": True}
    except Exception as e:
        logger.error(f"Erreur marquage notification lue: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/notifications/read-all", tags=["Notifications"])
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Marque toutes les notifications comme lues"""
    try:
        await db.notifications.update_many(
            {"user_id": current_user.get("id"), "read": False},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Erreur marquage toutes notifications lues: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/notifications/{notification_id}", tags=["Notifications"])
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Supprime une notification"""
    try:
        result = await db.notifications.delete_one({
            "id": notification_id,
            "user_id": current_user.get("id")
        })
        if result.deleted_count == 0:
            result = await db.notifications.delete_one({
                "_id": ObjectId(notification_id),
                "user_id": current_user.get("id")
            })
        return {"success": True}
    except Exception as e:
        logger.error(f"Erreur suppression notification: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/notifications/create-rp", tags=["Notifications"])
async def create_rp_notification(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Crée une notification pour un OT 'Réparation à Planifier' (RP)"""
    try:
        # Récupérer tous les utilisateurs avec permission sur les OT (pour notifier les responsables)
        # Pour l'instant, notifier tous les admins et superviseurs
        users = await db.users.find({
            "$or": [
                {"role": "admin"},
                {"role": "supervisor"},
                {"permissions.workOrders.edit": True}
            ]
        }).to_list(100)
        
        notifications_created = 0
        for user in users:
            user_id = str(user.get("_id", user.get("id", "")))
            notification = {
                "id": str(uuid.uuid4()),
                "type": "rp_created",
                "title": f"Nouvel OT: {data.get('rp_ot_titre', 'RP-...')}",
                "message": f"Réparation à Planifier créé suite à {data.get('non_conformities_count', 0)} non-conformité(s) détectée(s) sur \"{data.get('original_ot_titre', 'OT')}\".",
                "priority": "high",
                "user_id": user_id,
                "link": "/work-orders",
                "metadata": {
                    "rp_ot_id": data.get("rp_ot_id"),
                    "rp_ot_titre": data.get("rp_ot_titre"),
                    "non_conformities_count": data.get("non_conformities_count"),
                    "is_rp_notification": True
                },
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "read_at": None
            }
            await db.notifications.insert_one(notification)
            
            # Émettre via WebSocket
            await _get_realtime_manager().emit_event(
                "notification",
                "created",
                notification,
                user_id=user_id
            )
            notifications_created += 1
        
        return {"success": True, "notifications_created": notifications_created}
    except Exception as e:
        logger.error(f"Erreur création notification RP: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def create_notification(
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
    priority: str = "medium",
    link: str = None,
    metadata: dict = None
):
    """Crée une notification pour un utilisateur"""
    try:
        notification = {
            "id": str(uuid.uuid4()),
            "type": notif_type,
            "title": title,
            "message": message,
            "priority": priority,
            "user_id": user_id,
            "link": link,
            "metadata": metadata or {},
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read_at": None
        }
        await db.notifications.insert_one(notification)
        
        # Émettre via WebSocket pour notification temps réel
        await _get_realtime_manager().emit_event(
            "notification",
            "created",
            notification,
            user_id=user_id
        )
        
        return notification
    except Exception as e:
        logger.error(f"Erreur création notification: {e}")
        return None

async def check_pm_notifications():
    """
    Vérifie les maintenances préventives à venir et crée des notifications.
    Appelé par le scheduler quotidiennement.
    """
    try:
        logger.info("🔔 Vérification des notifications PM...")
        now = datetime.now(timezone.utc)
        
        # Récupérer toutes les PM actives
        pm_list = await db.preventive_maintenances.find({"statut": "ACTIF"}).to_list(1000)
        
        notifications_created = 0
        
        for pm in pm_list:
            pm_id = str(pm.get("_id", pm.get("id", "")))
            prochaine = pm.get("prochaineMaintenance")
            
            if not prochaine:
                continue
            
            # Convertir en datetime si nécessaire
            if isinstance(prochaine, str):
                prochaine = datetime.fromisoformat(prochaine.replace('Z', '+00:00'))
            
            # Rendre timezone-aware si nécessaire
            if prochaine.tzinfo is None:
                prochaine = prochaine.replace(tzinfo=timezone.utc)
            
            days_until = (prochaine - now).days
            
            # Récupérer l'utilisateur assigné
            assigne_a_id = pm.get("assigne_a_id")
            if not assigne_a_id:
                continue
            
            # Vérifier si une notification existe déjà pour aujourd'hui
            existing = await db.notifications.find_one({
                "metadata.pm_id": pm_id,
                "created_at": {"$gte": now.replace(hour=0, minute=0, second=0).isoformat()}
            })
            
            if existing:
                continue
            
            titre = pm.get("titre", "Maintenance préventive")
            
            # Notification si maintenance dans 3 jours
            if days_until == 3:
                await create_notification(
                    user_id=assigne_a_id,
                    notif_type="pm_upcoming",
                    title="Maintenance préventive dans 3 jours",
                    message=f"La maintenance \"{titre}\" est prévue dans 3 jours.",
                    priority="medium",
                    link="/preventive-maintenance",
                    metadata={"pm_id": pm_id, "days_until": 3}
                )
                notifications_created += 1
            
            # Notification si maintenance demain
            elif days_until == 1:
                await create_notification(
                    user_id=assigne_a_id,
                    notif_type="pm_upcoming",
                    title="Maintenance préventive demain",
                    message=f"La maintenance \"{titre}\" est prévue pour demain.",
                    priority="high",
                    link="/preventive-maintenance",
                    metadata={"pm_id": pm_id, "days_until": 1}
                )
                notifications_created += 1
            
            # Notification si maintenance aujourd'hui
            elif days_until == 0:
                await create_notification(
                    user_id=assigne_a_id,
                    notif_type="pm_upcoming",
                    title="Maintenance préventive aujourd'hui",
                    message=f"La maintenance \"{titre}\" est prévue pour aujourd'hui !",
                    priority="urgent",
                    link="/preventive-maintenance",
                    metadata={"pm_id": pm_id, "days_until": 0}
                )
                notifications_created += 1
            
            # Notification si maintenance en retard
            elif days_until < 0:
                await create_notification(
                    user_id=assigne_a_id,
                    notif_type="pm_overdue",
                    title="Maintenance préventive en retard",
                    message=f"La maintenance \"{titre}\" est en retard de {abs(days_until)} jour(s) !",
                    priority="urgent",
                    link="/preventive-maintenance",
                    metadata={"pm_id": pm_id, "days_overdue": abs(days_until)}
                )
                notifications_created += 1
        
        logger.info(f"🔔 {notifications_created} notifications PM créées")
        return notifications_created
        
    except Exception as e:
        logger.error(f"❌ Erreur vérification notifications PM: {e}")
        return 0

