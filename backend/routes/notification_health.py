"""
Routes de monitoring de sante des notifications
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from pathlib import Path
import logging
import os

from models import ActionType, EntityType
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc
from routes.update_management import update_service

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
            # Assurer que lc_time est timezone-aware pour éviter l'erreur offset-naive/aware
            if lc_time is not None and hasattr(lc_time, 'tzinfo') and lc_time.tzinfo is None:
                lc_time = lc_time.replace(tzinfo=timezone.utc)
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
                # Utiliser _id comme fallback si le champ "id" n'existe pas en DB
                admin_cursor = db.users.find(
                    {"role": "ADMIN", "statut": {"$in": ["actif", "ACTIF"]}}
                )
                admin_ids = []
                async for doc in admin_cursor:
                    uid = str(doc.get("id") or doc["_id"])
                    if uid:
                        admin_ids.append(uid)
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


# ==================== ARCHITECTURE & MONITORING ====================

@router.get("/health/architecture", tags=["Health"])
async def get_system_architecture(current_user: dict = Depends(get_current_admin_user)):
    """Retourne l'architecture modulaire du backend, les metriques et le statut des services."""
    import time
    import importlib
    import inspect

    # 1. Scanner les modules de routes
    routes_dir = Path(__file__).parent
    modules_info = []

    route_files = sorted([
        f.stem for f in routes_dir.glob("*.py")
        if f.stem not in ("__init__", "shared") and not f.stem.startswith("__")
    ])

    for mod_name in route_files:
        try:
            mod = importlib.import_module(f"routes.{mod_name}")
            mod_router = getattr(mod, "router", None)
            route_count = 0
            methods_detail = []
            if mod_router and hasattr(mod_router, "routes"):
                for route in mod_router.routes:
                    methods = getattr(route, "methods", set())
                    path = getattr(route, "path", "")
                    route_count += 1
                    methods_detail.append({
                        "path": path,
                        "methods": list(methods) if methods else ["WS"]
                    })
            modules_info.append({
                "name": mod_name,
                "status": "ok",
                "route_count": route_count,
                "routes": methods_detail[:5],
                "has_more": route_count > 5
            })
        except Exception as e:
            modules_info.append({
                "name": mod_name,
                "status": "error",
                "route_count": 0,
                "error": str(e)[:100],
                "routes": []
            })

    # 2. Compter les modules externes (fichiers .py hors routes/)
    backend_dir = Path(__file__).parent.parent
    external_modules = []
    external_router_files = [
        f.stem for f in backend_dir.glob("*_routes.py")
        if f.stem not in ("__init__",)
    ]
    for ef in sorted(external_router_files):
        try:
            mod = importlib.import_module(ef)
            mod_router = getattr(mod, "router", None)
            rc = len(mod_router.routes) if mod_router and hasattr(mod_router, "routes") else 0
            external_modules.append({"name": ef, "status": "ok", "route_count": rc})
        except Exception as e:
            external_modules.append({"name": ef, "status": "error", "route_count": 0, "error": str(e)[:80]})

    # 3. Services status
    services = []

    # MongoDB
    try:
        t0 = time.time()
        await db.command("ping")
        mongo_ms = round((time.time() - t0) * 1000, 1)
        db_stats = await db.command("dbstats")
        collections_count = db_stats.get("collections", 0)
        data_size_mb = round(db_stats.get("dataSize", 0) / (1024 * 1024), 1)
        services.append({
            "name": "MongoDB",
            "status": "ok",
            "response_ms": mongo_ms,
            "details": f"{collections_count} collections, {data_size_mb} Mo"
        })
    except Exception as e:
        services.append({"name": "MongoDB", "status": "error", "details": str(e)[:80]})

    # MQTT
    try:
        from mqtt_manager import mqtt_manager as _mqtt
        mqtt_connected = _mqtt.client and _mqtt.client.is_connected() if hasattr(_mqtt, 'client') and _mqtt.client else False
        services.append({
            "name": "MQTT",
            "status": "ok" if mqtt_connected else "warning",
            "details": "Connecte" if mqtt_connected else "Non connecte"
        })
    except Exception:
        services.append({"name": "MQTT", "status": "warning", "details": "Module non charge"})

    # WebSocket / Realtime Manager
    try:
        from routes.shared import realtime_manager as _rm
        ws_connections = 0
        if hasattr(_rm, '_connections'):
            for entity_conns in _rm._connections.values():
                ws_connections += len(entity_conns)
        services.append({
            "name": "WebSocket",
            "status": "ok",
            "details": f"{ws_connections} connexion(s) active(s)"
        })
    except Exception:
        services.append({"name": "WebSocket", "status": "warning", "details": "Non disponible"})

    # Email Service
    try:
        import email_service as _es
        smtp_configured = bool(getattr(_es, 'smtp_host', None) or os.environ.get('SMTP_HOST'))
        services.append({
            "name": "Email (SMTP)",
            "status": "ok" if smtp_configured else "warning",
            "details": "Configure" if smtp_configured else "Non configure"
        })
    except Exception:
        services.append({"name": "Email (SMTP)", "status": "warning", "details": "Module non charge"})

    # 4. Uptime et info systeme
    import platform
    try:
        with open("/proc/uptime", "r") as f:
            uptime_seconds = float(f.readline().split()[0])
        uptime_hours = round(uptime_seconds / 3600, 1)
    except Exception:
        uptime_hours = None

    # 5. Resume global
    total_internal_routes = sum(m["route_count"] for m in modules_info)
    total_external_routes = sum(m["route_count"] for m in external_modules)
    ok_modules = sum(1 for m in modules_info if m["status"] == "ok")
    error_modules = sum(1 for m in modules_info if m["status"] == "error")

    return {
        "summary": {
            "total_modules": len(modules_info) + len(external_modules),
            "internal_modules": len(modules_info),
            "external_modules": len(external_modules),
            "total_routes": total_internal_routes + total_external_routes,
            "modules_ok": ok_modules + sum(1 for m in external_modules if m["status"] == "ok"),
            "modules_error": error_modules + sum(1 for m in external_modules if m["status"] == "error"),
            "python_version": platform.python_version(),
            "uptime_hours": uptime_hours
        },
        "internal_modules": modules_info,
        "external_modules": external_modules,
        "services": services
    }

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


@router.post("/health/notifications/cleanup-invalid", tags=["Health"])
async def cleanup_invalid_subscriptions(current_user: dict = Depends(get_current_admin_user)):
    """Teste tous les abonnements actifs et nettoie les invalides (VapidPkHashMismatch, 401, 410, etc.).
    Utile après un changement de clés VAPID."""
    from web_push import send_web_push_to_user
    
    active_subs = []
    async for doc in db.web_push_subscriptions.find({"is_active": True}):
        active_subs.append(doc)
    
    if not active_subs:
        return {"tested": 0, "cleaned": 0, "message": "Aucun abonnement actif à tester"}
    
    # Regrouper par user_id pour éviter de tester plusieurs fois le même user
    user_ids_tested = set()
    total_tested = 0
    total_cleaned = 0
    
    for sub in active_subs:
        user_id = sub.get("user_id")
        if not user_id or user_id in user_ids_tested:
            continue
        user_ids_tested.add(user_id)
        result = await send_web_push_to_user(
            db, user_id,
            title="Test de connectivité",
            body="Vérification du système de notifications.",
            data={"type": "connectivity_check"},
            tag="cleanup-test"
        )
        total_tested += result.get("sent", 0) + result.get("failed", 0)
        total_cleaned += result.get("deactivated", 0)
    
    logger.info(f"[NOTIF CLEANUP] {total_cleaned} abonnement(s) invalide(s) nettoyé(s) sur {total_tested} testé(s)")
    return {
        "tested": total_tested,
        "cleaned": total_cleaned,
        "message": f"{total_cleaned} abonnement(s) invalide(s) supprimé(s) sur {total_tested} testé(s). Les utilisateurs concernés doivent se réabonner dans Paramètres → Notifications."
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



# ==================== TRASH ROUTES ====================
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
