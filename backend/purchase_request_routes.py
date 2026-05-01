"""
Routes API pour les demandes d'achat
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Response
from fastapi.responses import HTMLResponse
from typing import List, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid
import logging
import os
from pathlib import Path

from models import (
    PurchaseRequest, PurchaseRequestCreate, PurchaseRequestUpdate,
    PurchaseRequestStatusUpdate, PurchaseRequestStatus, PurchaseRequestHistoryEntry,
    MessageResponse
)
from dependencies import get_current_user, get_database
from purchase_request_service import PurchaseRequestService
from realtime_manager import realtime_manager
from routes.shared import get_next_purchase_request_numero

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/purchase-requests", tags=["purchase-requests"])


@router.post("", response_model=dict)
async def create_purchase_request(
    request: PurchaseRequestCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Créer une nouvelle demande d'achat"""
    try:
        service = PurchaseRequestService(db)
        
        # Récupérer les infos du demandeur
        demandeur_nom = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        demandeur_email = current_user.get('email', '')
        
        # Récupérer le N+1 si existe
        responsable_n1_id = current_user.get('responsable_hierarchique_id')
        responsable_n1_nom = None
        
        if responsable_n1_id:
            n1_user = await db.users.find_one({"id": responsable_n1_id}, {"_id": 0})
            if n1_user:
                responsable_n1_nom = f"{n1_user.get('prenom', '')} {n1_user.get('nom', '')}"
        
        # Générer le numéro de demande (avec retry-on-conflict via shared.py)
        numero = await get_next_purchase_request_numero()
        
        # Créer la demande
        purchase_request = PurchaseRequest(
            **request.model_dump(),
            numero=numero,
            demandeur_id=current_user['id'],
            demandeur_nom=demandeur_nom,
            demandeur_email=demandeur_email,
            responsable_n1_id=responsable_n1_id,
            responsable_n1_nom=responsable_n1_nom,
            status=PurchaseRequestStatus.SOUMISE,
            history=[
                PurchaseRequestHistoryEntry(
                    user_id=current_user['id'],
                    user_name=demandeur_nom,
                    action="Création de la demande",
                    new_status=PurchaseRequestStatus.SOUMISE.value
                )
            ]
        )
        
        # Sauvegarder dans la DB
        await db.purchase_requests.insert_one(purchase_request.model_dump())
        
        # Envoyer l'email au N+1 si existe
        if responsable_n1_id and n1_user:
            await service.send_email_to_n1(purchase_request, n1_user)
        
        logger.info(f"✅ Demande d'achat {numero} créée par {demandeur_nom}")
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await realtime_manager.emit_event(
            "purchase_requests",
            "created",
            purchase_request.model_dump(),
            user_id=current_user['id']
        )
        
        return {
            "message": "Demande d'achat créée avec succès",
            "id": purchase_request.id,
            "numero": purchase_request.numero
        }
        
    except Exception as e:
        logger.error(f"❌ Erreur création demande d'achat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[dict])
async def get_purchase_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Récupérer les demandes d'achat (exclut les archivées)"""
    try:
        # Exclure les demandes archivées par défaut
        query = {"$or": [{"archived": False}, {"archived": {"$exists": False}}]}
        
        # Si pas admin, ne voir que ses propres demandes ou celles dont on est N+1
        if current_user.get('role') != 'ADMIN':
            query = {
                "$and": [
                    {"$or": [{"archived": False}, {"archived": {"$exists": False}}]},
                    {"$or": [
                        {"demandeur_id": current_user['id']},
                        {"responsable_n1_id": current_user['id']}
                    ]}
                ]
            }
        
        # Filtrer par statut si demandé
        if status:
            if "$and" in query:
                query["$and"].append({"status": status})
            else:
                query["status"] = status
        
        requests = await db.purchase_requests.find(query, {"_id": 0}).sort("date_creation", -1).to_list(1000)
        
        # Convertir les ObjectId en string pour éviter les erreurs de sérialisation
        for req in requests:
            for key, val in req.items():
                if hasattr(val, '__str__') and type(val).__name__ == 'ObjectId':
                    req[key] = str(val)
        
        return requests
        
    except Exception as e:
        logger.error(f"❌ Erreur récupération demandes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{request_id}", response_model=dict)
async def get_purchase_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Récupérer une demande d'achat par ID"""
    try:
        request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        
        if not request:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        
        # Convertir les ObjectId en string
        for key, val in request.items():
            if hasattr(val, '__str__') and type(val).__name__ == 'ObjectId':
                request[key] = str(val)
        
        # Vérifier les permissions
        if current_user.get('role') != 'ADMIN':
            if request['demandeur_id'] != current_user['id'] and request.get('responsable_n1_id') != current_user['id']:
                raise HTTPException(status_code=403, detail="Accès non autorisé")
        
        return request
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur récupération demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{request_id}/status", response_model=dict)
async def update_purchase_request_status(
    request_id: str,
    status_update: PurchaseRequestStatusUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Mettre à jour le statut d'une demande d'achat"""
    try:
        service = PurchaseRequestService(db)
        
        # Récupérer la demande
        request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        
        if not request:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        
        # Vérifier les permissions selon le statut
        old_status = request['status']
        new_status = status_update.status.value
        
        # Vérifier si l'utilisateur a la permission "achat"
        user_permissions = current_user.get('permissions', {})
        has_achat_permission = (
            current_user.get('role') == 'ADMIN' or
            (isinstance(user_permissions, dict) and 
             user_permissions.get('achat', {}).get('edit', False))
        )
        
        # Logique de validation selon le rôle et permissions
        if new_status in [PurchaseRequestStatus.VALIDEE_N1.value, PurchaseRequestStatus.REFUSEE_N1.value]:
            # Seul le N+1 ou un utilisateur avec permission achat peut valider/refuser N+1
            is_n1 = request.get('responsable_n1_id') == current_user['id']
            if not is_n1 and not has_achat_permission:
                raise HTTPException(status_code=403, detail="Seul le N+1 ou un utilisateur avec la permission Achat peut effectuer cette action")
        
        elif new_status in [PurchaseRequestStatus.APPROUVEE_ACHAT.value, PurchaseRequestStatus.REFUSEE_ACHAT.value,
                           PurchaseRequestStatus.ACHAT_EFFECTUE.value, PurchaseRequestStatus.RECEPTIONNEE.value,
                           PurchaseRequestStatus.DISTRIBUEE.value]:
            # Utilisateurs avec permission achat ou admin peuvent effectuer ces actions
            if not has_achat_permission:
                raise HTTPException(status_code=403, detail="Seuls les utilisateurs avec la permission Achat peuvent effectuer cette action")
        
        # Créer l'entrée d'historique
        user_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        history_entry = PurchaseRequestHistoryEntry(
            user_id=current_user['id'],
            user_name=user_name,
            action=f"Changement de statut: {old_status} → {new_status}",
            old_status=old_status,
            new_status=new_status,
            comment=status_update.comment
        )
        
        # Préparer les mises à jour
        update_data = {
            "status": new_status,
            "date_derniere_modification": datetime.now(timezone.utc).isoformat()
        }
        
        # Ajouter les dates selon le statut
        if new_status == PurchaseRequestStatus.VALIDEE_N1.value:
            update_data["date_validation_n1"] = datetime.now(timezone.utc).isoformat()
        elif new_status == PurchaseRequestStatus.APPROUVEE_ACHAT.value:
            update_data["date_approbation_achat"] = datetime.now(timezone.utc).isoformat()
        elif new_status == PurchaseRequestStatus.ACHAT_EFFECTUE.value:
            update_data["date_achat_effectue"] = datetime.now(timezone.utc).isoformat()
        elif new_status == PurchaseRequestStatus.RECEPTIONNEE.value:
            update_data["date_reception"] = datetime.now(timezone.utc).isoformat()
        elif new_status == PurchaseRequestStatus.DISTRIBUEE.value:
            update_data["date_distribution"] = datetime.now(timezone.utc).isoformat()
        
        # Mettre à jour dans la DB
        await db.purchase_requests.update_one(
            {"id": request_id},
            {
                "$set": update_data,
                "$push": {"history": history_entry.model_dump()}
            }
        )
        
        # Envoyer les emails selon le changement de statut
        await service.send_status_change_emails(request_id, old_status, new_status, current_user)
        
        logger.info(f"✅ Statut de la demande {request['numero']} changé: {old_status} → {new_status}")
        
        # Broadcast WebSocket pour la synchronisation temps réel
        updated_request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        await realtime_manager.emit_event(
            "purchase_requests",
            "status_changed",
            updated_request,
            user_id=current_user['id']
        )
        
        return {"message": "Statut mis à jour avec succès"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur mise à jour statut: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{request_id}", response_model=dict)
async def update_purchase_request(
    request_id: str,
    update: PurchaseRequestUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Mettre à jour une demande d'achat (seulement par l'admin)"""
    try:
        if current_user.get('role') != 'ADMIN':
            raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent modifier les demandes")
        
        request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        
        if not request:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        
        # Préparer les données de mise à jour
        update_data = {k: v for k, v in update.model_dump(exclude_unset=True).items() if v is not None}
        update_data["date_derniere_modification"] = datetime.now(timezone.utc).isoformat()
        
        # Ajouter à l'historique
        user_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        history_entry = PurchaseRequestHistoryEntry(
            user_id=current_user['id'],
            user_name=user_name,
            action="Modification de la demande",
            new_status=request['status']
        )
        
        await db.purchase_requests.update_one(
            {"id": request_id},
            {
                "$set": update_data,
                "$push": {"history": history_entry.model_dump()}
            }
        )
        
        logger.info(f"✅ Demande {request['numero']} modifiée par {user_name}")
        
        # Broadcast WebSocket pour la synchronisation temps réel
        updated_request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        await realtime_manager.emit_event(
            "purchase_requests",
            "updated",
            updated_request,
            user_id=current_user['id']
        )
        
        return {"message": "Demande mise à jour avec succès"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur mise à jour demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{request_id}", response_model=MessageResponse)
async def delete_purchase_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Supprimer une demande d'achat (seulement par l'admin)"""
    try:
        if current_user.get('role') != 'ADMIN':
            raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent supprimer les demandes")
        
        request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        
        if not request:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        
        await db.purchase_requests.delete_one({"id": request_id})
        
        logger.info(f"✅ Demande {request['numero']} supprimée")
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await realtime_manager.emit_event(
            "purchase_requests",
            "deleted",
            {"id": request_id, "numero": request['numero']},
            user_id=current_user['id']
        )
        
        return {"message": "Demande supprimée avec succès"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur suppression demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/approve/{token}", response_class=Response)
async def approve_via_token(
    token: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Approuver une demande via le token dans l'email"""
    try:
        # Vérifier le token
        token_data = await db.approval_tokens.find_one({"token": token, "used": False}, {"_id": 0})
        
        if not token_data:
            return Response(
                content="<html><body><h1>Lien invalide ou expiré</h1><p>Ce lien n'est plus valide.</p></body></html>",
                media_type="text/html",
                status_code=400
            )
        
        # Vérifier l'expiration
        expiration = datetime.fromisoformat(token_data['expiration'])
        if datetime.now(timezone.utc) > expiration:
            return Response(
                content="<html><body><h1>Lien expiré</h1><p>Ce lien a expiré.</p></body></html>",
                media_type="text/html",
                status_code=400
            )
        
        # Récupérer la demande
        request = await db.purchase_requests.find_one({"id": token_data['request_id']}, {"_id": 0})
        
        if not request:
            return Response(
                content="<html><body><h1>Demande introuvable</h1></body></html>",
                media_type="text/html",
                status_code=404
            )
        
        # Récupérer l'utilisateur
        user = await db.users.find_one({"id": token_data['user_id']}, {"_id": 0})
        
        if not user:
            return Response(
                content="<html><body><h1>Utilisateur introuvable</h1></body></html>",
                media_type="text/html",
                status_code=404
            )
        
        # Déterminer le nouveau statut selon l'action
        action = token_data['action']
        if action == "approve_n1":
            new_status = PurchaseRequestStatus.VALIDEE_N1.value
            action_label = "validée par le N+1"
        elif action == "approve_achat":
            new_status = PurchaseRequestStatus.APPROUVEE_ACHAT.value
            action_label = "approuvée par le service achat"
        else:
            return Response(
                content="<html><body><h1>Action invalide</h1></body></html>",
                media_type="text/html",
                status_code=400
            )
        
        # Mettre à jour le statut
        user_name = f"{user.get('prenom', '')} {user.get('nom', '')}"
        history_entry = PurchaseRequestHistoryEntry(
            user_id=user['id'],
            user_name=user_name,
            action=f"Approbation via email: {request['status']} → {new_status}",
            old_status=request['status'],
            new_status=new_status
        )
        
        update_data = {
            "status": new_status,
            "date_derniere_modification": datetime.now(timezone.utc).isoformat()
        }
        
        if new_status == PurchaseRequestStatus.VALIDEE_N1.value:
            update_data["date_validation_n1"] = datetime.now(timezone.utc).isoformat()
        elif new_status == PurchaseRequestStatus.APPROUVEE_ACHAT.value:
            update_data["date_approbation_achat"] = datetime.now(timezone.utc).isoformat()
        
        await db.purchase_requests.update_one(
            {"id": request['id']},
            {
                "$set": update_data,
                "$push": {"history": history_entry.model_dump()}
            }
        )
        
        # Marquer le token comme utilisé
        await db.approval_tokens.update_one(
            {"token": token},
            {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        # Envoyer les emails de notification
        service = PurchaseRequestService(db)
        await service.send_status_change_emails(request['id'], request['status'], new_status, user)
        
        logger.info(f"✅ Demande {request['numero']} {action_label} via email par {user_name}")
        
        return Response(
            content=f"""
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; text-align: center; padding: 50px; }}
                    .success {{ color: #4caf50; font-size: 24px; margin-bottom: 20px; }}
                    .info {{ color: #666; }}
                </style>
            </head>
            <body>
                <div class="success">✓ Demande approuvée avec succès</div>
                <p class="info">Demande n°{request['numero']} {action_label}</p>
                <p class="info">Le demandeur a été notifié par email.</p>
            </body>
            </html>
            """,
            media_type="text/html"
        )
        
    except Exception as e:
        logger.error(f"❌ Erreur approbation via token: {str(e)}")
        return Response(
            content=f"<html><body><h1>Erreur</h1><p>{str(e)}</p></body></html>",
            media_type="text/html",
            status_code=500
        )


@router.get("/reject/{token}", response_class=Response)
async def reject_via_token(
    token: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Refuser une demande via le token dans l'email"""
    try:
        # Vérifier le token
        token_data = await db.approval_tokens.find_one({"token": token, "used": False}, {"_id": 0})
        
        if not token_data:
            return Response(
                content="<html><body><h1>Lien invalide ou expiré</h1><p>Ce lien n'est plus valide.</p></body></html>",
                media_type="text/html",
                status_code=400
            )
        
        # Vérifier l'expiration
        expiration = datetime.fromisoformat(token_data['expiration'])
        if datetime.now(timezone.utc) > expiration:
            return Response(
                content="<html><body><h1>Lien expiré</h1><p>Ce lien a expiré.</p></body></html>",
                media_type="text/html",
                status_code=400
            )
        
        # Récupérer la demande
        request = await db.purchase_requests.find_one({"id": token_data['request_id']}, {"_id": 0})
        
        if not request:
            return Response(
                content="<html><body><h1>Demande introuvable</h1></body></html>",
                media_type="text/html",
                status_code=404
            )
        
        # Récupérer l'utilisateur
        user = await db.users.find_one({"id": token_data['user_id']}, {"_id": 0})
        
        if not user:
            return Response(
                content="<html><body><h1>Utilisateur introuvable</h1></body></html>",
                media_type="text/html",
                status_code=404
            )
        
        # Déterminer le nouveau statut selon l'action
        action = token_data['action']
        if action == "reject_n1":
            new_status = PurchaseRequestStatus.REFUSEE_N1.value
            action_label = "refusée par le N+1"
        elif action == "reject_achat":
            new_status = PurchaseRequestStatus.REFUSEE_ACHAT.value
            action_label = "refusée par le service achat"
        else:
            return Response(
                content="<html><body><h1>Action invalide</h1></body></html>",
                media_type="text/html",
                status_code=400
            )
        
        # Mettre à jour le statut
        user_name = f"{user.get('prenom', '')} {user.get('nom', '')}"
        history_entry = PurchaseRequestHistoryEntry(
            user_id=user['id'],
            user_name=user_name,
            action=f"Refus via email: {request['status']} → {new_status}",
            old_status=request['status'],
            new_status=new_status
        )
        
        await db.purchase_requests.update_one(
            {"id": request['id']},
            {
                "$set": {
                    "status": new_status,
                    "date_derniere_modification": datetime.now(timezone.utc).isoformat()
                },
                "$push": {"history": history_entry.model_dump()}
            }
        )
        
        # Marquer le token comme utilisé
        await db.approval_tokens.update_one(
            {"token": token},
            {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        # Envoyer les emails de notification
        service = PurchaseRequestService(db)
        await service.send_status_change_emails(request['id'], request['status'], new_status, user)
        
        logger.info(f"✅ Demande {request['numero']} {action_label} via email par {user_name}")
        
        return Response(
            content=f"""
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; text-align: center; padding: 50px; }}
                    .warning {{ color: #f44336; font-size: 24px; margin-bottom: 20px; }}
                    .info {{ color: #666; }}
                </style>
            </head>
            <body>
                <div class="warning">✗ Demande refusée</div>
                <p class="info">Demande n°{request['numero']} {action_label}</p>
                <p class="info">Le demandeur a été notifié par email.</p>
            </body>
            </html>
            """,
            media_type="text/html"
        )
        
    except Exception as e:
        logger.error(f"❌ Erreur refus via token: {str(e)}")
        return Response(
            content=f"<html><body><h1>Erreur</h1><p>{str(e)}</p></body></html>",
            media_type="text/html",
            status_code=500
        )



@router.get("/users-list", response_model=List[dict])
async def get_users_for_purchase_requests(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Récupérer la liste des utilisateurs pour le formulaire de demande d'achat"""
    try:
        users = await db.users.find(
            {},
            {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "email": 1, "role": 1}
        ).to_list(1000)
        
        # Formater pour le frontend
        formatted_users = [
            {
                "id": u["id"],
                "name": f"{u.get('prenom', '')} {u.get('nom', '')}",
                "email": u.get("email", ""),
                "role": u.get("role", "")
            }
            for u in users
        ]
        
        return formatted_users
        
    except Exception as e:
        logger.error(f"❌ Erreur récupération utilisateurs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{request_id}/add-to-inventory", response_model=dict)
async def add_to_inventory(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Ajouter l'article de la demande à l'inventaire"""
    try:
        # Vérifier que l'utilisateur est admin
        if current_user.get('role') != 'ADMIN':
            raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent ajouter à l'inventaire")
        
        # Récupérer la demande
        request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        
        if not request:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        
        # Vérifier que le statut est DISTRIBUEE
        if request['status'] != 'DISTRIBUEE':
            raise HTTPException(status_code=400, detail="La demande doit être distribuée pour être ajoutée à l'inventaire")
        
        # Vérifier si déjà ajoutée
        if request.get('added_to_inventory'):
            raise HTTPException(status_code=400, detail="Cette demande a déjà été ajoutée à l'inventaire")
        
        # Chercher des articles similaires dans l'inventaire par désignation
        designation_lower = request['designation'].lower()
        similar_items = await db.inventory.find({}, {"_id": 0}).to_list(1000)
        
        matches = []
        for item in similar_items:
            item_name_lower = item.get('nom', '').lower()
            # Recherche exacte
            if item_name_lower == designation_lower:
                matches.append({**item, 'match_type': 'exact'})
            # Recherche partielle (contient)
            elif designation_lower in item_name_lower or item_name_lower in designation_lower:
                matches.append({**item, 'match_type': 'partial'})
        
        # Si des doublons potentiels sont trouvés, retourner la liste pour que l'utilisateur choisisse
        if matches:
            return {
                "has_duplicates": True,
                "matches": matches[:5],  # Limiter à 5 résultats
                "request_data": {
                    "designation": request['designation'],
                    "quantite": request['quantite'],
                    "unite": request['unite'],
                    "reference": request.get('reference'),
                    "type": request['type']
                }
            }
        
        # Sinon, créer un nouvel article dans l'inventaire
        new_item = {
            "id": str(uuid.uuid4()),
            "nom": request['designation'],
            "reference": request.get('reference', ''),
            "quantite": request['quantite'],
            "unite": request['unite'],
            "categorie": "autre",  # Catégorie par défaut
            "emplacement": "",
            "seuil_alerte": 10,
            "prix_unitaire": 0,
            "fournisseur": request.get('fournisseur_suggere', ''),
            "date_ajout": datetime.now(timezone.utc).isoformat(),
            "derniere_modification": datetime.now(timezone.utc).isoformat(),
            "notes": f"Ajouté depuis la demande d'achat {request['numero']}"
        }
        
        await db.inventory.insert_one(new_item)
        
        # Mettre à jour la demande
        user_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        await db.purchase_requests.update_one(
            {"id": request_id},
            {
                "$set": {
                    "added_to_inventory": True,
                    "inventory_added_by": user_name,
                    "inventory_added_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        logger.info(f"✅ Article de la demande {request['numero']} ajouté à l'inventaire")
        
        return {
            "success": True,
            "message": "Article ajouté à l'inventaire avec succès",
            "inventory_item_id": new_item['id']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur ajout à l'inventaire: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{request_id}/add-to-existing-inventory", response_model=dict)
async def add_to_existing_inventory(
    request_id: str,
    inventory_item_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Ajouter la quantité à un article existant de l'inventaire"""
    try:
        if current_user.get('role') != 'ADMIN':
            raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent ajouter à l'inventaire")
        
        # Récupérer la demande
        request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        if not request:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        
        # Récupérer l'article d'inventaire
        inventory_item = await db.inventory.find_one({"id": inventory_item_id}, {"_id": 0})
        if not inventory_item:
            raise HTTPException(status_code=404, detail="Article d'inventaire introuvable")
        
        # Ajouter la quantité
        new_quantity = inventory_item['quantite'] + request['quantite']
        
        await db.inventory.update_one(
            {"id": inventory_item_id},
            {
                "$set": {
                    "quantite": new_quantity,
                    "derniere_modification": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        # Mettre à jour la demande
        user_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        await db.purchase_requests.update_one(
            {"id": request_id},
            {
                "$set": {
                    "added_to_inventory": True,
                    "inventory_added_by": user_name,
                    "inventory_added_at": datetime.now(timezone.utc).isoformat(),
                    "inventory_item_id": inventory_item_id
                }
            }
        )
        
        logger.info(f"✅ Quantité de la demande {request['numero']} ajoutée à l'article existant {inventory_item['nom']}")
        
        return {
            "success": True,
            "message": f"Quantité ajoutée à l'article existant. Nouveau stock: {new_quantity}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur ajout à l'inventaire existant: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vendors-list", response_model=List[str])
async def get_vendors_list(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Récupérer la liste des fournisseurs pour autocomplete"""
    try:
        vendors = await db.vendors.find({}, {"_id": 0, "nom": 1}).to_list(1000)
        vendor_names = [v.get('nom') for v in vendors if v.get('nom')]
        return vendor_names
    except Exception as e:
        logger.error(f"❌ Erreur récupération fournisseurs: {str(e)}")
        return []


# ==================== ARCHIVAGE DES DEMANDES D'ACHAT ====================

@router.post("/{request_id}/archive", response_model=dict)
async def archive_purchase_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Archiver une demande d'achat (Administrateurs uniquement)"""
    try:
        # Vérifier que l'utilisateur est admin
        if current_user.get('role') != 'ADMIN':
            raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent archiver les demandes")
        
        # Vérifier que la demande existe
        request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        if not request:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        
        # Archiver la demande
        archive_data = {
            "archived": True,
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "archived_by": current_user.get('id'),
            "archived_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        }
        
        await db.purchase_requests.update_one(
            {"id": request_id},
            {"$set": archive_data}
        )
        
        # Ajouter à l'historique
        history_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user.get('id'),
            "user_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
            "action": "Archivage de la demande",
            "old_status": request.get('status'),
            "new_status": request.get('status'),
            "comment": "Demande archivée par un administrateur"
        }
        
        await db.purchase_requests.update_one(
            {"id": request_id},
            {"$push": {"history": history_entry}}
        )
        
        logger.info(f"✅ Demande {request.get('numero')} archivée par {current_user.get('email')}")
        
        return {"message": "Demande archivée avec succès", "id": request_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur archivage demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{request_id}/unarchive", response_model=dict)
async def unarchive_purchase_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Désarchiver une demande d'achat (Administrateurs uniquement)"""
    try:
        # Vérifier que l'utilisateur est admin
        if current_user.get('role') != 'ADMIN':
            raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent désarchiver les demandes")
        
        # Vérifier que la demande existe
        request = await db.purchase_requests.find_one({"id": request_id}, {"_id": 0})
        if not request:
            raise HTTPException(status_code=404, detail="Demande introuvable")
        
        # Désarchiver la demande
        await db.purchase_requests.update_one(
            {"id": request_id},
            {
                "$set": {
                    "archived": False,
                    "archived_at": None,
                    "archived_by": None,
                    "archived_by_name": None
                }
            }
        )
        
        # Ajouter à l'historique
        history_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user.get('id'),
            "user_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
            "action": "Désarchivage de la demande",
            "old_status": request.get('status'),
            "new_status": request.get('status'),
            "comment": "Demande désarchivée par un administrateur"
        }
        
        await db.purchase_requests.update_one(
            {"id": request_id},
            {"$push": {"history": history_entry}}
        )
        
        logger.info(f"✅ Demande {request.get('numero')} désarchivée par {current_user.get('email')}")
        
        return {"message": "Demande désarchivée avec succès", "id": request_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur désarchivage demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/archived/list", response_model=List[dict])
async def get_archived_purchase_requests(
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    demandeur: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Récupérer les demandes d'achat archivées avec filtres - accessible à tous les utilisateurs"""
    try:
        # Construire la requête
        query = {"archived": True}
        
        # Filtres
        if search:
            query["$or"] = [
                {"numero": {"$regex": search, "$options": "i"}},
                {"designation": {"$regex": search, "$options": "i"}},
                {"demandeur_nom": {"$regex": search, "$options": "i"}},
                {"reference": {"$regex": search, "$options": "i"}}
            ]
        
        if date_from:
            query["date_creation"] = {"$gte": date_from}
        
        if date_to:
            if "date_creation" in query:
                query["date_creation"]["$lte"] = date_to
            else:
                query["date_creation"] = {"$lte": date_to}
        
        if status:
            query["status"] = status
        
        if demandeur:
            query["demandeur_nom"] = {"$regex": demandeur, "$options": "i"}
        
        requests = await db.purchase_requests.find(query, {"_id": 0}).sort("archived_at", -1).to_list(1000)
        
        return requests
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur récupération archives: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

