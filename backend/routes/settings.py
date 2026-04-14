"""
Routes des Parametres - Settings, SMTP, Image Compression, Preferences, Menu, Permissions
Extrait de server.py.
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import logging
import json
import os
from pathlib import Path

from models import (
    ActionType, EntityType,
    SMTPConfig, SMTPConfigUpdate, SMTPTestRequest,
    SuccessResponse, SystemSettings, SystemSettingsUpdate,
    UserPreferences, UserPreferencesUpdate
)
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc
import email_service

# Chemin racine du backend (pour lecture/écriture du .env)
ROOT_DIR = Path(__file__).parent.parent

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Parametres"])

@router.get("/settings",
    summary="Configuration systeme", response_model=SystemSettings, tags=["Parametres"])
async def get_system_settings(current_user: dict = Depends(get_current_admin_user)):
    """Récupérer les paramètres système"""
    try:
        settings = await db.system_settings.find_one({"_id": "default"})
        if not settings:
            # Paramètres par défaut
            default_settings = {
                "_id": "default",
                "inactivity_timeout_minutes": 15
            }
            await db.system_settings.insert_one(default_settings)
            return SystemSettings(**default_settings)
        
        return SystemSettings(**settings)
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des paramètres : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

@router.put("/settings",
    summary="Modifier la configuration", response_model=SystemSettings, tags=["Parametres"])
async def update_system_settings(
    settings_update: SystemSettingsUpdate,
    current_user: dict = Depends(get_current_admin_user)
):
    """Mettre à jour les paramètres système (Admin uniquement)"""
    try:
        # Vérifier que la valeur est dans une plage acceptable (entre 1 et 120 minutes)
        if settings_update.inactivity_timeout_minutes is not None:
            if settings_update.inactivity_timeout_minutes < 1 or settings_update.inactivity_timeout_minutes > 120:
                raise HTTPException(
                    status_code=400, 
                    detail="Le temps d'inactivité doit être entre 1 et 120 minutes"
                )
        
        # Mettre à jour ou créer les paramètres
        update_data = {k: v for k, v in settings_update.model_dump().items() if v is not None}
        
        settings = await db.system_settings.find_one({"_id": "default"})
        if not settings:
            # Créer les paramètres par défaut
            default_settings = {
                "_id": "default",
                "inactivity_timeout_minutes": settings_update.inactivity_timeout_minutes or 15
            }
            await db.system_settings.insert_one(default_settings)
            settings = default_settings
        else:
            # Mettre à jour
            await db.system_settings.update_one(
                {"_id": "default"},
                {"$set": update_data}
            )
            settings.update(update_data)
        
        # Journaliser l'action
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType.SETTINGS,
            entity_id="default",
            entity_name="System Settings",
            details="Modification des paramètres système",
            changes=update_data
        )
        
        return SystemSettings(**settings)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de la mise à jour des paramètres : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")


# ==================== IMAGE COMPRESSION SETTINGS ====================

@router.get("/settings/image-compression", tags=["Parametres"])
async def get_image_compression_settings(current_user: dict = Depends(get_current_admin_user)):
    """Recuperer les parametres de compression d'images"""
    from image_compressor import get_compression_settings, DEFAULT_SETTINGS
    settings = await get_compression_settings(db)
    return settings

@router.put("/settings/image-compression", tags=["Parametres"])
async def update_image_compression_settings(
    body: dict,
    current_user: dict = Depends(get_current_admin_user)
):
    """Mettre a jour les parametres de compression d'images"""
    from image_compressor import DEFAULT_SETTINGS
    
    allowed_keys = {"enabled", "max_resolution", "quality", "output_format"}
    update_data = {k: v for k, v in body.items() if k in allowed_keys}
    
    # Validation
    if "max_resolution" in update_data:
        val = update_data["max_resolution"]
        if not isinstance(val, int) or val < 200 or val > 4000:
            raise HTTPException(status_code=400, detail="Resolution max doit etre entre 200 et 4000 pixels")
    
    if "quality" in update_data:
        val = update_data["quality"]
        if not isinstance(val, int) or val < 10 or val > 100:
            raise HTTPException(status_code=400, detail="Qualite doit etre entre 10 et 100%")
    
    if "output_format" in update_data:
        if update_data["output_format"] not in ("jpeg", "webp"):
            raise HTTPException(status_code=400, detail="Format doit etre jpeg ou webp")
    
    await db.system_settings.update_one(
        {"key": "image_compression"},
        {"$set": {**update_data, "key": "image_compression"}},
        upsert=True
    )
    
    settings = await db.system_settings.find_one({"key": "image_compression"}, {"_id": 0, "key": 0})
    return {**DEFAULT_SETTINGS, **(settings or {})}



# ==================== USER PREFERENCES ROUTES ====================
@router.get("/user-preferences", response_model=UserPreferences)
async def get_user_preferences(current_user: dict = Depends(get_current_user)):
    """Récupérer les préférences de l'utilisateur connecté"""
    try:
        user_id = current_user.get("id")
        
        # Dédupliquer: si plusieurs docs existent pour le même user_id,
        # garder celui avec les données les plus personnalisées (updated_at le plus récent)
        count = await db.user_preferences.count_documents({"user_id": user_id})
        if count > 1:
            all_prefs = await db.user_preferences.find({"user_id": user_id}).to_list(length=100)
            # Préférer celui qui a des menu_categories non vides ou des couleurs non par défaut
            best = all_prefs[0]
            for p in all_prefs:
                cats = p.get("menu_categories", [])
                color = p.get("primary_color", "#2563eb")
                updated = p.get("updated_at", "")
                best_cats = best.get("menu_categories", [])
                best_color = best.get("primary_color", "#2563eb")
                best_updated = best.get("updated_at", "")
                # Critères: catégories non vides, couleur personnalisée, ou plus récent
                if (len(cats) > len(best_cats)) or \
                   (color != "#2563eb" and best_color == "#2563eb") or \
                   (str(updated) > str(best_updated) and len(cats) >= len(best_cats)):
                    best = p
            # Supprimer les doublons
            ids_to_delete = [p["_id"] for p in all_prefs if p["_id"] != best["_id"]]
            if ids_to_delete:
                await db.user_preferences.delete_many({"_id": {"$in": ids_to_delete}})
                logger.info(f"[PREFS] Nettoyé {len(ids_to_delete)} doublon(s) pour user_id={user_id}")
            preferences = best
        else:
            preferences = await db.user_preferences.find_one({"user_id": user_id})
        
        if not preferences:
            # Créer des préférences par défaut
            default_prefs = {
                "user_id": user_id,
                "theme_mode": "light",
                "primary_color": "#2563eb",
                "secondary_color": "#64748b",
                "sidebar_bg_color": "#1f2937",
                "sidebar_position": "left",
                "sidebar_behavior": "minimizable",
                "sidebar_width": 256,
                "sidebar_icon_color": "#ffffff",
                "display_density": "normal",
                "font_size": "normal",
                "menu_categories": [],
                "menu_items": [],
                "header_icon_order": [],
                "default_home_page": "/dashboard",
                "date_format": "DD/MM/YYYY",
                "time_format": "24h",
                "currency": "€",
                "language": "fr",
                "dashboard_widgets": [],
                "dashboard_layout": {},
                "notifications_enabled": True,
                "email_notifications": True,
                "push_notifications": True,
                "sound_enabled": True,
                "stock_alert_threshold": 5,
                "customization_view_mode": "tabs",
                "preset_theme": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            preferences_obj = UserPreferences(**default_prefs)
            prefs_dict = preferences_obj.model_dump()
            await db.user_preferences.insert_one(prefs_dict)
            return preferences_obj
        
        return UserPreferences(**serialize_doc(preferences))
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des préférences : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

@router.put("/user-preferences", response_model=UserPreferences)
async def update_user_preferences(
    preferences_update: UserPreferencesUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Mettre à jour les préférences de l'utilisateur connecté"""
    try:
        user_id = current_user.get("id")
        logger.info(f"[PREFS] Mise à jour pour user_id: {user_id}")
        
        # Préparer les données de mise à jour
        # exclude_unset=True : ne mettre à jour que les champs explicitement envoyés
        # (permet de sauvegarder None/null pour les champs optionnels comme inactivity_timeout_minutes)
        update_data = preferences_update.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        logger.info(f"[PREFS] Données à mettre à jour: {list(update_data.keys())}")
        
        # Vérifier si les préférences existent
        existing = await db.user_preferences.find_one({"user_id": user_id})
        
        if not existing:
            # Créer les préférences si elles n'existent pas
            default_prefs = {
                "user_id": user_id,
                "theme_mode": "light",
                "primary_color": "#2563eb",
                "secondary_color": "#64748b",
                "sidebar_bg_color": "#1f2937",
                "sidebar_position": "left",
                "sidebar_behavior": "minimizable",
                "sidebar_width": 256,
                "sidebar_icon_color": "#ffffff",
                "display_density": "normal",
                "font_size": "normal",
                "menu_categories": [],
                "menu_items": [],
                "header_icon_order": [],
                "default_home_page": "/dashboard",
                "date_format": "DD/MM/YYYY",
                "time_format": "24h",
                "currency": "€",
                "language": "fr",
                "dashboard_widgets": [],
                "dashboard_layout": {},
                "notifications_enabled": True,
                "email_notifications": True,
                "push_notifications": True,
                "sound_enabled": True,
                "stock_alert_threshold": 5,
                "customization_view_mode": "tabs",
                "preset_theme": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            default_prefs.update(update_data)
            preferences_obj = UserPreferences(**default_prefs)
            prefs_dict = preferences_obj.model_dump()
            await db.user_preferences.insert_one(prefs_dict)
            
            # Journaliser l'action
            await audit_service.log_action(
                user_id=user_id,
                user_name=current_user.get("name", ""),
                user_email=current_user.get("email", ""),
                action=ActionType.UPDATE,
                entity_type=EntityType.SETTINGS,
                entity_id=user_id,
                details="Préférences utilisateur créées"
            )
            
            return preferences_obj
        else:
            # Mettre à jour les préférences existantes
            await db.user_preferences.update_one(
                {"user_id": user_id},
                {"$set": update_data}
            )
            
            # Récupérer les préférences mises à jour
            updated_prefs = await db.user_preferences.find_one({"user_id": user_id})
            
            # Journaliser l'action
            await audit_service.log_action(
                user_id=user_id,
                user_name=current_user.get("name", ""),
                user_email=current_user.get("email", ""),
                action=ActionType.UPDATE,
                entity_type=EntityType.SETTINGS,
                entity_id=user_id,
                details="Préférences utilisateur mises à jour"
            )
            
            return UserPreferences(**serialize_doc(updated_prefs))
    except Exception as e:
        import traceback
        logger.error(f"Erreur lors de la mise à jour des préférences : {str(e)}")
        logger.error(f"Traceback complet: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")


@router.get("/user-preferences/tour-status")
async def get_tour_status(current_user: dict = Depends(get_current_user)):
    """Retourne si l'utilisateur a déjà complété (ou passé) la visite guidée."""
    user_id = current_user.get("id")
    prefs = await db.user_preferences.find_one({"user_id": user_id}, {"_id": 0, "tour_completed": 1})
    completed = bool(prefs.get("tour_completed")) if prefs else False
    return {"tour_completed": completed}


@router.post("/user-preferences/tour-completed")
async def mark_tour_completed(current_user: dict = Depends(get_current_user)):
    """Marque la visite guidée comme terminée pour l'utilisateur (Terminer ou Passer)."""
    user_id = current_user.get("id")
    now = datetime.now(timezone.utc).isoformat()
    await db.user_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"tour_completed": True, "tour_completed_at": now, "updated_at": now}},
        upsert=True
    )
    logger.info(f"[TOUR] Visite guidée complétée/passée pour user_id={user_id}")
    return {"success": True, "tour_completed": True}


@router.delete("/user-preferences/tour-completed")
async def reset_tour_completed(current_user: dict = Depends(get_current_user)):
    """Réinitialise la visite guidée pour l'utilisateur (depuis Paramètres)."""
    user_id = current_user.get("id")
    now = datetime.now(timezone.utc).isoformat()
    await db.user_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"tour_completed": False, "tour_completed_at": None, "updated_at": now}}
    )
    return {"success": True, "tour_completed": False}


@router.post("/user-preferences/reset")
async def reset_user_preferences(current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user.get("id")
        
        # Supprimer les préférences existantes
        await db.user_preferences.delete_one({"user_id": user_id})
        
        # Créer des préférences par défaut
        default_prefs = {
            "user_id": user_id,
            "theme_mode": "light",
            "primary_color": "#2563eb",
            "secondary_color": "#64748b",
            "sidebar_bg_color": "#1f2937",
            "sidebar_position": "left",
            "sidebar_behavior": "minimizable",
            "sidebar_width": 256,
            "sidebar_icon_color": "#ffffff",
            "display_density": "normal",
            "font_size": "normal",
            "menu_categories": [],
            "menu_items": [],
            "header_icon_order": [],
            "default_home_page": "/dashboard",
            "date_format": "DD/MM/YYYY",
            "time_format": "24h",
            "currency": "€",
            "language": "fr",
            "dashboard_widgets": [],
            "dashboard_layout": {},
            "notifications_enabled": True,
            "email_notifications": True,
            "push_notifications": True,
            "sound_enabled": True,
            "stock_alert_threshold": 5,
            "customization_view_mode": "tabs",
            "preset_theme": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        preferences_obj = UserPreferences(**default_prefs)
        prefs_dict = preferences_obj.model_dump()
        await db.user_preferences.insert_one(prefs_dict)
        
        # Journaliser l'action
        await audit_service.log_action(
            user_id=user_id,
            user_name=current_user.get("name", ""),
            user_email=current_user.get("email", ""),
            action=ActionType.UPDATE,
            entity_type=EntityType.SETTINGS,
            entity_id=user_id,
            details="Préférences utilisateur réinitialisées"
        )
        
        return {"message": "Préférences réinitialisées avec succès", "preferences": preferences_obj}
    except Exception as e:
        logger.error(f"Erreur lors de la réinitialisation des préférences : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")


@router.post("/user-preferences/migrate-menus")
async def migrate_menu_preferences(current_user: dict = Depends(get_current_user)):
    """Mettre à jour automatiquement les préférences pour ajouter les menus manquants"""
    try:
        user_id = current_user.get("id")
        
        # Liste complète des menus par défaut
        complete_menu_items = [
            { "id": "dashboard", "label": "Tableau de bord", "path": "/dashboard", "icon": "LayoutDashboard", "module": "dashboard", "visible": True, "favorite": False, "order": 0 },
            { "id": "service-dashboard", "label": "Dashboard Service", "path": "/service-dashboard", "icon": "Presentation", "module": "serviceDashboard", "visible": True, "favorite": False, "order": 0.5 },
            { "id": "chat-live", "label": "Chat Live", "path": "/chat-live", "icon": "Mail", "module": "chatLive", "visible": True, "favorite": False, "order": 0.8 },
            { "id": "intervention-requests", "label": "Demandes d'inter.", "path": "/intervention-requests", "icon": "MessageSquare", "module": "interventionRequests", "visible": True, "favorite": False, "order": 1 },
            { "id": "work-orders", "label": "Ordres de travail", "path": "/work-orders", "icon": "ClipboardList", "module": "workOrders", "visible": True, "favorite": False, "order": 2 },
            { "id": "improvement-requests", "label": "Demandes d'amél.", "path": "/improvement-requests", "icon": "Lightbulb", "module": "improvementRequests", "visible": True, "favorite": False, "order": 3 },
            { "id": "improvements", "label": "Améliorations", "path": "/improvements", "icon": "Sparkles", "module": "improvements", "visible": True, "favorite": False, "order": 4 },
            { "id": "preventive-maintenance", "label": "Maintenance prev.", "path": "/preventive-maintenance", "icon": "Calendar", "module": "preventiveMaintenance", "visible": True, "favorite": False, "order": 5 },
            { "id": "planning-mprev", "label": "Planning M.Prev.", "path": "/planning-mprev", "icon": "Calendar", "module": "planningMprev", "visible": True, "favorite": False, "order": 6 },
            { "id": "assets", "label": "Équipements", "path": "/assets", "icon": "Wrench", "module": "assets", "visible": True, "favorite": False, "order": 7 },
            { "id": "inventory", "label": "Inventaire", "path": "/inventory", "icon": "Package", "module": "inventory", "visible": True, "favorite": False, "order": 8 },
            { "id": "purchase-requests", "label": "Demandes d'Achat", "path": "/purchase-requests", "icon": "ShoppingCart", "module": "purchaseRequests", "visible": True, "favorite": False, "order": 8.5 },
            { "id": "locations", "label": "Zones", "path": "/locations", "icon": "MapPin", "module": "locations", "visible": True, "favorite": False, "order": 9 },
            { "id": "meters", "label": "Compteurs", "path": "/meters", "icon": "Gauge", "module": "meters", "visible": True, "favorite": False, "order": 10 },
            { "id": "surveillance-plan", "label": "Plan de Surveillance", "path": "/surveillance-plan", "icon": "Eye", "module": "surveillance", "visible": True, "favorite": False, "order": 11 },
            { "id": "surveillance-rapport", "label": "Rapport Surveillance", "path": "/surveillance-rapport", "icon": "FileText", "module": "surveillanceRapport", "visible": True, "favorite": False, "order": 12 },
            { "id": "weekly-reports", "label": "Rapports Hebdo.", "path": "/weekly-reports", "icon": "FileText", "module": "weeklyReports", "visible": True, "favorite": False, "order": 12.5 },
            { "id": "presqu-accident", "label": "Presqu'accident", "path": "/presqu-accident", "icon": "AlertTriangle", "module": "presquaccident", "visible": True, "favorite": False, "order": 13 },
            { "id": "presqu-accident-rapport", "label": "Rapport P.accident", "path": "/presqu-accident-rapport", "icon": "FileText", "module": "presquaccidentRapport", "visible": True, "favorite": False, "order": 14 },
            { "id": "documentations", "label": "Documentations", "path": "/documentations", "icon": "FolderOpen", "module": "documentations", "visible": True, "favorite": False, "order": 15 },
            { "id": "reports", "label": "Rapports", "path": "/reports", "icon": "BarChart3", "module": "reports", "visible": True, "favorite": False, "order": 16 },
            { "id": "team-management", "label": "Gestion d'équipe", "path": "/team-management", "icon": "UserCog", "module": "timeTracking", "visible": True, "favorite": False, "order": 16.5 },
            { "id": "cameras", "label": "Caméras", "path": "/cameras", "icon": "Camera", "module": "cameras", "visible": True, "favorite": False, "order": 16.6 },
            { "id": "mes", "label": "M.E.S.", "path": "/mes", "icon": "Zap", "module": "mes", "visible": True, "favorite": False, "order": 16.7 },
            { "id": "mes-reports", "label": "Rapports M.E.S.", "path": "/mes-reports", "icon": "FileBarChart", "module": "mesReports", "visible": True, "favorite": False, "order": 16.8 },
            { "id": "analytics-checklists", "label": "Analytics Checklists", "path": "/analytics/checklists", "icon": "BarChart3", "module": "analyticsChecklists", "visible": True, "favorite": False, "order": 16.9 },
            { "id": "people", "label": "Utilisateurs", "path": "/people", "icon": "Users", "module": "people", "visible": True, "favorite": False, "order": 17 },
            { "id": "planning", "label": "Planning", "path": "/planning", "icon": "Calendar", "module": "planning", "visible": True, "favorite": False, "order": 18 },
            { "id": "vendors", "label": "Fournisseurs", "path": "/vendors", "icon": "ShoppingCart", "module": "vendors", "visible": True, "favorite": False, "order": 19 },
            { "id": "contrats", "label": "Contrats", "path": "/contrats", "icon": "FileSignature", "module": "contrats", "visible": True, "favorite": False, "order": 19.5 },
            { "id": "purchase-history", "label": "Historique Achat", "path": "/purchase-history", "icon": "ShoppingBag", "module": "purchaseHistory", "visible": True, "favorite": False, "order": 20 },
            { "id": "import-export", "label": "Import / Export", "path": "/import-export", "icon": "Database", "module": "importExport", "visible": True, "favorite": False, "order": 21 },
            { "id": "sensors", "label": "Capteurs MQTT", "path": "/sensors", "icon": "Activity", "module": "sensors", "visible": True, "favorite": False, "order": 22 },
            { "id": "iot-dashboard", "label": "Dashboard IoT", "path": "/iot-dashboard", "icon": "BarChart3", "module": "iotDashboard", "visible": True, "favorite": False, "order": 23 },
            { "id": "mqtt-logs", "label": "Logs MQTT", "path": "/mqtt-logs", "icon": "Terminal", "module": "mqttLogs", "visible": True, "favorite": False, "order": 24 },
            { "id": "whiteboard", "label": "Tableau d'affichage", "path": "/whiteboard", "icon": "Presentation", "module": "whiteboard", "visible": True, "favorite": False, "order": 25 },
            { "id": "consignations-loto", "label": "Consignations LOTO", "path": "/consignations-loto", "icon": "Shield", "module": "consignationsLoto", "visible": True, "favorite": False, "order": 26 },
            { "id": "surveillance-ai-history", "label": "Historique IA", "path": "/surveillance-ai-history", "icon": "History", "module": "surveillance", "visible": True, "favorite": False, "order": 27 },
            { "id": "surveillance-ai-dashboard", "label": "Tendances IA", "path": "/surveillance-ai-dashboard", "icon": "TrendingUp", "module": "surveillance", "visible": True, "favorite": False, "order": 28 },
            { "id": "accident-analysis", "label": "Arbre des Causes", "path": "/accident-analysis", "icon": "GitBranch", "module": "accidentAnalysis", "visible": True, "favorite": False, "order": 29 }
        ]
        
        # Récupérer les préférences actuelles
        preferences = await db.user_preferences.find_one({"user_id": user_id})
        
        if not preferences:
            # Si aucune préférence, utiliser la liste complète
            update_data = {
                "menu_items": complete_menu_items,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.user_preferences.insert_one({
                "user_id": user_id,
                **update_data
            })
            return {"message": "Préférences créées avec tous les menus", "added_count": len(complete_menu_items)}
        
        # Récupérer les menus actuels
        current_menus = preferences.get("menu_items", [])
        current_menu_ids = {menu["id"] for menu in current_menus}
        
        # Trouver les menus manquants
        missing_menus = [menu for menu in complete_menu_items if menu["id"] not in current_menu_ids]
        
        if not missing_menus:
            return {"message": "Aucun menu manquant", "added_count": 0}
        
        # Ajouter les menus manquants en préservant l'ordre
        updated_menus = current_menus + missing_menus
        
        # Réordonner tous les menus
        for idx, menu in enumerate(updated_menus):
            menu["order"] = idx
        
        # Mettre à jour dans la base de données
        await db.user_preferences.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "menu_items": updated_menus,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        # Journaliser l'action
        await audit_service.log_action(
            user_id=user_id,
            user_name=current_user.get("name", ""),
            user_email=current_user.get("email", ""),
            action=ActionType.UPDATE,
            entity_type=EntityType.SETTINGS,
            entity_id=user_id,
            details=f"Migration des menus - {len(missing_menus)} menu(s) ajouté(s)"
        )
        
        return {
            "message": f"{len(missing_menus)} menu(s) ajouté(s) avec succès",
            "added_count": len(missing_menus),
            "added_menus": [menu["label"] for menu in missing_menus]
        }
        
    except Exception as e:
        logger.error(f"Erreur lors de la migration des menus : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

# ==================== SMTP CONFIGURATION ROUTES ====================
@router.get("/smtp/config",
    summary="Configuration SMTP", response_model=SMTPConfig, tags=["Parametres"])
async def get_smtp_config(current_user: dict = Depends(get_current_admin_user)):
    """Récupérer la configuration SMTP actuelle (Admin uniquement)"""
    try:
        # Lire depuis les variables d'environnement
        config = SMTPConfig(
            smtp_host=os.environ.get('SMTP_HOST', 'smtp.gmail.com'),
            smtp_port=int(os.environ.get('SMTP_PORT', '587')),
            smtp_user=os.environ.get('SMTP_USER', ''),
            smtp_password='****' if os.environ.get('SMTP_PASSWORD') else '',  # Masquer le mot de passe
            smtp_from_email=os.environ.get('SMTP_FROM_EMAIL', ''),
            smtp_from_name=os.environ.get('SMTP_FROM_NAME', 'FSAO Iris'),
            smtp_use_tls=os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true',
            frontend_url=os.environ.get('FRONTEND_URL', ''),
            backend_url=os.environ.get('BACKEND_URL', '')
        )
        return config
    except Exception as e:
        logger.error(f"Erreur lors de la récupération de la config SMTP: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/smtp/config",
    summary="Modifier la config SMTP", response_model=SuccessResponse, tags=["Parametres"])
async def update_smtp_config(
    smtp_update: SMTPConfigUpdate,
    current_user: dict = Depends(get_current_admin_user)
):
    """Mettre à jour la configuration SMTP (Admin uniquement)"""
    try:
        env_path = ROOT_DIR / '.env'
        
        # Lire le fichier .env actuel
        env_vars = {}
        if env_path.exists():
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        env_vars[key] = value
        
        # Mettre à jour les variables
        if smtp_update.smtp_host is not None:
            env_vars['SMTP_HOST'] = smtp_update.smtp_host
        if smtp_update.smtp_port is not None:
            env_vars['SMTP_PORT'] = str(smtp_update.smtp_port)
        if smtp_update.smtp_user is not None:
            env_vars['SMTP_USER'] = smtp_update.smtp_user
        if smtp_update.smtp_password is not None and smtp_update.smtp_password != '****':
            env_vars['SMTP_PASSWORD'] = smtp_update.smtp_password
        if smtp_update.smtp_from_email is not None:
            env_vars['SMTP_FROM_EMAIL'] = smtp_update.smtp_from_email
        if smtp_update.smtp_from_name is not None:
            env_vars['SMTP_FROM_NAME'] = smtp_update.smtp_from_name
        if smtp_update.smtp_use_tls is not None:
            env_vars['SMTP_USE_TLS'] = 'true' if smtp_update.smtp_use_tls else 'false'
        if smtp_update.frontend_url is not None:
            env_vars['FRONTEND_URL'] = smtp_update.frontend_url
        if smtp_update.backend_url is not None:
            env_vars['BACKEND_URL'] = smtp_update.backend_url
        
        # Écrire le fichier .env mis à jour
        with open(env_path, 'w') as f:
            for key, value in env_vars.items():
                f.write(f"{key}={value}\n")
        
        # Mettre à jour les variables d'environnement en mémoire
        for key, value in env_vars.items():
            os.environ[key] = value
        
        # Réinitialiser le service email avec la nouvelle configuration
        email_service.init_email_service()
        
        # Journaliser l'action
        await audit_service.log_action(
            user_id=current_user["id"],
            user_name=f"{current_user['prenom']} {current_user['nom']}",
            user_email=current_user["email"],
            action=ActionType.UPDATE,
            entity_type=EntityType.SETTINGS,
            entity_id="smtp",
            entity_name="Configuration SMTP",
            details="Modification de la configuration SMTP"
        )
        
        return {"success": True, "message": "Configuration SMTP mise à jour avec succès"}
    except Exception as e:
        logger.error(f"Erreur lors de la mise à jour de la config SMTP: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smtp/test",
    summary="Tester la config SMTP", response_model=SuccessResponse, tags=["Parametres"])
async def test_smtp_config(
    test_request: SMTPTestRequest,
    current_user: dict = Depends(get_current_admin_user)
):
    """Tester la configuration SMTP en envoyant un email de test (Admin uniquement)"""
    try:
        # Envoyer un email de test
        success = email_service.send_test_email(test_request.test_email)
        
        if success:
            # Journaliser l'action
            await audit_service.log_action(
                user_id=current_user["id"],
                user_name=f"{current_user['prenom']} {current_user['nom']}",
                user_email=current_user["email"],
                action=ActionType.UPDATE,
                entity_type=EntityType.SETTINGS,
                entity_id="smtp_test",
                entity_name="Test SMTP",
                details=f"Test d'envoi d'email vers {test_request.test_email}"
            )
            
            return {"success": True, "message": f"Email de test envoyé avec succès à {test_request.test_email}"}
        else:
            return {"success": False, "message": "Échec de l'envoi de l'email de test"}
    except Exception as e:
        logger.error(f"Erreur lors du test SMTP: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))



