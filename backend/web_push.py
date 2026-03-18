"""
Web Push Notifications (PWA) pour FSAO Iris
Remplace les notifications Expo par des notifications Web Push standard.
"""
import os
import json
import logging
from datetime import datetime, timezone, timedelta
from pywebpush import webpush, WebPushException

logger = logging.getLogger("web_push")

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT")


async def send_web_push_to_user(db, user_id: str, title: str, body: str, data: dict = None, tag: str = None):
    """Envoie une notification web push a tous les appareils d'un utilisateur."""
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.warning("[WEB PUSH] Cles VAPID non configurees")
        return {"sent": 0, "failed": 0, "errors": ["VAPID keys not configured"]}

    subscriptions = []
    async for doc in db.web_push_subscriptions.find({"user_id": str(user_id), "is_active": True}):
        subscriptions.append(doc)

    if not subscriptions:
        logger.info(f"[WEB PUSH] Aucun abonnement actif pour user {user_id}")
        return {"sent": 0, "failed": 0, "errors": []}

    payload = json.dumps({
        "title": title,
        "body": body,
        "data": data or {},
        "tag": tag or "fsao-notification",
        "requireInteraction": True
    })

    sent = 0
    failed = 0
    errors = []

    for sub in subscriptions:
        subscription_info = sub.get("subscription")
        if not subscription_info:
            continue

        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT}
            )
            sent += 1
            logger.info(f"[WEB PUSH] OK -> user {user_id} ({sub.get('browser', '?')})")
            # Log success for health monitoring
            try:
                await db.notification_health_logs.insert_one({
                    "type": "sent", "user_id": user_id,
                    "timestamp": datetime.now(timezone.utc), "tag": tag
                })
            except Exception:
                pass
        except WebPushException as e:
            failed += 1
            error_msg = str(e)
            logger.error(f"[WEB PUSH] ERREUR -> user {user_id}: {error_msg}")

            # Si 410 Gone ou 404 = subscription invalide, la desactiver
            if hasattr(e, 'response') and e.response is not None:
                status = e.response.status_code
                if status in (404, 410):
                    await db.web_push_subscriptions.update_one(
                        {"_id": sub["_id"]},
                        {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc)}}
                    )
                    logger.info(f"[WEB PUSH] Subscription desactivee (HTTP {status})")

            errors.append(error_msg[:200])
            # Log failure for health monitoring
            try:
                await db.notification_health_logs.insert_one({
                    "type": "failed", "user_id": user_id,
                    "timestamp": datetime.now(timezone.utc), "error": error_msg[:200]
                })
            except Exception:
                pass
        except Exception as e:
            failed += 1
            errors.append(str(e)[:200])

    return {"sent": sent, "failed": failed, "errors": errors}


async def cleanup_notification_health_logs(db):
    """Nettoie les vieux logs de sante (garde 7 jours)."""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        await db.notification_health_logs.delete_many({"timestamp": {"$lt": cutoff}})
    except Exception:
        pass


async def send_web_push_to_users(db, user_ids: list, title: str, body: str, data: dict = None, tag: str = None):
    """Envoie une notification a plusieurs utilisateurs."""
    results = {"total_sent": 0, "total_failed": 0, "errors": []}
    for uid in user_ids:
        r = await send_web_push_to_user(db, str(uid), title, body, data, tag)
        results["total_sent"] += r["sent"]
        results["total_failed"] += r["failed"]
        results["errors"].extend(r["errors"])
    return results


async def notify_work_order_assigned_web(db, work_order: dict, assigned_user_id: str, current_user_id: str):
    """Notification quand un OT est assigne."""
    if str(assigned_user_id) == str(current_user_id):
        return
    numero = work_order.get("numero", "?")
    titre = work_order.get("titre", "")
    await send_web_push_to_user(
        db, assigned_user_id,
        title="Nouveau bon de travail assigne",
        body=f"#{numero}: {titre}",
        data={"type": "work_order_assigned", "work_order_id": str(work_order.get("id", work_order.get("_id", "")))},
        tag=f"wo-assigned-{numero}"
    )


async def notify_work_order_status_changed_web(db, work_order: dict, old_status: str, new_status: str, current_user_id: str):
    """Notification quand le statut d'un OT change."""
    numero = work_order.get("numero", "?")
    user_ids = set()
    if work_order.get("createdBy"):
        user_ids.add(str(work_order["createdBy"]))
    if work_order.get("assignedTo"):
        user_ids.add(str(work_order["assignedTo"]))
    user_ids.discard(str(current_user_id))

    for uid in user_ids:
        await send_web_push_to_user(
            db, uid,
            title="Statut BT modifie",
            body=f"#{numero} -> {new_status}",
            data={"type": "work_order_status_changed", "work_order_id": str(work_order.get("id", work_order.get("_id", "")))},
            tag=f"wo-status-{numero}"
        )


async def notify_equipment_alert_web(db, equipment: dict, alert_type: str = "PANNE"):
    """Notification quand un equipement tombe en panne."""
    nom = equipment.get("nom", "?")
    # Notifier tous les admins et techniciens actifs
    user_ids = []
    async for user in db.users.find({"statut": "actif", "role": {"$in": ["ADMIN", "TECHNICIEN"]}}, {"_id": 0, "id": 1}):
        user_ids.append(str(user["id"]))

    await send_web_push_to_users(
        db, user_ids,
        title=f"[{alert_type}] Alerte equipement",
        body=f"{nom}: L'equipement est hors service",
        data={"type": "equipment_alert", "equipment_id": str(equipment.get("id", equipment.get("_id", "")))},
        tag=f"equip-alert-{equipment.get('id', '')}"
    )


async def notify_chat_message_web(db, sender_name: str, message_body: str, recipient_ids: list, sender_id: str):
    """Notification pour un message chat prive."""
    body = message_body[:50] if message_body else "Fichier partage"
    for uid in recipient_ids:
        if str(uid) != str(sender_id):
            await send_web_push_to_user(
                db, str(uid),
                title=sender_name,
                body=body,
                data={"type": "chat_message"},
                tag=f"chat-{sender_id}"
            )
