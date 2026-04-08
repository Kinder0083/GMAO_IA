"""
Routes API — Gestion des sauvegardes MongoDB natives (mongodump/mongorestore)
Gestion du cron système, lancement manuel, restauration, logs.
"""
import os
import shutil
import subprocess
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel

from dependencies import get_current_admin_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mongodb-backup", tags=["MongoDB Backup"])

# --- Configuration ---
BACKUP_ROOT = Path(os.environ.get("MONGO_BACKUP_DIR", "/root/backups/mongo"))
DB_NAME = os.environ.get("DB_NAME", "gmao_iris")
LOG_FILE = Path("/var/log/mongodump_gmao.log")
CRON_FILE = Path("/etc/cron.d/gmao_mongodump")
CRON_SCRIPT = Path("/root/backup_mongo_auto.sh")


# ─────────────────────────────────────────
#  Utilitaires
# ─────────────────────────────────────────

def _run(cmd: list[str], timeout: int = 60) -> tuple[int, str, str]:
    """Exécute une commande shell et retourne (code, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=timeout, env={**os.environ, "LANG": "fr_FR.UTF-8"}
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Timeout dépassé"
    except FileNotFoundError:
        return -1, "", f"Commande introuvable : {cmd[0]}"
    except Exception as e:
        return -1, "", str(e)


def _is_mongodump_installed() -> bool:
    code, _, _ = _run(["mongodump", "--version"])
    return code == 0


def _get_mongodump_version() -> str:
    code, out, _ = _run(["mongodump", "--version"])
    if code == 0 and out:
        return out.strip().split("\n")[0]
    return ""


def _is_cron_running() -> bool:
    for daemon in ["cron", "crond"]:
        code, _, _ = _run(["pgrep", "-x", daemon])
        if code == 0:
            return True
    return False


def _get_disk_info() -> dict:
    try:
        BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
        st = shutil.disk_usage(str(BACKUP_ROOT))
        used_pct = round((st.used / st.total) * 100, 1)
        return {
            "total_gb": round(st.total / 1e9, 2),
            "used_gb": round(st.used / 1e9, 2),
            "free_gb": round(st.free / 1e9, 2),
            "used_pct": used_pct,
        }
    except Exception:
        return {}


def _list_backups() -> list[dict]:
    """Liste les dossiers de sauvegarde triés du plus récent au plus ancien."""
    backups = []
    if not BACKUP_ROOT.exists():
        return backups
    for entry in sorted(BACKUP_ROOT.iterdir(), reverse=True):
        if entry.is_dir():
            size_bytes = sum(f.stat().st_size for f in entry.rglob("*") if f.is_file())
            backups.append({
                "name": entry.name,
                "path": str(entry),
                "size_mb": round(size_bytes / 1e6, 2),
                "created_at": datetime.fromtimestamp(
                    entry.stat().st_mtime, tz=timezone.utc
                ).isoformat(),
            })
    return backups


def _get_cron_config() -> Optional[dict]:
    """Lit la configuration cron actuelle depuis CRON_FILE."""
    if not CRON_FILE.exists():
        return None
    content = CRON_FILE.read_text()
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 6:
            return {
                "minute": parts[0],
                "hour": parts[1],
                "day_month": parts[2],
                "month": parts[3],
                "day_week": parts[4],
                "command": " ".join(parts[6:]),
                "raw": line,
            }
    return None


def _write_cron_script(backup_dir: str, retention_days: int, db_name: str):
    """Écrit le script shell exécuté par le cron."""
    script = f"""#!/bin/bash
# Script de sauvegarde automatique MongoDB — GMAO Iris
DB_NAME="{db_name}"
BACKUP_ROOT="{backup_dir}"
RETENTION_DAYS={retention_days}
LOG_FILE="{LOG_FILE}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
log() {{ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }}
mkdir -p "$BACKUP_DIR"
log "Début sauvegarde — Base : $DB_NAME"
mongodump --db "$DB_NAME" --out "$BACKUP_DIR" --gzip --quiet
if [ $? -ne 0 ]; then
    log "ERREUR : mongodump a échoué"
    rm -rf "$BACKUP_DIR"
    exit 1
fi
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "Sauvegarde réussie — Taille : $BACKUP_SIZE"
find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {{}} \\;
log "Rotation OK — rétention : $RETENTION_DAYS jours"
"""
    CRON_SCRIPT.write_text(script)
    CRON_SCRIPT.chmod(0o755)


def _get_last_log_lines(n: int = 100) -> list[str]:
    if not LOG_FILE.exists():
        return []
    lines = LOG_FILE.read_text(errors="replace").splitlines()
    return lines[-n:]


# ─────────────────────────────────────────
#  Endpoints
# ─────────────────────────────────────────

@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_admin_user)):
    """État complet du système de sauvegarde MongoDB."""
    installed = _is_mongodump_installed()
    version = _get_mongodump_version() if installed else ""
    cron_active = _is_cron_running()
    cron_config = _get_cron_config()
    backups = _list_backups()
    disk = _get_disk_info()
    last_backup = backups[0] if backups else None
    last_log_lines = _get_last_log_lines(20)

    return {
        "mongodump_installed": installed,
        "mongodump_version": version,
        "cron_daemon_running": cron_active,
        "cron_configured": cron_config is not None,
        "cron_config": cron_config,
        "backup_dir": str(BACKUP_ROOT),
        "db_name": DB_NAME,
        "backup_count": len(backups),
        "last_backup": last_backup,
        "disk": disk,
        "last_logs": last_log_lines,
    }


@router.post("/install-mongodump")
async def install_mongodump(current_user: dict = Depends(get_current_admin_user)):
    """Tente d'installer mongodump via apt (Debian/Ubuntu/LXC)."""
    if _is_mongodump_installed():
        return {"success": True, "message": "mongodump déjà installé."}

    code, out, err = _run(
        ["apt-get", "install", "-y", "mongodb-database-tools"],
        timeout=120
    )
    if code == 0 and _is_mongodump_installed():
        return {"success": True, "message": "mongodump installé avec succès.", "version": _get_mongodump_version()}

    # Fallback : installer via snap
    code2, out2, err2 = _run(
        ["snap", "install", "mongodump"],
        timeout=120
    )
    if code2 == 0 and _is_mongodump_installed():
        return {"success": True, "message": "mongodump installé via snap.", "version": _get_mongodump_version()}

    raise HTTPException(
        status_code=500,
        detail=f"Installation échouée. Installez manuellement : apt-get install mongodb-database-tools\n{err}\n{err2}"
    )


@router.post("/run")
async def run_backup(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_admin_user)
):
    """Lance une sauvegarde manuelle immédiate."""
    if not _is_mongodump_installed():
        raise HTTPException(status_code=400, detail="mongodump n'est pas installé.")

    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    backup_dir = BACKUP_ROOT / timestamp

    backup_dir.mkdir(parents=True, exist_ok=True)

    # Exécution synchrone (attente max 10 min)
    code, out, err = _run(
        ["mongodump", "--db", DB_NAME, "--out", str(backup_dir), "--gzip", "--quiet"],
        timeout=600
    )

    if code != 0:
        shutil.rmtree(str(backup_dir), ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"mongodump a échoué : {err}")

    size_bytes = sum(f.stat().st_size for f in backup_dir.rglob("*") if f.is_file())
    size_mb = round(size_bytes / 1e6, 2)

    # Log
    log_msg = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Sauvegarde manuelle réussie — {timestamp} — {size_mb} MB\n"
    try:
        with open(str(LOG_FILE), "a") as f:
            f.write(log_msg)
    except Exception:
        pass

    return {
        "success": True,
        "backup_name": timestamp,
        "size_mb": size_mb,
        "message": f"Sauvegarde créée : {timestamp} ({size_mb} MB)"
    }


@router.get("/list")
async def list_backups(current_user: dict = Depends(get_current_admin_user)):
    """Liste toutes les sauvegardes disponibles."""
    return _list_backups()


@router.delete("/backup/{backup_name}")
async def delete_backup(
    backup_name: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """Supprime une sauvegarde."""
    # Sécurité : pas de traversée de chemin
    if ".." in backup_name or "/" in backup_name:
        raise HTTPException(status_code=400, detail="Nom invalide.")
    backup_path = BACKUP_ROOT / backup_name
    if not backup_path.exists():
        raise HTTPException(status_code=404, detail="Sauvegarde introuvable.")
    shutil.rmtree(str(backup_path))
    return {"success": True, "message": f"Sauvegarde {backup_name} supprimée."}


@router.post("/restore/{backup_name}")
async def restore_backup(
    backup_name: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """Restaure la base de données depuis une sauvegarde (--drop)."""
    if ".." in backup_name or "/" in backup_name:
        raise HTTPException(status_code=400, detail="Nom invalide.")
    backup_path = BACKUP_ROOT / backup_name / DB_NAME
    if not backup_path.exists():
        raise HTTPException(status_code=404, detail=f"Sauvegarde introuvable : {backup_path}")

    code, out, err = _run(
        ["mongorestore", "--db", DB_NAME, "--drop", "--gzip", str(backup_path)],
        timeout=600
    )
    if code != 0:
        raise HTTPException(status_code=500, detail=f"Restauration échouée : {err}")

    log_msg = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Restauration depuis {backup_name} — OK\n"
    try:
        with open(str(LOG_FILE), "a") as f:
            f.write(log_msg)
    except Exception:
        pass

    return {"success": True, "message": f"Base restaurée depuis {backup_name}"}


@router.get("/cron")
async def get_cron(current_user: dict = Depends(get_current_admin_user)):
    """Retourne la configuration cron actuelle."""
    return {
        "configured": CRON_FILE.exists(),
        "config": _get_cron_config(),
        "cron_file": str(CRON_FILE),
        "script_file": str(CRON_SCRIPT),
    }


class CronConfig(BaseModel):
    hour: int = 2
    minute: int = 0
    retention_days: int = 7
    backup_dir: Optional[str] = None


@router.post("/cron")
async def set_cron(
    config: CronConfig,
    current_user: dict = Depends(get_current_admin_user)
):
    """Configure la sauvegarde automatique via cron système."""
    if not _is_mongodump_installed():
        raise HTTPException(status_code=400, detail="mongodump n'est pas installé.")
    if not (0 <= config.hour <= 23 and 0 <= config.minute <= 59):
        raise HTTPException(status_code=400, detail="Heure invalide.")
    if not (1 <= config.retention_days <= 90):
        raise HTTPException(status_code=400, detail="Rétention entre 1 et 90 jours.")

    backup_dir = config.backup_dir or str(BACKUP_ROOT)

    # Écriture du script shell
    _write_cron_script(backup_dir, config.retention_days, DB_NAME)

    # Écriture du fichier cron
    cron_line = (
        f"{config.minute} {config.hour} * * * root bash {CRON_SCRIPT} "
        f">> {LOG_FILE} 2>&1\n"
    )
    cron_content = (
        "# Sauvegarde automatique MongoDB — GMAO Iris\n"
        "# Généré par l'interface GMAO — NE PAS MODIFIER MANUELLEMENT\n"
        f"{cron_line}"
    )
    try:
        CRON_FILE.write_text(cron_content)
        CRON_FILE.chmod(0o644)
    except PermissionError:
        raise HTTPException(
            status_code=403,
            detail="Permission refusée pour écrire dans /etc/cron.d/. Le processus doit tourner en root."
        )

    # Vérifier que cron est démarré
    if not _is_cron_running():
        _run(["service", "cron", "start"], timeout=10)
        _run(["service", "crond", "start"], timeout=10)

    return {
        "success": True,
        "message": f"Cron configuré — sauvegarde chaque jour à {config.hour:02d}h{config.minute:02d}",
        "cron_file": str(CRON_FILE),
        "script_file": str(CRON_SCRIPT),
        "config": {"hour": config.hour, "minute": config.minute, "retention_days": config.retention_days}
    }


@router.delete("/cron")
async def delete_cron(current_user: dict = Depends(get_current_admin_user)):
    """Supprime la configuration cron."""
    removed = []
    if CRON_FILE.exists():
        CRON_FILE.unlink()
        removed.append(str(CRON_FILE))
    if CRON_SCRIPT.exists():
        CRON_SCRIPT.unlink()
        removed.append(str(CRON_SCRIPT))
    return {"success": True, "message": "Cron supprimé.", "removed": removed}


@router.get("/logs")
async def get_logs(
    lines: int = 100,
    current_user: dict = Depends(get_current_admin_user)
):
    """Retourne les dernières lignes du log de sauvegarde."""
    all_lines = _get_last_log_lines(min(lines, 500))
    return {
        "log_file": str(LOG_FILE),
        "exists": LOG_FILE.exists(),
        "lines": all_lines,
        "total_lines": len(all_lines),
    }


@router.delete("/logs")
async def clear_logs(current_user: dict = Depends(get_current_admin_user)):
    """Vide le fichier de log."""
    try:
        LOG_FILE.write_text("")
        return {"success": True, "message": "Logs effacés."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
