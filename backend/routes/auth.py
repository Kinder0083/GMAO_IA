"""
Routes d'authentification - Login, Register, Invitation, Password Management
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Body, status
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from passlib.context import CryptContext
import uuid
import os
import logging
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from models import (
    ActionType, EntityType, Token, User, UserCreate, LoginRequest,
    MessageResponse, SuccessResponse, ForgotPasswordRequest, ResetPasswordRequest,
    ValidateInvitationResponse, UserPermissions, get_default_permissions_by_role,
    InviteMemberResponse, InviteMemberRequest, CreateMemberRequest,
    CompleteRegistrationRequest, ChangePasswordRequest, UserProfileUpdate
)
from auth import get_password_hash, verify_password, create_access_token, decode_access_token
from jose import jwt, JWTError
from dependencies import get_current_user, get_current_admin_user
from openapi_config import AUTH_ERRORS, STANDARD_ERRORS
from routes.shared import db, audit_service, serialize_doc, find_user_flexible
import email_service
import string

SECRET_KEY = os.environ.get("SECRET_KEY", "your_jwt_secret_key_change_in_production")
ALGORITHM = os.environ.get("ALGORITHM", "HS256")

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _get_realtime_manager():
    """Récupère le realtime_manager depuis le module shared."""
    from routes.shared import realtime_manager
    return realtime_manager

router = APIRouter(tags=["Authentification"])

@router.post("/auth/register", response_model=User, tags=["Authentification"],
    summary="Inscrire un nouvel utilisateur",
    description="Cree un compte utilisateur avec les permissions par defaut selon le role choisi.",
    responses={**AUTH_ERRORS, 400: {"description": "Email deja utilise"}}
)
async def register(user_create: UserCreate):
    """Créer un nouveau compte utilisateur"""
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_create.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utilisateur avec cet email existe déjà"
        )
    
    # Hash password
    hashed_password = get_password_hash(user_create.password)
    
    # Définir les permissions par défaut selon le rôle (utilisation centralisée)
    permissions = get_default_permissions_by_role(user_create.role).model_dump()
    
    # Create user
    user_dict = user_create.model_dump()
    del user_dict["password"]
    user_dict["hashed_password"] = hashed_password
    user_dict["statut"] = "actif"
    user_dict["dateCreation"] = datetime.utcnow()
    user_dict["derniereConnexion"] = None
    user_dict["permissions"] = permissions
    user_dict["_id"] = ObjectId()
    
    await db.users.insert_one(user_dict)
    
    return User(**serialize_doc(user_dict))


@router.post("/auth/login", response_model=Token, tags=["Authentification"],
    summary="Connexion utilisateur",
    description="Authentifie un utilisateur et retourne un token JWT valide 7 jours. Le token doit etre inclus dans le header `Authorization: Bearer <token>` pour les requetes protegees.",
    responses={401: {"description": "Identifiants invalides", "content": {"application/json": {"example": {"detail": "Identifiants invalides"}}}}}
)
async def login(login_request: LoginRequest):
    """Se connecter et obtenir un token JWT"""
    # Debug logging
    logger.info(f"🔍 LOGIN ATTEMPT - Email: {login_request.email}")
    
    # Find user
    user = await db.users.find_one({"email": login_request.email})
    logger.info(f"🔍 User found in DB: {user is not None}")
    
    if not user:
        logger.warning(f"❌ User not found for email: {login_request.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect"
        )
    
    # Verify password
    logger.info("🔍 Attempting password verification...")
    logger.info(f"   Password length: {len(login_request.password)}")
    
    # Support both 'password' and 'hashed_password' field names
    password_hash = user.get("hashed_password") or user.get("password")
    if not password_hash:
        logger.warning(f"❌ No password hash found for email: {login_request.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect"
        )
    
    logger.info(f"   Hash prefix: {password_hash[:20]}...")
    password_valid = verify_password(login_request.password, password_hash)
    logger.info(f"🔍 Password valid: {password_valid} (type: {type(password_valid)})")
    
    if not password_valid:
        logger.warning(f"❌ Invalid password for email: {login_request.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect"
        )
    
    # Vérifier que le compte est actif
    if user.get("statut") == "inactif":
        logger.warning(f"❌ Login refusé — compte inactif: {login_request.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte a été désactivé. Contactez un administrateur."
        )
    
    # Update last login
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"derniereConnexion": datetime.utcnow()}}
    )
    
    # Log dans l'audit
    await audit_service.log_action(
        user_id=user.get("id", str(user["_id"])),
        user_name=f"{user.get('prenom', '')} {user.get('nom', '')}".strip(),
        user_email=user["email"],
        action=ActionType.LOGIN,
        entity_type=EntityType_Audit.USER,
        entity_id=user.get("id", str(user["_id"])),
        entity_name=f"{user.get('prenom', '')} {user.get('nom', '')}".strip()
    )
    
    # Create access token (valide 1 heure)
    access_token = create_access_token(
        data={"sub": str(user["_id"])},
        expires_delta=timedelta(hours=1)
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=User(**serialize_doc(user))
    )

@router.get("/auth/me", response_model=User, tags=["Authentification"],
    summary="Profil utilisateur connecte",
    description="Retourne les informations completes de l'utilisateur actuellement authentifie.",
    responses={**STANDARD_ERRORS}
)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Obtenir l'utilisateur connecté"""
    return User(**current_user)


@router.get("/auth/session-check", tags=["Authentification"])
async def session_check(current_user: dict = Depends(get_current_user)):
    """Verifie si la session est encore valide (force_logout global)."""
    flag = await db.system_settings.find_one({"key": "force_logout_at"}, {"_id": 0})
    if flag:
        token_iat = current_user.get("token_iat", 0)
        if token_iat < flag.get("timestamp", 0):
            raise HTTPException(status_code=401, detail="Session invalidée par l'administrateur")
    return {"valid": True}

@router.post("/admin/force-logout-all", tags=["Administration"])
async def force_logout_all(current_user: dict = Depends(get_current_admin_user)):
    """Force la deconnexion de tous les utilisateurs."""
    import time
    ts = time.time()
    await db.system_settings.update_one(
        {"key": "force_logout_at"},
        {"$set": {"key": "force_logout_at", "timestamp": ts}},
        upsert=True
    )
    return {"message": "Tous les utilisateurs seront déconnectés", "timestamp": ts}



@router.post("/auth/forgot-password", response_model=MessageResponse, tags=["Authentification"],
    summary="Mot de passe oublie",
    description="Envoie un email avec un lien de reinitialisation du mot de passe. Le token est valable 1 heure.",
    responses={200: {"description": "Email envoye (meme si l'adresse n'existe pas, pour des raisons de securite)"}}
)
async def forgot_password(request: ForgotPasswordRequest):
    """Demander une réinitialisation de mot de passe"""
    # Vérifier si l'utilisateur existe
    user = await db.users.find_one({"email": request.email})
    
    if user:
        # Créer un token de réinitialisation (valide 1 heure)
        reset_token = create_access_token(
            data={"sub": str(user["_id"]), "type": "reset"},
            expires_delta=timedelta(hours=1)
        )
        
        # Construire l'URL de réinitialisation
        APP_URL = os.environ.get('APP_URL', 'http://localhost:3000')
        reset_url = f"{APP_URL}/reset-password?token={reset_token}"
        
        # Envoyer l'email de réinitialisation
        try:
            email_sent = email_service.send_password_reset_email(
                to_email=request.email,
                prenom=user.get('prenom', 'Utilisateur'),
                reset_url=reset_url
            )
            
            if email_sent:
                logger.info(f"Email de réinitialisation envoyé à {request.email}")
            else:
                logger.error(f"Échec de l'envoi de l'email de réinitialisation à {request.email}")
        except Exception as email_error:
            logger.error(f"Erreur lors de l'envoi de l'email de réinitialisation : {str(email_error)}")
        
        # Sauvegarder le token dans la base (pour invalider après usage)
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"reset_token": reset_token, "reset_token_created": datetime.utcnow()}}
        )
    
    # Toujours retourner succès pour ne pas révéler si l'email existe
    return {"message": "Si cet email existe, un lien de réinitialisation a été envoyé"}

@router.post("/auth/reset-password", response_model=MessageResponse, tags=["Authentification"],
    summary="Reinitialiser le mot de passe",
    description="Reinitialise le mot de passe avec un token recu par email. Le token expire apres 1 heure.",
    responses={400: {"description": "Token invalide ou expire"}}
)
async def reset_password(request: ResetPasswordRequest):
    """Réinitialiser le mot de passe avec un token"""
    try:
        # Vérifier le token
        payload = jwt.decode(request.token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        token_type = payload.get("type")
        
        if token_type != "reset":
            raise HTTPException(status_code=400, detail="Token invalide")
        
        # Trouver l'utilisateur
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        # Vérifier que le token correspond (si sauvegardé)
        if user.get("reset_token") != request.token:
            raise HTTPException(status_code=400, detail="Token invalide ou déjà utilisé")
        
        # Hacher le nouveau mot de passe
        hashed_password = get_password_hash(request.new_password)
        
        # Mettre à jour le mot de passe et supprimer le token
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {"hashed_password": hashed_password},
                "$unset": {"reset_token": "", "reset_token_created": ""}
            }
        )
        
        return {"message": "Mot de passe réinitialisé avec succès"}
        
    except JWTError:
        raise HTTPException(status_code=400, detail="Token invalide ou expiré")


# ==================== INVITATION & REGISTRATION ROUTES ====================

def generate_temp_password(length: int = 12) -> str:
    """Génère un mot de passe temporaire aléatoire"""
    characters = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(characters) for _ in range(length))

@router.post("/users/invite-member", response_model=InviteMemberResponse, tags=["Utilisateurs"],
    summary="Inviter un membre",
    description="Cree un compte utilisateur et envoie un email d'invitation avec les identifiants. Necessite le role ADMIN.",
    responses={**STANDARD_ERRORS, 400: {"description": "Email deja utilise"}}
)
async def invite_member(request: InviteMemberRequest, current_user: dict = Depends(get_current_admin_user)):
    """
    Envoyer une invitation par email (Admin uniquement)
    L'utilisateur recevra un lien pour compléter son inscription
    """
    # Vérifier si l'email existe déjà
    existing_user = await db.users.find_one({"email": request.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utilisateur avec cet email existe déjà"
        )
    
    # Créer un token d'invitation (valide 7 jours)
    invitation_data = {
        "sub": request.email,
        "type": "invitation",
        "role": request.role,
        "invited_by": current_user.get("_id")
    }
    invitation_token = create_access_token(
        data=invitation_data,
        expires_delta=timedelta(days=7)
    )
    
    # Envoyer l'email d'invitation
    email_sent = email_service.send_invitation_email(
        to_email=request.email,
        token=invitation_token,
        role=request.role
    )
    
    if not email_sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de l'envoi de l'email d'invitation"
        )
    
    # Log l'invitation
    logger.info(f"Invitation envoyée à {request.email} par {current_user.get('email')}")
    
    return {
        "message": f"Invitation envoyée à {request.email}",
        "email": request.email,
        "role": request.role
    }

@router.post("/users/create-member", response_model=User, tags=["Utilisateurs"])
async def create_member(request: CreateMemberRequest, current_user: dict = Depends(get_current_admin_user)):
    """
    Créer un membre directement avec mot de passe temporaire (Admin uniquement)
    L'utilisateur recevra un email avec ses identifiants
    """
    # Vérifier si l'email existe déjà
    existing_user = await db.users.find_one({"email": request.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utilisateur avec cet email existe déjà"
        )
    
    # Hasher le mot de passe fourni
    hashed_password = get_password_hash(request.password)
    
    # Obtenir les permissions par défaut selon le rôle
    default_permissions = get_default_permissions_by_role(request.role)
    permissions = default_permissions.model_dump()
    
    # Si des permissions personnalisées sont fournies, les utiliser
    if hasattr(request, 'permissions') and request.permissions:
        permissions = request.permissions
    
    # Créer l'utilisateur
    user_dict = {
        "id": str(uuid.uuid4()),
        "nom": request.nom,
        "prenom": request.prenom,
        "email": request.email,
        "telephone": request.telephone or "",
        "role": request.role,
        "service": request.service,
        "regime": request.regime if request.regime else "Journée",  # Régime de travail
        "hashed_password": hashed_password,
        "statut": "actif",
        "dateCreation": datetime.utcnow(),
        "derniereConnexion": datetime.utcnow(),
        "permissions": permissions,
        "firstLogin": True  # Doit changer son mot de passe à la première connexion
    }
    
    await db.users.insert_one(user_dict)
    
    # Émettre l'événement WebSocket pour la création
    try:
        from realtime_events import EntityType as RealtimeEntityType, EventType as RealtimeEventType
        await _get_realtime_manager().emit_event(
            RealtimeEntityType.USERS.value,
            RealtimeEventType.CREATED.value,
            serialize_doc(user_dict),
            current_user.get("id")
        )
    except Exception as e:
        logger.error(f"Erreur émission événement WebSocket users create: {e}")
    
    # Envoyer l'email avec les identifiants
    email_sent = email_service.send_account_created_email(
        to_email=request.email,
        temp_password=request.password,
        prenom=request.prenom
    )
    
    if not email_sent:
        logger.warning(f"Email non envoyé à {request.email}, mais compte créé")
    
    logger.info(f"Membre créé: {request.email} par {current_user.get('email')}")
    
    return User(**serialize_doc(user_dict))

@router.get("/auth/validate-invitation/{token}", response_model=ValidateInvitationResponse, tags=["Authentification"],
    summary="Valider un token d'invitation",
    description="Verifie la validite d'un token d'invitation. Utilise lors du processus d'acceptation d'invitation.",
    responses={400: {"description": "Token invalide ou expire"}}
)
async def validate_invitation(token: str):
    """
    Valider un token d'invitation et retourner les informations
    """
    try:
        payload = decode_access_token(token)
        if not payload or payload.get("type") != "invitation":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token d'invitation invalide"
            )
        
        # Vérifier que l'utilisateur n'existe pas déjà
        email = payload.get("sub")
        existing_user = await db.users.find_one({"email": email})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cet utilisateur existe déjà"
            )
        
        return {
            "valid": True,
            "email": email,
            "role": payload.get("role")
        }
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token d'invitation invalide ou expiré"
        )

@router.post("/auth/complete-registration", response_model=User, tags=["Authentification"])
async def complete_registration(request: CompleteRegistrationRequest):
    """
    Compléter l'inscription après avoir reçu une invitation
    """
    try:
        # Valider le token
        payload = decode_access_token(request.token)
        if not payload or payload.get("type") != "invitation":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token d'invitation invalide"
            )
        
        email = payload.get("sub")
        role = payload.get("role")
        
        # Vérifier que l'utilisateur n'existe pas déjà
        existing_user = await db.users.find_one({"email": email})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cet utilisateur existe déjà"
            )
        
        # Hasher le mot de passe
        hashed_password = get_password_hash(request.password)
        
        # Obtenir les permissions par défaut selon le rôle
        default_permissions = get_default_permissions_by_role(role)
        permissions = default_permissions.model_dump()
        
        # Créer l'utilisateur
        user_dict = {
            "id": str(uuid.uuid4()),
            "nom": request.nom,
            "prenom": request.prenom,
            "email": email,
            "telephone": request.telephone or "",
            "role": role,
            "service": None,
            "hashed_password": hashed_password,
            "statut": "actif",
            "dateCreation": datetime.utcnow(),
            "derniereConnexion": datetime.utcnow(),
            "permissions": permissions,
            "firstLogin": False  # A déjà défini son mot de passe
        }
        
        await db.users.insert_one(user_dict)
        
        logger.info(f"Inscription complétée pour {email}")
        
        return User(**serialize_doc(user_dict))
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de la completion de l'inscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erreur lors de l'inscription"
        )

@router.post("/auth/change-password-first-login", response_model=MessageResponse, tags=["Authentification"],
    summary="Changer le mot de passe (premiere connexion)",
    description="Permet a un utilisateur invite de definir son mot de passe definitif lors de sa premiere connexion.",
    responses={**AUTH_ERRORS}
)
async def change_password_first_login(request: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """
    Changer le mot de passe lors de la première connexion
    """
    user_id = current_user.get("id")  # Changé de "_id" à "id"
    
    # Vérifier l'ancien mot de passe
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    if not verify_password(request.old_password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mot de passe actuel incorrect"
        )
    
    # Hasher le nouveau mot de passe
    new_hashed_password = get_password_hash(request.new_password)
    
    # Mettre à jour le mot de passe et marquer firstLogin comme False
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {
            "$set": {
                "hashed_password": new_hashed_password,
                "firstLogin": False
            }
        }
    )
    
    logger.info(f"Mot de passe changé pour {user.get('email')}")
    
    return {"message": "Mot de passe changé avec succès"}


@router.get("/auth/me", response_model=User, tags=["Authentification"])
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """
    Récupérer le profil de l'utilisateur connecté
    """
    user_id = current_user.get("id")
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return User(**serialize_doc(user))


@router.put("/auth/me", tags=["Authentification"],
    summary="Mettre a jour le profil",
    description="Met a jour les informations du profil de l'utilisateur connecte (nom, prenom, email, telephone, photo).",
    responses={**STANDARD_ERRORS}
)
async def update_current_user_profile(user_update: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    """
    Mettre à jour le profil de l'utilisateur connecté
    """
    user_id = current_user.get("id")
    
    # Préparer les données à mettre à jour (exclure None)
    update_data = {k: v for k, v in user_update.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    # Mettre à jour l'utilisateur
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": update_data}
    )
    
    # Récupérer l'utilisateur mis à jour
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    logger.info(f"Profil mis à jour pour {user.get('email')}")
    
    return {"message": "Profil mis à jour avec succès", "user": serialize_doc(user)}


@router.post("/auth/change-password", response_model=MessageResponse, tags=["Authentification"],
    summary="Changer le mot de passe",
    description="Permet a l'utilisateur connecte de changer son mot de passe en fournissant l'ancien et le nouveau.",
    responses={**AUTH_ERRORS, 400: {"description": "Ancien mot de passe incorrect"}}
)
async def change_password(request: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """
    Changer le mot de passe de l'utilisateur connecté
    """
    user_id = current_user.get("id")
    
    # Vérifier l'ancien mot de passe
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    if not verify_password(request.old_password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mot de passe actuel incorrect"
        )
    
    # Hasher le nouveau mot de passe
    new_hashed_password = get_password_hash(request.new_password)
    
    # Mettre à jour le mot de passe
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"hashed_password": new_hashed_password}}
    )
    
    logger.info(f"Mot de passe changé pour {user.get('email')}")
    
    return {"message": "Mot de passe changé avec succès"}


