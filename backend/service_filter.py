"""
Service de filtrage par service pour les responsables de service.
Permet de filtrer automatiquement les données selon le service de l'utilisateur.
"""
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Variable globale pour la base de données
_db = None

def init_service_filter(db):
    """Initialise le service avec la connexion à la base de données"""
    global _db
    _db = db
    logger.info("✅ Service de filtrage par service initialisé")


async def get_user_service_filter(user: dict) -> Optional[str]:
    """
    Retourne le filtre service à appliquer pour un utilisateur.
    
    - Admin : None (voit tout)
    - Responsable de service : son service
    - Utilisateur normal : son propre service (s'il en a un)
    
    Returns:
        None si l'utilisateur voit tout, sinon le nom du service à filtrer
    """
    if _db is None:
        logger.warning("Service de filtrage non initialisé")
        return None
    
    user_id = user.get("id")
    user_role = user.get("role", "").upper()
    user_service = user.get("service")
    
    # Les admins voient tout
    if user_role in ["ADMIN", "SUPERADMIN", "ADMINISTRATEUR"]:
        return None
    
    # Vérifier si l'utilisateur est responsable de service
    responsable = await _db.service_responsables.find_one({"user_id": user_id})
    
    if responsable:
        # Le responsable voit son service
        return responsable.get("service")
    
    # Utilisateur normal : retourne son service s'il en a un
    # (pour filtrer par défaut sur son propre service)
    return user_service


async def get_user_managed_services(user: dict) -> List[str]:
    """
    Retourne la liste des services gérés par un utilisateur.
    Un utilisateur peut être responsable de plusieurs services.
    
    Returns:
        Liste des services (vide si utilisateur normal, tous si admin)
    """
    if _db is None:
        return []
    
    user_id = user.get("id")
    user_role = user.get("role", "").upper()
    
    # Les admins gèrent tous les services
    if user_role in ["ADMIN", "SUPERADMIN", "ADMINISTRATEUR"]:
        # Retourner tous les services distincts
        services = await _db.users.distinct("service")
        return [s for s in services if s]
    
    # Chercher tous les services dont l'utilisateur est responsable
    responsables = await _db.service_responsables.find(
        {"user_id": user_id},
        {"_id": 0, "service": 1}
    ).to_list(length=50)
    
    return [r.get("service") for r in responsables if r.get("service")]


async def is_service_manager(user: dict) -> bool:
    """
    Vérifie si l'utilisateur est un responsable de service.
    """
    if _db is None:
        return False
    
    user_id = user.get("id")
    user_role = user.get("role", "").upper()
    
    # Admin est considéré comme "super manager"
    if user_role in ["ADMIN", "SUPERADMIN", "ADMINISTRATEUR"]:
        return True
    
    responsable = await _db.service_responsables.find_one({"user_id": user_id})
    return responsable is not None


async def apply_service_filter(query: dict, user: dict, service_field: str = "service") -> dict:
    """
    Applique automatiquement le filtre service à une requête MongoDB.
    
    Args:
        query: La requête MongoDB existante
        user: L'utilisateur courant
        service_field: Le nom du champ service dans la collection (défaut: "service")
    
    Returns:
        La requête modifiée avec le filtre service
    """
    service_filter = await get_user_service_filter(user)
    
    if service_filter is not None:
        # Créer une copie de la requête pour ne pas modifier l'originale
        filtered_query = {**query}
        
        # Si un filtre service existe déjà, on le combine avec $and
        if service_field in filtered_query:
            filtered_query = {
                "$and": [
                    query,
                    {service_field: service_filter}
                ]
            }
        else:
            filtered_query[service_field] = service_filter
        
        return filtered_query
    
    return query


async def get_service_team_members(user: dict) -> List[Dict[str, Any]]:
    """
    Retourne les membres de l'équipe du responsable de service.
    """
    if _db is None:
        return []
    
    managed_services = await get_user_managed_services(user)
    
    if not managed_services:
        return []
    
    # Récupérer les utilisateurs actifs de ces services (exclure les inactifs)
    team = await _db.users.find(
        {
            "service": {"$in": managed_services},
            "actif": {"$ne": False},
            "statut": {"$not": {"$regex": "^inactif$", "$options": "i"}}
        },
        {"_id": 0, "password": 0}
    ).to_list(length=500)
    
    return team


async def can_access_service_data(user: dict, target_service: str) -> bool:
    """
    Vérifie si un utilisateur peut accéder aux données d'un service spécifique.
    """
    user_role = user.get("role", "").upper()
    
    # Admin peut tout voir
    if user_role in ["ADMIN", "SUPERADMIN", "ADMINISTRATEUR"]:
        return True
    
    managed_services = await get_user_managed_services(user)
    
    # Le responsable peut voir son/ses service(s)
    if target_service in managed_services:
        return True
    
    # L'utilisateur peut voir son propre service
    if user.get("service") == target_service:
        return True
    
    return False


# === Décorateur pour appliquer automatiquement le filtre service ===

def with_service_filter(service_field: str = "service"):
    """
    Décorateur pour appliquer automatiquement le filtre service aux endpoints.
    
    Usage:
        @with_service_filter("service")
        async def get_items(current_user: dict = Depends(get_current_user)):
            ...
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Récupérer l'utilisateur des kwargs
            current_user = kwargs.get("current_user")
            if current_user:
                # Ajouter le filtre service aux kwargs
                service_filter = await get_user_service_filter(current_user)
                kwargs["_service_filter"] = service_filter
                kwargs["_service_field"] = service_field
            return await func(*args, **kwargs)
        return wrapper
    return decorator
