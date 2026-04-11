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


def _get_vapid():
    """Lit les clés VAPID dynamiquement depuis l'environnement (lecture tardive pour éviter
    les problèmes d'ordre d'initialisation avec load_dotenv)."""
    return (
        os.environ.get("VAPID_PUBLIC_KEY"),
        os.environ.get("VAPID_PRIVATE_KEY"),
        os.environ.get("VAPID_SUBJECT")
    )


async def send_web_push_to_user(db, user_id: str, title: str, body: str, data: dict = None, tag: str = None):
    """Envoie une notification web push a tous les appareils d'un utilisateur."""
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = _get_vapid()
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.warning("[WEB PUSH] Cles VAPID non configurees. Vérifiez VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY dans le .env")
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
    deactivated = 0
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
            resp_body = ""
            resp_status = 0
            if hasattr(e, 'response') and e.response is not None:
                resp_status = e.response.status_code
                try:
                    resp_body = e.response.text[:200] if hasattr(e.response, 'text') else str(e.response.content[:200])
                except Exception:
                    pass
            logger.error(f"[WEB PUSH] ERREUR -> user {user_id} (HTTP {resp_status}): {error_msg[:200]}")
            if resp_body:
                logger.error(f"[WEB PUSH] Response body: {resp_body}")

            # Désactiver les subscriptions définitivement invalides:
            # 404 = introuvable, 410 = expiré (Gone)
            # 401 = clé VAPID invalide (changement de clés), 403 = Forbidden
            # HTTP 0 = erreur locale (ex: Invalid p256dh key)
            should_deactivate = (
                resp_status in (401, 403, 404, 410)
                or (resp_status == 0 and ("Invalid" in error_msg or "invalid" in error_msg.lower()))
            )
            if should_deactivate:
                if resp_status in (404, 410):
                    deact_reason = f"HTTP {resp_status}"
                elif resp_status == 401:
                    deact_reason = "vapid_key_mismatch"
                elif resp_status == 403:
                    deact_reason = "HTTP 403"
                else:
                    deact_reason = "endpoint_gone"
                await db.web_push_subscriptions.update_one(
                    {"_id": sub["_id"]},
                    {"$set": {
                        "is_active": False,
                        "deactivated_at": datetime.now(timezone.utc),
                        "deactivation_reason": deact_reason
                    }}
                )
                deactivated += 1
                logger.info(f"[WEB PUSH] Subscription désactivée ({deact_reason}: {error_msg[:60]})")

            errors.append(error_msg[:200])
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

    return {"sent": sent, "failed": failed, "deactivated": deactivated, "errors": errors}


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
        title="Nouveau bon de travail assigné",
        body=f"#{numero} : {titre[:80]}",
        data={"type": "work_order_assigned", "work_order_id": str(work_order.get("id", work_order.get("_id", "")))},
        tag=f"wo-assigned-{numero}"
    )


async def notify_work_order_status_changed_web(db, work_order: dict, old_status: str, new_status: str, current_user_id: str):
    """Notification quand le statut d'un OT change."""
    numero = work_order.get("numero", "?")
    titre = work_order.get("titre", "")
    user_ids = set()
    # Champs possibles selon les versions du schéma
    if work_order.get("createdBy"):
        user_ids.add(str(work_order["createdBy"]))
    if work_order.get("created_by") and work_order.get("created_by") != "inconnu":
        user_ids.add(str(work_order["created_by"]))
    if work_order.get("assigne_a_id"):
        user_ids.add(str(work_order["assigne_a_id"]))
    if work_order.get("assignedTo"):
        user_ids.add(str(work_order["assignedTo"]))
    user_ids.discard(str(current_user_id))
    user_ids.discard("inconnu")
    user_ids.discard("")

    for uid in user_ids:
        await send_web_push_to_user(
            db, uid,
            title="Statut bon de travail modifié",
            body=f"#{numero} {titre[:40]} → {new_status}",
            data={"type": "work_order_status_changed", "work_order_id": str(work_order.get("id", work_order.get("_id", "")))},
            tag=f"wo-status-{numero}"
        )


async def notify_equipment_alert_web(db, equipment: dict, alert_type: str = "PANNE"):
    """Notification quand un equipement tombe en panne."""
    nom = equipment.get("nom", "?")
    # Notifier tous les admins et techniciens actifs (statut ACTIF ou actif)
    user_ids = []
    async for user in db.users.find(
        {"statut": {"$in": ["ACTIF", "actif"]}, "role": {"$in": ["ADMIN", "TECHNICIEN"]}},
        {"_id": 0, "id": 1}
    ):
        if user.get("id"):
            user_ids.append(str(user["id"]))

    if not user_ids:
        logger.info(f"[WEB PUSH] Alerte équipement: aucun utilisateur actif trouvé")
        return

    await send_web_push_to_users(
        db, user_ids,
        title=f"[{alert_type}] Alerte équipement",
        body=f"{nom} : L'équipement est hors service",
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
