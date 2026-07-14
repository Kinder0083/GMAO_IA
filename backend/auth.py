from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
import os
import time

# Configuration bcrypt optimisée pour environnements contraints (Proxmox LXC)
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=10  # Réduction des rounds pour environnements limités
)

ALGORITHM_DEFAULT = "HS256"
_ACCESS_TOKEN_EXPIRE_MINUTES_DEFAULT = 43200  # 30 jours par défaut pour PWA mobile
_INSECURE_SECRET_VALUES = {
    "",
    "your_jwt_secret_key_change_in_production",
    "change_me",
    "changeme",
    "secret",
    "dev-secret",
}


def _get_secret_key() -> str:
    """Retourne la clé JWT depuis l'environnement, sans valeur par défaut faible."""
    secret_key = os.environ.get("SECRET_KEY", "").strip()
    if secret_key in _INSECURE_SECRET_VALUES:
        raise RuntimeError(
            "SECRET_KEY doit être défini dans backend/.env avec une valeur forte "
            "avant d'utiliser l'authentification JWT."
        )
    return secret_key


def _get_algorithm() -> str:
    """Lit l'algorithme JWT depuis l'environnement au moment de l'appel."""
    return os.environ.get("ALGORITHM", ALGORITHM_DEFAULT).strip() or ALGORITHM_DEFAULT


def _get_token_expire_minutes() -> int:
    """Lit ACCESS_TOKEN_EXPIRE_MINUTES depuis l'env au moment de l'appel."""
    raw_value = os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", str(_ACCESS_TOKEN_EXPIRE_MINUTES_DEFAULT))
    try:
        value = int(raw_value)
        return value if value > 0 else _ACCESS_TOKEN_EXPIRE_MINUTES_DEFAULT
    except (TypeError, ValueError):
        return _ACCESS_TOKEN_EXPIRE_MINUTES_DEFAULT


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Vérifie le mot de passe avec retry logic pour environnements contraints.
    Optimisé pour Proxmox LXC et containers avec ressources limitées.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            result = pwd_context.verify(plain_password, hashed_password)
            logger.info(f"✅ Password verification successful on attempt {attempt + 1}")
            return result
        except ValueError as e:
            # ValueError signifie que le hash est invalide ou mal formé
            logger.error(f"❌ Password verification ValueError on attempt {attempt + 1}: {str(e)}")
            logger.error(f"   Hash prefix: {hashed_password[:20] if hashed_password else 'None'}...")
            logger.error(f"   Plain password length: {len(plain_password) if plain_password else 0}")
            if attempt < max_retries - 1:
                time.sleep(0.1 * (attempt + 1))
                continue
            else:
                return False
        except Exception as e:
            # Autres erreurs (timeout, ressources, etc.)
            logger.error(f"❌ Password verification Exception on attempt {attempt + 1}: {type(e).__name__}: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(0.1 * (attempt + 1))
                continue
            else:
                return False
    return False


def get_password_hash(password: str) -> str:
    """Hash le mot de passe avec bcrypt optimisé"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    now = datetime.utcnow()
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=_get_token_expire_minutes())
    to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(to_encode, _get_secret_key(), algorithm=_get_algorithm())
    return encoded_jwt


def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, _get_secret_key(), algorithms=[_get_algorithm()])
        return payload
    except (JWTError, RuntimeError):
        return None
