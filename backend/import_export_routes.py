"""
Routes pour l'import/export de données FSAO Iris
Module séparé pour une meilleure organisation du code
"""
import io
import os
import uuid
import zipfile
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse
import pandas as pd
from bson import ObjectId
from dependencies import get_current_admin_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Import/Export"])

# Variable globale pour la DB (sera injectée depuis server.py)
db = None

# Répertoire des uploads
UPLOADS_DIR = Path("/app/backend/uploads")

# Répertoire temporaire pour les uploads chunkés
CHUNKED_UPLOAD_DIR = Path("/app/backend/chunked_uploads")
CHUNKED_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

def init_db(database):
    """Initialiser la référence à la base de données"""
    global db
    db = database

# Mapping des modules vers les collections MongoDB
EXPORT_MODULES = {
    # --- Modules existants ---
    "intervention-requests": "intervention_requests",
    "work-orders": "work_orders",
    "improvement-requests": "improvement_requests",
    "improvements": "improvements",
    "equipments": "equipments",
    "meters": "meters",
    "meter-readings": "meter_readings",
    "surveillance-items": "surveillance_items",
    "presqu-accident-items": "presqu_accident_items",
    "users": "users",
    "inventory": "inventory",
    "locations": "locations",
    "vendors": "vendors",
    "purchase-history": "purchase_history",
    "purchase-requests": "purchase_requests",
    "preventive-maintenance": "preventive_maintenance",
    "preventive-checklists": "preventive_checklists",
    "preventive-checklist-templates": "preventive_checklist_templates",
    "preventive-checklist-executions": "preventive_checklist_executions",
    "sensors": "sensors",
    "documentations": "poles_service",
    "documents": "documents",
    "bons-travail": "bons_travail",
    "doc-folders": "doc_folders",
    "mqtt-logs": "mqtt_logs",
    "chat-messages": "chat_messages",
    # --- M.E.S. ---
    "mes-machines": "mes_machines",
    "mes-product-references": "mes_product_references",
    "mes-rejects": "mes_rejects",
    "mes-reject-reasons": "mes_reject_reasons",
    "mes-cadence-history": "mes_cadence_history",
    "mes-alerts": "mes_alerts",
    "mes-scheduled-reports": "mes_scheduled_reports",
    "mes-pulses": "mes_pulses",
    # --- Caméras ---
    "cameras": "cameras",
    "camera-settings": "camera_settings",
    "camera-alerts": "camera_alerts",
    # --- Rapports ---
    "reports-historique": "reports_historique",
    "weekly-report-history": "weekly_report_history",
    "weekly-report-settings": "weekly_report_settings",
    "weekly-report-templates": "weekly_report_templates",
    # --- Consignes ---
    "consignes": "consignes",
    # --- Consignations LOTO ---
    "loto-consignations": "loto_consignations",
    # --- Tableaux blancs ---
    "whiteboards": "whiteboards",
    "whiteboard-objects": "whiteboard_objects",
    # --- Demandes d'arrêt ---
    "demandes-arret": "demandes_arret",
    # --- Planning ---
    "planning-equipement": "planning_equipement",
    # --- Rôles ---
    "roles": "roles",
    # --- Formulaires ---
    "custom-forms": "custom_forms",
    "form-templates": "form_templates",
    # --- Surveillance complémentaire ---
    "surveillance-plan": "surveillance_plan",
    "surveillance-controls": "surveillance_controls",
    # --- Presqu'accident rapport ---
    "presqu-accident": "presqu_accident",
    # --- Configuration système ---
    "global-settings": "global_settings",
    "mqtt-config": "mqtt_config",
    "mqtt-subscriptions": "mqtt_subscriptions",
    # --- Absences / Équipe ---
    "absences": "absences",
    "team-members": "team_members",
    "work-rhythms": "work_rhythms",
    # --- Templates OT ---
    "work-order-templates": "work_order_templates",
    # --- Notifications ---
    "notifications": "notifications",
    # --- Préférences utilisateur ---
    "user-preferences": "user_preferences",
    # --- Audit ---
    "audit-logs": "audit_logs",
    # --- Dashboard service ---
    "service-dashboard-configs": "service_dashboard_configs",
    # --- Contrats ---
    "contracts": "contracts",
}

# Mappings de colonnes pour l'import (noms français/anglais vers noms internes)
COLUMN_MAPPINGS = {
    "purchase-history": {
        "Fournisseur": "fournisseur",
        "N° Commande ": "numeroCommande",
        "N° Commande": "numeroCommande",
        "N° reception": "numeroReception",
        "Date de création": "dateCreation",
        "Article": "article",
        "Description 1": "description",
        "Description": "description",
        "Groupe statistique": "groupeStatistique",
        "Groupe statistique STK": "groupeStatistique",
        "STK quantité": "quantite",
        "quantité": "quantite",
        "Quantité": "quantite",
        "Montant ligne HT": "montantLigneHT",
        "Quantité retournée": "quantiteRetournee",
        "Site ": "site",
        "Site": "site",
        "Creation user": "creationUser"
    },
    "work-orders": {
        "ID": "id", "id": "id",
        "Titre": "titre", "Title": "titre", "titre": "titre",
        "Description": "description", "description": "description",
        "Priorité": "priorite", "Priority": "priorite", "priorite": "priorite",
        "Statut": "statut", "Status": "statut", "statut": "statut",
        "Catégorie": "categorie", "Category": "categorie", "categorie": "categorie",
        "Date création": "dateCreation", "dateCreation": "dateCreation",
        "Date début": "dateDebut", "dateDebut": "dateDebut",
        "Date fin": "dateFin", "dateFin": "dateFin",
        "Date limite": "dateLimite", "dateLimite": "dateLimite",
        "Équipement": "equipement_id", "Equipment": "equipement_id", "equipement_id": "equipement_id",
        "Assigné à": "assigne_a_id", "Assigned To": "assigne_a_id", "assigne_a_id": "assigne_a_id",
        "Emplacement": "emplacement_id", "Location": "emplacement_id", "emplacement_id": "emplacement_id",
        "Temps estimé": "tempsEstime", "tempsEstime": "tempsEstime",
        "Temps réel": "tempsReel", "tempsReel": "tempsReel",
        "Numéro": "numero", "numero": "numero",
        "Créé par": "createdBy", "createdBy": "createdBy"
    },
    "equipments": {
        "ID": "id", "Nom": "name", "Name": "name", "Code": "code",
        "Type": "type", "Marque": "brand", "Brand": "brand",
        "Modèle": "model", "Model": "model",
        "Numéro de série": "serialNumber", "Serial Number": "serialNumber",
        "Zone": "location", "Location": "location",
        "Statut": "status", "Status": "status",
        "Date installation": "installDate"
    },
    "intervention-requests": {
        "ID": "id", "Titre": "title", "Title": "title",
        "Description": "description", "Priorité": "priority", "Priority": "priority",
        "Statut": "status", "Status": "status",
        "Date création": "dateCreation",
        "Équipement": "equipment", "Equipment": "equipment",
        "Demandeur": "requestedBy", "Requested By": "requestedBy"
    },
    "improvement-requests": {
        "ID": "id", "Titre": "title", "Title": "title",
        "Description": "description", "Priorité": "priority", "Priority": "priority",
        "Statut": "status", "Status": "status",
        "Date création": "dateCreation", "Demandeur": "requestedBy"
    },
    "improvements": {
        "ID": "id", "Titre": "title", "Title": "title",
        "Description": "description", "Priorité": "priority", "Priority": "priority",
        "Statut": "status", "Status": "status",
        "Date création": "dateCreation", "Date début": "dateDebut",
        "Date fin": "dateFin", "Assigné à": "assignedTo"
    },
    "locations": {
        "ID": "id", "Nom": "name", "Name": "name", "Code": "code",
        "Type": "type", "Parent": "parent", "Description": "description"
    },
    "meters": {
        "ID": "id", "Nom": "name", "Name": "name", "Type": "type",
        "Équipement": "equipment", "Equipment": "equipment",
        "Unité": "unit", "Unit": "unit",
        "Valeur actuelle": "currentValue", "Current Value": "currentValue"
    },
    "users": {
        "ID": "id", "Email": "email",
        "Prénom": "prenom", "First Name": "prenom",
        "Nom": "nom", "Last Name": "nom",
        "Rôle": "role", "Role": "role",
        "Téléphone": "telephone", "Phone": "telephone",
        "Service": "service"
    },
    "inventory": {
        "ID": "id", "Nom": "name", "Name": "name", "Code": "code",
        "Catégorie": "category", "Category": "category",
        "Quantité": "quantity", "Quantity": "quantity",
        "Seuil min": "minQuantity", "Min Quantity": "minQuantity",
        "Unité": "unit", "Unit": "unit",
        "Emplacement": "location", "Location": "location",
        "Prix unitaire": "unitPrice", "Unit Price": "unitPrice"
    },
    "vendors": {
        "ID": "id", "Nom": "name", "Name": "name",
        "Email": "email", "Téléphone": "phone", "Phone": "phone",
        "Adresse": "address", "Address": "address",
        "Contact": "contact", "Notes": "notes"
    },
    "contracts": {
        "N° Contrat": "numero_contrat", "Numero Contrat": "numero_contrat",
        "Titre": "titre", "Objet": "titre",
        "Type": "type_contrat", "Type Contrat": "type_contrat",
        "Statut": "statut",
        "Date Etablissement": "date_etablissement",
        "Date Debut": "date_debut", "Date de debut": "date_debut",
        "Date Fin": "date_fin", "Date de fin": "date_fin",
        "Montant Total": "montant_total",
        "Periodicite": "periodicite_paiement",
        "Montant Periode": "montant_periode",
        "Mode Paiement": "mode_paiement",
        "Fournisseur": "fournisseur_nom",
        "Adresse Fournisseur": "fournisseur_adresse",
        "Tel Fournisseur": "fournisseur_telephone",
        "Email Fournisseur": "fournisseur_email",
        "Contact": "contact_nom",
        "Tel Contact": "contact_telephone",
        "Email Contact": "contact_email",
        "Signataire": "signataire_interne_nom",
        "Commande Interne": "commande_interne",
        "Notes": "notes"
    }
}

# Mapping des noms de feuilles Excel vers les modules
SHEET_TO_MODULE = {
    # Noms techniques (export récent)
    "intervention-requests": "intervention-requests",
    "intervention_requests": "intervention-requests",
    "work-orders": "work-orders",
    "work_orders": "work-orders",
    "improvement-requests": "improvement-requests",
    "improvement_requests": "improvement-requests",
    "improvements": "improvements",
    "equipments": "equipments",
    "locations": "locations",
    "inventory": "inventory",
    "purchase-history": "purchase-history",
    "purchase_history": "purchase-history",
    "purchase-requests": "purchase-requests",
    "purchase_requests": "purchase-requests",
    "meters": "meters",
    "users": "users",
    "people": "users",
    "vendors": "vendors",
    "sensors": "sensors",
    "chat-messages": "chat-messages",
    "chat_messages": "chat-messages",
    "preventive-maintenance": "preventive-maintenance",
    "preventive_maintenance": "preventive-maintenance",
    "documentations": "documentations",
    # Noms français (export ancienne version)
    "fournisseurs": "vendors",
    "inventaire": "equipments",
    "pieces": "chat-messages",
    "pièces": "chat-messages",
    "user": "users",
    "utilisateurs": "users",
    "utilisateur": "users",
    "sensor": "sensors",
    "capteurs": "sensors",
    "capteur": "sensors",
    "tâches": "improvement-requests",
    "taches": "improvement-requests",
    "ordres": "work-orders",
    "ordres de travail": "work-orders",
    "sheet1": "work-orders",
    "demandeschat": "purchase-requests",
    "demandes": "purchase-requests",
    "demandes d'achat": "purchase-requests",
    "améliorations": "improvements",
    "ameliorations": "improvements",
    "zones": "locations",
    "emplacements": "locations",
    "équipements": "equipments",
    "equipements": "equipments",
    "maintenance préventive": "preventive-maintenance",
    "maintenance preventive": "preventive-maintenance",
    # Noms des nouvelles fonctionnalités
    "mes-machines": "mes-machines",
    "mes_machines": "mes-machines",
    "mes-product-references": "mes-product-references",
    "mes_product_references": "mes-product-references",
    "mes-rejects": "mes-rejects",
    "mes_rejects": "mes-rejects",
    "mes-reject-reasons": "mes-reject-reasons",
    "mes_reject_reasons": "mes-reject-reasons",
    "mes-cadence-history": "mes-cadence-history",
    "mes_cadence_history": "mes-cadence-history",
    "mes-alerts": "mes-alerts",
    "mes_alerts": "mes-alerts",
    "mes-scheduled-reports": "mes-scheduled-reports",
    "mes_scheduled_reports": "mes-scheduled-reports",
    "mes-pulses": "mes-pulses",
    "mes_pulses": "mes-pulses",
    "cameras": "cameras",
    "camera-settings": "camera-settings",
    "camera_settings": "camera-settings",
    "camera-alerts": "camera-alerts",
    "camera_alerts": "camera-alerts",
    "reports-historique": "reports-historique",
    "reports_historique": "reports-historique",
    "weekly-report-history": "weekly-report-history",
    "weekly_report_history": "weekly-report-history",
    "weekly-report-settings": "weekly-report-settings",
    "weekly_report_settings": "weekly-report-settings",
    "weekly-report-templates": "weekly-report-templates",
    "weekly_report_templates": "weekly-report-templates",
    "consignes": "consignes",
    "whiteboards": "whiteboards",
    "whiteboard-objects": "whiteboard-objects",
    "whiteboard_objects": "whiteboard-objects",
    "demandes-arret": "demandes-arret",
    "demandes_arret": "demandes-arret",
    "planning-equipement": "planning-equipement",
    "planning_equipement": "planning-equipement",
    "roles": "roles",
    "custom-forms": "custom-forms",
    "custom_forms": "custom-forms",
    "form-templates": "form-templates",
    "form_templates": "form-templates",
    "surveillance-plan": "surveillance-plan",
    "surveillance_plan": "surveillance-plan",
    "surveillance-controls": "surveillance-controls",
    "surveillance_controls": "surveillance-controls",
    "presqu-accident": "presqu-accident",
    "presqu_accident": "presqu-accident",
    "global-settings": "global-settings",
    "global_settings": "global-settings",
    "mqtt-config": "mqtt-config",
    "mqtt_config": "mqtt-config",
    "mqtt-subscriptions": "mqtt-subscriptions",
    "mqtt_subscriptions": "mqtt-subscriptions",
    "absences": "absences",
    "team-members": "team-members",
    "team_members": "team-members",
    "work-rhythms": "work-rhythms",
    "work_rhythms": "work-rhythms",
    "work-order-templates": "work-order-templates",
    "work_order_templates": "work-order-templates",
    "documents": "documents",
    "bons-travail": "bons-travail",
    "bons_travail": "bons-travail",
    "doc-folders": "doc-folders",
    "doc_folders": "doc-folders",
    "poles_service": "documentations",
    "notifications": "notifications",
    "user-preferences": "user-preferences",
    "user_preferences": "user-preferences",
    "audit-logs": "audit-logs",
    "audit_logs": "audit-logs",
    "service-dashboard-configs": "service-dashboard-configs",
    "service_dashboard_configs": "service-dashboard-configs",
    "contracts": "contracts",
    "contrats": "contracts",
}


def clean_item_for_export(item: dict) -> dict:
    """Nettoyer un item pour l'export (convertir types non sérialisables)"""
    import json
    cleaned = {k: v for k, v in item.items() if k != "_id"}
    cleaned["id"] = str(item.get("_id", item.get("id", "")))
    
    for key, value in cleaned.items():
        if isinstance(value, datetime):
            cleaned[key] = value.isoformat()
        elif isinstance(value, ObjectId):
            cleaned[key] = str(value)
        elif isinstance(value, list):
            cleaned[key] = json.dumps(value, default=str)
        elif isinstance(value, dict):
            cleaned[key] = json.dumps(value, default=str)
    
    return cleaned


def detect_csv_separator(content: bytes) -> str:
    """Détecter le séparateur CSV (virgule, point-virgule ou tabulation)"""
    content_str = content.decode('utf-8', errors='ignore')
    first_line = content_str.split('\n')[0] if content_str else ""
    
    comma_count = first_line.count(',')
    semicolon_count = first_line.count(';')
    tab_count = first_line.count('\t')
    
    if semicolon_count > comma_count and semicolon_count > tab_count:
        return ';'
    elif tab_count > comma_count:
        return '\t'
    return ','


def convert_date_field(value, field_name: str):
    """Convertir une valeur de date en datetime"""
    if value is None:
        return None
    
    try:
        if isinstance(value, str):
            # Format français DD/MM/YYYY
            if '/' in value:
                parts = value.split('/')
                if len(parts) == 3:
                    value = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
            return datetime.fromisoformat(value)
        elif hasattr(value, 'to_pydatetime'):
            return value.to_pydatetime()
        elif isinstance(value, datetime):
            return value
    except Exception as e:
        logger.warning(f"Erreur conversion date {field_name}: {e}")
    return None


async def process_import_item(item: dict, module: str, collection_name: str, current_user: dict, mode: str) -> dict:
    """Traiter un item pour l'import"""
    import json
    
    # Nettoyer les NaN
    cleaned = {k: v for k, v in item.items() if pd.notna(v) and v != "" and v is not None}
    
    # --- Restaurer l'_id original (ObjectId) pour préserver les références ---
    item_id = cleaned.pop("id", None)
    if item_id:
        try:
            cleaned["_id"] = ObjectId(str(item_id))
        except Exception:
            cleaned["_id"] = ObjectId()
    else:
        cleaned["_id"] = ObjectId()
    
    # --- Convertir les champs *_id en ObjectId ---
    id_fields = [
        "equipement_id", "assigne_a_id", "emplacement_id", "createdBy",
        "parent_id", "created_by", "demandeur_id", "destinataire_id",
        "responsable_n1_id", "responsable_hierarchique_id",
        "preventive_maintenance_id", "checklist_id", "inventory_item_id",
        "user_id", "archived_by"
    ]
    for field in id_fields:
        val = cleaned.get(field)
        if val and isinstance(val, str) and len(val) == 24:
            try:
                cleaned[field] = ObjectId(val)
            except Exception:
                pass
    
    # --- Parser les champs JSON (listes/dicts stockés comme strings) ---
    json_fields = [
        "comments", "attachments", "historique", "permissions", "parts_used",
        "time_entries", "history", "recipient_ids", "recipient_names",
        "reactions", "attached_files", "equipment_ids"
    ]
    for field in json_fields:
        if field in cleaned:
            val = cleaned[field]
            if isinstance(val, str):
                try:
                    parsed = json.loads(val)
                    cleaned[field] = parsed
                except Exception:
                    if val in ("[]", ""):
                        cleaned[field] = []
                    elif val in ("{}", ""):
                        cleaned[field] = {}
            elif not isinstance(val, (list, dict)):
                cleaned[field] = []
        # Ne PAS forcer des listes vides si le champ n'existe pas
    
    # --- Convertir les champs numériques ---
    num_fields = ["quantite", "seuil_alerte", "prix_unitaire", "prixUnitaire",
                  "quantiteMin", "montantLigneHT", "quantiteRetournee",
                  "tempsEstime", "tempsReel", "refresh_interval",
                  "min_threshold", "max_threshold", "numero"]
    for field in num_fields:
        if field in cleaned:
            try:
                val = cleaned[field]
                if isinstance(val, str):
                    val = val.replace(',', '.').replace(' ', '')
                cleaned[field] = float(val) if '.' in str(val) else int(val)
            except Exception:
                pass
    
    # --- Convertir les champs date ---
    date_fields = [
        "dateCreation", "dateDebut", "dateFin", "dateLimite", "dateTermine",
        "dateAchat", "date_creation", "date_ajout", "derniere_modification",
        "derniereModification", "derniereConnexion", "date_derniere_modification",
        "date_validation_n1", "date_approbation_achat", "date_achat_effectue",
        "date_reception", "date_distribution", "date_limite_desiree",
        "converted_at", "statut_changed_at", "last_update",
        "inventory_added_at", "archived_at", "deletable_until", "deleted_at",
        "timestamp"
    ]
    for field in date_fields:
        if field in cleaned:
            cleaned[field] = convert_date_field(cleaned[field], field)
    
    # --- Traitement spécifique users ---
    if module == "users":
        if "statut" not in cleaned:
            cleaned["statut"] = "actif"
        # Assurer que actif est un bool
        if "actif" in cleaned:
            cleaned["actif"] = cleaned["actif"] in (True, "true", "True", 1, "actif")
        else:
            cleaned["actif"] = cleaned.get("statut", "actif") == "actif"
        # S'assurer que hashed_password existe
        if "hashed_password" not in cleaned:
            import bcrypt
            cleaned["hashed_password"] = bcrypt.hashpw("Changez-moi!".encode(), bcrypt.gensalt()).decode()
        # Parser permissions si c'est un string JSON
        if "permissions" in cleaned and isinstance(cleaned["permissions"], str):
            try:
                cleaned["permissions"] = json.loads(cleaned["permissions"])
            except Exception:
                pass
        if "firstLogin" in cleaned and isinstance(cleaned["firstLogin"], str):
            try:
                parsed = json.loads(cleaned["firstLogin"])
                if isinstance(parsed, dict) and "dashboard" in parsed:
                    cleaned["permissions"] = parsed
                    del cleaned["firstLogin"]
            except Exception:
                pass
    
    # --- Traitement spécifique work-orders ---
    if module in ["work-orders", "intervention-requests"]:
        if "statut" not in cleaned:
            cleaned["statut"] = "OUVERT"
        if "priorite" not in cleaned:
            cleaned["priorite"] = "AUCUNE"
        if "categorie" not in cleaned:
            cleaned["categorie"] = "TRAVAUX_DIVERS"
    
    # --- Traitement spécifique equipments ---
    if module == "equipments":
        if "statut" not in cleaned:
            cleaned["statut"] = "OPERATIONNEL"
    
    # --- Mode replace: vérifier si existe ---
    if mode == "replace":
        existing = await db[collection_name].find_one({"_id": cleaned["_id"]})
        if existing:
            await db[collection_name].update_one({"_id": cleaned["_id"]}, {"$set": {k: v for k, v in cleaned.items() if k != "_id"}})
            return {"action": "updated", "id": str(cleaned["_id"])}
    
    # --- Mode add: vérifier si _id existe déjà ---
    existing = await db[collection_name].find_one({"_id": cleaned["_id"]})
    if existing:
        return {"action": "skipped", "id": str(cleaned["_id"])}
    
    await db[collection_name].insert_one(cleaned)
    return {"action": "inserted", "id": str(cleaned["_id"])}


@router.get("/export/{module}")
async def export_data(
    module: str,
    format: str = "csv",
    current_user: dict = Depends(get_current_admin_user)
):
    """Exporter les données d'un module (admin uniquement)"""
    try:
        if module not in EXPORT_MODULES and module != "all":
            raise HTTPException(status_code=400, detail="Module invalide")
        
        data_to_export = {}
        
        if module == "all":
            modules_to_export = EXPORT_MODULES
        else:
            modules_to_export = {module: EXPORT_MODULES[module]}
        
        for mod_name, collection_name in modules_to_export.items():
            items = await db[collection_name].find().to_list(10000)
            cleaned_items = [clean_item_for_export(item) for item in items]
            data_to_export[mod_name] = cleaned_items
        
        # Générer le fichier
        if format == "csv":
            if len(data_to_export) == 1:
                mod_name = list(data_to_export.keys())[0]
                df = pd.DataFrame(data_to_export[mod_name])
                
                output = io.StringIO()
                df.to_csv(output, index=False, encoding='utf-8')
                output.seek(0)
                
                return StreamingResponse(
                    io.BytesIO(output.getvalue().encode('utf-8')),
                    media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={mod_name}.csv"}
                )
            else:
                raise HTTPException(status_code=400, detail="Pour exporter tout, utilisez le format xlsx")
        
        elif format == "xlsx":
            # Pour "all", créer un ZIP avec Excel + fichiers uploadés
            if module == "all":
                zip_output = io.BytesIO()
                with zipfile.ZipFile(zip_output, 'w', zipfile.ZIP_DEFLATED) as zf:
                    # 1. Ajouter le fichier Excel des données
                    xlsx_output = io.BytesIO()
                    with pd.ExcelWriter(xlsx_output, engine='openpyxl') as writer:
                        for mod_name, items in data_to_export.items():
                            df = pd.DataFrame(items)
                            sheet_name = mod_name[:31]
                            df.to_excel(writer, sheet_name=sheet_name, index=False)
                    xlsx_output.seek(0)
                    zf.writestr("data.xlsx", xlsx_output.getvalue())
                    logger.info("[Export] data.xlsx ajouté au ZIP")

                    # 2. Ajouter tous les fichiers uploadés
                    file_count = 0
                    if UPLOADS_DIR.exists():
                        for file_path in UPLOADS_DIR.rglob("*"):
                            if file_path.is_file():
                                arcname = f"uploads/{file_path.relative_to(UPLOADS_DIR)}"
                                zf.write(file_path, arcname)
                                file_count += 1
                    logger.info(f"[Export] {file_count} fichier(s) ajouté(s) au ZIP")

                zip_output.seek(0)

                # Vérification d'intégrité du ZIP
                with zipfile.ZipFile(io.BytesIO(zip_output.getvalue()), 'r') as zf_verify:
                    bad_file = zf_verify.testzip()
                    if bad_file is not None:
                        raise HTTPException(status_code=500, detail=f"Fichier corrompu dans le ZIP: {bad_file}")
                    logger.info(f"[Export] Intégrité ZIP vérifiée: {len(zf_verify.namelist())} entrée(s)")

                zip_output.seek(0)
                filename = f"export_complet_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"

                return StreamingResponse(
                    zip_output,
                    media_type="application/zip",
                    headers={"Content-Disposition": f"attachment; filename={filename}"}
                )
            else:
                # Export simple d'un seul module en XLSX
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    for mod_name, items in data_to_export.items():
                        df = pd.DataFrame(items)
                        sheet_name = mod_name[:31]
                        df.to_excel(writer, sheet_name=sheet_name, index=False)

                output.seek(0)
                filename = f"export_{module}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

                return StreamingResponse(
                    output,
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename={filename}"}
                )
        
        else:
            raise HTTPException(status_code=400, detail="Format non supporté (csv ou xlsx)")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur export: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Upload chunké pour gros fichiers (contourne la limite Nginx) ---

@router.post("/restore/chunked/init")
async def chunked_upload_init(
    filename: str = Form(...),
    filesize: int = Form(...),
    current_user: dict = Depends(get_current_admin_user)
):
    """Initialiser une session d'upload chunké"""
    if not filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Le fichier doit être un ZIP")

    session_id = str(uuid.uuid4())
    session_dir = CHUNKED_UPLOAD_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"[Chunked Upload] Session initialisée: {session_id}, fichier: {filename}, taille: {filesize}")
    return {"session_id": session_id, "filename": filename, "filesize": filesize}


@router.post("/restore/chunked/upload")
async def chunked_upload_part(
    session_id: str = Form(...),
    chunk_index: int = Form(...),
    chunk: UploadFile = File(...),
    current_user: dict = Depends(get_current_admin_user)
):
    """Uploader un morceau du fichier"""
    session_dir = CHUNKED_UPLOAD_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session d'upload non trouvée")

    chunk_path = session_dir / f"chunk_{chunk_index:06d}"
    content = await chunk.read()
    with open(chunk_path, 'wb') as f:
        f.write(content)

    logger.info(f"[Chunked Upload] Session {session_id}: chunk {chunk_index} reçu ({len(content)} bytes)")
    return {"session_id": session_id, "chunk_index": chunk_index, "size": len(content)}


@router.post("/restore/chunked/complete")
async def chunked_upload_complete(
    session_id: str = Form(...),
    total_chunks: int = Form(...),
    mode: str = Form("merge"),
    current_user: dict = Depends(get_current_admin_user)
):
    """Assembler les chunks et lancer la restauration"""
    session_dir = CHUNKED_UPLOAD_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session d'upload non trouvée")

    try:
        # Assembler les chunks dans l'ordre
        assembled_path = session_dir / "assembled.zip"
        with open(assembled_path, 'wb') as outfile:
            for i in range(total_chunks):
                chunk_path = session_dir / f"chunk_{i:06d}"
                if not chunk_path.exists():
                    raise HTTPException(status_code=400, detail=f"Chunk {i} manquant")
                with open(chunk_path, 'rb') as chunk_file:
                    outfile.write(chunk_file.read())

        file_size = assembled_path.stat().st_size
        logger.info(f"[Chunked Upload] Assemblage terminé: {file_size} bytes, {total_chunks} chunks")

        # Lire le fichier assemblé et lancer la restauration
        with open(assembled_path, 'rb') as f:
            content = f.read()

        result = await _do_restore(content, mode, current_user)
        return result

    finally:
        # Nettoyage du répertoire temporaire
        try:
            shutil.rmtree(session_dir)
            logger.info(f"[Chunked Upload] Session {session_id} nettoyée")
        except Exception as e:
            logger.warning(f"[Chunked Upload] Erreur nettoyage session {session_id}: {e}")


async def _do_restore(content: bytes, mode: str, current_user: dict):
    """Logique de restauration commune (utilisée par l'upload classique et chunké)"""
    restored_files = 0
    collections_cleared = 0

    # Vérifier que c'est un ZIP valide avec data.xlsx
    try:
        zf_test = zipfile.ZipFile(io.BytesIO(content), 'r')
        if 'data.xlsx' not in zf_test.namelist():
            zf_test.close()
            raise HTTPException(status_code=400, detail="ZIP invalide : le fichier data.xlsx est manquant. Ce n'est pas un backup FSAO valide.")
        zf_test.close()
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Le fichier ZIP est corrompu ou invalide")

    data_sheets = {}

    with zipfile.ZipFile(io.BytesIO(content), 'r') as zf:
        # 1. Lire data.xlsx
        xlsx_bytes = zf.read('data.xlsx')
        all_sheets = pd.read_excel(io.BytesIO(xlsx_bytes), sheet_name=None, engine='openpyxl')
        logger.info(f"[Restore] data.xlsx: {len(all_sheets)} feuilles")

        for sheet_name, df in all_sheets.items():
            module_name = SHEET_TO_MODULE.get(sheet_name.lower())
            if module_name and module_name in EXPORT_MODULES:
                data_sheets[module_name] = df
                logger.info(f"[Restore] Feuille '{sheet_name}' -> '{module_name}': {len(df)} lignes")

        # 2. Restaurer les fichiers uploadés
        upload_entries = [n for n in zf.namelist() if n.startswith('uploads/') and not n.endswith('/')]
        for entry in upload_entries:
            target = UPLOADS_DIR / entry.replace('uploads/', '', 1)
            target.parent.mkdir(parents=True, exist_ok=True)
            with open(target, 'wb') as f:
                f.write(zf.read(entry))
            restored_files += 1

        logger.info(f"[Restore] {restored_files} fichier(s) restauré(s)")

    # Mode "full": vider les collections avant import
    if mode == "full":
        protected_collections = {"manual_chapters", "manual_sections", "audit_logs"}
        for module_name, df in data_sheets.items():
            collection_name = EXPORT_MODULES[module_name]
            if collection_name not in protected_collections:
                result = await db[collection_name].delete_many({})
                collections_cleared += 1
                logger.info(f"[Restore FULL] Collection '{collection_name}' vidée ({result.deleted_count} documents)")

    # Importer les données
    stats = {
        "total": 0,
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "errors": [],
        "modules": {},
        "collections_cleared": collections_cleared,
        "restored_files": restored_files
    }

    import_mode = "add" if mode == "full" else "replace"

    for current_module, df in data_sheets.items():
        collection_name = EXPORT_MODULES[current_module]

        if current_module in COLUMN_MAPPINGS:
            df = df.rename(columns=COLUMN_MAPPINGS[current_module])

        df.columns = [str(col).strip() if col is not None else f'col_{i}' for i, col in enumerate(df.columns)]

        items = df.to_dict('records')
        module_stats = {"total": len(items), "inserted": 0, "updated": 0, "skipped": 0, "errors": []}

        logger.info(f"[Restore] Module '{current_module}': {len(items)} éléments")

        for idx, item in enumerate(items):
            try:
                result = await process_import_item(item, current_module, collection_name, current_user, import_mode)
                if result["action"] == "inserted":
                    module_stats["inserted"] += 1
                elif result["action"] == "updated":
                    module_stats["updated"] += 1
                elif result["action"] == "skipped":
                    module_stats["skipped"] += 1
            except Exception as e:
                module_stats["errors"].append(f"Ligne {idx+1}: {str(e)[:100]}")
                module_stats["skipped"] += 1

        stats["modules"][current_module] = module_stats
        stats["total"] += module_stats["total"]
        stats["inserted"] += module_stats["inserted"]
        stats["updated"] += module_stats["updated"]
        stats["skipped"] += module_stats["skipped"]
        stats["errors"].extend(module_stats["errors"][:5])

    logger.info(f"[Restore] Terminé: {stats['inserted']} insérés, {stats['updated']} mis à jour, {stats['skipped']} ignorés, {restored_files} fichiers, {collections_cleared} collections vidées")

    return {
        "success": True,
        "message": f"Restauration réussie: {stats['inserted']} insérés, {stats['updated']} mis à jour, {restored_files} fichiers restaurés" + (f", {collections_cleared} collections vidées" if mode == "full" else ""),
        "stats": stats
    }


@router.post("/restore/backup")
async def restore_backup(
    mode: str = "merge",
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_admin_user)
):
    """Restaurer une sauvegarde complète depuis un fichier ZIP de backup FSAO (upload classique)"""
    try:
        if not file.filename.endswith('.zip'):
            raise HTTPException(status_code=400, detail="Le fichier doit être un ZIP de sauvegarde FSAO")

        content = await file.read()
        return await _do_restore(content, mode, current_user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur restauration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import/{module}")
async def import_data(
    module: str,
    mode: str = "add",
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_admin_user)
):
    """Importer les données d'un module (admin uniquement)"""
    try:
        if module not in EXPORT_MODULES and module != "all":
            raise HTTPException(status_code=400, detail="Module invalide")
        
        if module == "all":
            modules_to_import = EXPORT_MODULES
        else:
            modules_to_import = {module: EXPORT_MODULES[module]}
        
        content = await file.read()
        data_sheets = {}
        restored_files = 0
        
        # Lire le fichier selon son format
        try:
            if file.filename.endswith('.zip'):
                # Import depuis un ZIP (données + fichiers)
                with zipfile.ZipFile(io.BytesIO(content), 'r') as zf:
                    # 1. Extraire et lire le fichier Excel
                    if 'data.xlsx' in zf.namelist():
                        xlsx_bytes = zf.read('data.xlsx')
                        all_sheets = pd.read_excel(io.BytesIO(xlsx_bytes), sheet_name=None, engine='openpyxl')
                        logger.info(f"[Import ZIP] data.xlsx: {len(all_sheets)} feuilles")

                        for sheet_name, df in all_sheets.items():
                            module_name = SHEET_TO_MODULE.get(sheet_name.lower())
                            if module_name and module_name in modules_to_import:
                                data_sheets[module_name] = df
                                logger.info(f"[Import ZIP] Feuille '{sheet_name}' -> '{module_name}': {len(df)} lignes")

                    # 2. Restaurer les fichiers uploadés
                    upload_entries = [n for n in zf.namelist() if n.startswith('uploads/') and not n.endswith('/')]
                    for entry in upload_entries:
                        target = UPLOADS_DIR / entry.replace('uploads/', '', 1)
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with open(target, 'wb') as f:
                            f.write(zf.read(entry))
                        restored_files += 1

                    logger.info(f"[Import ZIP] {restored_files} fichier(s) restauré(s)")

            elif file.filename.endswith('.csv'):
                separator = detect_csv_separator(content)
                logger.info(f"📋 Séparateur détecté: '{separator}'")
                df = pd.read_csv(io.BytesIO(content), sep=separator, encoding='utf-8')
                logger.info(f"✅ CSV lu: {len(df)} lignes, {len(df.columns)} colonnes")
                data_sheets[module] = df
                
            elif file.filename.endswith(('.xlsx', '.xls', '.xlsb')):
                if module == "all":
                    all_sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, engine='openpyxl')
                    logger.info(f"✅ Excel multi-feuilles: {len(all_sheets)} feuilles")
                    
                    for sheet_name, df in all_sheets.items():
                        module_name = SHEET_TO_MODULE.get(sheet_name.lower())
                        if module_name and module_name in modules_to_import:
                            data_sheets[module_name] = df
                            logger.info(f"📋 Feuille '{sheet_name}' → module '{module_name}': {len(df)} lignes")
                    
                    if not data_sheets:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Aucune feuille reconnue. Disponibles: {list(all_sheets.keys())}"
                        )
                else:
                    df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
                    data_sheets[module] = df
            else:
                raise HTTPException(status_code=400, detail="Format non supporté (CSV, XLSX, XLS)")
                
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erreur lecture: {str(e)}")
        
        # Traiter les données
        stats = {
            "total": 0,
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "errors": [],
            "modules": {}
        }
        
        for current_module, df in data_sheets.items():
            collection_name = modules_to_import[current_module]
            
            # Appliquer le mapping des colonnes
            if current_module in COLUMN_MAPPINGS:
                df = df.rename(columns=COLUMN_MAPPINGS[current_module])
            
            # Nettoyer les noms de colonnes
            df.columns = [str(col).strip() if col is not None else f'col_{i}' for i, col in enumerate(df.columns)]
            
            items = df.to_dict('records')
            module_stats = {"total": len(items), "inserted": 0, "updated": 0, "skipped": 0, "errors": []}
            
            logger.info(f"🔄 Module '{current_module}': {len(items)} éléments")
            
            for idx, item in enumerate(items):
                try:
                    result = await process_import_item(item, current_module, collection_name, current_user, mode)
                    if result["action"] == "inserted":
                        module_stats["inserted"] += 1
                    elif result["action"] == "updated":
                        module_stats["updated"] += 1
                except Exception as e:
                    module_stats["errors"].append(f"Ligne {idx+1}: {str(e)[:100]}")
                    module_stats["skipped"] += 1
            
            stats["modules"][current_module] = module_stats
            stats["total"] += module_stats["total"]
            stats["inserted"] += module_stats["inserted"]
            stats["updated"] += module_stats["updated"]
            stats["skipped"] += module_stats["skipped"]
            stats["errors"].extend(module_stats["errors"][:5])
        
        logger.info(f"✅ Import terminé: {stats['inserted']} insérés, {stats['updated']} mis à jour, {stats['skipped']} ignorés")
        
        return {
            "success": True,
            "message": f"Import réussi: {stats['inserted']} insérés, {stats['updated']} mis à jour" + (f", {restored_files} fichiers restaurés" if restored_files > 0 else ""),
            "stats": stats,
            "restored_files": restored_files
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur import: {e}")
        raise HTTPException(status_code=500, detail=str(e))
