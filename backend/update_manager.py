"""
Gestionnaire de mise à jour FSAO Iris.
"""
import os
import subprocess
import asyncio
import json
from datetime import datetime
from typing import Optional, Dict, List
import aiohttp
from pathlib import Path

from update_repository_config import get_update_repository_config


class UpdateManager:
    def __init__(self, db):
        self.db = db
        self.github_user = os.environ.get("GITHUB_USER", "Kinder0083")
        self.github_repo = os.environ.get("GITHUB_REPO", "GMAO_IA")
        self.github_branch = os.environ.get("GITHUB_BRANCH", "main")
        self.github_url = os.environ.get("GITHUB_URL", f"https://github.com/{self.github_user}/{self.github_repo}.git")
        self.app_root = str(Path(__file__).parent.parent)
        self.current_commit = None
        self._load_version()

    async def refresh_repository_config(self) -> Dict:
        """Recharge la configuration du dépôt depuis MongoDB/env."""
        config = await get_update_repository_config(self.db)
        self.github_user = config["github_user"]
        self.github_repo = config["github_repo"]
        self.github_branch = config["github_branch"]
        self.github_url = config["github_url"]
        return config

    def _load_version(self):
        """Charge la version depuis updates/version.json."""
        try:
            for base in [Path(self.app_root), Path("/opt/gmao-iris")]:
                vf = base / "updates" / "version.json"
                if vf.exists():
                    with open(vf) as f:
                        data = json.load(f)
                    self.current_version = data.get("version", "1.12.0")
                    return
        except Exception:
            pass
        self.current_version = "1.12.0"

    async def get_current_version(self) -> str:
        """Récupère la version actuelle depuis version.json."""
        self._load_version()
        return self.current_version

    async def get_current_commit(self) -> Optional[str]:
        """Récupère le commit actuel depuis git."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=self.app_root,
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                return result.stdout.strip()[:7]
        except Exception:
            pass
        return None

    def _github_headers(self) -> Dict[str, str]:
        token = os.environ.get("GITHUB_TOKEN", "").strip()
        if token:
            return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        return {"Accept": "application/vnd.github+json"}

    async def check_github_version(self) -> Optional[Dict]:
        """Vérifie la dernière version disponible sur le dépôt configuré."""
        try:
            config = await self.refresh_repository_config()
            headers = self._github_headers()
            async with aiohttp.ClientSession(headers=headers) as session:
                commit_url = f"https://api.github.com/repos/{self.github_user}/{self.github_repo}/commits/{self.github_branch}"
                commit_data = None
                async with session.get(commit_url, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status == 200:
                        commit_data = await response.json()
                    else:
                        error_text = await response.text()
                        return {
                            "available": False,
                            "error": f"GitHub HTTP {response.status}",
                            "details": error_text[:500],
                            "repository": config,
                        }

                remote_commit = commit_data["sha"][:7]
                commit_date = commit_data["commit"]["author"]["date"]
                commit_message = commit_data["commit"]["message"].split("\n")[0]

                version_url = f"https://raw.githubusercontent.com/{self.github_user}/{self.github_repo}/{self.github_branch}/updates/version.json"
                remote_version_name = f"latest-{remote_commit}"
                remote_changes = []
                try:
                    async with session.get(version_url, timeout=aiohttp.ClientTimeout(total=5)) as vresp:
                        if vresp.status == 200:
                            version_data = await vresp.json()
                            v = version_data.get("version", "")
                            if v and not v.startswith("latest-"):
                                remote_version_name = v
                            remote_changes = version_data.get("changes", [])
                except Exception:
                    pass

                local_commit = await self.get_current_commit()
                if local_commit:
                    update_available = local_commit != remote_commit
                else:
                    self._load_version()
                    update_available = self.current_version != remote_version_name

                return {
                    "version": remote_version_name,
                    "commit": remote_commit,
                    "date": commit_date,
                    "message": commit_message,
                    "available": update_available,
                    "local_commit": local_commit,
                    "changes": remote_changes,
                    "repository": config,
                }
        except Exception as e:
            print(f"Erreur vérification version GitHub: {e}")
            return None

    async def get_changelog(self, from_version: str = None) -> List[Dict]:
        """Récupère le changelog depuis le dépôt configuré."""
        try:
            await self.refresh_repository_config()
            headers = self._github_headers()
            url = f"https://raw.githubusercontent.com/{self.github_user}/{self.github_repo}/{self.github_branch}/CHANGELOG.md"
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status == 200:
                        changelog_text = await response.text()
                        return self._parse_changelog(changelog_text, from_version)

            return [{
                "version": "latest",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "changes": [
                    "✅ Corrections de bugs",
                    "✅ Améliorations de performance",
                    "✅ Mises à jour de sécurité",
                ],
            }]
        except Exception as e:
            print(f"Erreur récupération changelog: {e}")
            return []

    def _parse_changelog(self, changelog_text: str, from_version: str = None) -> List[Dict]:
        """Parse le fichier CHANGELOG.md."""
        changelogs = []
        current_version = None
        current_changes = []

        for line in changelog_text.split("\n"):
            line = line.strip()
            if line.startswith("## "):
                if current_version and current_changes:
                    changelogs.append({"version": current_version, "changes": current_changes})
                    if from_version and current_version == from_version:
                        break
                parts = line.split("[")
                if len(parts) > 1:
                    current_version = parts[1].split("]")[0]
                    current_changes = []
                else:
                    current_version = line.replace("##", "").strip()
                    current_changes = []
            elif line.startswith(("-", "*", "•")) and current_version:
                change = line[1:].strip()
                if change:
                    current_changes.append(change)

        if current_version and current_changes:
            changelogs.append({"version": current_version, "changes": current_changes})
        return changelogs

    async def get_update_history(self) -> List[Dict]:
        """Récupère l'historique des mises à jour depuis la DB."""
        try:
            history = await self.db.update_history.find().sort("date", -1).to_list(20)
            result = []
            for item in history:
                result.append({
                    "id": str(item["_id"]),
                    "version": item.get("version"),
                    "date": item.get("date"),
                    "status": item.get("status"),
                    "message": item.get("message", ""),
                })
            return result
        except Exception as e:
            print(f"Erreur récupération historique: {e}")
            return []

    async def save_update_record(self, version: str, status: str, message: str = ""):
        """Enregistre une mise à jour dans l'historique."""
        try:
            await self.db.update_history.insert_one({
                "version": version,
                "date": datetime.now(),
                "status": status,
                "message": message,
            })
        except Exception as e:
            print(f"Erreur sauvegarde historique: {e}")

    async def create_backup(self) -> Dict:
        """Crée un backup de la base de données."""
        try:
            backup_dir = Path(self.app_root) / "backups"
            backup_dir.mkdir(exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = backup_dir / f"backup_{timestamp}"
            db_name = os.environ.get("DB_NAME", "fsao_iris")

            cmd = [
                "mongodump",
                "--uri", os.environ.get("MONGO_URL", "mongodb://localhost:27017"),
                "--db", db_name,
                "--out", str(backup_path),
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                return {"success": True, "path": str(backup_path), "timestamp": timestamp}
            return {"success": False, "error": stderr.decode()}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def apply_update(self, github_token: Optional[str] = None) -> Dict:
        """Ancien flux conservé pour compatibilité. Le flux principal utilise update_service.py."""
        try:
            backup_result = await self.create_backup()
            if not backup_result["success"]:
                return {"success": False, "message": "Échec création backup", "error": backup_result.get("error")}

            script_path = f"{self.app_root}/scripts/update.sh"
            env = os.environ.copy()
            if github_token:
                env["GITHUB_TOKEN"] = github_token

            process = await asyncio.create_subprocess_exec(
                "bash", script_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                await self.save_update_record("latest", "success", "Mise à jour appliquée avec succès")
                return {
                    "success": True,
                    "message": "Mise à jour appliquée avec succès",
                    "output": stdout.decode(),
                    "backup_path": backup_result["path"],
                }

            await self.save_update_record("latest", "failed", f"Échec: {stderr.decode()[:200]}")
            return {"success": False, "message": "Échec de la mise à jour", "error": stderr.decode()}
        except Exception as e:
            return {"success": False, "message": "Erreur lors de la mise à jour", "error": str(e)}

    async def rollback_to_version(self, backup_path: str) -> Dict:
        """Restaure une version précédente depuis un backup MongoDB."""
        try:
            if not Path(backup_path).exists():
                return {"success": False, "message": "Backup introuvable"}

            db_name = os.environ.get("DB_NAME", "fsao_iris")
            cmd = [
                "mongorestore",
                "--uri", os.environ.get("MONGO_URL", "mongodb://localhost:27017"),
                "--db", db_name,
                "--drop",
                str(Path(backup_path) / db_name),
            ]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                return {"success": True, "message": "Rollback effectué avec succès"}
            return {"success": False, "error": stderr.decode()}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_git_history(self, limit: int = 20) -> List[Dict]:
        """Récupère l'historique des commits Git."""
        try:
            app_root = self.app_root
            if not Path(f"{app_root}/.git").exists():
                return []
            current_result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=app_root,
                capture_output=True,
                text=True,
                timeout=5,
            )
            current_commit = current_result.stdout.strip() if current_result.returncode == 0 else None
            result = subprocess.run(
                ["git", "log", f"--max-count={limit}", "--format=%H|%h|%ai|%s|%an"],
                cwd=app_root,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode != 0:
                return []

            commits = []
            for line in result.stdout.strip().split("\n"):
                if not line:
                    continue
                parts = line.split("|", 4)
                if len(parts) >= 5:
                    full_hash, short_hash, date, message, author = parts
                    commits.append({
                        "id": full_hash,
                        "short_id": short_hash,
                        "date": date,
                        "message": message,
                        "author": author,
                        "is_current": full_hash == current_commit,
                    })
            return commits
        except Exception as e:
            print(f"Erreur récupération historique Git: {e}")
            return []

    async def rollback_to_commit(self, commit_hash: str) -> Dict:
        """Effectue un rollback Git vers un commit spécifique."""
        try:
            app_root = self.app_root
            if not Path(f"{app_root}/.git").exists():
                return {"success": False, "message": "Pas de dépôt Git trouvé"}

            backup_result = await self.create_backup()
            subprocess.run(
                ["git", "stash", "save", f"Auto-stash before rollback to {commit_hash[:7]}"],
                cwd=app_root,
                capture_output=True,
                text=True,
                timeout=30,
            )
            reset_result = subprocess.run(
                ["git", "reset", "--hard", commit_hash],
                cwd=app_root,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if reset_result.returncode != 0:
                return {"success": False, "message": "Échec du rollback Git", "error": reset_result.stderr}

            await self.save_update_record(
                version=f"rollback-{commit_hash[:7]}",
                status="success",
                message=f"Rollback vers le commit {commit_hash[:7]}",
            )
            return {
                "success": True,
                "message": f"Rollback vers {commit_hash[:7]} effectué avec succès",
                "backup_path": backup_result.get("path") if backup_result.get("success") else None,
                "needs_restart": True,
            }
        except Exception as e:
            return {"success": False, "message": "Erreur lors du rollback", "error": str(e)}
