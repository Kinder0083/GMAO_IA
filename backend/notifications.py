# notifications.py - Push Notifications Service for FSAO Mobile (Expo Push)

from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel
import httpx
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from dependencies import get_current_user, get_database

logger = logging.getLogger(__name__)

# ============================================
# MODELS
# ============================================

class DeviceTokenCreate(BaseModel):
    push_token: str
    platform: str = "android"
    device_name: Optional[str] = None

class NotificationPayload(BaseModel):
    title: str
    body: str
    data: Optional[dict] = None

# ============================================
# EXPO PUSH NOTIFICATION SERVICE
# ============================================

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"

# Reference to db, set at startup from server.py
_db = None

def set_db(database):
    global _db
    _db = database

async def send_expo_push_notification(
    push_tokens: List[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
    db=None
) -> dict:
    """Send push notification via Expo Push Notification Service.
    Stores ticket IDs for later receipt verification."""
    messages = []
    token_order = []
    for token in push_tokens:
        if not token.startswith("ExponentPushToken"):
            continue
        message = {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "priority": "high",
        }
        if data:
            message["data"] = data
        messages.append(message)
        token_order.append(token)

    if not messages:
        return {"success": False, "error": "No valid tokens"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                timeout=30.0
            )
            result = response.json()
            logger.info(f"Push notification sent: {len(messages)} message(s)")

            # Process Expo response: store tickets + cleanup immediately rejected tokens
            use_db = db if db is not None else _db
            if use_db is not None:
                tickets_data = result.get("data", [])
                receipts_to_insert = []
                tokens_to_remove = []
                now = datetime.now(timezone.utc)

                for i, ticket in enumerate(tickets_data):
                    if i >= len(token_order):
                        break
                    push_token = token_order[i]
                    ticket_id = ticket.get("id")
                    ticket_status = ticket.get("status")

                    if ticket_id and ticket_status == "ok":
                        # Token accepted - store ticket for receipt verification
                        receipts_to_insert.append({
                            "ticket_id": ticket_id,
                            "push_token": push_token,
                            "status": "ok",
                            "created_at": now,
                            "checked": False
                        })
                    elif ticket_status == "error":
                        # Token immediately rejected - check if DeviceNotRegistered
                        error_detail = ticket.get("details", {}).get("error", "")
                        if error_detail == "DeviceNotRegistered":
                            tokens_to_remove.append(push_token)
                            logger.info(f"Token invalide (immediat): {push_token[:30]}...")

                # Store receipts for valid tickets
                if receipts_to_insert:
                    try:
                        await use_db.push_receipts.insert_many(receipts_to_insert)
                        logger.info(f"Stored {len(receipts_to_insert)} push receipt ticket(s)")
                    except Exception as e:
                        logger.warning(f"Failed to store push receipts: {e}")

                # Immediately remove invalid tokens
                if tokens_to_remove:
                    try:
                        del_result = await use_db.device_tokens.delete_many({
                            "push_token": {"$in": tokens_to_remove}
                        })
                        logger.info(f"Supprime {del_result.deleted_count} token(s) invalide(s) immediatement")
                    except Exception as e:
                        logger.warning(f"Failed to remove invalid tokens: {e}")

            return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Error sending push notification: {e}")
        return {"success": False, "error": str(e)}

# ============================================
# RECEIPT VERIFICATION (CRON TASK)
# ============================================

async def check_push_receipts():
    """Verify Expo push receipts and remove invalid tokens.
    Called by scheduler every 20 minutes."""
    if _db is None:
        logger.warning("[PUSH RECEIPTS] No database reference")
        return

    try:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
        cursor = _db.push_receipts.find({
            "checked": False,
            "created_at": {"$lt": cutoff}
        }).limit(1000)
        pending = await cursor.to_list(1000)

        if not pending:
            # Log success even with no pending receipts
            await _db.notification_health_checks.update_one(
                {"check_type": "push_receipts_cron"},
                {"$set": {"timestamp": datetime.now(timezone.utc), "success": True, "message": "Aucun recu en attente"}},
                upsert=True
            )
            return

        ticket_ids = [r["ticket_id"] for r in pending]
        token_map = {r["ticket_id"]: r["push_token"] for r in pending}

        logger.info(f"[PUSH RECEIPTS] Checking {len(ticket_ids)} receipt(s)")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_RECEIPTS_URL,
                json={"ids": ticket_ids},
                headers={"Content-Type": "application/json"},
                timeout=30.0
            )
            result = response.json()

        receipts = result.get("data", {})
        tokens_to_remove = set()
        ok_count = 0
        error_count = 0

        for ticket_id, receipt in receipts.items():
            receipt_status = receipt.get("status")
            if receipt_status == "ok":
                ok_count += 1
            elif receipt_status == "error":
                error_detail = receipt.get("details", {}).get("error", "")
                push_token = token_map.get(ticket_id)
                if error_detail == "DeviceNotRegistered" and push_token:
                    tokens_to_remove.add(push_token)
                    logger.info(f"[PUSH RECEIPTS] Token invalide: {push_token[:30]}...")
                else:
                    logger.warning(f"[PUSH RECEIPTS] Erreur ticket {ticket_id}: {error_detail}")
                error_count += 1

        # Remove invalid tokens from device_tokens collection
        if tokens_to_remove:
            result = await _db.device_tokens.delete_many({
                "push_token": {"$in": list(tokens_to_remove)}
            })
            logger.info(f"[PUSH RECEIPTS] {result.deleted_count} token(s) invalide(s) supprime(s)")

        # Mark all as checked
        await _db.push_receipts.update_many(
            {"ticket_id": {"$in": ticket_ids}},
            {"$set": {"checked": True, "checked_at": datetime.now(timezone.utc)}}
        )

        # Clean up old checked receipts (older than 7 days)
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        cleanup = await _db.push_receipts.delete_many({
            "checked": True,
            "created_at": {"$lt": week_ago}
        })

        logger.info(f"[PUSH RECEIPTS] Done: {ok_count} ok, {error_count} errors, "
                     f"{len(tokens_to_remove)} removed, {cleanup.deleted_count} old receipts cleaned")

        # Log cron success for health monitoring
        await _db.notification_health_checks.update_one(
            {"check_type": "push_receipts_cron"},
            {"$set": {
                "timestamp": datetime.now(timezone.utc),
                "success": True,
                "message": f"{ok_count} ok, {error_count} erreurs, {len(tokens_to_remove)} supprimes"
            }},
            upsert=True
        )

    except Exception as e:
        logger.error(f"[PUSH RECEIPTS] ERROR: {e}")
        # Log cron failure for health monitoring
        try:
            await _db.notification_health_checks.update_one(
                {"check_type": "push_receipts_cron"},
                {"$set": {
                    "timestamp": datetime.now(timezone.utc),
                    "success": False,
                    "message": str(e)[:200]
                }},
                upsert=True
            )
        except Exception:
            pass

# ============================================
# NOTIFICATION FUNCTIONS BY TYPE
# ============================================

async def notify_work_order_assigned(
    db,
    work_order_id: str,
    work_order_title: str,
    work_order_numero: str,
    assigned_user_id: str,
    etapes_count: int = 0
):
    """Send notification when a work order is assigned to a user."""
    try:
        logger.info(f"[PUSH NOTIFY] notify_work_order_assigned called for user {assigned_user_id}")
        tokens_cursor = db.device_tokens.find({
            "user_id": assigned_user_id,
            "is_active": True
        })
        tokens = [doc["push_token"] async for doc in tokens_cursor]
        logger.info(f"[PUSH NOTIFY] Found {len(tokens)} active tokens for user {assigned_user_id}")

        if tokens:
            # Suffixer avec le nb d'etapes si > 0
            etapes_suffix = f" · {etapes_count} étape(s)" if etapes_count and etapes_count > 0 else ""
            result = await send_expo_push_notification(
                push_tokens=tokens,
                title="Nouveau bon de travail assigne",
                body=f"#{work_order_numero}: {work_order_title}{etapes_suffix}",
                data={
                    "type": "work_order_assigned",
                    "work_order_id": work_order_id,
                    "work_order_numero": work_order_numero
                },
                db=db
            )
            logger.info(f"[PUSH NOTIFY] Send result: {result}")
        else:
            logger.info("[PUSH NOTIFY] No tokens found, skipping notification")
    except Exception as e:
        logger.error(f"[PUSH NOTIFY] ERROR in notify_work_order_assigned: {e}")

async def notify_work_order_status_changed(
    db,
    work_order_id: str,
    work_order_title: str,
    work_order_numero: str,
    old_status: str,
    new_status: str,
    notify_user_ids: List[str]
):
    """Send notification when a work order status changes."""
    try:
        logger.info(f"[PUSH NOTIFY] notify_work_order_status_changed called for users {notify_user_ids}")
        status_labels = {
            "OUVERT": "Ouvert",
            "EN_COURS": "En cours",
            "EN_ATTENTE": "En attente",
            "TERMINE": "Termine",
            "ANNULE": "Annule",
            "CLOTURE": "Cloture"
        }
        new_status_label = status_labels.get(new_status, new_status)

        tokens_cursor = db.device_tokens.find({
            "user_id": {"$in": notify_user_ids},
            "is_active": True
        })
        tokens = [doc["push_token"] async for doc in tokens_cursor]
        logger.info(f"[PUSH NOTIFY] Found {len(tokens)} active tokens for status change")

        if tokens:
            result = await send_expo_push_notification(
                push_tokens=tokens,
                title="Statut BT modifie",
                body=f"#{work_order_numero} -> {new_status_label}",
                data={
                    "type": "work_order_status_changed",
                    "work_order_id": work_order_id,
                    "work_order_numero": work_order_numero,
                    "old_status": old_status,
                    "new_status": new_status
                },
                db=db
            )
            logger.info(f"[PUSH NOTIFY] Status change send result: {result}")
        else:
            logger.info("[PUSH NOTIFY] No tokens found for status change, skipping")
    except Exception as e:
        logger.error(f"[PUSH NOTIFY] ERROR in notify_work_order_status_changed: {e}")

async def notify_equipment_alert(
    db,
    equipment_id: str,
    equipment_name: str,
    alert_type: str,
    alert_message: str,
    notify_user_ids: Optional[List[str]] = None
):
    """Send notification for equipment alerts."""
    try:
        if notify_user_ids is None:
            users_cursor = db.users.find({
                "role": {"$in": ["ADMIN", "TECHNICIEN"]},
                "actif": True
            })
            notify_user_ids = [str(doc["_id"]) async for doc in users_cursor]

        tokens_cursor = db.device_tokens.find({
            "user_id": {"$in": notify_user_ids},
            "is_active": True
        })
        tokens = [doc["push_token"] async for doc in tokens_cursor]

        alert_icons = {
            "PANNE": "PANNE",
            "MAINTENANCE": "MAINTENANCE",
            "ALERTE": "ALERTE",
            "INFO": "INFO"
        }
        icon = alert_icons.get(alert_type, "ALERTE")

        if tokens:
            await send_expo_push_notification(
                push_tokens=tokens,
                title=f"[{icon}] Alerte equipement",
                body=f"{equipment_name}: {alert_message}",
                data={
                    "type": "equipment_alert",
                    "equipment_id": equipment_id,
                    "alert_type": alert_type
                },
                db=db
            )
    except Exception as e:
        logger.error(f"[PUSH NOTIFY] ERROR in notify_equipment_alert: {e}")

async def notify_chat_message(
    db,
    sender_name: str,
    message_preview: str,
    recipient_user_ids: List[str]
):
    """Send notification for new chat messages."""
    try:
        tokens_cursor = db.device_tokens.find({
            "user_id": {"$in": recipient_user_ids},
            "is_active": True
        })
        tokens = [doc["push_token"] async for doc in tokens_cursor]

        if len(message_preview) > 50:
            message_preview = message_preview[:47] + "..."

        if tokens:
            await send_expo_push_notification(
                push_tokens=tokens,
                title=sender_name,
                body=message_preview,
                data={
                    "type": "chat_message"
                },
                db=db
            )
    except Exception as e:
        logger.error(f"[PUSH NOTIFY] ERROR in notify_chat_message: {e}")

# ============================================
# API ROUTER
# ============================================

router = APIRouter(prefix="/push-notifications", tags=["Push Notifications"])

@router.post("/register")
async def register_device_token(
    token_data: DeviceTokenCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """Register a device push token for the current user.
    Desactive automatiquement les anciens tokens du meme appareil."""
    try:
        user_id = str(current_user["id"])
        now = datetime.now(timezone.utc)

        # Desactiver les anciens tokens du meme appareil/utilisateur
        # (important lors du remplacement d'un APK avec nouveau sender ID)
        if token_data.device_name:
            await db.device_tokens.update_many(
                {
                    "user_id": user_id,
                    "device_name": token_data.device_name,
                    "push_token": {"$ne": token_data.push_token}
                },
                {"$set": {"is_active": False, "updated_at": now}}
            )

        # Upsert: si le push_token existe deja, on met a jour
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
            logger.info(f"[PUSH REGISTER] Nouveau token pour user {user_id} device {token_data.device_name}")
            return {"message": "Token registered", "token_id": str(result.upserted_id)}
        logger.info(f"[PUSH REGISTER] Token mis a jour pour user {user_id}")
        return {"message": "Token updated"}
    except Exception as e:
        logger.error(f"[PUSH REGISTER] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/unregister")
async def unregister_device_token(
    push_token: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """Unregister a device push token."""
    user_id = str(current_user["id"])

    result = await db.device_tokens.update_one(
        {"user_id": user_id, "push_token": push_token},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Token not found")

    return {"message": "Token unregistered"}

@router.post("/test")
async def test_notification(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """Send a test notification to the current user."""
    user_id = str(current_user["id"])

    tokens_cursor = db.device_tokens.find({
        "user_id": user_id,
        "is_active": True
    })
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


@router.post("/test/{user_id}")
async def test_notification_for_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """Send a test notification to a specific user via ALL channels (Expo + Web Push)."""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")

    results = {"expo": None, "web_push": None, "channels_tested": 0}

    # 1. Expo push (mobile app)
    tokens_cursor = db.device_tokens.find({
        "user_id": user_id,
        "is_active": True
    })
    tokens = [doc["push_token"] async for doc in tokens_cursor]

    if tokens:
        expo_result = await send_expo_push_notification(
            push_tokens=tokens,
            title="Test de notification",
            body="Les notifications fonctionnent correctement !",
            data={"type": "test"},
            db=db
        )
        results["expo"] = {
            "sent": True,
            "tokens": len(tokens),
            "result": expo_result
        }
        results["channels_tested"] += 1
    else:
        results["expo"] = {"sent": False, "tokens": 0, "message": "Aucun token Expo actif"}

    # 2. Web push (PWA)
    from web_push import send_web_push_to_user
    web_result = await send_web_push_to_user(
        db, user_id,
        title="Test de notification",
        body="Les notifications fonctionnent correctement !",
        data={"type": "test"},
        tag="test-notification"
    )
    web_delivered = web_result.get("sent", 0)
    web_failed = web_result.get("failed", 0)
    web_deactivated = web_result.get("deactivated", 0)

    if web_delivered > 0:
        results["web_push"] = {
            "sent": True,
            "delivered": web_delivered,
            "failed": web_failed,
            "deactivated": web_deactivated,
            "errors": web_result.get("errors", [])
        }
        results["channels_tested"] += 1
    elif web_failed > 0:
        results["web_push"] = {
            "sent": False,
            "delivered": 0,
            "failed": web_failed,
            "deactivated": web_deactivated,
            "errors": web_result.get("errors", []),
            "message": "Abonnements invalides, nettoyés automatiquement" if web_deactivated > 0 else "Tous les envois ont echoue"
        }
        results["channels_tested"] += 1
    else:
        results["web_push"] = {
            "sent": False,
            "delivered": 0,
            "failed": 0,
            "deactivated": 0,
            "errors": [],
            "message": "Aucun abonnement web push actif"
        }

    # Résumé détaillé
    results["summary"] = []
    if results["expo"]["sent"]:
        results["summary"].append(f"Expo: {results['expo']['tokens']} appareil(s)")
    else:
        results["summary"].append(f"Expo: {results['expo'].get('message', 'aucun token')}")

    if results["web_push"].get("sent") and results["web_push"].get("delivered", 0) > 0:
        results["summary"].append(f"Web Push: {results['web_push']['delivered']} envoyee(s)")
    elif results["web_push"].get("failed", 0) > 0:
        d = results["web_push"].get("deactivated", 0)
        if d > 0:
            results["summary"].append(f"Web Push: {d} abonnement(s) expire(s) nettoye(s), reabonnement requis")
        else:
            results["summary"].append(f"Web Push: {results['web_push']['failed']} echouee(s)")
    else:
        results["summary"].append(f"Web Push: {results['web_push'].get('message', 'aucun abonnement')}")

    # Déterminer le statut global
    web_delivered_ok = results["web_push"].get("sent") and results["web_push"].get("delivered", 0) > 0
    web_cleaned_up = web_result.get("deactivated", 0) > 0 and web_delivered == 0

    if results["channels_tested"] == 0:
        results["status"] = "no_channel"
        results["detail"] = "Aucun canal de notification disponible. L'utilisateur doit ouvrir l'application dans son navigateur et activer les notifications dans Paramètres → Notifications."
    elif web_cleaned_up and not results["expo"]["sent"]:
        results["status"] = "subscription_cleaned_up"
        results["detail"] = "Des abonnements push expirés ont été détectés et supprimés automatiquement. L'utilisateur doit aller dans Paramètres → Notifications pour réactiver les notifications."
    elif not results["expo"]["sent"] and not web_delivered_ok:
        results["status"] = "all_failed"
        results["detail"] = "Tous les envois ont echoue. Les abonnements sont probablement expires ou invalides. L'utilisateur doit rouvrir l'application pour renouveler automatiquement son abonnement."
    else:
        results["status"] = "ok"

    return results


@router.delete("/tokens/{user_id}")
async def purge_user_tokens(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """Purge all push tokens for a specific user (admin only)."""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.device_tokens.delete_many({"user_id": user_id})
    return {
        "message": f"{result.deleted_count} token(s) supprime(s) pour l'utilisateur {user_id}"
    }
