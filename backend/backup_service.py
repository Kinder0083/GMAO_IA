"""
Service de sauvegarde automatique pour FSAO Iris
Gère l'exécution des backups, le stockage local/Google Drive et le nettoyage
"""
import io
import os
import logging
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from bson import ObjectId

logger = logging.getLogger(__name__)

# Répertoire de stockage local des backups
BACKUP_DIR = Path("/app/backend/backups")
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

db = None

def init_db(database):
    global db
    db = database


def _clean_item_for_export(item: dict) -> dict:
    """Nettoyer un item MongoDB pour l'export Excel"""
    import json
    cleaned = {k: v for k, v in item.items() if k != "_id"}
    # Préserver le id original (UUID) s'il existe, sinon utiliser _id
    if "id" in cleaned and cleaned["id"]:
        cleaned["id"] = str(cleaned["id"])
    else:
        cleaned["id"] = str(item.get("_id", ""))
    for key, value in cleaned.items():
        if isinstance(value, datetime):
            cleaned[key] = value.isoformat()
        elif isinstance(value, ObjectId):
            cleaned[key] = str(value)
        elif isinstance(value, list):
            cleaned[key] = json.dumps(value, default=str)
        elif isinstance(value, dict):
            cleaned[key] = json.dumps(value, default=str)
    return cleaned


async def execute_backup(schedule: dict) -> dict:
    """
    Exécute une sauvegarde complète de toutes les données + fichiers uploadés.
    Retourne un dict avec le résultat.
    """
    from import_export_routes import EXPORT_MODULES

    started_at = datetime.now(timezone.utc)
    history_entry = {
        "schedule_id": str(schedule.get("_id", "")),
        "status": "running",
        "destination": schedule.get("destination", "local"),
        "started_at": started_at.isoformat(),
        "completed_at": None,
        "file_path": None,
        "file_size": 0,
        "google_drive_file_id": None,
        "error_message": None,
        "module_count": 0,
        "file_count": 0
    }

    result = await db.backup_history.insert_one(history_entry)
    history_id = result.inserted_id

    try:
        # 1. Générer le fichier ZIP avec données Excel + fichiers uploadés
        logger.info("[Backup] Génération du fichier ZIP...")
        zip_output = io.BytesIO()
        module_count = 0
        file_count = 0

        with zipfile.ZipFile(zip_output, 'w', zipfile.ZIP_DEFLATED) as zf:
            # 1a. Générer le fichier Excel des données
            xlsx_output = io.BytesIO()
            with pd.ExcelWriter(xlsx_output, engine='openpyxl') as writer:
                for mod_name, collection_name in EXPORT_MODULES.items():
                    items = await db[collection_name].find().to_list(10000)
                    cleaned = [_clean_item_for_export(item) for item in items]
                    df = pd.DataFrame(cleaned)
                    sheet_name = mod_name[:31]
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
                    module_count += 1

            xlsx_output.seek(0)
            zf.writestr("data.xlsx", xlsx_output.getvalue())

            # 1b. Ajouter tous les fichiers uploadés
            uploads_dir = Path("/app/backend/uploads")
            if uploads_dir.exists():
                for file_path in uploads_dir.rglob("*"):
                    if file_path.is_file():
                        arcname = f"uploads/{file_path.relative_to(uploads_dir)}"
                        zf.write(file_path, arcname)
                        file_count += 1

            logger.info(f"[Backup] ZIP: {module_count} modules, {file_count} fichiers")

        zip_output.seek(0)
        file_bytes = zip_output.getvalue()
        file_size = len(file_bytes)

        # Vérification d'intégrité du ZIP
        try:
            verify_buf = io.BytesIO(file_bytes)
            with zipfile.ZipFile(verify_buf, 'r') as zf_verify:
                bad_file = zf_verify.testzip()
                if bad_file is not None:
                    raise Exception(f"Fichier corrompu dans le ZIP: {bad_file}")
                names = zf_verify.namelist()
                if "data.xlsx" not in names:
                    raise Exception("data.xlsx manquant dans le ZIP")
            logger.info(f"[Backup] Intégrité ZIP vérifiée: {len(names)} entrée(s), aucune corruption")
        except zipfile.BadZipFile as e:
            raise Exception(f"Archive ZIP invalide: {e}")

        timestamp = started_at.strftime('%Y%m%d_%H%M%S')
        filename = f"backup_gmao_{timestamp}.zip"
        destination = schedule.get("destination", "local")

        local_path = None
        gdrive_file_id = None

        # 2. Sauvegarde locale
        if destination in ("local", "local_gdrive"):
            local_path = str(BACKUP_DIR / filename)
            with open(local_path, 'wb') as f:
                f.write(file_bytes)
            logger.info(f"[Backup] Fichier local sauvegardé: {local_path} ({file_size} bytes)")

        # 3. Upload Google Drive
        if destination in ("gdrive", "local_gdrive"):
            try:
                gdrive_file_id = await _upload_to_gdrive(file_bytes, filename, schedule)
                logger.info(f"[Backup] Fichier uploadé sur Google Drive: {gdrive_file_id}")
            except Exception as e:
                error_str = str(e)
                if "accessNotConfigured" in error_str or "has not been used in project" in error_str:
                    logger.error("[Backup] L'API Google Drive n'est pas activée dans le projet Google Cloud")
                else:
                    logger.error(f"[Backup] Erreur upload Google Drive: {error_str}")
                if destination == "gdrive":
                    raise

        # 4. Nettoyage des anciens backups
        retention = schedule.get("retention_count", 3)
        await _cleanup_old_backups(schedule, retention)

        # 5. Mettre à jour l'historique
        completed_at = datetime.now(timezone.utc)
        await db.backup_history.update_one(
            {"_id": history_id},
            {"$set": {
                "status": "success",
                "completed_at": completed_at.isoformat(),
                "file_path": local_path,
                "file_size": file_size,
                "google_drive_file_id": gdrive_file_id,
                "module_count": module_count,
                "file_count": file_count
            }}
        )

        # 6. Mettre à jour le statut global
        await db.backup_status.update_one(
            {"key": "last_backup"},
            {"$set": {
                "key": "last_backup",
                "status": "success",
                "timestamp": completed_at.isoformat(),
                "file_size": file_size
            }},
            upsert=True
        )

        logger.info(f"[Backup] Sauvegarde terminée: {module_count} modules, {file_count} fichiers, {file_size} bytes")

        # 7. Envoyer notification email
        await _send_backup_email(schedule, "success", file_size, module_count, file_count=file_count)

        return {"status": "success", "file_size": file_size, "module_count": module_count, "file_count": file_count}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[Backup] Erreur: {error_msg}")

        await db.backup_history.update_one(
            {"_id": history_id},
            {"$set": {
                "status": "error",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": error_msg
            }}
        )

        await db.backup_status.update_one(
            {"key": "last_backup"},
            {"$set": {
                "key": "last_backup",
                "status": "error",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error_message": error_msg
            }},
            upsert=True
        )

        await _send_backup_email(schedule, "error", error_msg=error_msg)

        return {"status": "error", "error": error_msg}


async def _upload_to_gdrive(file_bytes: bytes, filename: str, schedule: dict) -> str:
    """Upload un fichier sur Google Drive"""
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaInMemoryUpload
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest

    creds_doc = await db.drive_credentials.find_one({"key": "admin"})
    if not creds_doc:
        raise Exception("Google Drive non connecté. Veuillez d'abord connecter votre compte Google Drive.")

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

    service = build('drive', 'v3', credentials=creds)

    folder_id = schedule.get("google_drive_folder_id")

    # Si pas de dossier spécifié, utiliser/créer le dossier "Backup FSAO"
    if not folder_id:
        folder_name = "Backup FSAO"
        query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = service.files().list(q=query, spaces='drive', fields='files(id)').execute()
        existing = results.get('files', [])
        if existing:
            folder_id = existing[0]['id']
        else:
            folder_meta = {'name': folder_name, 'mimeType': 'application/vnd.google-apps.folder'}
            folder = service.files().create(body=folder_meta, fields='id').execute()
            folder_id = folder.get('id')
            logger.info(f"[Backup] Dossier Google Drive créé: {folder_name} (ID: {folder_id})")

    file_metadata = {
        'name': filename,
        'mimeType': 'application/zip',
        'parents': [folder_id]
    }

    media = MediaInMemoryUpload(file_bytes, mimetype='application/zip')
    file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()

    return file.get('id')


async def _cleanup_old_backups(schedule: dict, retention_count: int):
    """Nettoyer les anciens backups en appliquant la limite GLOBALE (toutes sauvegardes confondues)"""
    destination = schedule.get("destination", "local")

    # Récupérer TOUS les backups réussis, tous schedules confondus, triés par date
    history = await db.backup_history.find(
        {"status": "success"}
    ).sort("started_at", -1).to_list(1000)

    if len(history) <= retention_count:
        return

    to_delete = history[retention_count:]
    logger.info(f"[Backup] Nettoyage global: suppression de {len(to_delete)} ancien(s) backup(s) (limite: {retention_count})")

    for entry in to_delete:
        # Supprimer fichier local
        if entry.get("file_path") and os.path.exists(entry["file_path"]):
            try:
                os.remove(entry["file_path"])
                logger.info(f"[Backup] Fichier local supprimé: {entry['file_path']}")
            except Exception as e:
                logger.warning(f"[Backup] Erreur suppression fichier local: {e}")

        # Supprimer de Google Drive
        if entry.get("google_drive_file_id"):
            try:
                await _delete_from_gdrive(entry["google_drive_file_id"])
            except Exception as e:
                logger.warning(f"[Backup] Erreur suppression Google Drive: {e}")

        # Supprimer l'entrée d'historique
        await db.backup_history.delete_one({"_id": entry["_id"]})


async def _delete_from_gdrive(file_id: str):
    """Supprimer un fichier de Google Drive"""
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest

    creds_doc = await db.drive_credentials.find_one({"key": "admin"})
    if not creds_doc:
        return

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
                "expiry": creds.expiry.isoformat() if creds.expiry else None
            }}
        )

    service = build('drive', 'v3', credentials=creds)
    service.files().delete(fileId=file_id).execute()


async def _send_backup_email(schedule: dict, status: str, file_size: int = 0, module_count: int = 0, file_count: int = 0, error_msg: str = ""):
    """Envoyer un email de notification de backup"""
    import email_service

    recipient = schedule.get("email_recipient")
    if not recipient:
        return

    now = datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')

    if status == "success":
        size_mb = round(file_size / (1024 * 1024), 2)
        subject = "FSAO Iris - Sauvegarde automatique réussie"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">Sauvegarde réussie</h2>
            </div>
            <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
                <p>La sauvegarde automatique de FSAO Iris s'est terminée avec succès.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 8px; color: #6b7280;">Date</td><td style="padding: 8px; font-weight: bold;">{now}</td></tr>
                    <tr><td style="padding: 8px; color: #6b7280;">Modules</td><td style="padding: 8px; font-weight: bold;">{module_count} modules</td></tr>
                    <tr><td style="padding: 8px; color: #6b7280;">Fichiers joints</td><td style="padding: 8px; font-weight: bold;">{file_count} fichiers</td></tr>
                    <tr><td style="padding: 8px; color: #6b7280;">Taille</td><td style="padding: 8px; font-weight: bold;">{size_mb} Mo</td></tr>
                    <tr><td style="padding: 8px; color: #6b7280;">Destination</td><td style="padding: 8px; font-weight: bold;">{schedule.get('destination', 'local')}</td></tr>
                </table>
            </div>
        </div>
        """
    else:
        subject = "FSAO Iris - ECHEC sauvegarde automatique"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">Echec de sauvegarde</h2>
            </div>
            <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
                <p>La sauvegarde automatique de FSAO Iris a échoué.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 8px; color: #6b7280;">Date</td><td style="padding: 8px; font-weight: bold;">{now}</td></tr>
                    <tr><td style="padding: 8px; color: #6b7280;">Erreur</td><td style="padding: 8px; font-weight: bold; color: #dc2626;">{error_msg}</td></tr>
                </table>
                <p style="color: #6b7280; font-size: 14px;">Veuillez vérifier la configuration et réessayer manuellement si nécessaire.</p>
            </div>
        </div>
        """

    try:
        email_service.send_email(recipient, subject, html)
        logger.info(f"[Backup] Email de notification envoyé à {recipient}")
    except Exception as e:
        logger.warning(f"[Backup] Erreur envoi email: {e}")
