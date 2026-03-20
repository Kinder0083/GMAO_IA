"""
Routes de monitoring de sante des notifications
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
import logging

from models import ActionType, EntityType
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Notification Health"])


def _sanitize_datetimes(obj):
    """Convertit recursivement tous les datetime/ObjectId en strings serialisables."""
    if isinstance(obj, dict):
        return {k: _sanitize_datetimes(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_sanitize_datetimes(item) for item in obj]
    elif hasattr(obj, 'isoformat'):
        return obj.isoformat()
    elif isinstance(obj, ObjectId):
        return str(obj)
    return obj

async def _check_notification_health_internal():
    """Verifie la sante du systeme de notification. Retourne un dict de diagnostic."""
    now = datetime.now(timezone.utc)
    result = {
        "timestamp": now.isoformat(),
        "vapid_keys": {"status": "error", "message": "Non configurees"},
        "web_push_subscriptions": {"status": "error", "active": 0, "inactive": 0, "total": 0},
        "expo_tokens": {"status": "ok", "active": 0, "total": 0},
        "last_notifications": {"status": "unknown", "recent_sent": 0, "recent_failed": 0},
        "cron_push_receipts": {"status": "unknown", "message": "Non verifie"},
        "overall": "error"
    }
    try:
        # 1. VAPID keys
        vpub = os.environ.get("VAPID_PUBLIC_KEY")
        vpriv = os.environ.get("VAPID_PRIVATE_KEY")
        vsub = os.environ.get("VAPID_SUBJECT")
        if vpub and vpriv and vsub:
            result["vapid_keys"] = {"status": "ok", "message": "Configurees"}
        elif vpub or vpriv:
            result["vapid_keys"] = {"status": "warning", "message": "Configuration incomplete"}

        # 2. Web push subscriptions
        active_subs = await db.web_push_subscriptions.count_documents({"is_active": True})
        inactive_subs = await db.web_push_subscriptions.count_documents({"is_active": False})
        total_subs = active_subs + inactive_subs
        sub_status = "ok" if active_subs > 0 else ("warning" if total_subs > 0 else "error")
        result["web_push_subscriptions"] = {
            "status": sub_status,
            "active": active_subs,
            "inactive": inactive_subs,
            "total": total_subs,
            "message": f"{active_subs} actif(s) / {total_subs} total"
        }

        # 3. Expo tokens
        active_tokens = await db.device_tokens.count_documents({"is_active": True})
        total_tokens = await db.device_tokens.count_documents({})
        result["expo_tokens"] = {
            "status": "ok",
            "active": active_tokens,
            "total": total_tokens,
            "message": f"{active_tokens} actif(s) / {total_tokens} total"
        }

        # 4. Recent notification activity (last 24h from logs in notification_health_logs)
        cutoff_24h = now - timedelta(hours=24)
        recent_sent = await db.notification_health_logs.count_documents({
            "type": "sent", "timestamp": {"$gte": cutoff_24h}
        })
        recent_failed = await db.notification_health_logs.count_documents({
            "type": "failed", "timestamp": {"$gte": cutoff_24h}
        })
        # Get recent error details
        recent_errors = []
        async for err_doc in db.notification_health_logs.find(
            {"type": "failed", "timestamp": {"$gte": cutoff_24h}},
            {"_id": 0, "error": 1, "user_id": 1, "timestamp": 1}
        ).sort("timestamp", -1).limit(5):
            recent_errors.append({
                "error": str(err_doc.get("error", ""))[:100],
                "user_id": err_doc.get("user_id", ""),
                "timestamp": err_doc["timestamp"].isoformat() if hasattr(err_doc.get("timestamp"), "isoformat") else str(err_doc.get("timestamp", ""))
            })

        notif_status = "ok"
        if recent_failed > 0:
            notif_status = "warning"
        if recent_sent == 0 and active_subs > 0:
            notif_status = "warning"
        if recent_failed > recent_sent and recent_failed > 0:
            notif_status = "error"
        result["last_notifications"] = {
            "status": notif_status,
            "recent_sent": recent_sent,
            "recent_failed": recent_failed,
            "recent_errors": recent_errors,
            "message": f"{recent_sent} envoyee(s), {recent_failed} echouee(s) (24h)"
        }

        # 5. Cron check_push_receipts status
        last_check = await db.notification_health_checks.find_one(
            {"check_type": "push_receipts_cron"},
            sort=[("timestamp", -1)]
        )
        if last_check:
            lc_time = last_check.get("timestamp")
            if isinstance(lc_time, str):
                from dateutil.parser import parse as parse_date
                lc_time = parse_date(lc_time)
            age_min = (now - lc_time).total_seconds() / 60 if lc_time else 999
            cron_ok = last_check.get("success", False)
            cron_status = "ok" if cron_ok and age_min < 45 else "warning" if age_min < 90 else "error"
            result["cron_push_receipts"] = {
                "status": cron_status,
                "last_run": lc_time.isoformat() if hasattr(lc_time, 'isoformat') else str(lc_time),
                "success": cron_ok,
                "message": f"{'OK' if cron_ok else 'Erreur'} (il y a {int(age_min)} min)"
            }
        else:
            result["cron_push_receipts"] = {"status": "warning", "message": "Jamais execute"}

        # Overall status
        statuses = [v.get("status", "unknown") for v in result.values() if isinstance(v, dict) and "status" in v]
        if "error" in statuses:
            result["overall"] = "error"
        elif "warning" in statuses:
            result["overall"] = "warning"
        else:
            result["overall"] = "ok"

    except Exception as e:
        logger.error(f"[NOTIF HEALTH] Erreur verification: {e}")
        result["overall"] = "error"
        result["error"] = str(e)

    return result


async def check_notification_health_cron():
    """Tache planifiee: verifie la sante des notifications toutes les 30 min."""
    try:
        result = await _check_notification_health_internal()
        now = datetime.now(timezone.utc)

        # Store the check result
        await db.notification_health_checks.insert_one({
            "check_type": "periodic",
            "timestamp": now,
            "overall": result["overall"],
            "details": result,
            "checked": True
        })

        # Cleanup old checks (keep last 7 days)
        week_ago = now - timedelta(days=7)
        await db.notification_health_checks.delete_many({
            "check_type": "periodic",
            "timestamp": {"$lt": week_ago}
        })

        # Alert admins if notification system is down
        if result["overall"] == "error":
            logger.warning(f"[NOTIF HEALTH] Systeme de notification en ERREUR: {result}")
            # Try to send web push alert to admins
            try:
                admin_cursor = db.users.find(
                    {"role": "ADMIN", "statut": {"$in": ["actif", "ACTIF"]}},
                    {"_id": 0, "id": 1}
                )
                admin_ids = [doc["id"] async for doc in admin_cursor if doc.get("id")]
                if admin_ids:
                    from web_push import send_web_push_to_users
                    await send_web_push_to_users(
                        db, admin_ids,
                        title="Alerte: Systeme de notification",
                        body="Le systeme de notification est en erreur. Verifiez la page Sante Systeme.",
                        data={"type": "system_alert"},
                        tag="notif-health-alert"
                    )
            except Exception as alert_err:
                logger.warning(f"[NOTIF HEALTH] Impossible d'alerter les admins: {alert_err}")
        else:
            logger.info(f"[NOTIF HEALTH] Check OK: {result['overall']}")

    except Exception as e:
        logger.error(f"[NOTIF HEALTH] Erreur cron: {e}")


@router.get("/health/notifications", tags=["Health"])
async def get_notification_health(current_user: dict = Depends(get_current_admin_user)):
    """Retourne l'etat de sante du systeme de notification (Admin uniquement)."""
    result = await _check_notification_health_internal()
    return result


@router.get("/health/notifications/history", tags=["Health"])
async def get_notification_health_history(
    current_user: dict = Depends(get_current_admin_user),
    limit: int = 48
):
    """Historique des verifications de sante des notifications (Admin uniquement)."""
    checks = []
    try:
        async for doc in db.notification_health_checks.find(
            {"check_type": {"$in": ["periodic", "manual"]}},
            {"_id": 0}
        ).sort("timestamp", -1).limit(limit):
            # Convert all datetime objects to ISO strings recursively
            sanitized = _sanitize_datetimes(doc)
            checks.append(sanitized)
    except Exception as e:
        logger.error(f"[NOTIF HEALTH] Erreur historique: {e}")
    return {"total": len(checks), "checks": checks}


@router.post("/health/notifications/force-check", tags=["Health"])
async def force_notification_health_check(current_user: dict = Depends(get_current_admin_user)):
    """Lance une verification immediate de la sante des notifications."""
    result = await _check_notification_health_internal()
    now = datetime.now(timezone.utc)
    await db.notification_health_checks.insert_one({
        "check_type": "manual",
        "timestamp": now,
        "overall": result["overall"],
        "details": result,
        "triggered_by": str(current_user.get("id", ""))
    })
    return result



@router.post("/health/notifications/purge-inactive", tags=["Health"])
async def purge_inactive_subscriptions(current_user: dict = Depends(get_current_admin_user)):
    """Supprime les abonnements web push inactifs et les tokens Expo inactifs."""
    now = datetime.now(timezone.utc)
    # Purge inactive web push subscriptions
    web_result = await db.web_push_subscriptions.delete_many({"is_active": False})
    # Purge inactive device tokens
    expo_result = await db.device_tokens.delete_many({"is_active": False})
    logger.info(f"[NOTIF PURGE] {web_result.deleted_count} web push + {expo_result.deleted_count} expo tokens supprimes")
    return {
        "web_push_deleted": web_result.deleted_count,
        "expo_deleted": expo_result.deleted_count,
        "message": f"{web_result.deleted_count} abonnement(s) web + {expo_result.deleted_count} token(s) mobile supprimes"
    }


@router.post("/health/reset-failures")
async def reset_failure_counter(current_user: dict = Depends(get_current_admin_user)):
    """Remet à zéro le compteur d'échecs consécutifs (Admin uniquement)."""
    try:
        state_path = Path(update_service.app_root) / "health_state.json"
        import json as json_mod
        state = {}
        if state_path.exists():
            with open(state_path) as f:
                state = json_mod.load(f)
        state["consecutive_failures"] = 0
        state["last_recovery_level"] = 0
        with open(state_path, "w") as f:
            json_mod.dump(state, f, indent=2)
        return {"status": "ok", "message": "Compteur d'échecs remis à zéro"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────── HEALTH ALERTS CONFIG ────────

@router.get("/health/alerts-config")
async def get_health_alerts_config(current_user: dict = Depends(get_current_admin_user)):
    """Récupère la configuration des alertes santé système."""
    config = await db.health_alerts_config.find_one({}, {"_id": 0})
    if not config:
        config = {
            "enabled": False,
            "recipients": [],
            "cooldown_hours": 24,
            "alerts": {
                "app_down": {"enabled": True, "threshold": 1},
                "recovery_success": {"enabled": True},
                "recovery_failed": {"enabled": True},
                "disk_warning": {"enabled": True, "threshold": 80},
                "memory_warning": {"enabled": True, "threshold": 85},
                "maintenance_changed": {"enabled": False},
            },
            "last_test_sent": None,
        }
    return config


@router.put("/health/alerts-config")
async def update_health_alerts_config(
    config: dict,
    current_user: dict = Depends(get_current_admin_user)
):
    """Met à jour la configuration des alertes santé système."""
    try:
        allowed_fields = ["enabled", "recipients", "cooldown_hours", "alerts"]
        update_data = {k: v for k, v in config.items() if k in allowed_fields}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        update_data["updated_by"] = current_user.get("name", current_user.get("email", ""))

        await db.health_alerts_config.update_one(
            {}, {"$set": update_data}, upsert=True
        )
        return {"status": "ok", "message": "Configuration des alertes mise à jour"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/health/alerts-test")
async def test_health_alert(current_user: dict = Depends(get_current_admin_user)):
    """Envoie un email de test pour vérifier la configuration des alertes."""
    try:
        config = await db.health_alerts_config.find_one({}, {"_id": 0})
        if not config or not config.get("recipients"):
            raise HTTPException(status_code=400, detail="Aucun destinataire configuré")

        from health_alert_service import send_email, _build_html_email
        recipients = config["recipients"]
        admin_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip() or current_user.get("email", "")
        now_str = datetime.now().strftime("%d/%m/%Y à %H:%M")

        details_html = f"""
        <div style="background: #EFF6FF; border-left: 4px solid #2563EB; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; color: #1E40AF; font-weight: 600;">Test de configuration réussi</p>
          <p style="margin: 4px 0 0; color: #3B82F6; font-size: 13px;">Déclenché par : {admin_name}</p>
        </div>
        <p style="font-size: 14px; color: #334155;">
          Si vous recevez cet email, les alertes de santé système sont correctement configurées.
        </p>
        <p style="font-size: 13px; color: #64748b;">
          Les alertes actives vous notifieront automatiquement en cas de problème.
        </p>
        """
        html = _build_html_email("[TEST] FSAO Iris - Alerte Système", "info", details_html, f"Date : {now_str}<br>")

        sent = 0
        errors = []
        for email in recipients:
            try:
                ok = send_email(email.strip(), "[TEST] FSAO Iris - Test Alerte Système", html)
                if ok:
                    sent += 1
                else:
                    errors.append(email)
            except Exception as e:
                errors.append(f"{email}: {str(e)}")

        # Update last test timestamp
        await db.health_alerts_config.update_one(
            {}, {"$set": {"last_test_sent": datetime.now(timezone.utc).isoformat()}}, upsert=True
        )

        if sent > 0:
            return {"status": "ok", "message": f"Email de test envoyé à {sent} destinataire(s)", "sent": sent, "errors": errors}
        raise HTTPException(status_code=500, detail=f"Échec d'envoi : {', '.join(errors)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health/alerts-history")
async def get_health_alerts_history(current_user: dict = Depends(get_current_admin_user)):
    """Récupère l'historique des alertes envoyées."""
    try:
        history_path = Path(update_service.app_root) / "health_alert_history.json"
        if history_path.exists():
            import json as json_mod
            with open(history_path) as f:
                return json_mod.load(f)
        return {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/updates/recent-info")
async def get_recent_update_info(current_user: dict = Depends(get_current_user)):
    """
    Récupère les informations des mises à jour récentes (pour le popup utilisateur)
    Disponible pour tous les utilisateurs connectés
    """
    try:
        info = await update_service.get_recent_updates_info(days=3)
        return info
    except Exception as e:
        logger.error(f"❌ Erreur récupération info MAJ récente: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/updates/history-list")
async def get_update_history_list(
    limit: int = 50,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Récupère l'historique des mises à jour depuis la BDD (admin uniquement)
    Compatible avec le frontend Updates.jsx
    """
    try:
        # Récupérer depuis la collection system_update_history
        history = await db.system_update_history.find(
            {},
            {"_id": 0}
        ).sort("started_at", -1).limit(limit).to_list(limit)
        
        return {"data": history, "total": len(history)}
    except Exception as e:
        logger.error(f"❌ Erreur récupération historique mises à jour: {str(e)}")
        # Retourner une liste vide en cas d'erreur plutôt qu'une exception
        return {"data": [], "total": 0}


@router.get("/changelog")
async def get_changelog(current_user: dict = Depends(get_current_user)):
    """Récupère le changelog des mises à jour pour l'utilisateur"""
    try:
        user_id = current_user.get("id")
        
        # Récupérer les entrées de changelog récentes
        entries = await db.system_update_history.find(
            {},
            {"_id": 0}
        ).sort("started_at", -1).limit(20).to_list(20)
        
        # Générer un identifiant unique pour chaque entrée (version ou started_at)
        for entry in entries:
            if not entry.get("version"):
                entry["version"] = entry.get("started_at", "unknown")
        
        # Récupérer les versions lues par cet utilisateur
        user_seen = await db.changelog_seen.find_one({"user_id": user_id}, {"_id": 0})
        seen_versions = set(user_seen.get("versions", [])) if user_seen else set()
        
        for entry in entries:
            entry["seen"] = entry.get("version", "") in seen_versions
        
        return {"entries": entries, "unseen_count": sum(1 for e in entries if not e.get("seen"))}
    except Exception as e:
        logger.error(f"❌ Erreur récupération changelog: {str(e)}")
        return {"entries": [], "unseen_count": 0}


@router.post("/changelog/mark-seen")
async def mark_changelog_seen(current_user: dict = Depends(get_current_user)):
    """Marque toutes les entrées du changelog comme lues"""
    try:
        user_id = current_user.get("id")
        
        entries = await db.system_update_history.find({}, {"_id": 0, "version": 1, "started_at": 1}).to_list(None)
        # Utiliser version ou started_at comme identifiant unique
        all_versions = [e.get("version") or e.get("started_at", "") for e in entries if e.get("version") or e.get("started_at")]
        
        await db.changelog_seen.update_one(
            {"user_id": user_id},
            {"$set": {"user_id": user_id, "versions": all_versions, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        
        return {"success": True}
    except Exception as e:
        logger.error(f"❌ Erreur marquage changelog: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/menu-badges")
async def get_menu_badges(current_user: dict = Depends(get_current_user)):
    """Récupère les badges 'Nouveau' pour les menus récemment ajoutés"""
    try:
        user_id = current_user.get("id")
        
        # Récupérer la date de dernière consultation des badges
        user_badge = await db.menu_badge_seen.find_one({"user_id": user_id}, {"_id": 0})
        last_seen = user_badge.get("last_seen_at") if user_badge else None
        
        # Menus ajoutés récemment (depuis le dernier check ou depuis 7 jours)
        new_menu_ids = []
        if not last_seen:
            # Première connexion ou pas encore de données - montrer les menus les plus récents
            new_menu_ids = ["mes", "mes-reports", "analytics-checklists", "service-dashboard", "cameras", "weekly-reports"]
        
        return {"new_menu_ids": new_menu_ids}
    except Exception:
        return {"new_menu_ids": []}


@router.post("/menu-badges/dismiss")
async def dismiss_menu_badges(current_user: dict = Depends(get_current_user)):
    """Marque les badges de menus comme vus"""
    try:
        user_id = current_user.get("id")
        await db.menu_badge_seen.update_one(
            {"user_id": user_id},
            {"$set": {"user_id": user_id, "last_seen_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        return {"success": True}
    except Exception:
        return {"success": False}


# Import surveillance routes
from surveillance_routes import router as surveillance_router, init_surveillance_routes
from realtime_manager import realtime_manager

# Initialize surveillance routes with database, audit service and realtime manager
init_surveillance_routes(db, audit_service, realtime_manager)

# Include surveillance routes
api_router.include_router(surveillance_router)

# Import and initialize AI maintenance routes (checklists + maintenance préventive)
from ai_maintenance_routes import router as ai_maintenance_router, init_ai_maintenance_routes
init_ai_maintenance_routes(db, audit_service)
api_router.include_router(ai_maintenance_router)

# Import and initialize Trash routes (corbeille)
from trash_routes import init_trash_routes, purge_expired_trash, TRASH_COLLECTIONS, get_retention_days, TrashSettingsUpdate
init_trash_routes(db)

@router.get("/trash", tags=["Corbeille"])
async def get_trash_items(collection: str = None, current_user: dict = Depends(get_current_user)):
    try:
        items = []
        cols = {collection: TRASH_COLLECTIONS[collection]} if collection and collection in TRASH_COLLECTIONS else TRASH_COLLECTIONS
        for col_name, col_info in cols.items():
            name_field = col_info["name_field"]
            cursor = db[col_name].find(
                {"deleted_at": {"$ne": None, "$exists": True}},
                {"_id": 1, "id": 1, name_field: 1, "deleted_at": 1, "deleted_by_name": 1, "numero": 1}
            )
            docs = await cursor.to_list(length=500)
            for doc in docs:
                doc_id = str(doc.get("id", doc.get("_id", "")))
                deleted_at = doc["deleted_at"]
                if isinstance(deleted_at, datetime):
                    deleted_at = deleted_at.isoformat()
                items.append({
                    "id": doc_id,
                    "collection": col_name,
                    "collection_label": col_info["label"],
                    "name": doc.get(name_field, "Sans nom"),
                    "numero": doc.get("numero"),
                    "deleted_at": deleted_at,
                    "deleted_by_name": doc.get("deleted_by_name", "Inconnu"),
                })
        items.sort(key=lambda x: x["deleted_at"], reverse=True)
        retention_days = await get_retention_days()
        return {"items": items, "retention_days": retention_days}
    except Exception as e:
        logger.error(f"Erreur get_trash_items: {e}")
        return {"items": [], "retention_days": 2}

@router.post("/trash/{collection}/{item_id}/restore", tags=["Corbeille"])
async def restore_trash_item(collection: str, item_id: str, current_user: dict = Depends(get_current_user)):
    if collection not in TRASH_COLLECTIONS:
        raise HTTPException(status_code=400, detail="Collection invalide")
    query = {"id": item_id, "deleted_at": {"$ne": None, "$exists": True}}
    doc = await db[collection].find_one(query)
    if not doc:
        try:
            query = {"_id": ObjectId(item_id), "deleted_at": {"$ne": None, "$exists": True}}
            doc = await db[collection].find_one(query)
        except:
            pass
    if not doc:
        raise HTTPException(status_code=404, detail="Element non trouve dans la corbeille")
    await db[collection].update_one(
        {"_id": doc["_id"]},
        {"$unset": {"deleted_at": "", "deleted_by": "", "deleted_by_name": ""}}
    )
    name = doc.get(TRASH_COLLECTIONS[collection]["name_field"], "")
    await audit_service.log_action(
        user_id=current_user["id"],
        user_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
        user_email=current_user["email"],
        action=ActionType.CREATE,
        entity_type=collection,
        entity_id=item_id,
        entity_name=name,
        details="Restauration depuis la corbeille"
    )
    return {"message": "Element restaure avec succes", "name": name}

@router.delete("/trash/{collection}/{item_id}", tags=["Corbeille"])
async def permanent_delete_trash(collection: str, item_id: str, current_user: dict = Depends(get_current_admin_user)):
    if collection not in TRASH_COLLECTIONS:
        raise HTTPException(status_code=400, detail="Collection invalide")
    query = {"id": item_id, "deleted_at": {"$ne": None, "$exists": True}}
    doc = await db[collection].find_one(query)
    if not doc:
        try:
            query = {"_id": ObjectId(item_id), "deleted_at": {"$ne": None, "$exists": True}}
            doc = await db[collection].find_one(query)
        except:
            pass
    if not doc:
        raise HTTPException(status_code=404, detail="Element non trouve")
    await db[collection].delete_one({"_id": doc["_id"]})
    return {"message": "Element supprime definitivement"}

@router.get("/trash/settings", tags=["Corbeille"])
async def get_trash_settings_endpoint(current_user: dict = Depends(get_current_user)):
    retention_days = await get_retention_days()
    return {"retention_days": retention_days}

@router.put("/trash/settings", tags=["Corbeille"])
async def update_trash_settings_endpoint(settings: TrashSettingsUpdate, current_user: dict = Depends(get_current_admin_user)):
    if settings.retention_days < 1 or settings.retention_days > 365:
        raise HTTPException(status_code=400, detail="Le delai doit etre entre 1 et 365 jours")
    await db.app_settings.update_one(
        {"key": "trash_retention_days"},
        {"$set": {"key": "trash_retention_days", "value": settings.retention_days}},
        upsert=True
    )
    return {"message": "Parametres mis a jour", "retention_days": settings.retention_days}


from ai_presqu_accident_routes import router as ai_pa_router, init_ai_pa_routes
init_ai_pa_routes(db, audit_service)
api_router.include_router(ai_pa_router)

from ai_work_order_routes import router as ai_wo_router, init_ai_wo_routes
init_ai_wo_routes(db, audit_service)
api_router.include_router(ai_wo_router)

from ai_weekly_report_routes import router as ai_report_router, init_ai_report_routes
init_ai_report_routes(db)
api_router.include_router(ai_report_router)

from ai_sensor_routes import router as ai_sensor_router, init_ai_sensor_routes
init_ai_sensor_routes(db)
api_router.include_router(ai_sensor_router)

from ai_purchase_history_routes import router as ai_purchase_history_router, init_ai_purchase_history_routes
init_ai_purchase_history_routes(db, audit_service)
api_router.include_router(ai_purchase_history_router)

from automation_routes import router as automation_router, init_automation_routes
init_automation_routes(db)
api_router.include_router(automation_router)




# Import presqu'accident routes
from presqu_accident_routes import router as presqu_accident_router, init_presqu_accident_routes

# Initialize presqu'accident routes with database, audit service and realtime manager
init_presqu_accident_routes(db, audit_service, realtime_manager)

# Include presqu'accident routes
api_router.include_router(presqu_accident_router)

# Import documentations routes
from documentations_routes import router as documentations_router, init_documentations_routes
from ssh_routes import router as ssh_router
from user_preferences_routes import router as user_preferences_router
from surveillance_history_routes import router as surveillance_history_router
from tailscale_routes import router as tailscale_router
from autorisation_routes import router as autorisation_router

# Initialize documentations routes with database, audit service and realtime manager
init_documentations_routes(db, audit_service, realtime_manager)

# Include documentations routes
api_router.include_router(documentations_router)
api_router.include_router(ssh_router)
api_router.include_router(user_preferences_router)
api_router.include_router(surveillance_history_router)
api_router.include_router(tailscale_router)
api_router.include_router(autorisation_router)

# Demandes d'arrêt pour maintenance (refactorisé en modules)
from demande_arret_routes import router as demande_arret_router
from demande_arret_reports_routes import router as demande_arret_reports_router
from demande_arret_attachments_routes import router as demande_arret_attachments_router
api_router.include_router(demande_arret_reports_router)  # Routes reports EN PREMIER (avant routes avec {demande_id})
api_router.include_router(demande_arret_attachments_router)  # Routes attachments
api_router.include_router(demande_arret_router)  # Routes principales EN DERNIER

# Import/Export routes (modularisé)
from import_export_routes import router as import_export_router, init_db as init_import_export_db
init_import_export_db(db)
api_router.include_router(import_export_router)

# Backup routes (sauvegardes automatiques)
from backup_routes import router as backup_router, init_db as init_backup_db, set_scheduler as set_backup_scheduler
from backup_service import init_db as init_backup_service_db
init_backup_db(db)
init_backup_service_db(db)
api_router.include_router(backup_router)

# Chat Live
from chat_routes import router as chat_router, init_chat_routes
init_chat_routes(db)
api_router.include_router(chat_router)

# Chat Cleanup Service
from chat_cleanup_service import init_chat_cleanup_service
chat_cleanup_service = init_chat_cleanup_service(db)

# Manuel utilisateur
from manual_routes import router as manual_router
api_router.include_router(manual_router)

# Changelog "Quoi de neuf ?" (releases)
from changelog_routes import router as releases_router
api_router.include_router(releases_router)

# QR Codes équipements
from qr_routes import router as qr_router
api_router.include_router(qr_router)

# QR Codes inventaire
from qr_inventory_routes import router as qr_inventory_router
api_router.include_router(qr_inventory_router)

# Purchase Request routes
from purchase_request_routes import router as purchase_request_router
api_router.include_router(purchase_request_router)

# MQTT routes
from mqtt_routes import router as mqtt_router, init_mqtt_routes
init_mqtt_routes(db)
api_router.include_router(mqtt_router)

# MQTT Manager - pour connexion automatique au démarrage
from mqtt_manager import mqtt_manager

# MQTT Meter Collector
from mqtt_meter_collector import mqtt_meter_collector

# Sensor routes
from sensor_routes import router as sensor_router, init_sensor_routes
init_sensor_routes(db, realtime_manager)
api_router.include_router(sensor_router)

# MQTT Sensor Collector
from mqtt_sensor_collector import mqtt_sensor_collector

# Alert routes and service
from alert_routes import router as alert_router, init_alert_routes
init_alert_routes(db)
api_router.include_router(alert_router)

from alert_service import alert_service

# MQTT Logger
from mqtt_logger import init_mqtt_logger
mqtt_logger = init_mqtt_logger(db)

# MQTT Logs routes
from mqtt_logs_routes import router as mqtt_logs_router, init_mqtt_logs_routes
init_mqtt_logs_routes(db, mqtt_logger)
api_router.include_router(mqtt_logs_router)

# M.E.S (Manufacturing Execution System) routes
from mes_routes import router as mes_router, init_mes_routes, mes_service as _mes_svc_ref
init_mes_routes(db, mqtt_manager)
api_router.include_router(mes_router)

# M.E.S Report Scheduler (envoi automatique des rapports)
from mes_report_scheduler import init_mes_report_scheduler
import email_service as email_service_module

@app.on_event("startup")
async def start_mes_report_scheduler():
    try:
        await init_mes_report_scheduler(db, _mes_svc_ref, email_service_module)
        logger.info("Scheduler rapports M.E.S. demarre")
    except Exception as e:
        logger.warning(f"Erreur demarrage scheduler rapports M.E.S.: {e}")


# AI Chatbot routes
from ai_chat_routes import router as ai_router, init_ai_routes
init_ai_routes(db)
api_router.include_router(ai_router)

# Roles Management routes
from roles_routes import router as roles_router, init_system_roles, init_roles_routes
init_roles_routes(db)
api_router.include_router(roles_router)

# Timezone Configuration routes
from timezone_routes import router as timezone_router, init_timezone_routes
init_timezone_routes(db)
api_router.include_router(timezone_router)

# Consignes routes (notifications MQTT)
from consignes_routes import router as consignes_router, init_consignes_routes, consignes_websocket_endpoint
init_consignes_routes(db, get_current_user, mqtt_manager, audit_service)
api_router.include_router(consignes_router)

# Work Order Templates routes (Ordres Type)
from work_order_templates_routes import router as wo_templates_router
api_router.include_router(wo_templates_router)

# Custom Widgets routes (Widgets personnalisés pour responsables de service)
from custom_widgets_routes import router as custom_widgets_router, init_custom_widgets_routes
init_custom_widgets_routes(db, audit_service)
api_router.include_router(custom_widgets_router)

from ai_widget_routes import router as ai_widget_router, init_ai_widget_routes
init_ai_widget_routes(db)
api_router.include_router(ai_widget_router)

# Service de filtrage par service
from service_filter import init_service_filter
init_service_filter(db)

# Service d'email pour les demandes d'amélioration
from improvement_request_email_service import init_improvement_request_email_service
init_improvement_request_email_service(db)

# Whiteboard (Tableau d'affichage) routes
from whiteboard_routes import router as whiteboard_router, init_whiteboards, init_whiteboard_audit
from whiteboard_object_routes import router as whiteboard_object_router
from whiteboard_manager import whiteboard_manager, handle_whiteboard_message
init_whiteboard_audit(audit_service)  # Initialiser le service d'audit pour le whiteboard
api_router.include_router(whiteboard_router)
api_router.include_router(whiteboard_object_router)  # Nouvelles routes API granulaires

# Routes des rapports hebdomadaires/mensuels/annuels
from weekly_report_routes import router as weekly_report_router, set_database as set_weekly_report_db
set_weekly_report_db(db)
api_router.include_router(weekly_report_router)

# Routes de gestion d'équipe et pointage
from team_management_routes import router as team_router, set_database as set_team_db
set_team_db(db)
api_router.include_router(team_router)

from time_tracking_routes import router as time_tracking_router, set_database as set_time_tracking_db
set_time_tracking_db(db)
api_router.include_router(time_tracking_router)

# Routes de gestion des caméras RTSP/ONVIF
# IMPORTANT: Les routes Frigate doivent être incluses AVANT camera_router car
# celui-ci a des routes dynamiques /{camera_id} qui capturent tout
from frigate_routes import router as frigate_router, set_database as set_frigate_db, init_frigate_from_db
set_frigate_db(db)
api_router.include_router(frigate_router, prefix="/cameras")

from camera_routes import router as camera_router, set_database as set_camera_db
from camera_snapshot_scheduler import set_database as set_camera_scheduler_db, start_snapshot_scheduler
set_camera_db(db)
set_camera_scheduler_db(db)
api_router.include_router(camera_router)

# Initialiser Frigate depuis la DB au démarrage
@app.on_event("startup")
async def init_frigate():
    await init_frigate_from_db()

# Routes Analytics Checklists
from analytics_routes import router as analytics_router, set_database as set_analytics_db
set_analytics_db(db)
api_router.include_router(analytics_router)

# Routes Contrats
from contract_routes import router as contract_router, init_db as init_contract_db
init_contract_db(db, audit_service)
api_router.include_router(contract_router)

# Routes LOTO (Lockout/Tagout - Consignations de sécurité)
from loto_routes import router as loto_router, init_loto_routes
init_loto_routes(db, audit_service)
api_router.include_router(loto_router)

# Push Notifications routes
from notifications import router as push_notifications_router, set_db as set_notifications_db, check_push_receipts
set_notifications_db(db)
api_router.include_router(push_notifications_router)

# Routes Formation (Training)
from training_routes import router as training_router, init_training_routes
init_training_routes(db)
api_router.include_router(training_router)

# Routes Analyse d'Accidents (Arbre des Causes)
from accident_analysis_routes import router as accident_analysis_router, init_accident_analysis_routes
init_accident_analysis_routes(db, audit_service)
api_router.include_router(accident_analysis_router)

# Routes extraites de server.py
from routes.work_orders import router as work_orders_router
from routes.equipments import router as equipments_router
from routes.intervention_requests import router as intervention_requests_router
from routes.reports import router as reports_router
from routes.users import router as users_router
from routes.notifications import router as notifications_router, check_pm_notifications
from routes.settings import router as settings_router
from routes.vendors import router as vendors_router
from routes.improvements import router as improvements_router
api_router.include_router(work_orders_router)
api_router.include_router(equipments_router)
api_router.include_router(intervention_requests_router)
api_router.include_router(reports_router)
api_router.include_router(users_router)
api_router.include_router(notifications_router)
api_router.include_router(settings_router)
api_router.include_router(vendors_router)
api_router.include_router(improvements_router)


# WebSocket pour le tableau d'affichage
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/api/ws/whiteboard/{board_id}")
async def whiteboard_websocket(websocket: WebSocket, board_id: str):
    """WebSocket pour la synchronisation temps réel du tableau d'affichage"""
    # Récupérer les paramètres de l'utilisateur depuis la query string
    user_id = websocket.query_params.get("user_id", "anonymous")
    user_name = websocket.query_params.get("user_name", "Anonyme")
    
    await whiteboard_manager.connect(websocket, board_id, user_id, user_name)
    
    try:
        # Envoyer l'état initial du tableau
        board = await db.whiteboards.find_one({"board_id": board_id}, {"_id": 0})
        if board:
            await websocket.send_json({
                "type": "sync_response",
                "board": board
            })
        
        # Écouter les messages
        while True:
            data = await websocket.receive_json()
            await handle_whiteboard_message(websocket, board_id, user_id, user_name, data, db)
            
    except WebSocketDisconnect:
        await whiteboard_manager.disconnect(board_id, user_id)
    except Exception as e:
        logger.error(f"Erreur WebSocket whiteboard: {e}")
        await whiteboard_manager.disconnect(board_id, user_id)

# WebSocket Centralisé pour toutes les entités temps réel
from realtime_manager import realtime_manager
from realtime_events import EntityType as RealtimeEntityType

@app.websocket("/api/ws/realtime/{entity_type}")
async def realtime_websocket(websocket: WebSocket, entity_type: str, user_id: str = None):
    """
    WebSocket centralisé pour la synchronisation temps réel de toutes les entités
    
    Args:
        entity_type: Type d'entité (work_orders, equipments, etc.)
        user_id: ID de l'utilisateur connecté
    """
    try:
        logger.info(f"[Realtime] Nouvelle connexion WebSocket demandée: entity_type={entity_type}, user_id={user_id}")
        
        # Valider le type d'entité
        valid_types = [e.value for e in RealtimeEntityType]
        if entity_type not in valid_types:
            logger.warning(f"[Realtime] Type d'entité invalide: {entity_type}. Types valides: {valid_types}")
            await websocket.close(code=1008, reason=f"Invalid entity type: {entity_type}")
            return
        
        # Valider user_id
        if not user_id:
            logger.warning(f"[Realtime] user_id manquant pour {entity_type}")
            await websocket.close(code=1008, reason="user_id is required")
            return
        
        # Accepter la connexion WebSocket
        await websocket.accept()
        logger.info(f"[Realtime] WebSocket accepté: {entity_type}/{user_id}")
        
        # Connecter l'utilisateur au manager (connexion déjà acceptée)
        await realtime_manager.connect(entity_type, user_id, websocket, already_accepted=True)
        logger.info(f"[Realtime] Utilisateur {user_id} connecté au room {entity_type}. Total: {realtime_manager.get_connection_count(entity_type)}")
        
        # Garder la connexion ouverte
        while True:
            # Recevoir les messages du client (pour ping/pong ou autres commandes)
            data = await websocket.receive_json()
            
            # Gérer les commandes spéciales si nécessaire
            if data.get("type") == "ping":
                await realtime_manager.send_to_user(entity_type, user_id, {"type": "pong"})
            
    except WebSocketDisconnect:
        realtime_manager.disconnect(entity_type, user_id)
        logger.info(f"[Realtime] WebSocket déconnecté: {entity_type}/{user_id}")
    except Exception as e:
        logger.error(f"[Realtime] Erreur WebSocket {entity_type}/{user_id}: {e}")
        realtime_manager.disconnect(entity_type, user_id)

# WebSocket pour le Chat Live
from websocket_manager import manager as chat_manager

@app.websocket("/api/ws/chat")
async def chat_live_websocket(websocket: WebSocket, token: str = None, user_id: str = None):
    """WebSocket pour le chat en temps réel"""
    ws_user_id = None
    user_name = "Unknown"
    
    try:
        # Support: user_id direct (préféré pour la compatibilité proxy) ou token JWT
        if user_id:
            ws_user_id = user_id
            user_data = await db.users.find_one({"_id": ObjectId(ws_user_id)})
            if not user_data:
                await websocket.close(code=1008, reason="User not found")
                return
            user_name = f"{user_data.get('prenom', '')} {user_data.get('nom', '')}".strip()
        elif token:
            payload = decode_access_token(token)
            if not payload:
                await websocket.close(code=1008, reason="Invalid token")
                return
            ws_user_id = payload.get("sub")
            if not ws_user_id:
                await websocket.close(code=1008, reason="Invalid token - no user_id")
                return
            user_data = await db.users.find_one({"_id": ObjectId(ws_user_id)})
            if not user_data:
                await websocket.close(code=1008, reason="User not found")
                return
            user_name = f"{user_data.get('prenom', '')} {user_data.get('nom', '')}".strip()
        else:
            await websocket.close(code=1008, reason="user_id or token required")
            return
        
        # Connecter l'utilisateur
        await chat_manager.connect(websocket, ws_user_id, user_name)
        
        # Marquer l'utilisateur comme en ligne
        await db.user_chat_activity.update_one(
            {"user_id": ws_user_id},
            {
                "$set": {
                    "user_id": ws_user_id,
                    "is_online": True,
                    "last_activity": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
        
        try:
            while True:
                # Recevoir les messages du client
                data = await websocket.receive_json()
                message_type = data.get("type")
                
                if message_type == "heartbeat":
                    await db.user_chat_activity.update_one(
                        {"user_id": ws_user_id},
                        {"$set": {"last_activity": datetime.now(timezone.utc).isoformat()}}
                    )
                    await websocket.send_json({"type": "heartbeat_ack"})
                
                elif message_type == "message":
                    message_content = data.get("message", "")
                    recipient_ids = data.get("recipient_ids", [])
                    reply_to_id = data.get("reply_to_id")
                    
                    chat_message = {
                        "id": str(uuid.uuid4()),
                        "user_id": ws_user_id,
                        "user_name": user_name,
                        "user_role": user_data.get("role", ""),
                        "message": message_content,
                        "recipient_ids": recipient_ids,
                        "recipient_names": [],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "is_deleted": False,
                        "deleted_at": None,
                        "reply_to_id": reply_to_id,
                        "reply_to_preview": None,
                        "reactions": [],
                        "attachments": [],
                        "deletable_until": (datetime.now(timezone.utc) + timedelta(seconds=10)).isoformat(),
                        "is_private": len(recipient_ids) > 0
                    }
                    
                    if reply_to_id:
                        original_msg = await db.chat_messages.find_one({"id": reply_to_id})
                        if original_msg:
                            chat_message["reply_to_preview"] = original_msg.get("message", "")[:100]
                    
                    if recipient_ids:
                        recipient_object_ids = [ObjectId(rid) for rid in recipient_ids if ObjectId.is_valid(rid)]
                        recipients = await db.users.find({"_id": {"$in": recipient_object_ids}}).to_list(length=None)
                        chat_message["recipient_names"] = [
                            f"{r.get('prenom', '')} {r.get('nom', '')}".strip()
                            for r in recipients
                        ]
                    
                    await db.chat_messages.insert_one(chat_message)
                    
                    broadcast_data = {
                        "type": "new_message",
                        "message": {k: v for k, v in chat_message.items() if k != "_id"}
                    }
                    
                    if recipient_ids:
                        await chat_manager.send_to_users(broadcast_data, recipient_ids + [ws_user_id])
                    else:
                        await chat_manager.broadcast(broadcast_data)
                
                elif message_type == "typing":
                    await chat_manager.broadcast({
                        "type": "user_typing",
                        "user_id": ws_user_id,
                        "user_name": user_name
                    }, exclude_user_id=ws_user_id)
        
        except WebSocketDisconnect:
            logger.info(f"Chat WebSocket déconnecté: {user_name}")
    
    except Exception as e:
        logger.error(f"Erreur Chat WebSocket: {e}")
    
    finally:
        if ws_user_id:
            chat_manager.disconnect(ws_user_id, user_name, websocket=websocket)
            # Vérifier s'il reste des connexions pour cet utilisateur
            if not chat_manager.is_user_online(ws_user_id):
                await db.user_chat_activity.update_one(
                    {"user_id": ws_user_id},
                    {"$set": {"is_online": False, "last_activity": datetime.now(timezone.utc).isoformat()}}
                )
                await chat_manager.broadcast_user_status(ws_user_id, user_name, "offline")

# WebSocket pour les consignes (notifications temps réel)
@app.websocket("/api/ws/consignes")
async def consignes_websocket(websocket: WebSocket, token: str = None, user_id: str = None):
    """WebSocket pour recevoir les consignes en temps réel"""
    if user_id:
        # Connexion par user_id (compatible proxy)
        try:
            user_data = await db.users.find_one({"_id": ObjectId(user_id)})
            if not user_data:
                await websocket.close(code=1008, reason="User not found")
                return
            await websocket.accept()
            try:
                while True:
                    data = await websocket.receive_text()
            except WebSocketDisconnect:
                pass
        except Exception as e:
            logger.error(f"Erreur consignes WS: {e}")
    elif token:
        await consignes_websocket_endpoint(websocket, token)
    else:
        await websocket.close(code=1008, reason="user_id or token required")


