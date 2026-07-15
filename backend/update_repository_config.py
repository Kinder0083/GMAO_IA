"""
Configuration du dépôt de mise à jour FSAO Iris.

Objectif : centraliser le dépôt GitHub utilisé par :
- la détection des versions disponibles ;
- le script MAJ_FSAO.sh lancé depuis l'interface ;
- l'affichage de la page Mise à jour.

La configuration est stockée dans MongoDB pour pouvoir être modifiée depuis
l'interface graphique, avec fallback propre sur les variables d'environnement.
"""
import os
import re
from datetime import datetime, timezone
from typing import Dict, Optional

SETTINGS_KEY = "update_repository_config"

DEFAULT_UPDATE_REPOSITORY = {
    "github_user": "Kinder0083",
    "github_repo": "GMAO_IA",
    "github_branch": "main",
    "github_url": "",
}

_RE_SAFE = re.compile(r"^[A-Za-z0-9_.-]+$")
_RE_BRANCH_SAFE = re.compile(r"^[A-Za-z0-9_./-]+$")


def _clean(value: Optional[str]) -> str:
    return str(value or "").strip()


def _default_from_env() -> Dict[str, str]:
    github_user = _clean(os.environ.get("GITHUB_USER")) or DEFAULT_UPDATE_REPOSITORY["github_user"]
    github_repo = _clean(os.environ.get("GITHUB_REPO")) or DEFAULT_UPDATE_REPOSITORY["github_repo"]
    github_branch = _clean(os.environ.get("GITHUB_BRANCH")) or DEFAULT_UPDATE_REPOSITORY["github_branch"]
    github_url = _clean(os.environ.get("GITHUB_URL"))
    if not github_url:
        github_url = f"https://github.com/{github_user}/{github_repo}.git"
    return {
        "github_user": github_user,
        "github_repo": github_repo,
        "github_branch": github_branch,
        "github_url": github_url,
    }


def normalize_update_repository_config(payload: Optional[dict], base: Optional[dict] = None) -> Dict[str, str]:
    """Normalise une configuration partielle et reconstruit l'URL si besoin."""
    base_config = dict(base or _default_from_env())
    payload = payload or {}

    github_user = _clean(payload.get("github_user", base_config.get("github_user")))
    github_repo = _clean(payload.get("github_repo", base_config.get("github_repo")))
    github_branch = _clean(payload.get("github_branch", base_config.get("github_branch")))
    github_url = _clean(payload.get("github_url", base_config.get("github_url")))

    # Si l'utilisateur ne renseigne pas explicitement une URL, on reconstruit depuis user/repo.
    if not github_url:
        github_url = f"https://github.com/{github_user}/{github_repo}.git"

    return {
        "github_user": github_user,
        "github_repo": github_repo,
        "github_branch": github_branch,
        "github_url": github_url,
    }


def validate_update_repository_config(config: dict) -> None:
    """Lève ValueError si la configuration n'est pas acceptable."""
    github_user = _clean(config.get("github_user"))
    github_repo = _clean(config.get("github_repo"))
    github_branch = _clean(config.get("github_branch"))
    github_url = _clean(config.get("github_url"))

    if not github_user or not _RE_SAFE.match(github_user):
        raise ValueError("Utilisateur / organisation GitHub invalide.")
    if not github_repo or not _RE_SAFE.match(github_repo):
        raise ValueError("Nom de dépôt GitHub invalide.")
    if not github_branch or not _RE_BRANCH_SAFE.match(github_branch):
        raise ValueError("Nom de branche invalide.")
    if github_url and not (
        github_url.startswith("https://github.com/")
        or github_url.startswith("http://github.com/")
        or github_url.startswith("git@github.com:")
        or github_url.startswith("ssh://git@github.com/")
    ):
        raise ValueError("URL GitHub invalide ou non supportée.")


async def get_update_repository_config(db) -> Dict[str, str]:
    """Retourne la configuration effective : DB si présente, sinon env/default."""
    env_config = _default_from_env()
    doc = None
    try:
        doc = await db.system_settings.find_one({"key": SETTINGS_KEY}, {"_id": 0})
    except Exception:
        doc = None

    if doc:
        config = normalize_update_repository_config(doc.get("config", {}), env_config)
        source = "database"
    else:
        config = env_config
        source = "environment"

    return {
        **config,
        "source": source,
        "full_name": f"{config['github_user']}/{config['github_repo']}",
    }


async def save_update_repository_config(db, payload: dict, user_email: str = "") -> Dict[str, str]:
    """Valide et persiste la configuration en MongoDB."""
    current = await get_update_repository_config(db)
    config = normalize_update_repository_config(payload, current)
    validate_update_repository_config(config)

    doc = {
        "key": SETTINGS_KEY,
        "config": config,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": user_email,
    }
    await db.system_settings.update_one({"key": SETTINGS_KEY}, {"$set": doc}, upsert=True)
    return {
        **config,
        "source": "database",
        "full_name": f"{config['github_user']}/{config['github_repo']}",
    }


def apply_update_repository_env(config: dict, env: Optional[dict] = None) -> dict:
    """Injecte la configuration dans un environnement de processus."""
    target = dict(env or os.environ.copy())
    target["GITHUB_USER"] = config["github_user"]
    target["GITHUB_REPO"] = config["github_repo"]
    target["GITHUB_BRANCH"] = config["github_branch"]
    target["GITHUB_URL"] = config["github_url"]
    return target
