from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from auth import decode_access_token
from bson import ObjectId

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

# Database will be injected from server.py
db = None

def set_database(database):
    global db
    db = database

def get_database():
    """Retourne la base de données pour les routes"""
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    return db


async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security_optional)):
    """Version optionnelle de get_current_user qui ne lève pas d'erreur si pas de credentials"""
    if credentials is None:
        return None
    
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if payload is None:
        return None
    
    user_id = payload.get("sub")
    if user_id is None:
        return None
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        return None
    
    user["id"] = str(user["_id"])
    del user["_id"]
    user.pop("password", None)
    user.pop("hashed_password", None)
    
    return user

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur non trouvé",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user["id"] = str(user["_id"])
    del user["_id"]
    # Remove password field if it exists (support both 'password' and 'hashed_password')
    user.pop("password", None)
    user.pop("hashed_password", None)
    user["token_iat"] = payload.get("iat", 0)
    
    return user

async def get_current_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé. Droits administrateur requis."
        )
    return current_user

def can_edit_resource(current_user: dict, resource: dict) -> bool:
    """
    Vérifie si l'utilisateur peut éditer la ressource.
    - Les admins peuvent tout éditer
    - Les autres ne peuvent éditer que ce qu'ils ont créé
    """
    if current_user.get("role") == "ADMIN":
        return True
    
    # Vérifier si l'utilisateur est le créateur
    created_by = resource.get("createdBy") or resource.get("created_by")
    return created_by == current_user.get("id")

def can_edit_work_order_status(current_user: dict, work_order: dict) -> bool:
    """
    Vérifie si l'utilisateur peut modifier le statut d'un ordre de travail.
    - Les admins peuvent tout modifier
    - Les techniciens peuvent modifier ce qu'ils ont créé entièrement
    - Les visualiseurs assignés peuvent seulement modifier le statut
    """
    user_role = current_user.get("role")
    user_id = current_user.get("id")
    
    if user_role == "ADMIN":
        return True
    
    # Technicien : peut modifier ce qu'il a créé
    if user_role == "TECHNICIEN":
        created_by = work_order.get("createdBy") or work_order.get("created_by")
        return created_by == user_id
    
    # Visualiseur : peut modifier le statut seulement s'il est assigné
    if user_role == "VISUALISEUR":
        assigne_a_id = work_order.get("assigne_a_id")
        return assigne_a_id == user_id
    
    return False


def check_permission(current_user: dict, module: str, permission_type: str) -> bool:
    """
    Vérifie si l'utilisateur a la permission demandée pour un module.
    
    Args:
        current_user: Dict contenant les infos de l'utilisateur avec ses permissions
        module: Nom du module (ex: 'workOrders', 'assets', 'interventionRequests')
        permission_type: Type de permission ('view', 'edit', 'delete')
    
    Returns:
        bool: True si l'utilisateur a la permission, False sinon
    """
    # Les admins ont toujours toutes les permissions
    if current_user.get("role") == "ADMIN":
        return True
    
    # Récupérer les permissions de l'utilisateur
    permissions = current_user.get("permissions", {})
    
    # Récupérer les permissions du module
    module_permissions = permissions.get(module, {})
    
    # Vérifier la permission demandée
    return module_permissions.get(permission_type, False)

def require_permission(module: str, permission_type: str):
    """
    Decorator pour vérifier les permissions sur un endpoint.
    
    Usage:
        @api_router.get("/work-orders")
        async def get_work_orders(current_user: dict = Depends(require_permission("workOrders", "view"))):
            ...
    """
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        if not check_permission(current_user, module, permission_type):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Vous n'avez pas la permission '{permission_type}' pour le module '{module}'"
            )
        return current_user
    return permission_checker
