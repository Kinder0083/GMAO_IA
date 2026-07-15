"""
Routes de mise a jour FSAO Iris.

La philosophie retenue est volontairement simple pour l'utilisateur :
la mise a jour est pilotable depuis l'interface graphique et s'execute dans
le conteneur LXC applicatif via MAJ_FSAO.sh.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional
from pathlib import Path
import logging
import os
import subprocess

from models import ActionType, EntityType
from dependencies import get_current_admin_user
from routes.shared import db

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Mises a jour"])

from update_manager import UpdateManager

update_manager = UpdateManager(db)
# Alignement avec le dépôt officiel FSAO Iris.
update_manager.github_user = os.environ.get("GITHUB_USER", "Kinder0083")
update_manager.github_repo = os.environ.get("GITHUB_REPO", "GMAO_IA")
update_manager.github_branch = os.environ.get("GITHUB_BRANCH", "main")

APP_ROOT = Path(__file__).resolve().parents[2]
UPDATE_SCRIPT = APP_ROOT / "MAJ_FSAO.sh"
BACKUP_ROOT = APP_ROOT / "backups"


def _script_metadata() -> dict:
    return {
        "name": "MAJ_FSAO.sh",
        "path": str(UPDATE_SCRIPT),
        "exists": UPDATE_SCRIPT.exists(),
        "executable": os.access(UPDATE_SCRIPT, os.X_OK) if UPDATE_SCRIPT.exists() else False,
        "precheck_command": "bash MAJ_FSAO.sh --check",
        "apply_command": "bash MAJ_FSAO.sh <version> <update_id>",
    }


def _workflow_payload() -> dict:
    return {
        "mode": "lxc_in_app",
        "product_name": "FSAO Iris",
        "technical_path": str(APP_ROOT),
        "backup_root": str(BACKUP_ROOT),
        "can_execute_from_app": True,
        "requires_proxmox_host": False,
        "message": "La mise a jour est lancee depuis l'interface graphique et s'execute dans le conteneur LXC via MAJ_FSAO.sh.",
        "script": _script_metadata(),
        "recommended_flow": [
            "Cliquer sur Verifier pour rechercher une version disponible.",
            "Cliquer sur Pre-verifier pour controler les prerequis dans le LXC.",
            "Cliquer sur Mettre a jour maintenant pour lancer MAJ_FSAO.sh depuis l'interface.",
            "Suivre les logs dans l'interface puis verifier le resultat apres redemarrage des services.",
        ],
        "notes": [
            "Aucune action ne doit etre lancee depuis l'hote Proxmox pour une mise a jour applicative normale.",
            "Le conteneur doit disposer d'un acces GitHub valide : GITHUB_TOKEN, gh auth ou URL SSH configuree.",
        ],
    }


@router.get("/updates/current")
async def get_current_version(current_user: dict = Depends(get_current_admin_user)):
    """Récupère la version actuelle (admin uniquement)."""
    version = await update_manager.get_current_version()
    return {
        "version": version,
        "date": datetime.now().isoformat(),
    }


@router.get("/updates/check")
async def check_updates(current_user: dict = Depends(get_current_admin_user)):
    """Vérifie si une mise à jour est disponible (admin uniquement)."""
    current = await update_manager.get_current_version()
    latest = await update_manager.check_github_version()
    return {
        "current_version": current,
        "latest_version": latest,
        "update_available": latest is not None and latest.get("available", False),
        "deployment_workflow": _workflow_payload(),
    }


@router.get("/updates/deployment-workflow")
async def get_deployment_workflow(current_user: dict = Depends(get_current_admin_user)):
    """Retourne la stratégie de mise à jour actuelle."""
    return _workflow_payload()


@router.post("/updates/precheck")
async def run_update_precheck(current_user: dict = Depends(get_current_admin_user)):
    """Lance le pre-check de mise a jour dans le conteneur LXC."""
    if not UPDATE_SCRIPT.exists():
        return {
            "success": False,
            "can_execute": False,
            "message": f"Script de mise a jour introuvable : {UPDATE_SCRIPT}",
            "workflow": _workflow_payload(),
        }

    try:
        result = subprocess.run(
            ["bash", str(UPDATE_SCRIPT), "--check"],
            cwd=str(APP_ROOT),
            capture_output=True,
            text=True,
            timeout=240,
        )
        return {
            "success": result.returncode == 0,
            "can_execute": True,
            "return_code": result.returncode,
            "stdout": result.stdout[-30000:],
            "stderr": result.stderr[-10000:],
            "workflow": _workflow_payload(),
        }
    except Exception as e:
        logger.error(f"Erreur precheck mise a jour: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/updates/archive-precheck")
async def run_archive_precheck_compat(current_user: dict = Depends(get_current_admin_user)):
    """Compatibilite avec l'ancienne route temporaire : lance le pre-check LXC."""
    return await run_update_precheck(current_user)


@router.get("/updates/app-backups")
async def list_app_backups(current_user: dict = Depends(get_current_admin_user)):
    """Liste les sauvegardes applicatives et MongoDB locales du LXC."""
    backups = []
    try:
        if BACKUP_ROOT.exists():
            # Sauvegardes applicatives créées par MAJ_FSAO.sh
            for path in sorted(BACKUP_ROOT.glob("app_*.tar.gz"), reverse=True):
                stat = path.stat()
                backups.append({
                    "type": "application",
                    "path": str(path),
                    "name": path.name,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "size_bytes": stat.st_size,
                })
            # Sauvegardes MongoDB historiques
            for path in sorted(BACKUP_ROOT.glob("backup_*"), reverse=True):
                if path.is_dir():
                    stat = path.stat()
                    backups.append({
                        "type": "mongodb",
                        "path": str(path),
                        "name": path.name,
                        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    })
        return {
            "success": True,
            "backup_root": str(BACKUP_ROOT),
            "count": len(backups),
            "backups": backups,
            "note": "Ces sauvegardes sont stockees dans le conteneur LXC applicatif.",
        }
    except Exception as e:
        logger.error(f"Erreur liste backups mise a jour: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/updates/archive-backups")
async def list_archive_backups_compat(current_user: dict = Depends(get_current_admin_user)):
    """Compatibilite avec l'ancienne route temporaire."""
    return await list_app_backups(current_user)


@router.get("/updates/changelog")
async def get_changelog(
    from_version: Optional[str] = None,
    current_user: dict = Depends(get_current_admin_user),
):
    """Récupère le changelog (admin uniquement)."""
    changelog = await update_manager.get_changelog(from_version)
    return {"changelog": changelog}


@router.get("/updates/history")
async def get_update_history(current_user: dict = Depends(get_current_admin_user)):
    """Récupère l'historique des mises à jour depuis la BDD."""
    try:
        history = await db.system_update_history.find({}, {"_id": 0}).sort("started_at", -1).limit(50).to_list(50)
        return {"history": history}
    except Exception as e:
        logger.error(f"Erreur récupération historique MAJ: {e}")
        history = await update_manager.get_update_history()
        return {"history": history}


@router.get("/updates/history-list")
async def get_update_history_list_compat(current_user: dict = Depends(get_current_admin_user)):
    """Compatibilite avec d'anciennes versions du frontend."""
    data = await get_update_history(current_user)
    return {"data": data.get("history", [])}


@router.post("/updates/backup")
async def create_backup(current_user: dict = Depends(get_current_admin_user)):
    """Crée un backup MongoDB manuel (admin uniquement)."""
    result = await update_manager.create_backup()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Erreur lors de la création du backup"))
    return result


@router.post("/updates/rollback")
async def rollback_update(
    backup_path: str,
    current_user: dict = Depends(get_current_admin_user),
):
    """Restaure une sauvegarde MongoDB historique (admin uniquement)."""
    result = await update_manager.rollback_to_version(backup_path)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("message", "Erreur lors du rollback"))
    return result


@router.get("/updates/git-history")
async def get_git_history(
    limit: int = 20,
    current_user: dict = Depends(get_current_admin_user),
):
    """Historique Git local, conservé pour diagnostic."""
    try:
        commits = await update_manager.get_git_history(limit)
        return {
            "success": True,
            "commits": commits,
            "total": len(commits),
            "message": "Historique Git local disponible." if commits else "Aucun historique Git local disponible.",
        }
    except Exception as e:
        logger.error(f"Erreur historique Git: {e}")
        return {"success": False, "commits": [], "error": str(e)}


@router.post("/updates/git-rollback")
async def rollback_to_git_commit(
    commit_hash: str,
    current_user: dict = Depends(get_current_admin_user),
):
    """Rollback Git legacy, conservé mais non recommandé comme flux principal."""
    try:
        result = await update_manager.rollback_to_commit(commit_hash)
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("message", "Erreur lors du rollback Git"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur rollback Git: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors du rollback: {str(e)}")
