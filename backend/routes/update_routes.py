"""
Routes de mise a jour des donnees
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
import logging

from models import ActionType, EntityType
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Mises a jour"])

from update_manager import UpdateManager

update_manager = UpdateManager(db)

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
        "update_available": latest is not None and latest.get("available", False)
    }

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
    """Restaure une version précédente (admin uniquement)"""
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
    Permet de voir et restaurer des versions antérieures du code
    """
    try:
        commits = await update_manager.get_git_history(limit)
        return {
            "success": True,
            "commits": commits,
            "total": len(commits)
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
    Effectue un rollback Git vers un commit spécifique (admin uniquement)
    ⚠️ ATTENTION: Cette action modifie le code source de l'application
    """
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

