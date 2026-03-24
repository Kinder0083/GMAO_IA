"""
Routes des Équipements - CRUD, Status, Hiérarchie
Extrait de server.py pour une meilleure maintenabilité.
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
import logging
import asyncio

from models import (
    Equipment, EquipmentCreate, EquipmentUpdate, EquipmentStatus,
    MessageResponse, ActionType, EntityType
)
from dependencies import get_current_user, require_permission
from routes.shared import db, audit_service, serialize_doc, get_equipment_by_id, get_location_by_id, NOT_DELETED

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)


def _get_realtime_manager():
    """Import lazy pour éviter les imports circulaires."""
    from realtime_manager import realtime_manager
    return realtime_manager


async def _get_equipment_by_id(equipment_id: str):
    """Get equipment details by ID"""
    try:
        equipment = await db.equipments.find_one({"_id": ObjectId(equipment_id)})
        if equipment:
            return {"id": str(equipment["_id"]), "nom": equipment.get("nom")}
    except Exception:
        return None

router = APIRouter(tags=["Equipements"])

@router.get("/equipments",
    summary="Lister les equipements", tags=["Equipements"])
async def get_equipments(
    current_user: dict = Depends(get_current_user),
    parents_only: bool = False
):
    """Liste tous les équipements visibles par l'utilisateur authentifie.
    
    Note : Pas de filtrage par service - seules les permissions du profil
    utilisateur determinent l'acces. Accessible a tous les utilisateurs 
    authentifies pour permettre la selection d'equipements dans les OT.
    """
    query = {**NOT_DELETED}
    
    if parents_only:
        query["$or"] = [{"parent_id": None}, {"parent_id": {"$exists": False}}]
        query["nom"] = {"$exists": True, "$nin": [None, ""]}
    
    limit = None if parents_only else 1000
    equipments = await db.equipments.find(query).sort("display_order", 1).to_list(limit)
    
    result = []
    for eq in equipments:
        eq = serialize_doc(eq)
        
        # Convertir parent_id en string
        if eq.get("parent_id") and not isinstance(eq["parent_id"], str):
            eq["parent_id"] = str(eq["parent_id"])
        
        # Convertir emplacement_id en string
        if eq.get("emplacement_id") and not isinstance(eq["emplacement_id"], str):
            eq["emplacement_id"] = str(eq["emplacement_id"])
        
        if eq.get("emplacement_id"):
            eq["emplacement"] = await get_location_by_id(eq["emplacement_id"])
        
        if eq.get("parent_id"):
            eq["parent"] = await get_equipment_by_id(eq["parent_id"])
        
        # Vérifier si l'équipement a des enfants
        try:
            children_count = await db.equipments.count_documents({
                "$or": [
                    {"parent_id": eq["id"]},
                    {"parent_id": ObjectId(eq["id"])}
                ]
            })
            eq["hasChildren"] = children_count > 0
        except Exception:
            eq["hasChildren"] = False
        
        result.append(eq)
    
    return result


@router.put("/equipments/reorder",
    summary="Reordonner les equipements", tags=["Equipements"])
async def reorder_equipments(
    items: List[dict],
    current_user: dict = Depends(require_permission("assets", "edit"))
):
    """Mettre à jour l'ordre d'affichage des équipements (admin uniquement)"""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent réorganiser les équipements")
    
    for item in items:
        eq_id = item.get("id")
        order = item.get("display_order", 0)
        if eq_id:
            await db.equipments.update_one(
                {"_id": ObjectId(eq_id)},
                {"$set": {"display_order": order}}
            )
    
    return {"message": "Ordre mis à jour", "count": len(items)}


@router.post("/equipments",
    summary="Creer un equipement", response_model=Equipment, tags=["Equipements"])
async def create_equipment(eq_create: EquipmentCreate, current_user: dict = Depends(require_permission("assets", "edit"))):
    """Créer un nouvel équipement"""
    eq_dict = eq_create.model_dump()
    
    # Si un parent est spécifié et qu'aucun emplacement n'est fourni, hériter de l'emplacement du parent
    if eq_dict.get("parent_id"):
        parent = await db.equipments.find_one({"_id": ObjectId(eq_dict["parent_id"])})
        if parent:
            # Hériter de l'emplacement du parent
            if not eq_dict.get("emplacement_id"):
                eq_dict["emplacement_id"] = parent.get("emplacement_id")
        else:
            raise HTTPException(status_code=404, detail="Équipement parent non trouvé")
    
    # Vérifier qu'on a un emplacement_id valide après héritage
    if not eq_dict.get("emplacement_id"):
        raise HTTPException(status_code=400, detail="Un emplacement est requis (directement ou hérité du parent)")
    
    eq_dict["dateCreation"] = datetime.utcnow()
    eq_dict["derniereMaintenance"] = None
    eq_dict["createdBy"] = current_user.get("id")  # Ajouter le créateur
    eq_dict["_id"] = ObjectId()
    
    await db.equipments.insert_one(eq_dict)
    
    eq = serialize_doc(eq_dict)
    if eq.get("emplacement_id"):
        eq["emplacement"] = await get_location_by_id(eq["emplacement_id"])
    
    if eq.get("parent_id"):
        eq["parent"] = await get_equipment_by_id(eq["parent_id"])
    
    eq["hasChildren"] = False
    
    # Broadcast WebSocket pour la synchronisation temps réel
    await _get_realtime_manager().emit_event(
        "equipments",
        "created",
        eq,
        user_id=current_user.get("id")
    )
    
    return Equipment(**eq)

@router.get("/equipments/status-history",
    summary="Historique des statuts", tags=["Equipements"])
async def get_equipment_status_history(
    equipment_ids: Optional[str] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    current_user: dict = Depends(require_permission("assets", "view"))
):
    """Récupérer l'historique des statuts des équipements pour le Planning M.Prev"""
    try:
        query = {}
        
        # Filtrer par équipements si spécifié
        if equipment_ids:
            ids_list = equipment_ids.split(",")
            query["equipment_id"] = {"$in": ids_list}
        
        # Filtrer par date si spécifié
        if date_debut or date_fin:
            query["changed_at"] = {}
            if date_debut:
                query["changed_at"]["$gte"] = datetime.fromisoformat(date_debut.replace('Z', '+00:00'))
            if date_fin:
                query["changed_at"]["$lte"] = datetime.fromisoformat(date_fin.replace('Z', '+00:00'))
        
        # Récupérer l'historique trié par date
        history = await db.equipment_status_history.find(query).sort("changed_at", 1).to_list(10000)
        
        # Sérialiser les documents
        result = []
        for entry in history:
            entry["id"] = str(entry["_id"])
            del entry["_id"]
            # Convertir datetime en ISO string
            if isinstance(entry.get("changed_at"), datetime):
                entry["changed_at"] = entry["changed_at"].isoformat()
            result.append(entry)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/equipments/{eq_id}",
    summary="Detail d'un equipement", tags=["Equipements"])
async def get_equipment_detail(eq_id: str, current_user: dict = Depends(require_permission("assets", "view"))):
    """Récupérer les détails d'un équipement"""
    try:
        eq = await db.equipments.find_one({"_id": ObjectId(eq_id)})
        if not eq:
            raise HTTPException(status_code=404, detail="Équipement non trouvé")
        
        eq = serialize_doc(eq)
        
        if eq.get("emplacement_id"):
            eq["emplacement"] = await get_location_by_id(eq["emplacement_id"])
        
        if eq.get("parent_id"):
            eq["parent_id"] = str(eq["parent_id"])
            eq["parent"] = await get_equipment_by_id(eq["parent_id"])
        
        if eq.get("emplacement_id"):
            eq["emplacement_id"] = str(eq["emplacement_id"])
        
        # Vérifier si l'équipement a des enfants
        children_count = await db.equipments.count_documents({
            "$or": [
                {"parent_id": eq["id"]},
                {"parent_id": ObjectId(eq["id"])}
            ]
        })
        eq["hasChildren"] = children_count > 0
        
        try:
            return Equipment(**eq)
        except Exception:
            return eq
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/equipments/{eq_id}/children",
    summary="Sous-equipements", tags=["Equipements"])
async def get_equipment_children(eq_id: str, current_user: dict = Depends(require_permission("assets", "view"))):
    """Récupérer tous les sous-équipements d'un équipement"""
    try:
        # Vérifier que le parent existe
        parent = await db.equipments.find_one({"_id": ObjectId(eq_id)})
        if not parent:
            raise HTTPException(status_code=404, detail="Équipement parent non trouvé")
        
        # Récupérer tous les enfants (parent_id peut être string ou ObjectId)
        children = await db.equipments.find({
            "$or": [
                {"parent_id": eq_id},
                {"parent_id": ObjectId(eq_id)}
            ]
        }).to_list(1000)
        
        result = []
        for child in children:
            child = serialize_doc(child)
            
            if child.get("emplacement_id"):
                child["emplacement_id"] = str(child["emplacement_id"])
                child["emplacement"] = await get_location_by_id(child["emplacement_id"])
            
            if child.get("parent_id"):
                child["parent_id"] = str(child["parent_id"])
                child["parent"] = await get_equipment_by_id(child["parent_id"])
            
            # Vérifier si cet enfant a lui-même des enfants
            grandchildren_count = await db.equipments.count_documents({
                "$or": [
                    {"parent_id": child["id"]},
                    {"parent_id": ObjectId(child["id"])}
                ]
            })
            child["hasChildren"] = grandchildren_count > 0
            
            try:
                result.append(Equipment(**child))
            except Exception:
                result.append(child)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/equipments/{eq_id}/hierarchy",
    summary="Hierarchie complete", tags=["Equipements"])
async def get_equipment_hierarchy(eq_id: str, current_user: dict = Depends(require_permission("assets", "view"))):
    """Récupérer toute la hiérarchie d'un équipement (récursif)"""
    try:
        async def build_hierarchy(equipment_id: str):
            eq = await db.equipments.find_one({"_id": ObjectId(equipment_id)})
            if not eq:
                return None
            
            eq = serialize_doc(eq)
            
            if eq.get("emplacement_id"):
                eq["emplacement"] = await get_location_by_id(eq["emplacement_id"])
            
            # Récupérer les enfants
            children = await db.equipments.find({"parent_id": eq["id"]}).to_list(1000)
            eq["children"] = []
            
            for child in children:
                child_hierarchy = await build_hierarchy(str(child["_id"]))
                if child_hierarchy:
                    eq["children"].append(child_hierarchy)
            
            eq["hasChildren"] = len(eq["children"]) > 0
            
            return eq
        
        hierarchy = await build_hierarchy(eq_id)
        if not hierarchy:
            raise HTTPException(status_code=404, detail="Équipement non trouvé")
        
        return hierarchy
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/equipments/{eq_id}",
    summary="Modifier un equipement", response_model=Equipment, tags=["Equipements"])
async def update_equipment(eq_id: str, eq_update: EquipmentUpdate, current_user: dict = Depends(require_permission("assets", "edit"))):
    """Modifier un équipement"""
    from dependencies import can_edit_resource
    
    try:
        # Récupérer l'équipement existant
        existing_eq = await db.equipments.find_one({"_id": ObjectId(eq_id)})
        if not existing_eq:
            raise HTTPException(status_code=404, detail="Équipement non trouvé")
        
        existing_eq["id"] = str(existing_eq["_id"])
        
        # Vérifier les permissions (sauf admin, seulement le créateur peut modifier)
        if not can_edit_resource(current_user, existing_eq):
            raise HTTPException(
                status_code=403,
                detail="Vous ne pouvez modifier que les équipements que vous avez créés"
            )
        
        update_data = {k: v for k, v in eq_update.model_dump().items() if v is not None}
        
        # Si le statut change, enregistrer dans l'historique et le journal
        old_statut = existing_eq.get("statut")
        if "statut" in update_data and old_statut != update_data["statut"]:
            now = datetime.now(timezone.utc)
            # Arrondir à l'heure inférieure (supprimer minutes, secondes, microsecondes)
            rounded_hour = now.replace(minute=0, second=0, microsecond=0)
            update_data["statut_changed_at"] = rounded_hour
            
            # Enregistrer dans l'historique des statuts
            # Si une entrée existe déjà pour cet équipement à la même heure, l'écraser
            history_entry = {
                "equipment_id": eq_id,
                "statut": update_data["statut"],
                "changed_at": rounded_hour,
                "changed_by": current_user.get("id"),
                "changed_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
            }
            await db.equipment_status_history.update_one(
                {"equipment_id": eq_id, "changed_at": rounded_hour},
                {"$set": history_entry},
                upsert=True
            )
            
            # Enregistrer dans le journal d'audit
            await audit_service.log_action(
                user_id=current_user.get("id"),
                user_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
                user_email=current_user.get("email", ""),
                action=ActionType.UPDATE,
                entity_type=EntityType.EQUIPMENT,
                entity_id=eq_id,
                entity_name=existing_eq.get("nom"),
                details=f"Changement de statut: {old_statut} → {update_data['statut']}",
                changes={"statut": {"old": old_statut, "new": update_data["statut"]}}
            )

            # Notification push si equipement passe hors service
            if update_data.get("statut") == "HORS_SERVICE" and old_statut != "HORS_SERVICE":
                try:
                    from web_push import notify_equipment_alert_web
                    asyncio.create_task(
                        notify_equipment_alert_web(db, {**existing_eq, **update_data}, "PANNE")
                    )
                except Exception as e:
                    logger.warning(f"[PUSH] Erreur alerte équipement (update): {e}")
        
        await db.equipments.update_one(
            {"_id": ObjectId(eq_id)},
            {"$set": update_data}
        )
        
        eq = await db.equipments.find_one({"_id": ObjectId(eq_id)})
        eq = serialize_doc(eq)
        
        if eq.get("emplacement_id"):
            eq["emplacement"] = await get_location_by_id(eq["emplacement_id"])
        
        if eq.get("parent_id"):
            eq["parent"] = await get_equipment_by_id(eq["parent_id"])
        
        children_count = await db.equipments.count_documents({"parent_id": eq["id"]})
        eq["hasChildren"] = children_count > 0
        
        # Broadcast WebSocket pour la synchronisation temps réel (sans exclure l'utilisateur pour les autres vues)
        await _get_realtime_manager().emit_event(
            "equipments",
            "updated",
            eq
        )
        
        return Equipment(**eq)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

async def check_and_update_parent_status(equipment_id: str):
    """Vérifier et mettre à jour le statut du parent en fonction des enfants"""
    # Récupérer l'équipement
    equipment = await db.equipments.find_one({"_id": ObjectId(equipment_id)})
    if not equipment:
        return
    
    # Si cet équipement a un parent, vérifier le statut du parent
    if equipment.get("parent_id"):
        await update_parent_alert_status(equipment["parent_id"])

async def update_parent_alert_status(parent_id: str):
    """Mettre à jour le statut du parent en fonction des statuts des enfants"""
    # Récupérer tous les enfants
    children = await db.equipments.find({"parent_id": parent_id}).to_list(1000)
    
    if not children:
        return
    
    # Vérifier si au moins un enfant est EN_MAINTENANCE ou HORS_SERVICE
    has_problematic_child = any(
        child.get("statut") in ["EN_MAINTENANCE", "HORS_SERVICE"] 
        for child in children
    )
    
    parent = await db.equipments.find_one({"_id": ObjectId(parent_id)})
    if not parent:
        return
    
    if has_problematic_child:
        # Mettre le parent en ALERTE_S_EQUIP (alerte automatique)
        await db.equipments.update_one(
            {"_id": ObjectId(parent_id)},
            {"$set": {"statut": "ALERTE_S_EQUIP"}}
        )
    else:
        # Si tous les enfants sont OPERATIONNEL et le parent est en ALERTE, remettre à OPERATIONNEL
        if parent.get("statut") == "ALERTE_S_EQUIP":
            all_operational = all(
                child.get("statut") == "OPERATIONNEL" 
                for child in children
            )
            if all_operational:
                await db.equipments.update_one(
                    {"_id": ObjectId(parent_id)},
                    {"$set": {"statut": "OPERATIONNEL"}}
                )

@router.patch("/equipments/{eq_id}/status",
    summary="Changer le statut", tags=["Equipements"])
async def update_equipment_status(
    eq_id: str, 
    statut: EquipmentStatus, 
    force: bool = False,  # Paramètre pour forcer le changement malgré maintenance en cours
    current_user: dict = Depends(require_permission("assets", "edit"))
):
    """Mettre à jour rapidement le statut d'un équipement"""
    try:
        equipment = await db.equipments.find_one({"_id": ObjectId(eq_id)})
        if not equipment:
            raise HTTPException(status_code=404, detail="Équipement non trouvé")
        
        # Vérifier si l'équipement a une maintenance préventive en cours
        # IMPORTANT: Exclure les maintenances déjà terminées de manière anticipée
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        active_maintenance = await db.planning_equipement.find_one({
            "equipement_id": eq_id,
            "date_debut": {"$lte": today},
            "date_fin": {"$gte": today},
            "fin_anticipee": {"$ne": True}  # Exclure les maintenances déjà terminées
        })
        
        # Si maintenance en cours et pas de force, retourner une demande de confirmation
        if active_maintenance and not force:
            # Récupérer les infos de la demande d'arrêt associée
            demande_arret = await db.demandes_arret.find_one({"id": active_maintenance.get("demande_arret_id")})
            return {
                "requires_confirmation": True,
                "message": "Cet équipement est actuellement en maintenance préventive planifiée",
                "maintenance_info": {
                    "id": active_maintenance.get("id"),
                    "date_debut": active_maintenance.get("date_debut"),
                    "date_fin": active_maintenance.get("date_fin"),
                    "demande_id": active_maintenance.get("demande_arret_id"),
                    "motif": demande_arret.get("motif") if demande_arret else None
                },
                "current_status": equipment.get("statut"),
                "new_status": statut
            }
        
        # Si maintenance en cours et force=true, terminer la maintenance anticipée
        if active_maintenance and force:
            # Mettre fin à TOUTES les maintenances préventives actives pour cet équipement
            # (il peut y avoir plusieurs entrées de planning pour la même demande ou des demandes différentes)
            update_result = await db.planning_equipement.update_many(
                {
                    "equipement_id": eq_id,
                    "date_debut": {"$lte": today},
                    "date_fin": {"$gte": today},
                    "fin_anticipee": {"$ne": True}  # Ne pas re-mettre à jour celles déjà terminées
                },
                {"$set": {
                    "date_fin": today,
                    "fin_anticipee": True,
                    "fin_anticipee_par": current_user.get("id"),
                    "fin_anticipee_par_nom": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
                    "fin_anticipee_le": datetime.now(timezone.utc).isoformat()
                }}
            )
            logger.info(f"Fin anticipée: {update_result.modified_count} entrée(s) de planning mises à jour pour équipement {eq_id}")
            
            # Mettre à jour TOUTES les demandes d'arrêt associées
            demande_arret_id = active_maintenance.get("demande_arret_id")
            if demande_arret_id:
                await db.demandes_arret.update_one(
                    {"id": demande_arret_id},
                    {"$set": {
                        "fin_anticipee": True,
                        "date_fin_effective": today,
                        "fin_anticipee_par_id": current_user.get("id"),
                        "fin_anticipee_par_nom": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
            
            # Émettre un événement WebSocket pour notifier les autres clients
            try:
                await broadcast_update("equipments", {
                    "type": "equipment_status_changed",
                    "equipment_id": eq_id,
                    "new_status": statut.value if hasattr(statut, 'value') else statut,
                    "maintenance_ended": True
                })
            except Exception as ws_error:
                logger.warning(f"Erreur WebSocket broadcast: {ws_error}")
        
        # Note: La validation des sous-équipements a été retirée pour permettre
        # aux utilisateurs de changer librement le statut des équipements parents
        
        # Si le statut change, enregistrer dans l'historique et le journal
        old_statut = equipment.get("statut")
        if old_statut != statut:
            now = datetime.now(timezone.utc)
            # Arrondir à l'heure inférieure
            rounded_hour = now.replace(minute=0, second=0, microsecond=0)
            
            # Notification push si equipement passe hors service
            new_statut_value_check = statut.value if hasattr(statut, 'value') else statut
            if new_statut_value_check == "HORS_SERVICE" and old_statut != "HORS_SERVICE":
                from notifications import notify_equipment_alert
                from web_push import notify_equipment_alert_web
                asyncio.create_task(
                    notify_equipment_alert(
                        db=db,
                        equipment_id=eq_id,
                        equipment_name=equipment.get("nom", ""),
                        alert_type="PANNE",
                        alert_message="L'equipement est hors service"
                    )
                )
                # Web Push PWA
                asyncio.create_task(
                    notify_equipment_alert_web(db, equipment, "PANNE")
                )
            
            # Enregistrer dans l'historique (upsert pour écraser si même heure)
            history_entry = {
                "equipment_id": eq_id,
                "statut": statut,
                "changed_at": rounded_hour,
                "changed_by": current_user.get("id"),
                "changed_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
            }
            await db.equipment_status_history.update_one(
                {"equipment_id": eq_id, "changed_at": rounded_hour},
                {"$set": history_entry},
                upsert=True
            )
            
            # Enregistrer dans le journal d'audit
            new_statut_value = statut.value if hasattr(statut, 'value') else statut
            await audit_service.log_action(
                user_id=current_user.get("id"),
                user_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
                user_email=current_user.get("email", ""),
                action=ActionType.UPDATE,
                entity_type=EntityType.EQUIPMENT,
                entity_id=eq_id,
                entity_name=equipment.get("nom"),
                details=f"Changement de statut: {old_statut} → {new_statut_value}",
                changes={"statut": {"old": old_statut, "new": new_statut_value}}
            )
            
            # Mettre à jour le statut ET la date de changement
            result = await db.equipments.update_one(
                {"_id": ObjectId(eq_id)},
                {"$set": {"statut": statut, "statut_changed_at": rounded_hour}}
            )
        else:
            # Mettre à jour seulement le statut (pas de changement réel)
            result = await db.equipments.update_one(
                {"_id": ObjectId(eq_id)},
                {"$set": {"statut": statut}}
            )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Équipement non trouvé")
        
        # Mettre à jour le statut du parent si nécessaire
        await check_and_update_parent_status(eq_id)
        
        # Broadcast WebSocket pour la synchronisation temps réel
        # Ne pas exclure l'utilisateur courant pour que les autres vues (Planning) soient aussi mises à jour
        updated_eq = await db.equipments.find_one({"_id": ObjectId(eq_id)})
        if updated_eq:
            updated_eq = serialize_doc(updated_eq)
            await _get_realtime_manager().emit_event(
                "equipments",
                "status_changed",
                updated_eq
            )
        
        return {"message": "Statut mis à jour", "statut": statut}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/equipments/{eq_id}", response_model=MessageResponse,
    summary="Supprimer un equipement", tags=["Equipements"])
async def delete_equipment(eq_id: str, current_user: dict = Depends(require_permission("assets", "delete"))):
    """Supprimer un équipement"""
    try:
        # Récupérer l'équipement avant suppression pour le broadcast
        equipment = await db.equipments.find_one({"_id": ObjectId(eq_id)})
        eq_name = equipment.get("nom", "Inconnu") if equipment else "Inconnu"
        
        result = await db.equipments.update_one(
            {"_id": ObjectId(eq_id)},
            {"$set": {
                "deleted_at": datetime.now(timezone.utc),
                "deleted_by": current_user["id"],
                "deleted_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
            }}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Équipement non trouvé")
        
        # Broadcast WebSocket pour la synchronisation temps réel
        await _get_realtime_manager().emit_event(
            "equipments",
            "deleted",
            {"id": eq_id, "nom": eq_name},
            user_id=current_user.get("id")
        )
        
        return {"message": "Équipement supprimé"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

