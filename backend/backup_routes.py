"""
Routes API pour la gestion des sauvegardes automatiques
"""
import os
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel
from typing import Optional
from bson import ObjectId

from dependencies import get_current_admin_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backup", tags=["Backup"])

db = None

def init_db(database):
    global db
    db = database


# --- Pydantic Models ---

class BackupScheduleCreate(BaseModel):
    frequency: str  # "daily", "weekly", "monthly"
    day_of_week: Optional[int] = None  # 0=lundi pour weekly
    day_of_month: Optional[int] = None  # 1-28 pour monthly
    hour: int = 2
    minute: int = 0
    destination: str = "local"  # "local", "gdrive", "local_gdrive"
    retention_count: int = 3
    email_recipient: Optional[str] = None
    google_drive_folder_id: Optional[str] = None
    enabled: bool = True


class BackupScheduleUpdate(BaseModel):
    frequency: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    hour: Optional[int] = None
    minute: Optional[int] = None
    destination: Optional[str] = None
    retention_count: Optional[int] = None
    email_recipient: Optional[str] = None
    google_drive_folder_id: Optional[str] = None
    enabled: Optional[bool] = None


# --- Schedule CRUD ---

@router.get("/schedules")
async def get_schedules(current_user: dict = Depends(get_current_admin_user)):
    """Récupérer toutes les planifications de sauvegarde"""
    schedules = await db.backup_schedules.find({}, {"_id": 0, "id": {"$toString": "$_id"}}).to_list(50)
    # Manual projection since $toString doesn't work in find projection
    schedules = await db.backup_schedules.find().to_list(50)
    result = []
    for s in schedules:
        s["id"] = str(s.pop("_id"))
        result.append(s)
    return result


@router.post("/schedules")
async def create_schedule(data: BackupScheduleCreate, current_user: dict = Depends(get_current_admin_user)):
    """Créer une planification de sauvegarde"""
    if data.retention_count < 1 or data.retention_count > 5:
        raise HTTPException(status_code=400, detail="Le nombre de sauvegardes à garder doit être entre 1 et 5")

    if data.destination in ("gdrive", "local_gdrive"):
        creds = await db.drive_credentials.find_one({"key": "admin"})
        if not creds:
            raise HTTPException(status_code=400, detail="Google Drive non connecté. Veuillez d'abord connecter votre compte.")

    schedule = {
        **data.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    result = await db.backup_schedules.insert_one(schedule)

    # Recharger le scheduler
    await _reload_scheduler()

    schedule["id"] = str(result.inserted_id)
    schedule.pop("_id", None)
    return schedule


@router.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, data: BackupScheduleUpdate, current_user: dict = Depends(get_current_admin_user)):
    """Mettre à jour une planification"""
    updates = {k: v for k, v in data.model_dump().items() if v is not None}

    if "retention_count" in updates and (updates["retention_count"] < 1 or updates["retention_count"] > 5):
        raise HTTPException(status_code=400, detail="Le nombre de sauvegardes à garder doit être entre 1 et 5")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await db.backup_schedules.update_one(
        {"_id": ObjectId(schedule_id)},
        {"$set": updates}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Planification non trouvée")

    await _reload_scheduler()

    updated = await db.backup_schedules.find_one({"_id": ObjectId(schedule_id)})
    updated["id"] = str(updated.pop("_id"))
    return updated


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, current_user: dict = Depends(get_current_admin_user)):
    """Supprimer une planification"""
    result = await db.backup_schedules.delete_one({"_id": ObjectId(schedule_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Planification non trouvée")

    await _reload_scheduler()
    return {"message": "Planification supprimée"}


# --- Backup Execution ---

@router.post("/run")
async def run_backup_now(current_user: dict = Depends(get_current_admin_user)):
    """Déclencher une sauvegarde manuelle immédiate"""
    import backup_service

    # Utiliser la première planification active ou une config par défaut
    schedule = await db.backup_schedules.find_one({"enabled": True})
    if not schedule:
        schedule = {
            "_id": "manual",
            "destination": "local",
            "retention_count": 5,
            "email_recipient": None
        }

    result = await backup_service.execute_backup(schedule)
    return result


# --- Backup History ---

@router.get("/history")
async def get_history(
    limit: int = Query(default=20, le=100),
    current_user: dict = Depends(get_current_admin_user)
):
    """Récupérer l'historique des sauvegardes"""
    history = await db.backup_history.find().sort("started_at", -1).to_list(limit)
    result = []
    for h in history:
        h["id"] = str(h.pop("_id"))
        result.append(h)
    return result


@router.get("/status")
async def get_backup_status(current_user: dict = Depends(get_current_admin_user)):
    """Récupérer le statut de la dernière sauvegarde (pour l'icône)"""
    status = await db.backup_status.find_one({"key": "last_backup"}, {"_id": 0})
    if not status:
        return {"status": "none", "timestamp": None}
    return status


@router.get("/download/{history_id}")
async def download_backup(history_id: str, current_user: dict = Depends(get_current_admin_user)):
    """Télécharger un fichier de backup local"""
    entry = await db.backup_history.find_one({"_id": ObjectId(history_id)})
    if not entry:
        raise HTTPException(status_code=404, detail="Backup non trouvé")

    if not entry.get("file_path") or not os.path.exists(entry["file_path"]):
        raise HTTPException(status_code=404, detail="Fichier de backup non disponible localement")

    filename = os.path.basename(entry["file_path"])
    media_type = "application/zip" if filename.endswith(".zip") else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return FileResponse(
        entry["file_path"],
        media_type=media_type,
        filename=filename
    )


# --- Upload manuel vers Google Drive ---

GDRIVE_FOLDER_NAME = "Backup FSAO"


async def _get_drive_service():
    """Obtenir un service Google Drive authentifié"""
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest

    creds_doc = await db.drive_credentials.find_one({"key": "admin"})
    if not creds_doc:
        raise HTTPException(status_code=400, detail="Google Drive non connecté. Veuillez d'abord connecter votre compte.")

    creds = Credentials(
        token=creds_doc["access_token"],
        refresh_token=creds_doc.get("refresh_token"),
        token_uri=creds_doc["token_uri"],
        client_id=creds_doc["client_id"],
        client_secret=creds_doc["client_secret"],
        scopes=creds_doc.get("scopes")
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
        await db.drive_credentials.update_one(
            {"key": "admin"},
            {"$set": {
                "access_token": creds.token,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )

    return build('drive', 'v3', credentials=creds)


async def _get_or_create_gdrive_folder(service, folder_name: str) -> str:
    """Trouver ou créer un dossier sur Google Drive, retourne son ID"""
    query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    files = results.get('files', [])
    if files:
        return files[0]['id']

    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    folder = service.files().create(body=file_metadata, fields='id').execute()
    logger.info(f"[Backup] Dossier Google Drive créé: {folder_name} (ID: {folder.get('id')})")
    return folder.get('id')


@router.post("/drive/upload/{history_id}")
async def upload_backup_to_drive(history_id: str, current_user: dict = Depends(get_current_admin_user)):
    """Uploader manuellement un backup existant vers Google Drive dans le dossier 'Backup FSAO'"""
    from googleapiclient.http import MediaFileUpload

    entry = await db.backup_history.find_one({"_id": ObjectId(history_id)})
    if not entry:
        raise HTTPException(status_code=404, detail="Backup non trouvé dans l'historique")

    file_path = entry.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Fichier de backup non disponible localement")

    if entry.get("google_drive_file_id"):
        raise HTTPException(status_code=400, detail="Ce backup est déjà uploadé sur Google Drive")

    try:
        service = await _get_drive_service()
        folder_id = await _get_or_create_gdrive_folder(service, GDRIVE_FOLDER_NAME)

        filename = os.path.basename(file_path)
        file_metadata = {
            'name': filename,
            'parents': [folder_id],
            'mimeType': 'application/zip'
        }
        media = MediaFileUpload(file_path, mimetype='application/zip', resumable=True)
        uploaded_file = service.files().create(body=file_metadata, media_body=media, fields='id,name').execute()
        gdrive_file_id = uploaded_file.get('id')

        await db.backup_history.update_one(
            {"_id": ObjectId(history_id)},
            {"$set": {"google_drive_file_id": gdrive_file_id}}
        )

        logger.info(f"[Backup] Upload manuel vers Google Drive réussi: {filename} -> {gdrive_file_id}")
        return {"success": True, "google_drive_file_id": gdrive_file_id, "message": f"Backup uploadé dans le dossier '{GDRIVE_FOLDER_NAME}'"}

    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"[Backup] Erreur upload manuel Google Drive: {error_str}")

        # Détecter les erreurs courantes Google API et donner un message clair
        if "accessNotConfigured" in error_str or "has not been used in project" in error_str:
            raise HTTPException(
                status_code=403,
                detail="L'API Google Drive n'est pas activée dans votre projet Google Cloud. "
                       "Rendez-vous dans la console Google Cloud (APIs & Services > Bibliothèque) "
                       "et activez 'Google Drive API', puis réessayez après 1-2 minutes."
            )
        elif "invalid_grant" in error_str or "Token has been expired" in error_str:
            raise HTTPException(
                status_code=401,
                detail="La session Google Drive a expiré. Veuillez vous reconnecter à Google Drive dans les paramètres."
            )
        elif "insufficientPermissions" in error_str:
            raise HTTPException(
                status_code=403,
                detail="Permissions insuffisantes sur Google Drive. Reconnectez-vous pour accorder les autorisations nécessaires."
            )

        raise HTTPException(status_code=500, detail=f"Erreur lors de l'upload vers Google Drive: {error_str}")



# --- Google Drive OAuth ---

@router.get("/drive/status")
async def get_drive_status(current_user: dict = Depends(get_current_admin_user)):
    """Vérifier si Google Drive est connecté"""
    creds = await db.drive_credentials.find_one({"key": "admin"}, {"_id": 0, "access_token": 0, "refresh_token": 0, "client_secret": 0})
    if not creds:
        return {"connected": False}
    return {"connected": True, "updated_at": creds.get("updated_at")}

# --- Google Drive Configuration ---

class DriveConfigUpdate(BaseModel):
    google_client_id: str
    google_client_secret: str
    google_drive_redirect_uri: str


@router.get("/drive/config")
async def get_drive_config_status(current_user: dict = Depends(get_current_admin_user)):
    """Vérifie si Google Drive est configuré (sans exposer les secrets)"""
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = os.environ.get("GOOGLE_DRIVE_REDIRECT_URI", "")
    configured = bool(client_id and client_secret and redirect_uri)
    return {
        "configured": configured,
        "client_id_set": bool(client_id),
        "client_id_preview": (client_id[:20] + "...") if len(client_id) > 20 else client_id if client_id else "",
        "client_secret_set": bool(client_secret),
        "redirect_uri": redirect_uri if redirect_uri else "",
    }


@router.post("/drive/config")
async def save_drive_config(data: DriveConfigUpdate, current_user: dict = Depends(get_current_admin_user)):
    """Sauvegarde la configuration Google Drive dans le fichier .env"""
    try:
        env_path = Path(__file__).parent / ".env"
        if not env_path.exists():
            raise HTTPException(status_code=500, detail="Fichier .env introuvable")

        env_content = env_path.read_text()
        env_lines = env_content.splitlines()

        updates = {
            "GOOGLE_CLIENT_ID": data.google_client_id.strip(),
            "GOOGLE_CLIENT_SECRET": data.google_client_secret.strip(),
            "GOOGLE_DRIVE_REDIRECT_URI": data.google_drive_redirect_uri.strip(),
        }

        for key, value in updates.items():
            found = False
            for i, line in enumerate(env_lines):
                if line.startswith(f"{key}=") or line.startswith(f"# {key}="):
                    env_lines[i] = f"{key}={value}"
                    found = True
                    break
            if not found:
                env_lines.append(f"{key}={value}")
            os.environ[key] = value

        env_path.write_text("\n".join(env_lines) + "\n")

        logger.info(f"[Drive Config] Configuration Google Drive mise à jour par {current_user.get('email')}")
        return {"success": True, "message": "Configuration Google Drive sauvegardée. Les variables sont actives immédiatement."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Drive Config] Erreur sauvegarde: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la sauvegarde: {str(e)}")




DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file']


def _get_drive_config():
    """Récupère et valide la configuration Google Drive depuis les variables d'environnement"""
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_DRIVE_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        return None
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri]
        }
    }, redirect_uri


@router.get("/drive/connect")
async def connect_drive(current_user: dict = Depends(get_current_admin_user)):
    """Initier le flux OAuth Google Drive"""
    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        raise HTTPException(status_code=500, detail="Le package google-auth-oauthlib n'est pas installé sur le serveur.")

    config = _get_drive_config()
    if not config:
        raise HTTPException(
            status_code=400,
            detail="Google Drive non configuré. Ajoutez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et GOOGLE_DRIVE_REDIRECT_URI dans le .env."
        )

    client_config, redirect_uri = config

    try:
        flow = Flow.from_client_config(
            client_config,
            scopes=DRIVE_SCOPES,
            redirect_uri=redirect_uri
        )

        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'
        )
    except Exception as e:
        logger.error(f"[Google Drive] Erreur création flux OAuth: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur OAuth: {str(e)}")

    return {"authorization_url": authorization_url}


@router.get("/drive/callback")
async def drive_callback(code: str = Query(...), state: str = Query(default="")):
    """Callback OAuth Google Drive - appelé par Google après autorisation"""
    from fastapi.responses import HTMLResponse

    frontend_url = os.environ.get("FRONTEND_URL", "")

    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        logger.error("[Google Drive] google-auth-oauthlib non installé")
        return HTMLResponse(
            content="<h1>Erreur serveur</h1><p>Package google-auth-oauthlib manquant.</p>",
            status_code=500
        )

    config = _get_drive_config()
    if not config:
        logger.error("[Google Drive] Variables d'environnement manquantes dans le callback")
        return RedirectResponse(url=f"{frontend_url}/import-export?drive_error=config_missing")

    client_config, redirect_uri = config

    try:
        flow = Flow.from_client_config(
            client_config,
            scopes=DRIVE_SCOPES,
            redirect_uri=redirect_uri
        )

        flow.fetch_token(code=code)
        credentials = flow.credentials

        await db.drive_credentials.update_one(
            {"key": "admin"},
            {"$set": {
                "key": "admin",
                "access_token": credentials.token,
                "refresh_token": credentials.refresh_token,
                "token_uri": credentials.token_uri,
                "client_id": credentials.client_id,
                "client_secret": credentials.client_secret,
                "scopes": list(credentials.scopes) if credentials.scopes else [],
                "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )

        logger.info("[Google Drive] Connexion OAuth réussie, tokens enregistrés")
        return RedirectResponse(url=f"{frontend_url}/import-export?drive_connected=true")

    except Exception as e:
        logger.error(f"[Google Drive] Erreur callback OAuth: {type(e).__name__}: {e}")
        error_msg = str(e).replace("'", "").replace('"', '')[:200]
        return RedirectResponse(url=f"{frontend_url}/import-export?drive_error={error_msg}")


@router.delete("/drive/disconnect")
async def disconnect_drive(current_user: dict = Depends(get_current_admin_user)):
    """Déconnecter Google Drive"""
    await db.drive_credentials.delete_one({"key": "admin"})
    return {"message": "Google Drive déconnecté"}


# --- Scheduler Integration ---

_scheduler = None

def set_scheduler(scheduler):
    global _scheduler
    _scheduler = scheduler


async def _reload_scheduler():
    """Recharger les jobs de backup dans APScheduler en utilisant le fuseau horaire configuré"""
    if not _scheduler:
        return

    # Supprimer les anciens jobs de backup
    existing_jobs = _scheduler.get_jobs()
    for job in existing_jobs:
        if job.id.startswith("backup_"):
            _scheduler.remove_job(job.id)

    # Récupérer le fuseau horaire configuré dans les paramètres système
    from datetime import timezone as tz, timedelta
    settings = await db.system_settings.find_one({"_id": "default"})
    offset_hours = settings.get("timezone_offset", 1) if settings else 1
    user_tz = tz(timedelta(hours=offset_hours))
    logger.info(f"[Backup] Fuseau horaire configuré: GMT{'+' if offset_hours >= 0 else ''}{offset_hours}")

    # Ajouter les nouveaux
    schedules = await db.backup_schedules.find({"enabled": True}).to_list(50)

    for schedule in schedules:
        sid = str(schedule["_id"])
        freq = schedule.get("frequency", "daily")
        hour = schedule.get("hour", 2)
        minute = schedule.get("minute", 0)

        trigger_kwargs = {"hour": hour, "minute": minute, "timezone": user_tz}

        if freq == "daily":
            _scheduler.add_job(
                _run_scheduled_backup, 'cron',
                id=f"backup_{sid}",
                name=f"Backup auto ({freq})",
                args=[sid],
                replace_existing=True,
                **trigger_kwargs
            )
        elif freq == "weekly":
            dow = schedule.get("day_of_week", 0)
            dow_map = {0: 'mon', 1: 'tue', 2: 'wed', 3: 'thu', 4: 'fri', 5: 'sat', 6: 'sun'}
            trigger_kwargs["day_of_week"] = dow_map.get(dow, 'mon')
            _scheduler.add_job(
                _run_scheduled_backup, 'cron',
                id=f"backup_{sid}",
                name=f"Backup auto ({freq})",
                args=[sid],
                replace_existing=True,
                **trigger_kwargs
            )
        elif freq == "monthly":
            dom = schedule.get("day_of_month", 1)
            trigger_kwargs["day"] = dom
            _scheduler.add_job(
                _run_scheduled_backup, 'cron',
                id=f"backup_{sid}",
                name=f"Backup auto ({freq})",
                args=[sid],
                replace_existing=True,
                **trigger_kwargs
            )

    logger.info(f"[Backup] Scheduler rechargé: {len(schedules)} planification(s) active(s)")


async def _run_scheduled_backup(schedule_id: str):
    """Exécuter un backup planifié"""
    import backup_service

    schedule = await db.backup_schedules.find_one({"_id": ObjectId(schedule_id)})
    if not schedule:
        logger.warning(f"[Backup] Planification {schedule_id} non trouvée")
        return

    if not schedule.get("enabled", True):
        return

    await backup_service.execute_backup(schedule)
