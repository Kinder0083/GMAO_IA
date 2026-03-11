"""
Routes API pour la gestion des rôles
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from models import (
    Role, RoleCreate, RoleUpdate, UserPermissions,
    ServiceResponsable, ServiceResponsableCreate, ServiceResponsableUpdate,
    get_default_permissions_by_role,
    SuccessResponse
)
from dependencies import get_current_user
from bson import ObjectId
import uuid

router = APIRouter(prefix="/roles", tags=["Rôles"])

# Variable pour la base de données (initialisée depuis server.py)
db = None

def init_roles_routes(database):
    """Initialise les routes avec la référence à la base de données"""
    global db
    db = database

# Rôles système par défaut (non supprimables)
SYSTEM_ROLES = [
    {
        "code": "ADMIN",
        "label": "Administrateur",
        "description": "Accès complet à toutes les fonctionnalités",
        "color_bg": "bg-purple-100",
        "color_text": "text-purple-700",
        "is_system": True
    },
    {
        "code": "DIRECTEUR",
        "label": "Directeur",
        "description": "Direction générale avec accès étendu",
        "color_bg": "bg-red-100",
        "color_text": "text-red-700",
        "is_system": True
    },
    {
        "code": "QHSE",
        "label": "QHSE",
        "description": "Qualité, Hygiène, Sécurité, Environnement",
        "color_bg": "bg-yellow-100",
        "color_text": "text-yellow-700",
        "is_system": True
    },
    {
        "code": "RSP_PROD",
        "label": "Responsable Production",
        "description": "Responsable du service production",
        "color_bg": "bg-green-100",
        "color_text": "text-green-700",
        "is_system": True
    },
    {
        "code": "PROD",
        "label": "Production",
        "description": "Opérateur de production",
        "color_bg": "bg-green-100",
        "color_text": "text-green-600",
        "is_system": True
    },
    {
        "code": "TECHNICIEN",
        "label": "Technicien",
        "description": "Technicien de maintenance",
        "color_bg": "bg-blue-100",
        "color_text": "text-blue-700",
        "is_system": True
    },
    {
        "code": "LABO",
        "label": "Laboratoire",
        "description": "Personnel du laboratoire",
        "color_bg": "bg-pink-100",
        "color_text": "text-pink-700",
        "is_system": True
    },
    {
        "code": "ADV",
        "label": "ADV",
        "description": "Administration des ventes",
        "color_bg": "bg-indigo-100",
        "color_text": "text-indigo-700",
        "is_system": True
    },
    {
        "code": "LOGISTIQUE",
        "label": "Logistique",
        "description": "Service logistique",
        "color_bg": "bg-orange-100",
        "color_text": "text-orange-700",
        "is_system": True
    },
    {
        "code": "INDUS",
        "label": "Industrialisation",
        "description": "Service industrialisation",
        "color_bg": "bg-cyan-100",
        "color_text": "text-cyan-700",
        "is_system": True
    },
    {
        "code": "VISUALISEUR",
        "label": "Visualiseur",
        "description": "Accès en lecture seule",
        "color_bg": "bg-gray-100",
        "color_text": "text-gray-700",
        "is_system": True
    },
    {
        "code": "AFFICHAGE",
        "label": "Affichage",
        "description": "Rôle pour tableau d'affichage",
        "color_bg": "bg-slate-100",
        "color_text": "text-slate-700",
        "is_system": True
    },
    {
        "code": "RSP_SERVICE",
        "label": "Responsable de service",
        "description": "Responsable d'un service avec accès aux fonctions de supervision",
        "color_bg": "bg-teal-100",
        "color_text": "text-teal-700",
        "is_system": True
    }
]


async def init_system_roles():
    """Initialise les rôles système dans la base de données"""
    for role_data in SYSTEM_ROLES:
        existing = await db.roles.find_one({"code": role_data["code"]})
        if not existing:
            # Obtenir les permissions par défaut pour ce rôle
            permissions = get_default_permissions_by_role(role_data["code"])
            role = {
                "id": str(uuid.uuid4()),
                "code": role_data["code"],
                "label": role_data["label"],
                "description": role_data["description"],
                "color_bg": role_data["color_bg"],
                "color_text": role_data["color_text"],
                "is_system": role_data["is_system"],
                "permissions": permissions.model_dump(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": "system"
            }
            await db.roles.insert_one(role)
            print(f"Rôle système créé: {role_data['code']}")


@router.get("")
async def get_all_roles(current_user: dict = Depends(get_current_user)):
    """Récupérer tous les rôles"""
    try:
        roles_raw = await db.roles.find({}).to_list(length=None)
        
        # Si aucun rôle n'existe, initialiser les rôles système
        if not roles_raw or len(roles_raw) == 0:
            print("⚠️ Aucun rôle trouvé, initialisation des rôles système...")
            await init_system_roles()
            roles_raw = await db.roles.find({}).to_list(length=None)
        
        # Normaliser: s'assurer que chaque rôle a un champ "id"
        roles = []
        needs_migration = False
        for role in roles_raw:
            if "id" not in role or not role["id"]:
                role["id"] = str(role["_id"])
                needs_migration = True
                await db.roles.update_one({"_id": role["_id"]}, {"$set": {"id": role["id"]}})
            role.pop("_id", None)
            roles.append(role)
        
        if needs_migration:
            print(f"✅ Migration: {len(roles)} rôles mis à jour avec un champ 'id'")
        
        # Trier: rôles système en premier, puis par label
        roles.sort(key=lambda r: (not r.get("is_system", False), r.get("label", "")))
        
        return roles
    except Exception as e:
        print(f"❌ Erreur get_all_roles: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération des rôles: {str(e)}")


async def _find_role(role_id: str):
    """Chercher un rôle par id ou _id"""
    role = await db.roles.find_one({"id": role_id})
    if not role:
        try:
            role = await db.roles.find_one({"_id": ObjectId(role_id)})
        except:
            pass
    return role


@router.get("/{role_id}")
async def get_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Récupérer un rôle par ID"""
    role = await _find_role(role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Rôle non trouvé")
    if "id" not in role or not role["id"]:
        role["id"] = str(role["_id"])
    role.pop("_id", None)
    return role


@router.get("/by-code/{code}")
async def get_role_by_code(code: str, current_user: dict = Depends(get_current_user)):
    """Récupérer un rôle par son code"""
    role = await db.roles.find_one({"code": code}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Rôle non trouvé")
    return role


@router.post("")
async def create_role(role_data: RoleCreate, current_user: dict = Depends(get_current_user)):
    """Créer un nouveau rôle personnalisé"""
    try:
        # Vérifier que l'utilisateur est admin
        if current_user.get("role") != "ADMIN":
            raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent créer des rôles")
        
        # Valider les données requises
        if not role_data.code or not role_data.code.strip():
            raise HTTPException(status_code=400, detail="Le code du rôle est obligatoire")
        
        if not role_data.label or not role_data.label.strip():
            raise HTTPException(status_code=400, detail="Le libellé du rôle est obligatoire")
        
        # Vérifier que le code n'existe pas déjà
        existing = await db.roles.find_one({"code": role_data.code.upper()})
        if existing:
            raise HTTPException(status_code=400, detail="Un rôle avec ce code existe déjà")
        
        role = {
            "id": str(uuid.uuid4()),
            "code": role_data.code.upper(),
            "label": role_data.label,
            "description": role_data.description,
            "color_bg": role_data.color_bg,
            "color_text": role_data.color_text,
            "is_system": False,  # Les rôles créés manuellement ne sont pas système
            "permissions": role_data.permissions.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.get("id")
        }
        
        await db.roles.insert_one(role)
        
        # Retourner sans _id
        role.pop("_id", None)
        print(f"✅ Rôle créé: {role['code']} par {current_user.get('email')}")
        return role
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Erreur create_role: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création du rôle: {str(e)}")


@router.put("/{role_id}")
async def update_role(role_id: str, role_data: RoleUpdate, current_user: dict = Depends(get_current_user)):
    """Mettre à jour un rôle"""
    # Vérifier que l'utilisateur est admin
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent modifier les rôles")
    
    # Récupérer le rôle existant
    existing = await _find_role(role_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Rôle non trouvé")
    
    # Construire le filtre de recherche pour la mise à jour
    role_filter = {"id": role_id}
    if "id" not in existing or existing.get("id") != role_id:
        role_filter = {"_id": existing["_id"]}
    
    # Préparer les données de mise à jour
    update_data = {}
    if role_data.label is not None:
        update_data["label"] = role_data.label
    if role_data.description is not None:
        update_data["description"] = role_data.description
    if role_data.color_bg is not None:
        update_data["color_bg"] = role_data.color_bg
    if role_data.color_text is not None:
        update_data["color_text"] = role_data.color_text
    if role_data.permissions is not None:
        update_data["permissions"] = role_data.permissions.model_dump()
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.roles.update_one(role_filter, {"$set": update_data})
    
    # Retourner le rôle mis à jour
    updated = await _find_role(role_id)
    if updated:
        if "id" not in updated or not updated["id"]:
            updated["id"] = str(updated["_id"])
        updated.pop("_id", None)
    return updated


@router.delete("/{role_id}", response_model=SuccessResponse)
async def delete_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Supprimer un rôle (uniquement les rôles non-système)"""
    # Vérifier que l'utilisateur est admin
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent supprimer des rôles")
    
    # Récupérer le rôle
    role = await _find_role(role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Rôle non trouvé")
    
    # Vérifier que ce n'est pas un rôle système
    if role.get("is_system"):
        raise HTTPException(status_code=400, detail="Impossible de supprimer un rôle système")
    
    # Vérifier qu'aucun utilisateur n'utilise ce rôle
    users_with_role = await db.users.count_documents({"role": role.get("code")})
    if users_with_role > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer ce rôle: {users_with_role} utilisateur(s) l'utilisent encore"
        )
    
    # Supprimer par le bon filtre
    role_filter = {"id": role_id}
    if "id" not in role or role.get("id") != role_id:
        role_filter = {"_id": role["_id"]}
    await db.roles.delete_one(role_filter)
    
    return {"success": True, "message": "Rôle supprimé avec succès"}


# === Service Responsables ===

@router.get("/service-responsables/all")
async def get_all_service_responsables(current_user: dict = Depends(get_current_user)):
    """Récupérer tous les responsables de service"""
    responsables = await db.service_responsables.find({}, {"_id": 0}).to_list(length=None)
    return responsables


@router.get("/service-responsables/{service}")
async def get_service_responsable(service: str, current_user: dict = Depends(get_current_user)):
    """Récupérer le responsable d'un service"""
    responsable = await db.service_responsables.find_one({"service": service}, {"_id": 0})
    return responsable


@router.post("/service-responsables")
async def set_service_responsable(data: ServiceResponsableCreate, current_user: dict = Depends(get_current_user)):
    """Définir ou mettre à jour le responsable d'un service"""
    # Vérifier que l'utilisateur est admin
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent définir les responsables de service")
    
    # Récupérer l'utilisateur assigné - essayer par ObjectId d'abord, puis par id string
    user = None
    try:
        user = await db.users.find_one({"_id": ObjectId(data.user_id)})
    except:
        pass
    
    if not user:
        user = await db.users.find_one({"id": data.user_id})
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Vérifier si un responsable existe déjà pour ce service
    existing = await db.service_responsables.find_one({"service": data.service})
    
    responsable_data = {
        "service": data.service,
        "user_id": data.user_id,
        "user_name": f"{user.get('prenom', '')} {user.get('nom', '')}".strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("id")
    }
    
    if existing:
        # Mettre à jour
        await db.service_responsables.update_one(
            {"service": data.service},
            {"$set": responsable_data}
        )
        responsable_data["id"] = existing.get("id")
    else:
        # Créer
        responsable_data["id"] = str(uuid.uuid4())
        await db.service_responsables.insert_one(responsable_data)
        
        # Créer automatiquement un template de rapport pour ce nouveau service
        try:
            from default_report_templates import create_default_template_for_service
            await create_default_template_for_service(
                db=db,
                service=data.service,
                created_by=current_user.get("id"),
                created_by_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip() or "Admin"
            )
        except Exception as e:
            # Log l'erreur mais ne bloque pas la création du responsable
            import logging
            logging.getLogger(__name__).warning(f"Impossible de créer le template par défaut pour {data.service}: {e}")
    
    responsable_data.pop("_id", None)
    return responsable_data


@router.delete("/service-responsables/{service}", response_model=SuccessResponse)
async def remove_service_responsable(service: str, current_user: dict = Depends(get_current_user)):
    """Supprimer le responsable d'un service"""
    # Vérifier que l'utilisateur est admin
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent modifier les responsables de service")
    
    result = await db.service_responsables.delete_one({"service": service})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Responsable de service non trouvé")
    
    return {"success": True, "message": "Responsable de service supprimé"}


# Liste des services disponibles
SERVICES = [
    "ADV",
    "LOGISTIQUE",
    "PRODUCTION",
    "QHSE",
    "MAINTENANCE",
    "LABO",
    "INDUS",
    "DIRECTION",
    "AUTRE"
]

@router.get("/services/list")
async def get_services_list(current_user: dict = Depends(get_current_user)):
    """Récupérer la liste des services disponibles"""
    return SERVICES



@router.post("/migrate-permissions")
async def migrate_role_permissions(current_user: dict = Depends(get_current_user)):
    """Migrer les permissions des rôles existants pour ajouter les modules manquants"""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent migrer les permissions")
    
    NEW_PERMISSION_KEYS = [
        "mes", "mesReports", "serviceDashboard", "weeklyReports",
        "demandesArret", "consignes", "consignationsLoto", "autorisationsParticulieres", "training",
        "contrats", "aiDashboard", "aiAutomations", "aiWidgets"
    ]
    
    roles = await db.roles.find({}).to_list(length=None)
    updated_count = 0
    
    for role in roles:
        perms = role.get("permissions", {})
        needs_update = False
        
        for key in NEW_PERMISSION_KEYS:
            if key not in perms:
                needs_update = True
                default_perms = get_default_permissions_by_role(role.get("code", ""))
                default_dict = default_perms.model_dump()
                perms[key] = default_dict.get(key, {"view": False, "edit": False, "delete": False})
        
        if needs_update:
            role_filter = {"id": role["id"]} if "id" in role else {"_id": role["_id"]}
            await db.roles.update_one(
                role_filter,
                {"$set": {"permissions": perms}}
            )
            updated_count += 1
    
    return {"success": True, "message": f"{updated_count} rôle(s) mis à jour avec les nouvelles permissions", "updated_count": updated_count}
