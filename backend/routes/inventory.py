"""
Routes de l'Inventaire - CRUD, Services
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import logging

from models import (
    ActionType, EntityType, MessageResponse,
    Inventory, InventoryCreate, InventoryUpdate,
    InventoryStatsResponse, ToggleMonitoringResponse
)
from dependencies import get_current_user, require_permission
from routes.shared import db, audit_service, serialize_doc, _get_realtime_manager

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Inventaire"])

@router.get("/inventory",
    summary="Lister l'inventaire", tags=["Inventaire"])
async def get_inventory(current_user: dict = Depends(get_current_user)):
    """Liste tous les articles de l'inventaire
    
    Note : Accessible à tous les utilisateurs authentifiés pour permettre
    la sélection de pièces dans les ordres de travail, même sans permission 'inventory'.
    """
    inventory = await db.inventory.find({}).to_list(1000)
    # Sérialiser chaque document pour convertir _id en id
    return [serialize_doc(item) for item in inventory]

@router.post("/inventory",
    summary="Ajouter un article", response_model=Inventory, tags=["Inventaire"])
async def create_inventory_item(inv_create: InventoryCreate, current_user: dict = Depends(require_permission("inventory", "edit"))):
    """Créer un nouvel article dans l'inventaire"""
    inv_dict = inv_create.model_dump()
    inv_dict["dateCreation"] = datetime.utcnow()
    inv_dict["derniereModification"] = datetime.utcnow()
    inv_dict["_id"] = ObjectId()
    
    await db.inventory.insert_one(inv_dict)
    
    inv_data = serialize_doc(inv_dict)
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "inventory",
        "created",
        inv_data,
        user_id=current_user.get("id")
    )
    
    return Inventory(**inv_data)

@router.put("/inventory/{inv_id}",
    summary="Modifier un article", response_model=Inventory, tags=["Inventaire"])
async def update_inventory_item(inv_id: str, inv_update: InventoryUpdate, current_user: dict = Depends(require_permission("inventory", "edit"))):
    """Modifier un article de l'inventaire"""
    try:
        # Récupérer l'article actuel pour vérifier la quantité avant modification
        current_item = await db.inventory.find_one({"_id": ObjectId(inv_id)})
        if not current_item:
            raise HTTPException(status_code=404, detail="Article non trouvé")
        
        old_quantity = current_item.get("quantite", 0)
        
        update_data = {k: v for k, v in inv_update.model_dump().items() if v is not None}
        update_data["derniereModification"] = datetime.utcnow()
        
        await db.inventory.update_one(
            {"_id": ObjectId(inv_id)},
            {"$set": update_data}
        )
        
        inv = await db.inventory.find_one({"_id": ObjectId(inv_id)})
        inv_data = serialize_doc(inv)
        
        # Vérifier si la quantité est passée à 0
        new_quantity = inv_data.get("quantite", 0)
        if new_quantity == 0 and old_quantity > 0:
            # Créer automatiquement une demande d'achat
            await create_auto_purchase_request(inv_data, current_user)
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await _get_realtime_manager().emit_event(
            "inventory",
            "updated",
            inv_data,
            user_id=current_user.get("id")
        )
        
        return Inventory(**inv_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


async def create_auto_purchase_request(inventory_item: dict, current_user: dict):
    """Créer automatiquement une demande d'achat pour un article en rupture de stock"""
    try:
        from models import PurchaseRequest, PurchaseRequestType, PurchaseRequestUrgency, PurchaseRequestStatus, PurchaseRequestHistoryEntry
        
        # Générer un numéro unique pour la demande
        year = datetime.utcnow().year
        count = await db.purchase_requests.count_documents({
            "numero": {"$regex": f"^DA-{year}-"}
        })
        numero = f"DA-{year}-{str(count + 1).zfill(5)}"
        
        # Créer la demande d'achat avec le modèle Pydantic (génère automatiquement l'UUID)
        purchase_request = PurchaseRequest(
            numero=numero,
            type=PurchaseRequestType.CONSOMMABLE,
            designation=inventory_item.get("nom", "Article inconnu"),
            description=f"Demande automatique - Rupture de stock détectée pour l'article '{inventory_item.get('nom')}'",
            quantite=inventory_item.get("quantiteMin", 10),  # Commander au moins le seuil minimum
            unite="Unité",
            reference=inventory_item.get("reference", ""),
            fournisseur_suggere=inventory_item.get("fournisseur", ""),
            urgence=PurchaseRequestUrgency.URGENT,
            justification=f"Rupture de stock automatiquement détectée. L'article '{inventory_item.get('nom')}' (Réf: {inventory_item.get('reference', 'N/A')}) a atteint une quantité de 0. Emplacement: {inventory_item.get('emplacement', 'N/A')}",
            destinataire_id=None,
            destinataire_nom="Service Maintenance",
            inventory_item_id=inventory_item.get("id"),
            attached_files=[],
            demandeur_id="SYSTEM",
            demandeur_nom="Système automatique",
            demandeur_email="system@gmao.local",
            status=PurchaseRequestStatus.SOUMISE,
            responsable_n1_id=None,
            responsable_n1_nom=None,
            history=[
                PurchaseRequestHistoryEntry(
                    user_id="SYSTEM",
                    user_name="Système automatique",
                    action="Création automatique - Rupture de stock",
                    new_status=PurchaseRequestStatus.SOUMISE.value,
                    comment=f"Article '{inventory_item.get('nom')}' en rupture de stock"
                )
            ]
        )
        
        # Sauvegarder dans la DB
        await db.purchase_requests.insert_one(purchase_request.model_dump())
        
        # Broadcast WebSocket pour notifier
        await _get_realtime_manager().emit_event(
            "purchase_requests",
            "created",
            purchase_request.model_dump(),
            user_id=current_user.get("id")
        )
        
        logger.info(f"Demande d'achat automatique créée: {numero} pour article {inventory_item.get('nom')}")
        
    except Exception as e:
        logger.error(f"Erreur création demande d'achat automatique: {e}")
        import traceback
        logger.error(traceback.format_exc())


@router.delete("/inventory/{inv_id}", response_model=MessageResponse,
    summary="Supprimer un article", tags=["Inventaire"])
async def delete_inventory_item(inv_id: str, current_user: dict = Depends(require_permission("inventory", "delete"))):
    """Supprimer un article de l'inventaire"""
    try:
        # Récupérer l'article avant suppression pour le broadcast
        item = await db.inventory.find_one({"_id": ObjectId(inv_id)})
        item_name = item.get("nom", "Inconnu") if item else "Inconnu"
        
        result = await db.inventory.delete_one({"_id": ObjectId(inv_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Article non trouvé")
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await _get_realtime_manager().emit_event(
            "inventory",
            "deleted",
            {"id": inv_id, "nom": item_name},
            user_id=current_user.get("id")
        )
        
        return {"message": "Article supprimé"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/inventory/{inv_id}/toggle-monitoring",
    summary="Activer/desactiver la surveillance", response_model=ToggleMonitoringResponse, tags=["Inventaire"])
async def toggle_inventory_monitoring(inv_id: str, current_user: dict = Depends(require_permission("inventory", "edit"))):
    """Active/Désactive la surveillance du stock d'un article"""
    try:
        # Récupérer l'article actuel
        item = await db.inventory.find_one({"_id": ObjectId(inv_id)})
        if not item:
            raise HTTPException(status_code=404, detail="Article non trouvé")
        
        # Inverser le statut de surveillance (par défaut True si n'existe pas)
        current_monitoring = item.get("stock_monitoring_enabled", True)
        new_monitoring = not current_monitoring
        
        # Mettre à jour
        await db.inventory.update_one(
            {"_id": ObjectId(inv_id)},
            {
                "$set": {
                    "stock_monitoring_enabled": new_monitoring,
                    "derniere_modification": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        logger.info(f"📊 Surveillance stock {'activée' if new_monitoring else 'désactivée'} pour {item.get('nom', 'Article')}")
        
        return {
            "message": f"Surveillance {'activée' if new_monitoring else 'désactivée'}",
            "stock_monitoring_enabled": new_monitoring
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur toggle monitoring: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/inventory/stats",
    summary="Statistiques inventaire", response_model=InventoryStatsResponse, tags=["Inventaire"])
async def get_inventory_stats(current_user: dict = Depends(require_permission("inventory", "view"))):
    """Récupère les statistiques de l'inventaire (rupture et niveau bas)"""
    try:
        inventory = await db.inventory.find().to_list(1000)
        
        rupture = 0
        niveau_bas = 0
        
        for item in inventory:
            # Ignorer les articles dont la surveillance est désactivée
            if not item.get("stock_monitoring_enabled", True):
                continue
            
            quantite = item.get("quantite", 0)
            quantite_min = item.get("quantiteMin", item.get("seuil_alerte", 0))
            
            if quantite <= 0:
                rupture += 1
            elif quantite <= quantite_min:
                niveau_bas += 1
        
        return {
            "rupture": rupture,
            "niveau_bas": niveau_bas
        }
    except Exception as e:
        logging.error(f"Erreur lors du calcul des stats inventaire: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== Services d'inventaire (onglets par service) =====

@router.get("/inventory/services", tags=["Inventaire - Services"])
async def get_inventory_services(current_user: dict = Depends(get_current_user)):
    """Liste tous les services d'inventaire (onglets), synchronises avec les services des roles."""
    # Synchroniser avec la liste des services (meme source que Dashboard Service)
    try:
        from roles_routes import SERVICES as roles_services
        
        existing_names = set()
        existing_services = await db.inventory_services.find({}, {"_id": 0}).to_list(200)
        for svc in existing_services:
            existing_names.add(svc.get("name", "").upper())
        
        # Auto-creer les services manquants
        for role_svc in roles_services:
            if role_svc.upper() not in existing_names:
                new_svc = {
                    "id": str(uuid.uuid4()),
                    "name": role_svc,
                    "created_by": "system",
                    "created_by_name": "Synchronisation automatique",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.inventory_services.insert_one(new_svc)
        
        # Assurer "Non classe" existe
        if "NON CLASSÉ" not in existing_names and "NON CLASSE" not in existing_names:
            nc_doc = {
                "id": str(uuid.uuid4()),
                "name": "Non classé",
                "created_by": "system",
                "created_by_name": "Système",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.inventory_services.insert_one(nc_doc)
    except Exception as e:
        logger.warning(f"Erreur sync services inventaire: {e}")
    
    services = await db.inventory_services.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return services


@router.post("/inventory/services", tags=["Inventaire - Services"])
async def create_inventory_service(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Créer un nouvel onglet de service d'inventaire (Admin ou responsable de service)."""
    user_role = current_user.get("role", "")
    is_admin = user_role in ["ADMIN", "admin", "Administrateur"]
    
    # Vérifier si responsable de service
    is_manager = False
    try:
        from service_filter import is_service_manager
        is_manager = await is_service_manager(current_user)
    except Exception:
        pass
    
    if not is_admin and not is_manager:
        raise HTTPException(403, "Seuls les administrateurs et responsables de service peuvent créer des onglets")
    
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Le nom du service est requis")
    
    # Vérifier unicité
    existing = await db.inventory_services.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(400, f"Le service '{name}' existe déjà")
    
    service_doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "created_by": current_user.get("id"),
        "created_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.inventory_services.insert_one(service_doc)
    del service_doc["_id"]
    return service_doc


@router.delete("/inventory/services/{service_id}", tags=["Inventaire - Services"])
async def delete_inventory_service(
    service_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Supprimer un onglet de service d'inventaire. Les articles seront déplacés vers 'Non classé'."""
    user_role = current_user.get("role", "")
    is_admin = user_role in ["ADMIN", "admin", "Administrateur"]
    
    is_manager = False
    try:
        from service_filter import is_service_manager
        is_manager = await is_service_manager(current_user)
    except Exception:
        pass
    
    if not is_admin and not is_manager:
        raise HTTPException(403, "Seuls les administrateurs et responsables de service peuvent supprimer des onglets")
    
    service = await db.inventory_services.find_one({"id": service_id}, {"_id": 0})
    if not service:
        raise HTTPException(404, "Service introuvable")
    
    if service.get("name") == "Non classé":
        raise HTTPException(400, "Impossible de supprimer le service 'Non classé'")
    
    # Trouver le service "Non classé"
    non_classe = await db.inventory_services.find_one({"name": "Non classé"}, {"_id": 0})
    nc_id = non_classe["id"] if non_classe else None
    
    # Déplacer les articles vers "Non classé"
    if nc_id:
        await db.inventory.update_many(
            {"service_id": service_id},
            {"$set": {"service_id": nc_id}}
        )
        # Retirer ce service des articles partagés
        await db.inventory.update_many(
            {"shared_service_ids": service_id},
            {"$pull": {"shared_service_ids": service_id}}
        )
    
    await db.inventory_services.delete_one({"id": service_id})
    
    article_count = await db.inventory.count_documents({"service_id": nc_id}) if nc_id else 0
    return {"success": True, "message": "Service supprimé. Articles déplacés vers 'Non classé'.", "moved_count": article_count}


@router.post("/inventory/{inv_id}/share", tags=["Inventaire - Partage"])
async def share_inventory_item(
    inv_id: str,
    data: dict,
    current_user: dict = Depends(require_permission("inventory", "edit"))
):
    """Importer/partager un article dans un autre service (lien partagé, même stock)."""
    target_service_id = data.get("target_service_id")
    if not target_service_id:
        raise HTTPException(400, "target_service_id requis")
    
    # Vérifier que l'article existe
    item = await db.inventory.find_one({"_id": ObjectId(inv_id)})
    if not item:
        raise HTTPException(404, "Article introuvable")
    
    # Vérifier que le service cible existe
    target_service = await db.inventory_services.find_one({"id": target_service_id}, {"_id": 0})
    if not target_service:
        raise HTTPException(404, "Service cible introuvable")
    
    # Vérifier que ce n'est pas déjà partagé
    shared = item.get("shared_service_ids", [])
    if target_service_id in shared or item.get("service_id") == target_service_id:
        raise HTTPException(400, "Cet article est déjà dans ce service")
    
    await db.inventory.update_one(
        {"_id": ObjectId(inv_id)},
        {"$addToSet": {"shared_service_ids": target_service_id}}
    )
    
    updated = await db.inventory.find_one({"_id": ObjectId(inv_id)})
    return serialize_doc(updated)


@router.delete("/inventory/{inv_id}/unshare/{service_id}", tags=["Inventaire - Partage"])
async def unshare_inventory_item(
    inv_id: str,
    service_id: str,
    current_user: dict = Depends(require_permission("inventory", "edit"))
):
    """Retirer le partage d'un article d'un service."""
    item = await db.inventory.find_one({"_id": ObjectId(inv_id)})
    if not item:
        raise HTTPException(404, "Article introuvable")
    
    await db.inventory.update_one(
        {"_id": ObjectId(inv_id)},
        {"$pull": {"shared_service_ids": service_id}}
    )
    
    return {"success": True, "message": "Partage retiré"}


@router.get("/inventory/by-service/{service_id}", tags=["Inventaire - Services"])
async def get_inventory_by_service(
    service_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Liste les articles d'un service (propriétaires + partagés)."""
    items = await db.inventory.find(
        {"$or": [
            {"service_id": service_id},
            {"shared_service_ids": service_id}
        ]}
    ).to_list(1000)
    return [serialize_doc(item) for item in items]



