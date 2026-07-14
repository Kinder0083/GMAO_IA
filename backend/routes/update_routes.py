"""
Routes de mise a jour des donnees et passerelle vers les scripts Proxmox.
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
from pathlib import Path
import logging
import os
import shutil
import subprocess

from models import ActionType, EntityType
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Mises a jour"])

from update_manager import UpdateManager

update_manager = UpdateManager(db)

APP_ROOT = Path(__file__).resolve().parents[2]
APP_TECH_SLUG = "gmao-iris"
BACKUP_ROOT = Path(f"/opt/{APP_TECH_SLUG}-backups")


def _script_path(script_name: str) -> Path:
    """Retourne le chemin attendu du script dans l'installation applicative."""
    return APP_ROOT / script_name


def _has_pct() -> bool:
    """Indique si le code s'execute sur un hote Proxmox capable de piloter pct."""
    return shutil.which("pct") is not None


def _script_metadata(script_name: str, description: str, command: str) -> dict:
    path = _script_path(script_name)
    return {
        "name": script_name,
        "description": description,
        "path": str(path),
        "exists": path.exists(),
        "executable": os.access(path, os.X_OK) if path.exists() else False,
        "recommended_command": command,
    }


def _archive_workflow_payload() -> dict:
    """Description normalisee de la nouvelle strategie de mise a jour par archive."""
    can_execute_from_app = _has_pct()
    return {
        "mode": "archive_proxmox",
        "product_name": "FSAO Iris",
        "technical_path": str(APP_ROOT),
        "backup_root": str(BACKUP_ROOT),
        "can_execute_from_app": can_execute_from_app,
        "requires_proxmox_host": not can_execute_from_app,
        "message": (
            "L'application peut piloter les scripts localement car pct est disponible."
            if can_execute_from_app
            else "L'application tourne probablement dans le conteneur LXC : les scripts d'installation, mise a jour et rollback doivent etre lances depuis l'hote Proxmox."
        ),
        "scripts": {
            "install": _script_metadata(
                "gmao-iris-install.sh",
                "Installation complete d'un nouveau conteneur LXC",
                "chmod +x gmao-iris-install.sh && ./gmao-iris-install.sh --check && ./gmao-iris-install.sh",
            ),
            "update": _script_metadata(
                "gmao-iris-update.sh",
                "Mise a jour par archive d'une installation existante",
                "chmod +x gmao-iris-update.sh && ./gmao-iris-update.sh --check && ./gmao-iris-update.sh",
            ),
            "rollback": _script_metadata(
                "gmao-iris-rollback.sh",
                "Rollback applicatif depuis une sauvegarde de mise a jour",
                "chmod +x gmao-iris-rollback.sh && ./gmao-iris-rollback.sh",
            ),
        },
        "recommended_flow": [
            "Depuis le shell de l'hote Proxmox, se placer dans le dossier contenant les scripts.",
            "Executer ./gmao-iris-update.sh --check pour verifier les prerequis.",
            "Executer ./gmao-iris-update.sh pour faire la mise a jour par archive.",
            "En cas de probleme applicatif, executer ./gmao-iris-rollback.sh depuis l'hote Proxmox.",
        ],
        "documentation": [
            "docs/SCRIPTS.md",
            "docs/INSTALLATION_NOVICE.md",
            "docs/MISE_A_JOUR_NOVICE.md",
        ],
    }


@router.get("/updates/current")
async def get_current_version(current_user: dict = Depends(get_current_admin_user)):
    """Récupère la version actuelle (admin uniquement)"""
    version = await update_manager.get_current_version()
    return {
        "version": version,
        "date": datetime.now().isoformat()
    }


@router.get("/updates/check")
async def check_updates(current_user: dict = Depends(get_current_admin_user)):
    """Vérifie si une mise à jour est disponible (admin uniquement)"""
    current = await update_manager.get_current_version()
    latest = await update_manager.check_github_version()

    return {
        "current_version": current,
        "latest_version": latest,
        "update_available": latest is not None and latest.get("available", False),
        "deployment_workflow": _archive_workflow_payload(),
    }


@router.get("/updates/deployment-workflow")
async def get_deployment_workflow(current_user: dict = Depends(get_current_admin_user)):
    """
    Retourne la strategie de deploiement actuelle.

    Important : depuis la refonte par archive, l'application installee dans le LXC
    ne doit plus essayer de faire un git pull elle-meme. Les actions lourdes se
    lancent depuis l'hote Proxmox via les scripts racine.
    """
    return _archive_workflow_payload()


@router.post("/updates/archive-precheck")
async def run_archive_update_precheck(current_user: dict = Depends(get_current_admin_user)):
    """
    Lance le --check du script de mise a jour seulement si l'API tourne sur l'hote Proxmox.
    Dans le cas normal, l'API tourne dans le LXC et retourne les commandes a lancer.
    """
    payload = _archive_workflow_payload()
    script = _script_path("gmao-iris-update.sh")

    if not _has_pct():
        return {
            "success": False,
            "can_execute": False,
            "requires_proxmox_host": True,
            "message": "Pre-verification a lancer depuis l'hote Proxmox, pas depuis le conteneur applicatif.",
            "command": payload["scripts"]["update"]["recommended_command"],
            "workflow": payload,
        }

    if not script.exists():
        return {
            "success": False,
            "can_execute": False,
            "message": f"Script introuvable : {script}",
            "workflow": payload,
        }

    try:
        result = subprocess.run(
            ["bash", str(script), "--check"],
            cwd=str(APP_ROOT),
            capture_output=True,
            text=True,
            timeout=180,
        )
        return {
            "success": result.returncode == 0,
            "can_execute": True,
            "return_code": result.returncode,
            "stdout": result.stdout[-20000:],
            "stderr": result.stderr[-10000:],
            "workflow": payload,
        }
    except Exception as e:
        logger.error(f"Erreur archive-precheck: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/updates/archive-backups")
async def list_archive_backups(current_user: dict = Depends(get_current_admin_user)):
    """Liste les sauvegardes applicatives créées par gmao-iris-update.sh."""
    backups = []
    try:
        if BACKUP_ROOT.exists():
            for app_backup in sorted(BACKUP_ROOT.glob("*/app"), reverse=True):
                try:
                    stat = app_backup.stat()
                    backups.append({
                        "path": str(app_backup),
                        "timestamp": app_backup.parent.name,
                        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    })
                except Exception:
                    backups.append({
                        "path": str(app_backup),
                        "timestamp": app_backup.parent.name,
                    })
        return {
            "success": True,
            "backup_root": str(BACKUP_ROOT),
            "count": len(backups),
            "backups": backups,
            "rollback_command": "chmod +x gmao-iris-rollback.sh && ./gmao-iris-rollback.sh",
            "note": "Le rollback applicatif doit etre lance depuis l'hote Proxmox avec le script dedie.",
        }
    except Exception as e:
        logger.error(f"Erreur liste backups archive: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/updates/changelog")
async def get_changelog(
    from_version: Optional[str] = None,
    current_user: dict = Depends(get_current_admin_user)
):
    """Récupère le changelog (admin uniquement)"""
    changelog = await update_manager.get_changelog(from_version)
    return {"changelog": changelog}


@router.get("/updates/history")
async def get_update_history(current_user: dict = Depends(get_current_admin_user)):
    """Récupère l'historique des mises à jour depuis la BDD (admin uniquement)"""
    try:
        # Récupérer depuis la nouvelle collection system_update_history
        history = await db.system_update_history.find(
            {},
            {"_id": 0}
        ).sort("started_at", -1).limit(50).to_list(50)

        return {"history": history}
    except Exception as e:
        logger.error(f"❌ Erreur récupération historique: {str(e)}")
        # Fallback vers l'ancienne méthode si erreur
        history = await update_manager.get_update_history()
        return {"history": history}


@router.post("/updates/backup")
async def create_backup(current_user: dict = Depends(get_current_admin_user)):
    """Crée un backup de la base de données (admin uniquement)"""
    result = await update_manager.create_backup()

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Erreur lors de la création du backup")
        )

    return result


@router.post("/updates/rollback")
async def rollback_update(
    backup_path: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """Restaure une sauvegarde MongoDB historique (admin uniquement)."""
    result = await update_manager.rollback_to_version(backup_path)

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "Erreur lors du rollback")
        )

    return result


@router.get("/updates/git-history")
async def get_git_history(
    limit: int = 20,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Récupère l'historique des commits Git (versions précédentes) (admin uniquement)
    Permet de voir et restaurer des versions antérieures du code.
    En deploiement archive sans .git, cette liste peut etre vide.
    """
    try:
        commits = await update_manager.get_git_history(limit)
        return {
            "success": True,
            "commits": commits,
            "total": len(commits),
            "archive_mode": len(commits) == 0,
            "message": "Aucun historique Git local : deploiement par archive probable." if len(commits) == 0 else "Historique Git local disponible."
        }
    except Exception as e:
        logger.error(f"❌ Erreur récupération historique Git: {str(e)}")
        return {
            "success": False,
            "commits": [],
            "error": str(e)
        }


@router.post("/updates/git-rollback")
async def rollback_to_git_commit(
    commit_hash: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Effectue un rollback Git vers un commit spécifique (admin uniquement).
    Cette action est conservée pour les anciennes installations avec .git local.
    Pour le nouveau deploiement par archive, utiliser gmao-iris-rollback.sh depuis l'hote Proxmox.
    """
    if not (Path(update_manager.app_root) / ".git").exists():
        return {
            "success": False,
            "archive_mode": True,
            "message": "Rollback Git indisponible : cette installation semble deployee par archive sans dossier .git. Utilisez gmao-iris-rollback.sh depuis l'hote Proxmox.",
            "command": "chmod +x gmao-iris-rollback.sh && ./gmao-iris-rollback.sh"
        }
    try:
        result = await update_manager.rollback_to_commit(commit_hash)

        if not result["success"]:
            raise HTTPException(
                status_code=500,
                detail=result.get("message", "Erreur lors du rollback Git")
            )

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur rollback Git: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du rollback: {str(e)}"
        )
