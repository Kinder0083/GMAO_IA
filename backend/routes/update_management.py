"""
Routes de gestion des mises a jour - Check, Apply, Changelog
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from pathlib import Path
import logging
import subprocess
import os

from models import ActionType, EntityType
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Gestion Mises a Jour"])

from update_service import UpdateService, MaintenanceMode

# Initialiser le service de mise à jour
update_service = UpdateService(db)

@router.get("/updates/check-version")
async def check_updates_version(current_user: dict = Depends(get_current_admin_user)):
    """
    Vérifie si une mise à jour est disponible via version.json (Admin uniquement)
    """
    try:
        update_info = await update_service.check_for_updates()
        return update_info if update_info else {"available": False, "current_version": update_service.current_version}
    except Exception as e:
        logger.error(f"❌ Erreur vérification mises à jour: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/updates/status")
async def get_update_status(current_user: dict = Depends(get_current_admin_user)):
    """
    Récupère le statut actuel du système de mise à jour
    """
    try:
        return {
            "current_version": update_service.current_version,
            "status": "ready"
        }
    except Exception as e:
        logger.error(f"❌ Erreur statut mise à jour: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/updates/check-conflicts")
async def check_git_conflicts(current_user: dict = Depends(get_current_admin_user)):
    """
    Vérifie s'il y a des conflits Git avant une mise à jour (Admin uniquement)
    Retourne la liste des fichiers modifiés localement
    """
    try:
        result = update_service.check_git_conflicts()
        return result
    except Exception as e:
        logger.error(f"Erreur lors de la vérification des conflits: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/updates/resolve-conflicts")
async def resolve_git_conflicts(
    strategy: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Résout les conflits Git selon la stratégie choisie (Admin uniquement)
    strategy: "reset" (écraser), "stash" (sauvegarder), ou "abort" (annuler)
    """
    try:
        result = update_service.resolve_git_conflicts(strategy)
        
        # Journaliser l'action
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType.SETTINGS,
            entity_id="git_conflicts",
            entity_name=f"Résolution conflits Git ({strategy})",
            details=result.get("message", "")
        )
        
        return result
    except Exception as e:
        logger.error(f"Erreur lors de la résolution des conflits: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_update_status(current_user: dict = Depends(get_current_admin_user)):
    """
    Récupère le statut actuel des mises à jour (Admin uniquement)
    """
    try:
        status = await update_service.get_update_status()
        return status
    except Exception as e:
        logger.error(f"❌ Erreur récupération statut: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/updates/dismiss/{version}")
async def dismiss_update(version: str, current_user: dict = Depends(get_current_admin_user)):
    """
    Marque une notification de mise à jour comme dismissée (Admin uniquement)
    """
    try:
        await update_service.dismiss_update_notification(version)
        return {"message": "Notification dismissée"}
    except Exception as e:
        logger.error(f"❌ Erreur dismiss notification: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/updates/broadcast-warning")
async def broadcast_update_warning(
    version: str = "",
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Diffuse un avertissement de mise à jour à TOUS les utilisateurs connectés via WebSocket.
    Après 30 secondes, les utilisateurs seront automatiquement déconnectés côté frontend.
    """
    try:
        admin_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
        connected_count = len(chat_manager.active_connections)
        
        logger.info(f"📢 Diffusion avertissement MAJ par {admin_name} - {connected_count} utilisateur(s) connecté(s)")
        
        # Broadcast via le WebSocket du chat (tous les utilisateurs connectés)
        await chat_manager.broadcast({
            "type": "update_warning",
            "message": "Une mise à jour va être effectuée. Vous serez déconnecté dans 30 secondes. Vous pourrez vous reconnecter dans 5 minutes.",
            "admin_name": admin_name,
            "version": version,
            "countdown_seconds": 30,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # Broadcast via les WebSocket consignes aussi
        from consignes_routes import consigne_connections
        for uid, ws in list(consigne_connections.items()):
            try:
                await ws.send_json({
                    "type": "update_warning",
                    "message": "Une mise à jour va être effectuée. Vous serez déconnecté dans 30 secondes.",
                    "countdown_seconds": 30
                })
            except Exception:
                pass
        
        # Log dans l'audit
        await audit_service.log_action(
            user_id=current_user.get("id"),
            user_name=admin_name,
            user_email=current_user.get("email"),
            action=ActionType.UPDATE,
            entity_type=EntityType.SETTINGS,
            entity_id="update_warning_broadcast",
            entity_name=f"Avertissement MAJ diffusé ({connected_count} utilisateurs)"
        )
        
        return {
            "success": True,
            "connected_users": connected_count,
            "message": f"Avertissement envoyé à {connected_count} utilisateur(s)"
        }
    except Exception as e:
        logger.error(f"❌ Erreur broadcast avertissement MAJ: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/updates/apply")
async def apply_update_endpoint(
    version: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """Lance une mise a jour in-process (Admin uniquement)."""
    try:
        logger.info(f"[MAJ] Demande MAJ vers {version} par {current_user.get('email')}")
        await audit_service.log_action(
            user_id=current_user.get("id"),
            user_name=f"{current_user.get('prenom')} {current_user.get('nom')}",
            user_email=current_user.get("email"),
            action=ActionType.UPDATE,
            entity_type=EntityType.SETTINGS,
            entity_id="system_update",
            entity_name=f"Mise a jour vers {version}"
        )
        result = await update_service.apply_update(version)
        if result.get("accepted") or result.get("success"):
            return {
                "accepted": True,
                "success": True,
                "message": result.get("message", "Mise a jour lancee"),
                "update_id": result.get("update_id"),
                "version": version,
                "code_updated": result.get("code_updated", False),
                "errors": result.get("errors", []),
                "diagnostic": result.get("diagnostic", {})
            }
        else:
            raise HTTPException(status_code=500, detail=result.get("message", "Erreur"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[MAJ] Erreur: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/updates/log")
async def get_update_log(current_user: dict = Depends(get_current_admin_user)):
    """
    Retourne le log de la derniere mise a jour.
    Source PRINCIPALE: MongoDB (fiable, survit au reboot).
    """
    try:
        last_result = await db.system_settings.find_one({"key": "last_update_result"}, {"_id": 0})
        if last_result and last_result.get("log_output"):
            return {
                "found": True,
                "path": "MongoDB",
                "content": last_result["log_output"],
                "in_progress": last_result.get("in_progress", False),
                "current_step": last_result.get("current_step", ""),
                "errors": last_result.get("errors", []),
                "status": last_result.get("status", ""),
                "success": last_result.get("success", False)
            }
        
        import glob as glob_mod
        log_candidates = ["/var/log/gmao-iris-update.log", "/var/log/gmao-iris-worker.log",
                          "/tmp/gmao-iris-update.log", "/tmp/gmao-iris-worker.log"]
        for path in log_candidates:
            if path and os.path.exists(path) and os.path.getsize(path) > 10:
                with open(path, 'r', errors='replace') as f:
                    content = f.read()
                return {
                    "found": True,
                    "path": path,
                    "content": content[-50000:],
                    "in_progress": last_result.get("in_progress", False) if last_result else False
                }

        return {
            "found": False,
            "content": "",
            "message": "Aucun log disponible."
        }
    except Exception as e:
        logger.error(f"[MAJ] Erreur lecture log: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/updates/last-result")
async def get_last_update_result(current_user: dict = Depends(get_current_admin_user)):
    """
    Récupère le résultat de la dernière mise à jour depuis la base de données.
    Permet au frontend de vérifier si la mise à jour a réellement réussi après un redémarrage.
    """
    try:
        result = await db.system_settings.find_one({"key": "last_update_result"}, {"_id": 0})
        if result:
            return {
                "has_result": True,
                "success": result.get("success", False),
                "code_updated": result.get("code_updated", False),
                "in_progress": result.get("in_progress", False),
                "version_before": result.get("version_before"),
                "version_after": result.get("version_after"),
                "errors": result.get("errors", []),
                "warnings": result.get("warnings", []),
                "completed_at": result.get("completed_at")
            }
        return {"has_result": False, "in_progress": False}
    except Exception as e:
        logger.error(f"❌ Erreur récupération résultat MAJ: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/maintenance/activate")
async def activate_maintenance_mode(current_user: dict = Depends(get_current_admin_user)):
    """Active la page de maintenance NGINX (Admin uniquement)."""
    try:
        maintenance = MaintenanceMode(Path(update_service.app_root))
        success = maintenance.activate()
        if success:
            return {"status": "ok", "message": "Page de maintenance activée", "maintenance_active": True}
        raise HTTPException(status_code=500, detail="Échec de l'activation de la maintenance")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/maintenance/deactivate")
async def deactivate_maintenance_mode(current_user: dict = Depends(get_current_admin_user)):
    """Désactive la page de maintenance NGINX (Admin uniquement)."""
    try:
        maintenance = MaintenanceMode(Path(update_service.app_root))
        success = maintenance.deactivate()
        if success:
            return {"status": "ok", "message": "Page de maintenance désactivée", "maintenance_active": False}
        raise HTTPException(status_code=500, detail="Échec de la désactivation de la maintenance")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/maintenance/status")
async def get_maintenance_status(current_user: dict = Depends(get_current_admin_user)):
    """Vérifie si la page de maintenance est active (Admin uniquement)."""
    try:
        flag_path = Path(update_service.app_root) / "maintenance.flag"
        state_path = Path(update_service.app_root) / "health_state.json"
        history_path = Path(update_service.app_root) / "health_recovery_history.json"
        result = {
            "maintenance_active": flag_path.exists(),
            "health_state": None,
            "recovery_history": [],
        }
        if state_path.exists():
            import json as json_mod
            with open(state_path) as f:
                health_state = json_mod.load(f)
            result["health_state"] = {
                "consecutive_failures": health_state.get("consecutive_failures", 0),
                "last_check": health_state.get("last_check"),
                "last_success": health_state.get("last_success"),
                "last_failure": health_state.get("last_failure"),
                "last_recovery_level": health_state.get("last_recovery_level", 0),
                "total_recoveries": health_state.get("total_recoveries", 0),
            }
        if history_path.exists():
            import json as json_mod
            with open(history_path) as f:
                result["recovery_history"] = json_mod.load(f)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Ping simple pour vérifier la connectivité."""
    return {"status": "ok"}


@router.get("/health/recovery-history")
async def get_recovery_history(current_user: dict = Depends(get_current_admin_user)):
    """Historique des récupérations automatiques (Admin uniquement)."""
    try:
        history_path = Path(update_service.app_root) / "health_recovery_history.json"
        if history_path.exists():
            import json as json_mod
            with open(history_path) as f:
                return json_mod.load(f)
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/health/force-check")
async def force_health_check(current_user: dict = Depends(get_current_admin_user)):
    """Lance un health check immédiat (Admin uniquement)."""
    try:
        import urllib.request
        checks = {}
        # Backend self-check
        checks["backend"] = {"status": "ok", "message": "API opérationnelle"}
        # MongoDB check
        try:
            await db.command("ping")
            checks["mongodb"] = {"status": "ok", "message": "MongoDB connecté"}
        except Exception as e:
            checks["mongodb"] = {"status": "error", "message": str(e)}
        # Disk usage
        try:
            import shutil
            usage = shutil.disk_usage("/")
            used_pct = round((usage.used / usage.total) * 100, 1)
            free_gb = round(usage.free / (1024**3), 1)
            checks["disk"] = {
                "status": "ok" if used_pct < 90 else "warning",
                "message": f"{used_pct}% utilisé, {free_gb} Go libre"
            }
        except Exception as e:
            checks["disk"] = {"status": "error", "message": str(e)}
        # Memory
        try:
            with open("/proc/meminfo") as f:
                meminfo = f.read()
            total = int([l for l in meminfo.split('\n') if 'MemTotal' in l][0].split()[1])
            available = int([l for l in meminfo.split('\n') if 'MemAvailable' in l][0].split()[1])
            used_pct = round(((total - available) / total) * 100, 1)
            checks["memory"] = {
                "status": "ok" if used_pct < 85 else "warning",
                "message": f"{used_pct}% utilisé"
            }
        except Exception:
            checks["memory"] = {"status": "unknown", "message": "Impossible de lire /proc/meminfo"}

        overall = "ok"
        for c in checks.values():
            if c["status"] == "error":
                overall = "error"
                break
            if c["status"] == "warning":
                overall = "warning"
        return {"overall": overall, "checks": checks, "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


