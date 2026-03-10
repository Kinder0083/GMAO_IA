"""
Routes API pour les Demandes d'Arrêt pour Maintenance
Version refactorisée - Routes principales (CRUD, validation, annulation)

Les routes sont maintenant divisées en modules :
- demande_arret_routes.py (ce fichier) : CRUD principal, validation, annulation, planning
- demande_arret_reports_routes.py : Routes pour les reports et contre-propositions  
- demande_arret_attachments_routes.py : Routes pour les pièces jointes
- demande_arret_emails.py : Fonctions d'envoi d'emails
- demande_arret_utils.py : Utilitaires partagés (serialize_doc, db, etc.)
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime, timedelta, timezone
import logging
import uuid
from bson import ObjectId

from dependencies import get_current_user
from models import (
    DemandeArretMaintenance, DemandeArretMaintenanceCreate, DemandeArretMaintenanceUpdate,
    DemandeArretStatus, PlanningEquipementEntry, EquipmentStatus, UserRole,
    ActionType, EntityType
)
import audit_service as audit_module

# Import des modules refactorisés
from demande_arret_utils import db, serialize_doc, UPLOAD_DIR, MAX_FILE_SIZE
from demande_arret_emails import (
    send_demande_email,
    send_cancellation_email,
    send_reminder_email
)

# Import du manager WebSocket pour les notifications temps réel
try:
    from realtime_manager import realtime_manager
    HAS_REALTIME = True
except ImportError:
    HAS_REALTIME = False
    realtime_manager = None

logger = logging.getLogger(__name__)

# Service d'audit pour journalisation
audit_service = audit_module.AuditService(db)

router = APIRouter(prefix="/demandes-arret", tags=["demandes-arret"])


# ==================== HELPER FUNCTION POUR BROADCAST WEBSOCKET ====================

async def broadcast_demande_update(event_type: str, data: dict):
    """Broadcast une mise à jour de demande d'arrêt via WebSocket"""
    if HAS_REALTIME and realtime_manager:
        try:
            await realtime_manager.broadcast("demandes_arret", {
                "type": event_type,
                "entity_type": "demandes_arret",
                "data": data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            logger.info(f"[Realtime] Event {event_type} émis pour demandes_arret")
        except Exception as e:
            logger.warning(f"[Realtime] Erreur broadcast demandes_arret: {e}")


# ==================== CRUD DEMANDES ====================

@router.post("/")
async def create_demande_arret(
    demande: DemandeArretMaintenanceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Créer une nouvelle demande d'arrêt pour maintenance"""
    try:
        # Récupérer le destinataire
        logger.info(f"🔍 Recherche destinataire avec ID: {demande.destinataire_id}")
        destinataire = await db.users.find_one({"_id": ObjectId(demande.destinataire_id)})
        logger.info(f"🔍 Destinataire trouvé: {destinataire is not None}")
        if not destinataire:
            raise HTTPException(status_code=404, detail="Destinataire non trouvé")
        
        # Récupérer les informations des équipements
        equipement_noms = []
        for eq_id in demande.equipement_ids:
            logger.info(f"🔍 Recherche équipement avec ID: {eq_id}")
            equipement = await db.equipments.find_one({"_id": ObjectId(eq_id)})
            logger.info(f"🔍 Équipement trouvé: {equipement is not None}")
            if equipement:
                equipement_noms.append(equipement.get("nom", ""))
                logger.info(f"🔍 Nom équipement: {equipement.get('nom', '')}")
        
        # Calculer la date d'expiration (7 jours)
        date_creation = datetime.now(timezone.utc)
        date_expiration = date_creation + timedelta(days=7)
        
        # Créer la demande
        data = demande.model_dump()
        data["id"] = str(uuid.uuid4())
        data["demandeur_id"] = current_user.get("id")
        data["demandeur_nom"] = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}"
        data["destinataire_nom"] = f"{destinataire.get('prenom', '')} {destinataire.get('nom', '')}"
        data["destinataire_email"] = destinataire.get("email")
        data["equipement_noms"] = equipement_noms
        data["statut"] = DemandeArretStatus.EN_ATTENTE
        data["date_creation"] = date_creation.isoformat()
        data["date_expiration"] = date_expiration.isoformat()
        data["validation_token"] = str(uuid.uuid4())
        data["created_at"] = date_creation.isoformat()
        data["updated_at"] = date_creation.isoformat()
        
        # Ajouter _id pour MongoDB
        data["_id"] = ObjectId()
        
        await db.demandes_arret.insert_one(data)
        
        # Vérifier si le demandeur est le même que le destinataire (auto-approbation)
        is_self_request = str(current_user.get("id")) == str(demande.destinataire_id)
        
        if is_self_request:
            now = datetime.now(timezone.utc)
            end_maintenance_token = str(uuid.uuid4())
            
            for eq_id in demande.equipement_ids:
                planning_entry = {
                    "id": str(uuid.uuid4()),
                    "equipement_id": eq_id,
                    "demande_arret_id": data["id"],
                    "date_debut": demande.date_debut,
                    "date_fin": demande.date_fin,
                    "periode_debut": demande.periode_debut,
                    "periode_fin": demande.periode_fin,
                    "heure_debut": data.get("heure_debut"),
                    "heure_fin": data.get("heure_fin"),
                    "motif": demande.commentaire,
                    "statut": EquipmentStatus.EN_MAINTENANCE,
                    "end_maintenance_token": end_maintenance_token,
                    "created_at": now.isoformat()
                }
                await db.planning_equipement.insert_one(planning_entry)
                
                today_str = now.strftime("%Y-%m-%d")
                if demande.date_debut <= today_str:
                    await update_equipment_status_for_maintenance(
                        eq_id=eq_id,
                        new_status=EquipmentStatus.EN_MAINTENANCE,
                        changed_by_name=data["demandeur_nom"]
                    )
            
            await db.demandes_arret.update_one(
                {"id": data["id"]},
                {"$set": {
                    "statut": DemandeArretStatus.APPROUVEE,
                    "date_validation": now.isoformat(),
                    "end_maintenance_token": end_maintenance_token,
                    "auto_approuvee": True,
                    "updated_at": now.isoformat()
                }}
            )
            data["statut"] = DemandeArretStatus.APPROUVEE
            logger.info(f"Demande auto-approuvee (demandeur=destinataire): {data['id']}")
        else:
            await send_demande_email(data)
        
        # Enregistrer dans le journal d'audit
        await audit_service.log_action(
            user_id=current_user.get("id"),
            user_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
            user_email=current_user.get("email"),
            action=ActionType.CREATE,
            entity_type=EntityType.DEMANDE_ARRET,
            entity_id=data['id'],
            entity_name=f"Demande d'arrêt du {demande.date_debut} au {demande.date_fin}",
            details=f"Demande d'arrêt pour {len(equipement_noms)} équipement(s): {', '.join(equipement_noms)}. Destinataire: {data['destinataire_nom']}"
        )
        
        # Broadcast WebSocket pour mise à jour temps réel
        await broadcast_demande_update("created", {
            "id": data['id'],
            "equipement_ids": data.get("equipement_ids", []),
            "date_debut": data.get("date_debut"),
            "date_fin": data.get("date_fin"),
            "statut": data.get("statut")
        })
        
        logger.info(f"Demande d'arrêt créée: {data['id']}")
        return serialize_doc(data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur création demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def get_demandes_arret(
    statut: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer toutes les demandes d'arrêt (avec filtre optionnel)"""
    try:
        filter_query = {}
        if statut:
            filter_query["statut"] = statut
        
        demandes = await db.demandes_arret.find(filter_query).sort("date_creation", -1).to_list(length=None)
        
        # Sérialiser les documents
        serialized_demandes = [serialize_doc(demande) for demande in demandes]
        
        return serialized_demandes
    except Exception as e:
        logger.error(f"Erreur récupération demandes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== RAPPELS ====================

@router.get("/trigger-reminders")
async def trigger_reminders(current_user: dict = Depends(get_current_user)):
    """
    Point d'entrée pour déclencher les vérifications de rappels.
    Appelé automatiquement lors de la visite du dashboard.
    """
    try:
        result = await check_pending_reminders_internal()
        return {"status": "ok", "reminders_triggered": result.get("reminders_sent", 0)}
    except Exception as e:
        logger.error(f"Erreur trigger rappels: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.post("/check-pending-reminders")
async def check_pending_reminders_endpoint():
    """
    Vérifier et envoyer des rappels pour les demandes en attente depuis longtemps.
    """
    return await check_pending_reminders_internal()


async def check_pending_reminders_internal():
    """Logique interne pour vérifier les rappels"""
    try:
        now = datetime.now(timezone.utc)
        three_days_ago = now - timedelta(days=3)
        
        # Trouver les demandes en attente créées il y a plus de 3 jours
        demandes_pending = await db.demandes_arret.find({
            "statut": DemandeArretStatus.EN_ATTENTE,
            "date_creation": {"$lt": three_days_ago.isoformat()},
            "reminder_sent": {"$ne": True}
        }).to_list(length=None)
        
        count = 0
        for demande in demandes_pending:
            date_expiration = datetime.fromisoformat(demande["date_expiration"].replace("Z", "+00:00"))
            days_remaining = (date_expiration - now).days
            
            if days_remaining <= 4 and days_remaining > 0:
                await send_reminder_email(demande, days_remaining)
                
                await db.demandes_arret.update_one(
                    {"id": demande["id"]},
                    {"$set": {
                        "reminder_sent": True,
                        "reminder_sent_at": now.isoformat()
                    }}
                )
                
                logger.info(f"Rappel envoyé pour demande {demande['id']} - {days_remaining} jours restants")
                count += 1
        
        return {
            "reminders_sent": count,
            "message": f"{count} rappel(s) envoyé(s)"
        }
    except Exception as e:
        logger.error(f"Erreur vérification rappels: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== FIN DE MAINTENANCE ====================

@router.get("/end-maintenance")
async def get_end_maintenance_info(token: str):
    """
    Récupérer les informations pour la page de fin de maintenance (PUBLIC).
    Appelé quand l'utilisateur clique sur un lien dans l'email.
    """
    try:
        # Chercher la demande par le token de fin de maintenance
        demande = await db.demandes_arret.find_one({"end_maintenance_token": token})
        if not demande:
            raise HTTPException(status_code=404, detail="Token invalide ou demande non trouvée")
        
        # Vérifier que la demande est bien terminée (date_fin atteinte ou fin anticipée)
        if demande.get("statut") not in [DemandeArretStatus.APPROUVEE, "TERMINEE"]:
            raise HTTPException(status_code=400, detail="Cette demande n'est pas en état de fin de maintenance")
        
        # Récupérer les noms des équipements
        equipement_noms = demande.get("equipement_noms", [])
        
        return {
            "demande_id": demande.get("id"),
            "equipement_ids": demande.get("equipement_ids", []),
            "equipement_noms": equipement_noms,
            "date_debut": demande.get("date_debut"),
            "date_fin": demande.get("date_fin"),
            "motif": demande.get("motif"),
            "demandeur_nom": demande.get("demandeur_nom"),
            "statuts_disponibles": [
                {"code": "OPERATIONNEL", "label": "Opérationnel", "color": "#10b981"},
                {"code": "EN_FONCTIONNEMENT", "label": "En Fonctionnement", "color": "#059669"},
                {"code": "A_LARRET", "label": "À l'arrêt", "color": "#6b7280"},
                {"code": "EN_MAINTENANCE", "label": "En maintenance", "color": "#eab308"},
                {"code": "HORS_SERVICE", "label": "Hors service", "color": "#ef4444"},
                {"code": "EN_CT", "label": "En C.T", "color": "#8b5cf6"},
                {"code": "DEGRADE", "label": "Dégradé", "color": "#3b82f6"}
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération info fin de maintenance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/end-maintenance")
async def process_end_maintenance(
    token: str,
    statut: str
):
    """
    Traiter la fin de maintenance et appliquer le nouveau statut (PUBLIC).
    Appelé quand l'utilisateur sélectionne un statut depuis l'email/page.
    """
    try:
        from bson import ObjectId
        
        # Chercher la demande par le token de fin de maintenance
        demande = await db.demandes_arret.find_one({"end_maintenance_token": token})
        if not demande:
            raise HTTPException(status_code=404, detail="Token invalide ou demande non trouvée")
        
        # Valider le statut
        valid_statuts = ["OPERATIONNEL", "EN_FONCTIONNEMENT", "A_LARRET", "EN_MAINTENANCE", "HORS_SERVICE", "EN_CT", "DEGRADE"]
        if statut not in valid_statuts:
            raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs acceptées: {', '.join(valid_statuts)}")
        
        now = datetime.now(timezone.utc)
        rounded_hour = now.replace(minute=0, second=0, microsecond=0)
        
        # Pour chaque équipement concerné
        for eq_id in demande.get("equipement_ids", []):
            # Mettre à jour le statut de l'équipement
            await db.equipments.update_one(
                {"_id": ObjectId(eq_id)},
                {"$set": {
                    "statut": statut,
                    "statut_changed_at": rounded_hour,
                    "updated_at": now.isoformat()
                }}
            )
            
            # Ajouter dans l'historique des statuts
            history_entry = {
                "equipment_id": eq_id,
                "statut": statut,
                "changed_at": rounded_hour,
                "changed_by": "fin_maintenance",
                "changed_by_name": f"Fin de maintenance ({demande.get('demandeur_nom', 'Utilisateur')})",
                "demande_arret_id": demande.get("id"),
                "is_end_of_maintenance": True
            }
            
            await db.equipment_status_history.update_one(
                {"equipment_id": eq_id, "changed_at": rounded_hour},
                {"$set": history_entry},
                upsert=True
            )
            
            # IMPORTANT: Ne PAS supprimer l'entrée du planning !
            # On la marque comme terminée pour conserver l'historique
            # Cela permet au planning de continuer à afficher "En maintenance" pour les jours passés
            await db.planning_equipement.update_many(
                {
                    "demande_arret_id": demande.get("id"),
                    "equipement_id": eq_id
                },
                {"$set": {
                    "maintenance_terminee": True,
                    "maintenance_terminee_le": now.isoformat(),
                    "statut_apres_maintenance": statut
                }}
            )
        
        # Marquer la demande comme terminée
        await db.demandes_arret.update_one(
            {"id": demande.get("id")},
            {"$set": {
                "statut": "TERMINEE",
                "date_fin_effective": now.isoformat(),
                "statut_apres_maintenance": statut,
                "updated_at": now.isoformat()
            }}
        )
        
        logger.info(f"Fin de maintenance traitée pour demande {demande.get('id')}, nouveau statut: {statut}")
        
        return {
            "status": "success",
            "message": f"Maintenance terminée. Statut mis à jour vers '{statut}'",
            "demande_id": demande.get("id"),
            "nouveau_statut": statut
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur traitement fin de maintenance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-end-maintenance")
async def check_end_maintenance_and_send_emails():
    """
    Vérifier les maintenances arrivées à leur date de fin et envoyer les emails.
    À appeler périodiquement (cron job ou au chargement du dashboard).
    """
    try:
        from demande_arret_emails import send_end_maintenance_email
        
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # Trouver les demandes approuvées dont la date de fin est aujourd'hui ou passée
        # et qui n'ont pas encore reçu l'email de fin
        demandes = await db.demandes_arret.find({
            "statut": DemandeArretStatus.APPROUVEE,
            "date_fin": {"$lte": today},
            "end_maintenance_email_sent": {"$ne": True}
        }).to_list(length=None)
        
        count = 0
        for demande in demandes:
            equipement_noms = demande.get("equipement_noms", [])
            
            # Envoyer l'email
            success = await send_end_maintenance_email(demande, equipement_noms)
            
            if success:
                # Marquer comme email envoyé
                await db.demandes_arret.update_one(
                    {"id": demande.get("id")},
                    {"$set": {
                        "end_maintenance_email_sent": True,
                        "end_maintenance_email_sent_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                count += 1
        
        return {
            "emails_sent": count,
            "message": f"{count} email(s) de fin de maintenance envoyé(s)"
        }
    except Exception as e:
        logger.error(f"Erreur vérification fin de maintenance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-status-update")
async def get_maintenances_pending_status_update(
    current_user: dict = Depends(get_current_user)
):
    """
    Récupérer les maintenances terminées (date de fin passée) qui attendent 
    que l'utilisateur définisse le nouveau statut de l'équipement.
    Utilisé pour afficher une notification sur le tableau de bord.
    """
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # Ne montrer que les maintenances des 30 derniers jours
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Trouver les demandes approuvées dont la date de fin est passée (mais récente)
        # et qui ne sont pas terminées de manière anticipée
        demandes = await db.demandes_arret.find({
            "statut": DemandeArretStatus.APPROUVEE,
            "date_fin": {
                "$lt": today,           # Date de fin passée (hier ou avant)
                "$gte": thirty_days_ago  # Mais pas plus de 30 jours
            },
            "fin_anticipee": {"$ne": True}  # Pas terminée de manière anticipée
        }).to_list(length=None)
        
        # Filtrer celles qui n'ont pas de statut après maintenance
        pending_maintenances = []
        for demande in demandes:
            # Vérifier si le statut après maintenance a été défini
            if not demande.get("statut_apres_maintenance"):
                # S'assurer qu'il y a un token pour permettre la sélection
                token = demande.get("end_maintenance_token")
                if token:
                    pending_maintenances.append({
                        "id": demande.get("id"),
                        "equipement_ids": demande.get("equipement_ids", []),
                        "equipement_noms": demande.get("equipement_noms", []),
                        "date_debut": demande.get("date_debut"),
                        "date_fin": demande.get("date_fin"),
                        "motif": demande.get("motif"),
                        "demandeur_nom": demande.get("demandeur_nom"),
                        "end_maintenance_token": token
                    })
        
        return {
            "count": len(pending_maintenances),
            "maintenances": pending_maintenances
        }
    except Exception as e:
        logger.error(f"Erreur récupération maintenances en attente: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PLANNING EQUIPEMENT ====================

@router.get("/planning/equipements")
async def get_planning_equipements(
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Récupérer le planning des équipements.
    Retourne les maintenances dont la période chevauche la plage demandée.
    """
    try:
        filter_query = {}
        
        # Filtrer les maintenances qui chevauchent la période demandée
        # Une maintenance chevauche si: sa date_fin >= date_debut_demandée ET sa date_debut <= date_fin_demandée
        if date_debut and date_fin:
            filter_query["$and"] = [
                {"date_fin": {"$gte": date_debut}},   # La maintenance se termine après le début de la période
                {"date_debut": {"$lte": date_fin}}    # La maintenance commence avant la fin de la période
            ]
        elif date_debut:
            filter_query["date_fin"] = {"$gte": date_debut}
        elif date_fin:
            filter_query["date_debut"] = {"$lte": date_fin}
        
        # Ne pas inclure les maintenances terminées de manière anticipée
        filter_query["fin_anticipee"] = {"$ne": True}
        
        entries = await db.planning_equipement.find(filter_query).to_list(length=None)
        
        # Enrichir les entrées avec le statut de la demande
        enriched_entries = []
        for entry in entries:
            demande_id = entry.get("demande_arret_id")
            if demande_id:
                demande = await db.demandes_arret.find_one({"id": demande_id})
                if demande:
                    # Ajouter un flag pour indiquer si la maintenance est terminée
                    entry["demande_terminee"] = demande.get("statut") == "TERMINEE"
                    entry["statut_apres_maintenance"] = demande.get("statut_apres_maintenance")
                    enriched_entries.append(entry)
            else:
                # Si pas de demande associée, garder l'entrée
                enriched_entries.append(entry)
        
        return [serialize_doc(e) for e in enriched_entries]
    except Exception as e:
        logger.error(f"Erreur récupération planning: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== VÉRIFICATION EXPIRATION ====================

@router.post("/check-expired")
async def check_expired_demandes():
    """Vérifier et expirer les demandes dépassées"""
    try:
        now = datetime.now(timezone.utc)
        
        # Trouver les demandes en attente expirées
        expired = await db.demandes_arret.find({
            "statut": DemandeArretStatus.EN_ATTENTE,
            "date_expiration": {"$lt": now.isoformat()}
        }).to_list(length=None)
        
        count = 0
        for demande in expired:
            await db.demandes_arret.update_one(
                {"id": demande["id"]},
                {"$set": {
                    "statut": DemandeArretStatus.EXPIREE,
                    "updated_at": now.isoformat()
                }}
            )
            count += 1
        
        return {"expired_count": count, "message": f"{count} demande(s) expirée(s)"}
    except Exception as e:
        logger.error(f"Erreur vérification expiration: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ROUTES AVEC PARAMÈTRE /{demande_id} ====================
# NOTE: Ces routes doivent être APRÈS les routes sans paramètre pour éviter les conflits de routage

@router.get("/{demande_id}")
async def get_demande_by_id(
    demande_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer une demande par ID"""
    try:
        demande = await db.demandes_arret.find_one({"id": demande_id})
        if not demande:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        return serialize_doc(demande)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== VALIDATION / REFUS ====================

@router.post("/validate/{token}")
async def validate_demande_by_token(
    token: str,
    approved: bool = True,
    commentaire: Optional[str] = None,
    date_proposee: Optional[str] = None
):
    """Valider ou refuser une demande via token (depuis l'email)"""
    try:
        demande = await db.demandes_arret.find_one({"validation_token": token})
        if not demande:
            raise HTTPException(status_code=404, detail="Token invalide ou demande non trouvée")
        
        if demande["statut"] != DemandeArretStatus.EN_ATTENTE:
            raise HTTPException(status_code=400, detail="Cette demande a déjà été traitée")
        
        now = datetime.now(timezone.utc)
        
        if approved:
            # Approuver la demande
            new_status = DemandeArretStatus.APPROUVEE
            
            # Générer un token pour la fin de maintenance
            end_maintenance_token = str(uuid.uuid4())
            
            # Pour chaque équipement concerné
            for eq_id in demande.get("equipement_ids", []):
                # Créer l'entrée dans le planning avec toutes les infos
                planning_entry = {
                    "id": str(uuid.uuid4()),
                    "equipement_id": eq_id,
                    "demande_arret_id": demande["id"],
                    "date_debut": demande["date_debut"],
                    "date_fin": demande["date_fin"],
                    "periode_debut": demande.get("periode_debut"),
                    "periode_fin": demande.get("periode_fin"),
                    "heure_debut": demande.get("heure_debut"),
                    "heure_fin": demande.get("heure_fin"),
                    "motif": demande.get("motif"),
                    "statut": EquipmentStatus.EN_MAINTENANCE,
                    "end_maintenance_token": end_maintenance_token,
                    "created_at": now.isoformat()
                }
                await db.planning_equipement.insert_one(planning_entry)
                
                # NOTE: On ne crée plus d'entrées dans l'historique des statuts ici.
                # L'affichage de la maintenance est géré par planningEntries côté frontend.
                # Le statut de l'équipement sera mis à jour uniquement si date_debut <= aujourd'hui
                
                # Si la date de début est aujourd'hui ou passée, mettre à jour le statut actuel
                today = now.strftime("%Y-%m-%d")
                if demande["date_debut"] <= today:
                    await update_equipment_status_for_maintenance(
                        eq_id=eq_id,
                        new_status=EquipmentStatus.EN_MAINTENANCE,
                        changed_by_name=demande.get("demandeur_nom", "Système")
                    )
            
            message = "Demande approuvée avec succès"
        else:
            # Refuser la demande
            new_status = DemandeArretStatus.REFUSEE
            end_maintenance_token = None
            message = "Demande refusée"
        
        # Mettre à jour la demande
        update_data = {
            "statut": new_status,
            "date_validation": now.isoformat(),
            "updated_at": now.isoformat()
        }
        if end_maintenance_token:
            update_data["end_maintenance_token"] = end_maintenance_token
        if commentaire:
            update_data["commentaire_validation"] = commentaire
        if date_proposee:
            update_data["date_proposee"] = date_proposee
        
        await db.demandes_arret.update_one(
            {"validation_token": token},
            {"$set": update_data}
        )
        
        # Broadcast WebSocket pour mise à jour temps réel
        await broadcast_demande_update("status_changed", {
            "id": demande["id"],
            "equipement_ids": demande.get("equipement_ids", []),
            "date_debut": demande.get("date_debut"),
            "date_fin": demande.get("date_fin"),
            "statut": new_status,
            "action": "approved" if approved else "refused"
        })
        
        logger.info(f"Demande {demande['id']} {'approuvée' if approved else 'refusée'}")
        return {"message": message, "demande_id": demande["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur validation demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def apply_maintenance_status_to_history(
    eq_id: str,
    date_debut: str,
    date_fin: str,
    demande_id: str,
    demandeur_nom: str
):
    """
    Appliquer le statut EN_MAINTENANCE dans l'historique des statuts
    pour toute la période de maintenance, en écrasant les statuts existants.
    Crée une entrée par heure (arrondie à l'heure pleine inférieure).
    """
    from datetime import datetime, timedelta, timezone
    
    # Parser les dates
    start_date = datetime.strptime(date_debut, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_date = datetime.strptime(date_fin, "%Y-%m-%d").replace(hour=23, minute=59, tzinfo=timezone.utc)
    
    # Arrondir à l'heure pleine inférieure
    current_hour = start_date.replace(minute=0, second=0, microsecond=0)
    
    # Créer/écraser une entrée pour chaque heure de la période
    while current_hour <= end_date:
        history_entry = {
            "equipment_id": eq_id,
            "statut": EquipmentStatus.EN_MAINTENANCE,
            "changed_at": current_hour,
            "changed_by": "maintenance_planifiee",
            "changed_by_name": f"Maintenance planifiée ({demandeur_nom})",
            "demande_arret_id": demande_id,
            "is_planned_maintenance": True
        }
        
        # Upsert: écraser si une entrée existe déjà pour cette heure
        await db.equipment_status_history.update_one(
            {"equipment_id": eq_id, "changed_at": current_hour},
            {"$set": history_entry},
            upsert=True
        )
        
        # Passer à l'heure suivante
        current_hour += timedelta(hours=1)
    
    logger.info(f"Historique de maintenance appliqué pour équipement {eq_id} du {date_debut} au {date_fin}")


async def update_equipment_status_for_maintenance(
    eq_id: str,
    new_status: EquipmentStatus,
    changed_by_name: str
):
    """
    Mettre à jour le statut actuel d'un équipement pour la maintenance.
    Met à jour le statut + le point de couleur + broadcast WebSocket.
    """
    from bson import ObjectId
    from datetime import datetime, timezone
    from realtime_manager import realtime_manager
    
    now = datetime.now(timezone.utc)
    rounded_hour = now.replace(minute=0, second=0, microsecond=0)
    
    # Mettre à jour l'équipement
    await db.equipments.update_one(
        {"_id": ObjectId(eq_id)},
        {"$set": {
            "statut": new_status,
            "statut_changed_at": rounded_hour,
            "updated_at": now.isoformat()
        }}
    )
    
    # Enregistrer dans l'historique des statuts
    await db.equipment_status_history.update_one(
        {"equipment_id": eq_id, "changed_at": rounded_hour},
        {"$set": {
            "equipment_id": eq_id,
            "statut": new_status,
            "changed_at": rounded_hour,
            "changed_by_name": changed_by_name
        }},
        upsert=True
    )
    
    # Broadcast WebSocket pour synchronisation temps réel avec le Planning
    updated_eq = await db.equipments.find_one({"_id": ObjectId(eq_id)})
    if updated_eq:
        updated_eq["id"] = str(updated_eq.pop("_id"))
        await realtime_manager.emit_event("equipments", "status_changed", updated_eq)
    
    logger.info(f"Statut équipement {eq_id} mis à jour à {new_status}")


@router.post("/refuse/{token}")
async def refuse_demande_by_token(
    token: str,
    commentaire: Optional[str] = None,
    date_proposee: Optional[str] = None
):
    """Refuser une demande via token (depuis l'email)"""
    try:
        demande = await db.demandes_arret.find_one({"validation_token": token})
        if not demande:
            raise HTTPException(status_code=404, detail="Token invalide ou demande non trouvée")
        
        if demande["statut"] != DemandeArretStatus.EN_ATTENTE:
            raise HTTPException(status_code=400, detail="Cette demande a déjà été traitée")
        
        now = datetime.now(timezone.utc)
        
        update_data = {
            "statut": DemandeArretStatus.REFUSEE,
            "date_refus": now.isoformat(),
            "updated_at": now.isoformat()
        }
        if commentaire:
            update_data["commentaire_refus"] = commentaire
        if date_proposee:
            update_data["date_proposee"] = date_proposee
        
        await db.demandes_arret.update_one(
            {"validation_token": token},
            {"$set": update_data}
        )
        
        logger.info(f"Demande {demande['id']} refusée")
        return {"message": "Demande refusée avec succès", "demande_id": demande["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur refus demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ANNULATION ====================

@router.post("/{demande_id}/cancel")
async def cancel_demande(
    demande_id: str,
    motif: str,
    current_user: dict = Depends(get_current_user)
):
    """Annuler une demande d'arrêt"""
    try:
        demande = await db.demandes_arret.find_one({"id": demande_id})
        if not demande:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        if demande["statut"] in [DemandeArretStatus.ANNULEE, DemandeArretStatus.EXPIREE]:
            raise HTTPException(status_code=400, detail="Cette demande ne peut pas être annulée")
        
        now = datetime.now(timezone.utc)
        ancien_statut = demande["statut"]
        
        # Si la demande était approuvée, supprimer du planning
        if ancien_statut == DemandeArretStatus.APPROUVEE:
            await db.planning_equipement.delete_many({"demande_arret_id": demande_id})
        
        # Mettre à jour le statut
        await db.demandes_arret.update_one(
            {"id": demande_id},
            {"$set": {
                "statut": DemandeArretStatus.ANNULEE,
                "motif_annulation": motif,
                "annule_par_id": current_user.get("id"),
                "annule_par_nom": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
                "date_annulation": now.isoformat(),
                "updated_at": now.isoformat()
            }}
        )
        
        # Envoyer email d'annulation
        await send_cancellation_email(demande, motif, current_user)
        
        # Enregistrer dans le journal d'audit
        await audit_service.log_action(
            user_id=current_user.get("id"),
            user_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
            user_email=current_user.get("email"),
            action=ActionType.DELETE,
            entity_type=EntityType.DEMANDE_ARRET,
            entity_id=demande_id,
            entity_name=f"Demande d'arrêt annulée",
            details=f"Motif: {motif}",
            changes={"statut": f"{ancien_statut} → ANNULEE"}
        )
        
        logger.info(f"Demande annulée: {demande_id}")
        return {"message": "Demande annulée avec succès", "demande_id": demande_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur annulation demande: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== FONCTION CRON ====================

async def check_expired_demandes_cron():
    """Fonction appelée par le scheduler pour vérifier les demandes expirées"""
    try:
        now = datetime.now(timezone.utc)
        expired = await db.demandes_arret.find({
            "statut": DemandeArretStatus.EN_ATTENTE,
            "date_expiration": {"$lt": now.isoformat()}
        }).to_list(length=None)
        
        for demande in expired:
            await db.demandes_arret.update_one(
                {"id": demande["id"]},
                {"$set": {"statut": DemandeArretStatus.EXPIREE, "updated_at": now.isoformat()}}
            )
        
        logger.info(f"Vérification expiration: {len(expired)} demande(s) expirée(s)")
    except Exception as e:
        logger.error(f"Erreur cron expiration: {str(e)}")
