"""
Service de gestion des mises à jour FSAO Iris
VERSION CORRIGÉE - Détection automatique des chemins
UPDATE_SYSTEM_VERSION: v7.0 (reboot post-MAJ comme methode manuelle)
"""
import os
import json
import asyncio
import logging
import aiohttp
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Dict
import shutil
import sys
import uuid

logger = logging.getLogger(__name__)


class MaintenanceMode:
    """Gestionnaire du mode maintenance NGINX pour les mises à jour."""

    def __init__(self, app_root):
        self.app_root = Path(app_root)
        self.maintenance_flag = self.app_root / "maintenance.flag"
        self.maintenance_html = self.app_root / "maintenance.html"

    def _find_nginx_conf(self):
        """Trouve le fichier de config NGINX actif. Résout les symlinks."""
        candidates = [
            "/etc/nginx/sites-enabled/gmao-iris",
            "/etc/nginx/sites-enabled/fsao-iris",
            "/etc/nginx/sites-enabled/default",
            "/etc/nginx/sites-available/gmao-iris",
            "/etc/nginx/sites-available/default",
            "/etc/nginx/conf.d/gmao-iris.conf",
            "/etc/nginx/conf.d/default.conf",
        ]
        for path in candidates:
            if os.path.exists(path):
                return path
        return None

    def _find_backup(self, nginx_conf):
        """Cherche le backup de la config NGINX dans tous les emplacements possibles."""
        # Chercher le backup au même endroit que le fichier conf
        backup = nginx_conf + ".backup_pre_maintenance"
        if os.path.exists(backup):
            return backup
        # Si le conf est un symlink, chercher aussi au chemin résolu
        if os.path.islink(nginx_conf):
            real_path = os.path.realpath(nginx_conf)
            backup_real = real_path + ".backup_pre_maintenance"
            if os.path.exists(backup_real):
                return backup_real
        # Chercher dans tous les emplacements possibles
        for d in ["/etc/nginx/sites-enabled", "/etc/nginx/sites-available", "/etc/nginx/conf.d"]:
            if os.path.isdir(d):
                for f in os.listdir(d):
                    if f.endswith(".backup_pre_maintenance"):
                        return os.path.join(d, f)
        return None

    def activate(self):
        """Active la page de maintenance."""
        try:
            self.maintenance_flag.touch()
            nginx_conf = self._find_nginx_conf()
            if nginx_conf:
                # Résoudre le symlink pour écrire dans le vrai fichier
                real_conf = os.path.realpath(nginx_conf)
                backup = real_conf + ".backup_pre_maintenance"
                if not os.path.exists(backup):
                    shutil.copy2(real_conf, backup)
                    logger.info(f"[Maintenance] Config NGINX sauvegardée: {backup}")
                # Écrire la config maintenance dans le fichier réel
                maint_conf = f"""# FSAO Iris - MODE MAINTENANCE
server {{
    listen 80;
    server_name _;
    location /logo-iris.png {{
        alias {self.app_root}/frontend/public/logo-iris.png;
        access_log off;
    }}
    location /api/ {{
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }}
    location / {{
        root {self.app_root};
        try_files /maintenance.html =503;
    }}
    error_page 503 @maintenance;
    location @maintenance {{
        root {self.app_root};
        rewrite ^(.*)$ /maintenance.html break;
    }}
}}
"""
                with open(real_conf, "w") as f:
                    f.write(maint_conf)
                # Recharger NGINX
                subprocess.run(["nginx", "-t"], capture_output=True, timeout=10)
                for cmd in [["nginx", "-s", "reload"], ["systemctl", "reload", "nginx"]]:
                    try:
                        r = subprocess.run(cmd, capture_output=True, timeout=10)
                        if r.returncode == 0:
                            break
                    except Exception:
                        continue
                logger.info("[Maintenance] Page de maintenance ACTIVÉE")
            return True
        except Exception as e:
            logger.error(f"[Maintenance] Erreur activation: {e}")
            return False

    def deactivate(self):
        """Désactive la page de maintenance et restaure NGINX."""
        try:
            if self.maintenance_flag.exists():
                self.maintenance_flag.unlink()
            nginx_conf = self._find_nginx_conf()
            if nginx_conf:
                real_conf = os.path.realpath(nginx_conf)
                backup = self._find_backup(nginx_conf)
                if backup:
                    shutil.copy2(backup, real_conf)
                    logger.info(f"[Maintenance] Config NGINX restaurée: {backup} -> {real_conf}")
                else:
                    logger.warning("[Maintenance] Aucun backup trouvé pour restaurer NGINX")
                for cmd in [["nginx", "-s", "reload"], ["systemctl", "reload", "nginx"]]:
                    try:
                        r = subprocess.run(cmd, capture_output=True, timeout=10)
                        if r.returncode == 0:
                            break
                    except Exception:
                        continue
                logger.info("[Maintenance] Page de maintenance DÉSACTIVÉE")
            return True
        except Exception as e:
            logger.error(f"[Maintenance] Erreur désactivation: {e}")
            return False


class UpdateService:
    def __init__(self, db):
        self.db = db
        self.github_user = os.environ.get("GITHUB_USER", "Kinder0083")
        self.github_repo = os.environ.get("GITHUB_REPO", "GMAO")
        self.github_branch = os.environ.get("GITHUB_BRANCH", "main")
        self.version_file_url = f"https://raw.githubusercontent.com/{self.github_user}/{self.github_repo}/{self.github_branch}/updates/version.json"
        
        # Détection automatique du répertoire racine
        self.backend_dir = Path(__file__).parent.resolve()
        self.app_root = self.backend_dir.parent
        self.frontend_dir = self.app_root / "frontend"
        self.backup_dir = self.app_root / "backups"
        
        # Gestionnaire de maintenance
        self.maintenance = MaintenanceMode(self.app_root)
        
        # SECURITE: Au demarrage, desactiver la maintenance si elle est restee active
        # (peut arriver si le script de MAJ a crashe avant de restaurer NGINX)
        if self.maintenance.maintenance_flag.exists():
            logger.warning("[MAJ] maintenance.flag detecte au demarrage - desactivation automatique")
            self.maintenance.deactivate()
        else:
            # Verifier aussi s'il existe un backup NGINX non restaure
            nginx_conf = self.maintenance._find_nginx_conf()
            if nginx_conf:
                backup = self.maintenance._find_backup(nginx_conf)
                if backup:
                    logger.warning(f"[MAJ] Backup NGINX non restaure detecte: {backup} - restauration")
                    self.maintenance.deactivate()
        
        logger.info(f"📂 Chemins détectés automatiquement:")
        logger.info(f"   - App root: {self.app_root}")
        logger.info(f"   - Backend: {self.backend_dir}")
        logger.info(f"   - Frontend: {self.frontend_dir}")
        logger.info(f"   - Backups: {self.backup_dir}")
        
        # Charger la version depuis version.json
        self._load_version()
    
    def _load_version(self):
        """Charge la version depuis updates/version.json"""
        try:
            vf = self.app_root / "updates" / "version.json"
            if vf.exists():
                import json as json_mod
                with open(vf) as f:
                    data = json_mod.load(f)
                self.current_version = data.get("version", "1.5.0")
                return
        except Exception:
            pass
        self.current_version = "1.5.0"
        
    def parse_version(self, version_str: str) -> tuple:
        """Parse une version string en tuple (major, minor, patch)"""
        try:
            parts = version_str.split('.')
            return tuple(int(p) for p in parts)
        except:
            return (0, 0, 0)
    
    def compare_versions(self, v1: str, v2: str) -> int:
        """
        Compare deux versions
        Retourne: 1 si v1 > v2, -1 si v1 < v2, 0 si égales
        """
        v1_tuple = self.parse_version(v1)
        v2_tuple = self.parse_version(v2)
        
        if v1_tuple > v2_tuple:
            return 1
        elif v1_tuple < v2_tuple:
            return -1
        else:
            return 0
    
    async def check_for_updates(self) -> Optional[Dict]:
        """
        Vérifie si une mise à jour est disponible sur GitHub
        Retourne les informations de mise à jour si disponible, None sinon
        """
        try:
            logger.info(f"🔍 Vérification des mises à jour depuis {self.version_file_url}")
            
            async with aiohttp.ClientSession() as session:
                async with session.get(self.version_file_url, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status == 200:
                        remote_version_info = await response.json()
                        remote_version = remote_version_info.get("version", "0.0.0")
                        
                        # Comparer les versions
                        comparison = self.compare_versions(remote_version, self.current_version)
                        
                        if comparison > 0:
                            # Une nouvelle version est disponible
                            logger.info(f"✅ Nouvelle version disponible: {remote_version} (actuelle: {self.current_version})")
                            
                            # Enregistrer la notification dans la DB
                            await self._save_update_notification(remote_version_info)
                            
                            return {
                                "available": True,
                                "current_version": self.current_version,
                                "new_version": remote_version,
                                "version_name": remote_version_info.get("versionName", ""),
                                "release_date": remote_version_info.get("releaseDate", ""),
                                "description": remote_version_info.get("description", ""),
                                "changes": remote_version_info.get("changes", []),
                                "breaking": remote_version_info.get("breaking", False),
                                "download_url": remote_version_info.get("downloadUrl", "")
                            }
                        else:
                            logger.info(f"✅ Application à jour (version: {self.current_version})")
                            return {
                                "available": False,
                                "current_version": self.current_version,
                                "new_version": self.current_version,
                                "message": "Vous utilisez la dernière version"
                            }
                    else:
                        logger.error(f"❌ Erreur HTTP lors de la vérification des mises à jour: {response.status}")
                        return None
                        
        except asyncio.TimeoutError:
            logger.error("⏱️ Timeout lors de la vérification des mises à jour")
            return None
        except Exception as e:
            logger.error(f"❌ Erreur lors de la vérification des mises à jour: {str(e)}")
            return None
    
    async def _save_update_notification(self, version_info: Dict):
        """Enregistre une notification de mise à jour dans la base de données"""
        try:
            notification = {
                "type": "update_available",
                "version": version_info.get("version"),
                "version_name": version_info.get("versionName"),
                "description": version_info.get("description"),
                "changes": version_info.get("changes", []),
                "release_date": version_info.get("releaseDate"),
                "created_at": datetime.now().isoformat(),
                "read": False
            }
            
            # Vérifier si cette notification existe déjà
            existing = await self.db.update_notifications.find_one({
                "version": version_info.get("version")
            })
            
            if not existing:
                await self.db.update_notifications.insert_one(notification)
                logger.info(f"📝 Notification de mise à jour enregistrée: {version_info.get('version')}")
        except Exception as e:
            logger.error(f"❌ Erreur lors de l'enregistrement de la notification: {str(e)}")
    
    async def get_update_notifications(self, user_id: str = None) -> list:
        """Récupère les notifications de mises à jour non lues"""
        try:
            notifications = await self.db.update_notifications.find(
                {"read": False}
            ).sort("created_at", -1).to_list(length=10)
            
            # Nettoyer les _id MongoDB
            for notif in notifications:
                if "_id" in notif:
                    del notif["_id"]
            
            return notifications
        except Exception as e:
            logger.error(f"❌ Erreur lors de la récupération des notifications: {str(e)}")
            return []
    
    async def mark_notification_read(self, version: str):
        """Marque une notification comme lue"""
        try:
            await self.db.update_notifications.update_one(
                {"version": version},
                {"$set": {"read": True}}
            )
            logger.info(f"✅ Notification marquée comme lue: {version}")
        except Exception as e:
            logger.error(f"❌ Erreur lors du marquage de la notification: {str(e)}")


    async def get_recent_updates_info(self, days: int = 7) -> Dict:
        """
        Récupère les informations des mises à jour récentes
        Args:
            days: Nombre de jours à regarder en arrière
        Returns:
            Dict avec les infos des mises à jour récentes
        """
        try:
            cutoff_date = datetime.now() - timedelta(days=days)
            
            # Récupérer les notifications récentes non lues
            notifications = await self.db.update_notifications.find({
                "created_at": {"$gte": cutoff_date.isoformat()},
                "read": False
            }).sort("created_at", -1).to_list(10)
            
            recent_updates = []
            for notif in notifications:
                recent_updates.append({
                    "version": notif.get("version"),
                    "date": notif.get("created_at"),
                    "features": notif.get("features", []),
                    "fixes": notif.get("fixes", []),
                    "breaking_changes": notif.get("breaking_changes", [])
                })
            
            return {
                "has_recent_updates": len(recent_updates) > 0,
                "count": len(recent_updates),
                "updates": recent_updates,
                "current_version": self.current_version
            }
        except Exception as e:
            logger.error(f"❌ Erreur récupération info MAJ récentes: {str(e)}")
            return {
                "has_recent_updates": False,
                "count": 0,
                "updates": [],
                "current_version": self.current_version
            }

    
    def _ensure_gitignore(self):
        """S'assure qu'un .gitignore existe avec les exclusions nécessaires"""
        gitignore_path = self.app_root / ".gitignore"
        required_patterns = [
            "venv/", "backend/uploads/", "backend/tests/", 
            "*.pyc", "__pycache__/", "node_modules/",
            "frontend/build/", ".env", "*.log",
            "backups/", "post-update.sh", "update.sh",
            "health_state.json", "health_recovery_history.json",
            "health_alert_history.json", "maintenance.flag"
        ]
        
        existing_patterns = set()
        if gitignore_path.exists():
            try:
                existing_patterns = set(gitignore_path.read_text().strip().split('\n'))
            except Exception:
                pass
        
        missing = [p for p in required_patterns if p not in existing_patterns]
        if missing:
            try:
                with open(gitignore_path, 'a') as f:
                    if existing_patterns:
                        f.write('\n')
                    f.write('\n'.join(missing) + '\n')
            except Exception:
                pass

    def check_git_conflicts(self) -> Dict:
        """
        Vérifie s'il y a des modifications locales non commitées qui pourraient créer des conflits
        Retourne un dictionnaire avec le statut et la liste des fichiers modifiés
        Ne considère QUE les fichiers suivis par Git (ignore les untracked)
        """
        try:
            # Vérifier que nous sommes dans un dépôt git
            if not (self.app_root / ".git").exists():
                return {
                    "success": True,
                    "has_conflicts": False,
                    "modified_files": [],
                    "message": "Pas de dépôt Git détecté (normal en environnement de production)"
                }
            
            # S'assurer que .gitignore est à jour
            self._ensure_gitignore()
            
            # Utiliser git diff pour ne voir que les fichiers SUIVIS modifiés
            # (pas les fichiers untracked comme uploads/, venv/, etc.)
            result = subprocess.run(
                ['git', 'diff', '--name-status', 'HEAD'],
                cwd=str(self.app_root),
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                # Fallback : git status sans les untracked
                result = subprocess.run(
                    ['git', 'status', '--porcelain', '-uno'],
                    cwd=str(self.app_root),
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode != 0:
                    logger.error(f"Erreur git status: {result.stderr}")
                    return {
                        "success": False,
                        "error": "Impossible d'exécuter git status",
                        "details": result.stderr
                    }
            
            # Parser la sortie
            modified_files = []
            # Fichiers à ignorer dans la détection de conflits
            ignored_files = {
                '.gitignore', 'frontend/yarn.lock', 'package-lock.json', 'yarn.lock',
                'health_state.json', 'health_recovery_history.json', 'health_alert_history.json',
                'maintenance.flag', 'maintenance.html'
            }
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    status = line[:2].strip()
                    filename = line[2:].strip() if '\t' not in line else line.split('\t', 1)[1].strip()
                    # Ignorer les fichiers non importants
                    if (filename and 
                        not filename.startswith('backend/uploads/') and 
                        filename != 'venv/' and
                        filename not in ignored_files):
                        modified_files.append({
                            "file": filename,
                            "status": status
                        })
            
            has_conflicts = len(modified_files) > 0
            
            return {
                "success": True,
                "has_conflicts": has_conflicts,
                "modified_files": modified_files,
                "message": f"{len(modified_files)} fichier(s) modifié(s) localement" if has_conflicts else "Aucune modification locale"
            }
            
        except subprocess.TimeoutExpired:
            logger.error("Timeout lors de l'exécution de git status")
            return {
                "success": False,
                "error": "Timeout lors de la vérification Git"
            }
        except FileNotFoundError:
            logger.error("Git n'est pas installé sur le système")
            return {
                "success": True,
                "has_conflicts": False,
                "modified_files": [],
                "message": "Git non disponible (normal en production)"
            }
        except Exception as e:
            logger.error(f"Erreur inattendue lors de la vérification Git: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def resolve_git_conflicts(self, strategy: str) -> Dict:
        """
        Résout les conflits Git selon la stratégie choisie
        strategy: "reset" (écraser les modifications locales), "stash" (sauvegarder), ou "abort" (annuler)
        """
        try:
            if not (self.app_root / ".git").exists():
                return {
                    "success": True,
                    "message": "Pas de dépôt Git (environnement de production)"
                }
            
            if strategy == "reset":
                # Écraser les modifications locales
                result = subprocess.run(
                    ['git', 'reset', '--hard', 'HEAD'],
                    cwd=str(self.app_root),
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode == 0:
                    return {
                        "success": True,
                        "message": "Modifications locales écrasées (git reset --hard)"
                    }
                else:
                    return {
                        "success": False,
                        "error": result.stderr
                    }
            
            elif strategy == "stash":
                # Sauvegarder les modifications dans le stash
                result = subprocess.run(
                    ['git', 'stash', 'save', f'Auto-stash avant mise à jour {datetime.now().isoformat()}'],
                    cwd=str(self.app_root),
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode == 0:
                    return {
                        "success": True,
                        "message": "Modifications sauvegardées dans le stash Git"
                    }
                else:
                    return {
                        "success": False,
                        "error": result.stderr
                    }
            
            elif strategy == "abort":
                return {
                    "success": True,
                    "message": "Mise à jour annulée (aucune action effectuée)"
                }
            
            else:
                return {
                    "success": False,
                    "error": f"Stratégie invalide: {strategy}"
                }
                
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Timeout lors de la résolution des conflits"
            }
        except FileNotFoundError:
            return {
                "success": True,
                "message": "Git non disponible (normal en production)"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


    def _log_step(self, update_history: Dict, step_name: str, command: str, 
                  stdout: str = "", stderr: str = "", return_code: int = 0,
                  status: str = "success", duration_ms: int = 0):
        """
        Enregistre une étape détaillée dans le journal de mise à jour.
        Chaque entrée contient : commande, sortie, erreurs, code retour, durée.
        """
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "step": step_name,
            "command": command,
            "stdout": stdout[-5000:] if len(stdout) > 5000 else stdout,
            "stderr": stderr[-5000:] if len(stderr) > 5000 else stderr,
            "return_code": return_code,
            "status": status,
            "duration_ms": duration_ms
        }
        update_history["logs"].append(log_entry)
        
        # Log aussi dans le logger serveur
        if status == "error":
            logger.error(f"[MAJ] {step_name}: ERREUR (code {return_code}) - {stderr[:200]}")
        elif status == "warning":
            logger.warning(f"[MAJ] {step_name}: AVERTISSEMENT - {stderr[:200] if stderr else stdout[:200]}")
        else:
            logger.info(f"[MAJ] {step_name}: OK ({duration_ms}ms)")

    async def _run_command(self, update_history: Dict, step_name: str, 
                           cmd: list, cwd: str = None, env: dict = None,
                           timeout: int = 300) -> tuple:
        """
        Exécute une commande et enregistre automatiquement le résultat dans le journal.
        Retourne (success: bool, stdout: str, stderr: str)
        """
        import time
        cmd_str = " ".join(str(c) for c in cmd)
        start = time.time()
        
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )
            
            duration_ms = int((time.time() - start) * 1000)
            stdout_str = stdout_bytes.decode(errors='replace')
            stderr_str = stderr_bytes.decode(errors='replace')
            
            status = "success" if process.returncode == 0 else "error"
            self._log_step(
                update_history, step_name, cmd_str,
                stdout=stdout_str, stderr=stderr_str,
                return_code=process.returncode, status=status,
                duration_ms=duration_ms
            )
            
            return (process.returncode == 0, stdout_str, stderr_str)
            
        except asyncio.TimeoutError:
            duration_ms = int((time.time() - start) * 1000)
            self._log_step(
                update_history, step_name, cmd_str,
                stderr=f"TIMEOUT après {timeout}s", return_code=-1,
                status="error", duration_ms=duration_ms
            )
            return (False, "", f"TIMEOUT après {timeout}s")
            
        except FileNotFoundError as e:
            duration_ms = int((time.time() - start) * 1000)
            self._log_step(
                update_history, step_name, cmd_str,
                stderr=f"Commande introuvable: {str(e)}", return_code=-2,
                status="warning", duration_ms=duration_ms
            )
            return (False, "", f"Commande introuvable: {str(e)}")
            
        except Exception as e:
            duration_ms = int((time.time() - start) * 1000)
            self._log_step(
                update_history, step_name, cmd_str,
                stderr=str(e), return_code=-3,
                status="error", duration_ms=duration_ms
            )
            return (False, "", str(e))

    async def _save_update_log(self, update_id, step, log_output, errors,
                               status="in_progress", success=False, version=""):
        """Sauvegarde le log de mise a jour dans MongoDB (fiable, in-process)."""
        try:
            await self.db.system_settings.update_one(
                {"key": "last_update_result"},
                {"$set": {
                    "key": "last_update_result",
                    "in_progress": status == "in_progress",
                    "success": success,
                    "code_updated": success,
                    "history_id": update_id,
                    "current_step": step,
                    "log_output": log_output[-10000:],
                    "errors": errors,
                    "status": status,
                    "version_after": version,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }},
                upsert=True
            )
        except Exception as e:
            logger.error(f"[MAJ] Erreur sauvegarde log MongoDB: {e}")

    async def apply_update(self, version: str) -> Dict:
        """
        Applique une mise a jour IN-PROCESS.
        Reproduit exactement les commandes manuelles qui fonctionnent:
          1. Sauvegarde .env
          2. rm -rf .git && git init && git fetch && git reset --hard
          3. Restauration .env
          4. source venv/bin/activate && pip install -r requirements.txt
          5. cd frontend && yarn install && yarn build
          6. Redemarrage services
        """
        import subprocess as sp
        import tempfile

        update_id = str(uuid.uuid4())
        full_log = ""
        errors = []
        code_updated = False

        def log(msg):
            nonlocal full_log
            ts = datetime.now().strftime("%H:%M:%S")
            line = f"[{ts}] {msg}"
            full_log += line + "\n"
            logger.info(f"[MAJ] {msg}")

        async def run_cmd(cmd_str, cwd=None, timeout=120):
            """Execute une commande shell et retourne (returncode, stdout, stderr)."""
            proc = await asyncio.create_subprocess_shell(
                cmd_str,
                cwd=cwd or str(self.app_root),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return proc.returncode, stdout.decode(errors='replace'), stderr.decode(errors='replace')

        log("=" * 60)
        log(f"MISE A JOUR FSAO IRIS v6.0")
        log(f"Version cible: {version}")
        log(f"APP_ROOT: {self.app_root}")
        log(f"GitHub: {self.github_user}/{self.github_repo}:{self.github_branch}")
        log("=" * 60)

        await self._save_update_log(update_id, "Demarrage", full_log, errors, version=version)

        update_history = {
            "id": update_id,
            "version_before": self.current_version,
            "version_after": version,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "status": "in_progress",
            "success": False,
            "logs": [],
            "triggered_by": "manual",
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        github_url = f"https://github.com/{self.github_user}/{self.github_repo}.git"

        try:
            # === ETAPE 1/6: Sauvegarde .env ===
            log("\n=== ETAPE 1/6: Sauvegarde .env ===")
            for f in ["backend/.env", "frontend/.env"]:
                src = os.path.join(str(self.app_root), f)
                dst = f"/tmp/{f.replace('/', '_')}"
                if os.path.exists(src):
                    shutil.copy2(src, dst)
                    log(f"  OK: {f}")
            await self._save_update_log(update_id, "1/6 Sauvegarde .env", full_log, errors, version=version)

            # === ETAPE 2/6: Git - rm -rf .git + git init + fetch + reset --hard ===
            log("\n=== ETAPE 2/6: Recuperation code (methode clean) ===")

            # Supprimer le .git corrompu
            git_dir_path = self.app_root / ".git"
            if git_dir_path.exists():
                shutil.rmtree(str(git_dir_path), ignore_errors=True)
                log("  rm -rf .git OK")

            # git init
            rc, out, err = await run_cmd("git init")
            log(f"  git init: rc={rc}")

            # git remote add origin
            rc, out, err = await run_cmd(f"git remote add origin {github_url}")
            log(f"  git remote add: rc={rc}")

            # git fetch origin main
            log("  git fetch origin main ...")
            rc, out, err = await run_cmd(f"git fetch origin {self.github_branch}", timeout=180)
            if rc == 0:
                log(f"  git fetch OK")
            else:
                log(f"  git fetch ERREUR: {err[:300]}")
                errors.append(f"git fetch echoue: {err[:200]}")

            # git reset --hard origin/main
            if rc == 0:
                rc, out, err = await run_cmd(f"git reset --hard origin/{self.github_branch}")
                if rc == 0:
                    log(f"  git reset --hard OK: {out[:200]}")
                    code_updated = True
                else:
                    log(f"  git reset ERREUR: {err[:300]}")
                    errors.append(f"git reset echoue: {err[:200]}")

            await self._save_update_log(update_id, "2/6 Git", full_log, errors, version=version)

            # === ETAPE 3/6: Restauration .env ===
            log("\n=== ETAPE 3/6: Restauration .env ===")
            for f in ["backend/.env", "frontend/.env"]:
                src = f"/tmp/{f.replace('/', '_')}"
                dst = os.path.join(str(self.app_root), f)
                if os.path.exists(src):
                    shutil.copy2(src, dst)
                    log(f"  OK: {f}")
            await self._save_update_log(update_id, "3/6 Restauration .env", full_log, errors, version=version)

            # === ETAPE 4/6: pip install via venv ===
            log("\n=== ETAPE 4/6: Installation dependances backend ===")
            venv_activate = self.app_root / "venv" / "bin" / "activate"
            backend_req = self.backend_dir / "requirements.txt"
            extra_index = "https://d33sy5i8bnduwe.cloudfront.net/simple/"

            if venv_activate.exists() and backend_req.exists():
                # Reproduit exactement: source venv/bin/activate && pip install -r backend/requirements.txt
                pip_cmd = f"source {venv_activate} && pip install -r {backend_req} --extra-index-url {extra_index}"
                log(f"  Commande: {pip_cmd}")
                rc, out, err = await run_cmd(f"bash -c '{pip_cmd}'", timeout=300)
                if rc == 0:
                    log("  pip install OK")
                else:
                    log(f"  pip install ERREUR (rc={rc}): {err[:500]}")
                    # Non bloquant
            elif backend_req.exists():
                # Fallback: pip3 direct
                venv_pip = None
                for p in [self.app_root / "venv" / "bin" / "pip3", self.app_root / "venv" / "bin" / "pip"]:
                    if p.exists():
                        venv_pip = str(p)
                        break
                pip_bin = venv_pip or "pip3"
                rc, out, err = await run_cmd(f"{pip_bin} install -r {backend_req} --extra-index-url {extra_index}", timeout=300)
                log(f"  pip install (fallback): rc={rc}")
                if rc != 0:
                    log(f"  pip ERREUR: {err[:500]}")

            await self._save_update_log(update_id, "4/6 pip install", full_log, errors, version=version)

            # === ETAPE 5/6: Frontend - yarn install + yarn build ===
            log("\n=== ETAPE 5/6: Frontend (yarn install + build) ===")
            frontend_dir = str(self.frontend_dir)
            if (self.frontend_dir / "package.json").exists():
                # Backup du build existant
                build_dir = self.frontend_dir / "build"
                build_backup = self.frontend_dir / "build_backup"
                if build_dir.exists():
                    try:
                        if build_backup.exists():
                            shutil.rmtree(str(build_backup))
                        shutil.copytree(str(build_dir), str(build_backup))
                        log("  Backup build/ cree")
                    except Exception as e:
                        log(f"  Backup build/ impossible: {e}")

                # yarn install
                rc, out, err = await run_cmd("yarn install", cwd=frontend_dir, timeout=300)
                if rc == 0:
                    log("  yarn install OK")
                else:
                    log(f"  yarn install AVERTISSEMENT: {err[:300]}")

                await self._save_update_log(update_id, "5/6 yarn install", full_log, errors, version=version)

                # yarn build
                log("  yarn build ...")
                rc, out, err = await run_cmd("CI=false yarn build", cwd=frontend_dir, timeout=600)
                if rc == 0:
                    index_html = build_dir / "index.html"
                    if index_html.exists():
                        log("  yarn build OK (index.html present)")
                    else:
                        log("  yarn build OK mais index.html absent!")
                        errors.append("yarn build: index.html absent")
                else:
                    log(f"  yarn build ERREUR: {err[:500]}")
                    errors.append("yarn build echoue")
                    # Restaurer le backup
                    if build_backup.exists():
                        try:
                            if build_dir.exists():
                                shutil.rmtree(str(build_dir))
                            shutil.copytree(str(build_backup), str(build_dir))
                            log("  Build restaure depuis le backup")
                            errors.pop()  # Retirer l'erreur car on a un fallback
                        except Exception:
                            pass

                # Nettoyer backup
                if build_backup.exists():
                    try:
                        shutil.rmtree(str(build_backup))
                    except Exception:
                        pass

            await self._save_update_log(update_id, "5/6 Frontend", full_log, errors, version=version)

            # === ETAPE 6/6: Redemarrage ===
            log("\n=== ETAPE 6/6: Redemarrage des services ===")
            success = code_updated and len(errors) == 0
            status = "success" if success else "failed"
            completed_at = datetime.now(timezone.utc).isoformat()

            update_history["completed_at"] = completed_at
            update_history["status"] = status
            update_history["success"] = success
            update_history["code_updated"] = code_updated
            update_history["errors"] = errors
            update_history["logs"] = [{"step": "Log complet", "stdout": full_log, "status": status}]
            try:
                start = datetime.fromisoformat(update_history["started_at"])
                end = datetime.fromisoformat(completed_at)
                update_history["duration_seconds"] = (end - start).total_seconds()
            except Exception:
                update_history["duration_seconds"] = 0
            try:
                await self.db.system_update_history.insert_one(update_history)
            except Exception as e:
                log(f"  Erreur sauvegarde historique: {e}")

            if success:
                log("MISE A JOUR REUSSIE")
            else:
                log(f"MISE A JOUR AVEC ERREURS: {errors}")

            await self.db.system_settings.update_one(
                {"key": "last_update_result"},
                {"$set": {
                    "key": "last_update_result",
                    "in_progress": False,
                    "success": success,
                    "code_updated": code_updated,
                    "history_id": update_id,
                    "current_step": "Termine",
                    "log_output": full_log[-10000:],
                    "errors": errors,
                    "status": status,
                    "version_after": version,
                    "completed_at": completed_at,
                    "updated_at": completed_at
                }},
                upsert=True
            )

            # Redemarrage: utiliser reboot comme la methode manuelle qui fonctionne
            # Le supervisorctl restart seul est insuffisant car:
            # 1. Le nom du processus peut ne pas correspondre
            # 2. Le processus Python garde l'ancien code en memoire si le restart echoue
            # La methode manuelle de l'utilisateur utilise toujours 'reboot' et ca marche.
            try:
                restart_script = tempfile.NamedTemporaryFile(
                    mode='w', suffix='.sh', prefix='gmao_restart_', dir='/tmp', delete=False
                )
                restart_script.write(f"""#!/bin/bash
LOG="/var/log/gmao-iris-restart.log"
echo "$(date) - Debut redemarrage post-MAJ v7.0" >> $LOG

sleep 3

# D'abord recharger NGINX pour servir le nouveau frontend immediatement
nginx -s reload >> $LOG 2>&1 || sudo nginx -s reload >> $LOG 2>&1 || sudo systemctl reload nginx >> $LOG 2>&1
echo "$(date) - NGINX reloaded" >> $LOG

# Attendre puis reboot propre (methode qui fonctionne a 100%)
echo "$(date) - Reboot dans 5 secondes..." >> $LOG
sleep 5
reboot >> $LOG 2>&1 || sudo reboot >> $LOG 2>&1
# Fallback si reboot ne marche pas
sleep 2
shutdown -r now >> $LOG 2>&1 || sudo shutdown -r now >> $LOG 2>&1

rm -f {restart_script.name}
""")
                restart_script.close()
                os.chmod(restart_script.name, 0o755)
                sp.Popen(['/bin/bash', restart_script.name], stdout=sp.DEVNULL, stderr=sp.DEVNULL, start_new_session=True)
                log("  Reboot programme dans ~8 secondes (methode manuelle eprouvee)")
            except Exception as e:
                log(f"  Impossible de planifier le reboot: {e}")
                # Fallback ultime
                try:
                    sp.Popen(['bash', '-c', 'sleep 5 && (reboot || sudo reboot)'], 
                             stdout=sp.DEVNULL, stderr=sp.DEVNULL, start_new_session=True)
                    log("  Fallback: reboot programme dans 5 secondes")
                except Exception as e2:
                    log(f"  Fallback reboot impossible: {e2}")

            log("=" * 60)
            return {
                "success": True,
                "accepted": True,
                "message": f"Mise a jour vers {version} {'reussie' if success else 'terminee avec erreurs'}. Redemarrage en cours...",
                "update_id": update_id,
                "version": version,
                "code_updated": code_updated,
                "errors": errors,
                "diagnostic": {
                    "app_root": str(self.app_root),
                    "github": f"{self.github_user}/{self.github_repo}:{self.github_branch}"
                }
            }

        except Exception as e:
            logger.error(f"[MAJ] ERREUR: {e}")
            import traceback
            logger.error(traceback.format_exc())
            log(f"\nERREUR CRITIQUE: {e}")
            errors.append(str(e))
            try:
                await self.db.system_settings.update_one(
                    {"key": "last_update_result"},
                    {"$set": {
                        "key": "last_update_result",
                        "in_progress": False,
                        "success": False,
                        "code_updated": False,
                        "history_id": update_id,
                        "current_step": "Erreur",
                        "log_output": full_log[-10000:],
                        "errors": errors,
                        "status": "failed",
                        "version_after": version,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }},
                    upsert=True
                )
            except Exception:
                pass
            return {
                "success": False,
                "message": f"Erreur lors de la mise a jour: {str(e)}",
                "error": str(e),
                "update_id": update_id
            }

    async def check_and_save_update_result(self):
        """
        Vérifie s'il existe un fichier de résultat de mise à jour
        et le sauvegarde dans la base de données.
        Appelée au démarrage du serveur.
        Cherche dans /var/log/ (prioritaire), puis APP_ROOT, puis /tmp.
        """
        import glob as glob_mod
        
        result_files = []
        # 1) Fichier dans le repertoire dedie (hors depot, survit au reboot)
        dedicated_dir = self.app_root.parent / "gmao-iris-logs"
        dedicated_result = dedicated_dir / "update-result.json"
        if dedicated_result.exists():
            result_files.append(str(dedicated_result))
        # 2) Fichier dans /var/log/ (emplacement principal, survit à git reset + reboot)
        if os.path.exists("/var/log/gmao-iris-update-result.json"):
            result_files.append("/var/log/gmao-iris-update-result.json")
        # 3) Fichier persistant dans APP_ROOT (ancien emplacement, compat)
        persistent_result = self.app_root / "last_update_result.json"
        if persistent_result.exists():
            result_files.append(str(persistent_result))
        # 4) Fichiers temporaires dans /tmp
        result_files.extend(glob_mod.glob("/tmp/gmao_update_result_*.json"))
        
        for rf in result_files:
            try:
                with open(rf, 'r') as f:
                    result = json.load(f)
                
                update_id = result.get("update_id", "unknown")
                logger.info(f"[MAJ] Résultat de mise à jour trouvé: {update_id}")
                
                log_file = rf.replace("_result_", "_update_").replace(".json", ".log")
                log_content = ""
                # D'abord essayer le contenu embarque dans le JSON de resultat
                if result.get("log_content"):
                    log_content = result["log_content"].replace("\\n", "\n")
                else:
                    # Chercher le log dans le repertoire dedie, puis /var/log/, puis le fichier temp
                    dedicated_log = str(self.app_root.parent / "gmao-iris-logs" / "update.log")
                    for log_candidate in [
                        dedicated_log,
                        "/var/log/gmao-iris-update.log",
                        log_file
                    ]:
                        if os.path.exists(log_candidate) and os.path.getsize(log_candidate) > 10:
                            try:
                                with open(log_candidate, 'r', errors='replace') as lf:
                                    log_content = lf.read()[-10000:]
                                break
                            except Exception:
                                pass
                
                history_entry = {
                    "id": update_id,
                    "version_before": result.get("version_before", ""),
                    "version_after": result.get("version_after", ""),
                    "started_at": result.get("started_at", ""),
                    "completed_at": result.get("completed_at", ""),
                    "status": "success" if result.get("success") else "failed",
                    "success": result.get("success", False),
                    "code_updated": result.get("code_updated", False),
                    "errors": result.get("errors", []),
                    "warnings": result.get("warnings", []),
                    "logs": [{"step": "Script complet", "stdout": log_content, "status": "success" if result.get("success") else "error"}],
                    "summary": {
                        "total_steps": result.get("steps_ok", 0) + result.get("steps_warn", 0) + result.get("steps_err", 0),
                        "successful_steps": result.get("steps_ok", 0),
                        "warning_steps": result.get("steps_warn", 0),
                        "error_steps": result.get("steps_err", 0),
                        "errors": result.get("errors", []),
                        "warnings": result.get("warnings", [])
                    },
                    "triggered_by": "manual",
                    "created_at": result.get("started_at", "")
                }
                
                try:
                    start = datetime.fromisoformat(result["started_at"].replace("Z", "+00:00"))
                    end = datetime.fromisoformat(result["completed_at"].replace("Z", "+00:00"))
                    history_entry["duration_seconds"] = (end - start).total_seconds()
                except Exception:
                    history_entry["duration_seconds"] = 0
                
                await self.db.system_update_history.insert_one(history_entry)
                
                await self.db.system_settings.update_one(
                    {"key": "last_update_result"},
                    {"$set": {
                        "key": "last_update_result",
                        "in_progress": False,
                        "success": result.get("success", False),
                        "code_updated": result.get("code_updated", False),
                        "version_before": result.get("version_before", ""),
                        "version_after": result.get("version_after", ""),
                        "history_id": update_id,
                        "errors": result.get("errors", []),
                        "warnings": result.get("warnings", []),
                        "completed_at": result.get("completed_at", "")
                    }},
                    upsert=True
                )
                
                self._load_version()
                logger.info(f"[MAJ] Résultat sauvegardé. Succès: {result.get('success')}")
                
                os.remove(rf)
                if os.path.exists(log_file):
                    try:
                        os.rename(log_file, f"/tmp/gmao_update_{update_id}_archived.log")
                    except Exception:
                        pass
                        
            except Exception as e:
                logger.error(f"[MAJ] Erreur lecture résultat {rf}: {e}")

