"""
Routes des Utilisateurs - CRUD, Permissions, Roles
Extrait de server.py pour une meilleure maintenabilite.
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
from passlib.context import CryptContext
import uuid
import logging

from models import (
    ActionType, EntityType, User, UserUpdate, UserInvite,
    UserPermissions, UserPermissionsUpdate, ResetPasswordAdminResponse,
    MessageResponse, SuccessResponse, get_default_permissions_by_role
)
from auth import get_password_hash
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc, find_user_flexible, NOT_DELETED
import email_service

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(tags=["Utilisateurs"])


def _get_realtime_manager():
    from realtime_manager import realtime_manager
    return realtime_manager


@router.get("/users",
    summary="Lister les utilisateurs", tags=["Utilisateurs"])
async def get_users(current_user: dict = Depends(get_current_user)):
    """Liste tous les utilisateurs"""
    # Vérifier les permissions - Admin a toujours accès, sinon vérifier permission people.view
    if current_user.get("role") != "ADMIN":
        permissions = current_user.get("permissions", {})
        people_perms = permissions.get("people", {})
        if not people_perms.get("view", False):
            raise HTTPException(
                status_code=403,
                detail="Vous n'avez pas la permission de voir les utilisateurs"
            )
    
    users = await db.users.find(NOT_DELETED).to_list(1000)
    result = []
    for user in users:
        doc = serialize_doc(user)
        # Fix permissions: doit être un dict, pas une liste
        if isinstance(doc.get("permissions"), list):
            doc["permissions"] = {}
        # Fix mqtt fields: convertir en string
        for field in ["mqtt_action_ok", "mqtt_action_reception"]:
            if field in doc and not isinstance(doc[field], str):
                doc[field] = str(doc[field])
        # Assurer les champs obligatoires
        if "nom" not in doc:
            doc["nom"] = doc.get("name", "Inconnu")
        if "prenom" not in doc:
            doc["prenom"] = ""
        result.append(doc)
    return result

@router.put("/users/{user_id}",
    summary="Modifier un utilisateur", response_model=User, tags=["Utilisateurs"])
async def update_user(user_id: str, user_update: UserUpdate, current_user: dict = Depends(get_current_admin_user)):
    """Modifier un utilisateur (admin uniquement)"""
    try:
        user = await find_user_flexible(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        update_data = {k: v for k, v in user_update.model_dump().items() if v is not None}
        
        # Valider la valeur du statut si fourni
        if "statut" in update_data and update_data["statut"] not in ("actif", "inactif"):
            raise HTTPException(status_code=400, detail="Statut invalide. Valeurs acceptées : actif, inactif")
        
        # Si le rôle change, mettre à jour automatiquement les permissions par défaut
        if "role" in update_data:
            new_role = update_data["role"]
            default_permissions = get_default_permissions_by_role(new_role).model_dump()
            update_data["permissions"] = default_permissions
        
        # Détecter le changement de statut pour l'audit
        old_statut = user.get("statut", "actif")
        new_statut = update_data.get("statut")
        statut_changed = new_statut and new_statut != old_statut
        
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": update_data}
        )
        
        updated = await db.users.find_one({"_id": user["_id"]})
        user_response = User(**serialize_doc(updated))
        
        # Log d'audit pour le changement de statut
        if statut_changed:
            action_label = "désactivé" if new_statut == "inactif" else "réactivé"
            await audit_service.log_action(
                user_id=current_user["id"],
                user_name=f"{current_user['prenom']} {current_user['nom']}",
                user_email=current_user["email"],
                action=ActionType.UPDATE,
                entity_type=EntityType_Audit.USER,
                entity_id=user_id,
                entity_name=f"{user.get('prenom', '')} {user.get('nom', '')}".strip(),
                details=f"Compte {action_label} (statut: {old_statut} → {new_statut})"
            )
        
        # Émettre l'événement WebSocket à TOUS les utilisateurs (y compris celui qui fait la modification)
        # Important pour la synchronisation du Planning quand on modifie un service
        try:
            from realtime_events import EntityType as RealtimeEntityType, EventType as RealtimeEventType
            await _get_realtime_manager().emit_event(
                RealtimeEntityType.USERS.value,
                RealtimeEventType.UPDATED.value,
                user_response.model_dump(),
                None  # Ne pas exclure l'utilisateur actuel pour assurer la synchro du Planning
            )
        except Exception as e:
            logger.error(f"Erreur émission événement WebSocket users: {e}")
        
        return user_response
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/users/{user_id}/header-visibility",
    summary="Obtenir la visibilité des icônes header d'un utilisateur", tags=["Utilisateurs"])
async def get_user_header_visibility(user_id: str, current_user: dict = Depends(get_current_user)):
    """Obtenir les paramètres de visibilité des icônes header pour un utilisateur"""
    user = await find_user_flexible(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return user.get("header_icons_visibility", {})

@router.put("/users/{user_id}/header-visibility",
    summary="Modifier la visibilité des icônes header d'un utilisateur", tags=["Utilisateurs"])
async def update_user_header_visibility(
    user_id: str,
    visibility: dict,
    current_user: dict = Depends(get_current_admin_user)
):
    """Modifier les paramètres de visibilité des icônes header (admin uniquement)"""
    user = await find_user_flexible(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"header_icons_visibility": visibility}}
    )
    
    return {"message": "Visibilité des icônes mise à jour", "visibility": visibility}


@router.delete("/users/{user_id}", response_model=MessageResponse,
    summary="Supprimer un utilisateur", tags=["Utilisateurs"])
async def delete_user(user_id: str, current_user: dict = Depends(get_current_admin_user)):
    """Supprimer un utilisateur (admin uniquement)"""
    try:
        # Empêcher de se supprimer soi-même
        if str(user_id) == str(current_user.get('id')):
            raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous supprimer vous-même")
        
        user = await find_user_flexible(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        result = await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "deleted_at": datetime.now(timezone.utc),
                "deleted_by": current_user["id"],
                "deleted_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
            }}
        )
        
        # Émettre l'événement WebSocket
        try:
            from realtime_events import EntityType as RealtimeEntityType, EventType as RealtimeEventType
            await _get_realtime_manager().emit_event(
                RealtimeEntityType.USERS.value,
                RealtimeEventType.DELETED.value,
                {"id": user_id},
                current_user.get("id")
            )
        except Exception as e:
            logger.error(f"Erreur émission événement WebSocket users: {e}")
        
        return {"message": "Utilisateur supprimé"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/users/invite", response_model=User, tags=["Utilisateurs"])
async def invite_user(user_invite: UserInvite, current_user: dict = Depends(get_current_admin_user)):
    """Inviter un nouveau membre (admin uniquement)"""
    # Vérifier si l'utilisateur existe déjà
    existing_user = await db.users.find_one({"email": user_invite.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utilisateur avec cet email existe déjà"
        )
    
    # Générer un mot de passe temporaire
    import secrets
    import string
    temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
    hashed_password = get_password_hash(temp_password)
    
    # Définir les permissions par défaut selon le rôle
    if user_invite.permissions is None:
        # Utiliser la fonction centralisée pour obtenir les permissions par défaut
        permissions = get_default_permissions_by_role(user_invite.role).model_dump()
    else:
        permissions = user_invite.permissions.model_dump()
    
    # Créer l'utilisateur
    user_dict = {
        "nom": user_invite.nom,
        "prenom": user_invite.prenom,
        "email": user_invite.email,
        "telephone": user_invite.telephone,
        "role": user_invite.role,
        "hashed_password": hashed_password,
        "statut": "actif",
        "dateCreation": datetime.utcnow(),
        "derniereConnexion": None,
        "permissions": permissions,
        "_id": ObjectId()
    }
    
    await db.users.insert_one(user_dict)
    
    # TODO: Envoyer un email avec le mot de passe temporaire
    # Pour l'instant, on log juste le mot de passe (À REMPLACER EN PRODUCTION)
    logger.info(f"Utilisateur {user_invite.email} créé avec mot de passe temporaire: {temp_password}")
    
    return User(**serialize_doc(user_dict))

@router.get("/users/{user_id}/permissions", response_model=UserPermissions, tags=["Utilisateurs"])
async def get_user_permissions(user_id: str, current_user: dict = Depends(get_current_admin_user)):
    """Obtenir les permissions d'un utilisateur"""
    try:
        user = await find_user_flexible(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        permissions = user.get("permissions", {})
        return UserPermissions(**permissions)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/users/default-permissions/{role}",
    summary="Permissions par defaut d'un role", tags=["Utilisateurs"])
async def get_default_permissions_for_role(
    role: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """Obtenir les permissions par défaut pour un rôle spécifique (admin uniquement)"""
    try:
        default_permissions = get_default_permissions_by_role(role)
        return {"role": role, "permissions": default_permissions.model_dump()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur lors de la récupération des permissions: {str(e)}")


@router.get("/users/service-manager/{service}",
    summary="Responsable d'un service", tags=["Utilisateurs"])
async def get_service_manager_for_user(
    service: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer le responsable de service pour un service donné"""
    try:
        # Chercher dans service_responsables
        manager_entry = await db.service_responsables.find_one({"service": service})
        
        if not manager_entry:
            raise HTTPException(status_code=404, detail="Aucun responsable assigné pour ce service")
        
        user_id = manager_entry["user_id"]
        
        # Récupérer les infos du responsable (chercher par id OU par _id)
        manager = await db.users.find_one(
            {"id": user_id, "statut": "actif"},
            {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "email": 1, "role": 1}
        )
        
        # Si non trouvé, essayer avec _id (ObjectId)
        if not manager:
            try:
                manager = await db.users.find_one(
                    {"_id": ObjectId(user_id), "statut": "actif"},
                    {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "email": 1, "role": 1}
                )
            except:
                pass
        
        if not manager:
            raise HTTPException(status_code=404, detail="Responsable non trouvé ou inactif")
        
        return manager
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération responsable service: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/users/{user_id}/permissions", response_model=User, tags=["Utilisateurs"])
async def update_user_permissions(
    user_id: str, 
    permissions_update: UserPermissionsUpdate, 
    current_user: dict = Depends(get_current_admin_user)
):
    """Mettre à jour les permissions d'un utilisateur (admin uniquement)"""
    try:
        user = await find_user_flexible(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        permissions_dict = permissions_update.permissions.model_dump()
        
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"permissions": permissions_dict}}
        )
        
        updated_user = await db.users.find_one({"_id": user["_id"]})
        return User(**serialize_doc(updated_user))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/users/init-time-tracking-permissions", tags=["Utilisateurs"])
async def init_time_tracking_permissions(
    current_user: dict = Depends(get_current_admin_user)
):
    """Initialiser les permissions timeTracking pour tous les utilisateurs selon leur rôle"""
    try:
        # Mettre à jour les ADMIN avec toutes les permissions timeTracking
        admin_result = await db.users.update_many(
            {"role": "ADMIN"},
            {"$set": {"permissions.timeTracking": {"view": True, "edit": True, "delete": True}}}
        )
        
        # Mettre à jour les TECHNICIEN et DIRECTEUR avec view et edit
        tech_result = await db.users.update_many(
            {"role": {"$in": ["TECHNICIEN", "DIRECTEUR"]}},
            {"$set": {"permissions.timeTracking": {"view": True, "edit": True, "delete": False}}}
        )
        
        # Mettre à jour les autres rôles avec view seulement
        other_result = await db.users.update_many(
            {"role": {"$nin": ["ADMIN", "TECHNICIEN", "DIRECTEUR", "AFFICHAGE"]}},
            {"$set": {"permissions.timeTracking": {"view": True, "edit": False, "delete": False}}}
        )
        
        return {
            "message": "Permissions timeTracking initialisées",
            "updated": {
                "admin": admin_result.modified_count,
                "technicien_directeur": tech_result.modified_count,
                "others": other_result.modified_count
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/users/init-cameras-permissions", tags=["Utilisateurs"])
async def init_cameras_permissions(
    current_user: dict = Depends(get_current_admin_user)
):
    """Initialiser les permissions caméras pour tous les utilisateurs selon leur rôle"""
    try:
        # ADMIN : toutes les permissions
        admin_result = await db.users.update_many(
            {"role": "ADMIN"},
            {"$set": {"permissions.cameras": {"view": True, "edit": True, "delete": True}}}
        )
        
        # Responsables de service (DIRECTEUR, responsable) : view seulement
        responsable_result = await db.users.update_many(
            {"$or": [
                {"role": "DIRECTEUR"},
                {"is_service_manager": True}
            ]},
            {"$set": {"permissions.cameras": {"view": True, "edit": False, "delete": False}}}
        )
        
        return {
            "message": "Permissions caméras initialisées",
            "updated": {
                "admin": admin_result.modified_count,
                "responsables": responsable_result.modified_count
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/users/migrate-all-permissions", tags=["Utilisateurs"])
async def migrate_all_user_permissions(
    current_user: dict = Depends(get_current_admin_user)
):
    """Migrer les permissions de TOUS les utilisateurs selon leur rôle actuel.
    Réinitialise les permissions par défaut pour chaque utilisateur selon son rôle."""
    try:
        all_users = await db.users.find({}).to_list(length=None)
        updated_count = 0
        for u in all_users:
            user_role = u.get("role", "VISUALISEUR")
            default_perms = get_default_permissions_by_role(user_role).model_dump()
            await db.users.update_one(
                {"_id": u["_id"]},
                {"$set": {"permissions": default_perms}}
            )
            updated_count += 1
        return {
            "success": True,
            "message": f"Permissions mises à jour pour {updated_count} utilisateur(s)",
            "updated_count": updated_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/users/{user_id}/set-password-permanent",
    summary="Definir un mot de passe permanent", response_model=SuccessResponse, tags=["Utilisateurs"])
async def set_password_permanent(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Marquer le mot de passe temporaire comme permanent (désactiver le changement obligatoire au premier login)
    L'utilisateur peut uniquement modifier son propre statut, sauf si c'est un admin
    """
    try:
        # Vérifier que l'utilisateur existe
        user = await find_user_flexible(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        # Vérifier que l'utilisateur modifie son propre compte OU qu'il est admin
        current_user_id = current_user.get("id")
        is_admin = current_user.get("role") == "ADMIN"
        
        # Comparer par _id MongoDB (ObjectId) pour eviter les mismatches UUID vs ObjectId
        target_mongo_id = str(user.get("_id", ""))
        is_same_user = (
            str(user_id) == str(current_user_id)
            or target_mongo_id == str(current_user_id)
            or str(user_id) == target_mongo_id
            or str(user.get("id", "")) == str(current_user_id)
        )
        
        if not is_same_user and not is_admin:
            raise HTTPException(
                status_code=403, 
                detail="Vous ne pouvez modifier que votre propre statut"
            )
        
        # Mettre à jour le champ firstLogin à False
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"firstLogin": False}}
        )
        
        # Enregistrer l'action dans le journal d'audit
        await audit_service.log_action(
            user_id=current_user_id,
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType_Audit.USER,
            entity_id=user_id,
            entity_name=f"{user.get('prenom', '')} {user.get('nom', '')}".strip(),
            details="Mot de passe temporaire conservé comme permanent",
            changes={"firstLogin": False}
        )
        
        return {
            "success": True,
            "message": "Mot de passe conservé avec succès"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")



@router.post("/users/{user_id}/reset-password-admin",
    summary="Reinitialiser le mot de passe (admin)", response_model=ResetPasswordAdminResponse, tags=["Utilisateurs"])
async def reset_password_admin(
    user_id: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Réinitialiser le mot de passe d'un utilisateur (Admin uniquement)
    Génère un nouveau mot de passe temporaire et force le changement au prochain login
    """
    try:
        # Vérifier que l'utilisateur existe
        user = await find_user_flexible(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        # Générer un nouveau mot de passe temporaire
        temp_password = generate_temp_password()
        
        # Hasher le mot de passe
        hashed_password = get_password_hash(temp_password)
        
        # Mettre à jour le mot de passe et forcer le changement au prochain login
        await db.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "hashed_password": hashed_password,
                    "firstLogin": True
                }
            }
        )
        
        # Enregistrer l'action dans le journal d'audit
        await audit_service.log_action(
            user_id=current_user.get("id"),
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType_Audit.USER,
            entity_id=user_id,
            entity_name=f"{user.get('prenom', '')} {user.get('nom', '')}".strip(),
            details="Réinitialisation du mot de passe par l'administrateur",
            changes={"firstLogin": True, "password_reset": "admin_action"}
        )
        
        # Envoyer un email à l'utilisateur avec le nouveau mot de passe
        try:
            email_sent = email_service.send_account_created_email(
                to_email=user['email'],
                prenom=user.get('prenom', ''),
                temp_password=temp_password
            )
            
            if email_sent:
                logger.info(f"Email de réinitialisation envoyé à {user['email']}")
        except Exception as email_error:
            logger.error(f"Erreur lors de l'envoi de l'email de réinitialisation : {str(email_error)}")
        
        return {
            "success": True,
            "message": "Mot de passe réinitialisé avec succès",
            "tempPassword": temp_password,
            "emailSent": email_sent if 'email_sent' in locals() else False
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de la réinitialisation du mot de passe : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")


