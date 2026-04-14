from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from enum import Enum
import re
import uuid

# Enums
class UserRole(str, Enum):
    ADMIN = "ADMIN"
    TECHNICIEN = "TECHNICIEN"
    VISUALISEUR = "VISUALISEUR"
    DIRECTEUR = "DIRECTEUR"
    QHSE = "QHSE"
    RSP_PROD = "RSP_PROD"
    PROD = "PROD"
    INDUS = "INDUS"
    LOGISTIQUE = "LOGISTIQUE"
    LABO = "LABO"
    ADV = "ADV"
    AFFICHAGE = "AFFICHAGE"  # Rôle pour utilisateur tableau d'affichage

# Permission Models
class ModulePermission(BaseModel):
    view: bool = False
    edit: bool = False
    delete: bool = False

class UserPermissions(BaseModel):
    dashboard: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    interventionRequests: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    workOrders: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    improvementRequests: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    improvements: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    preventiveMaintenance: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    planningMprev: ModulePermission = ModulePermission(view=True, edit=False, delete=False)  # Planning M.Prev.
    assets: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    inventory: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    locations: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    meters: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    surveillance: ModulePermission = ModulePermission(view=True, edit=False, delete=False)  # Plan de Surveillance
    surveillanceRapport: ModulePermission = ModulePermission(view=True, edit=False, delete=False)  # Rapport Surveillance
    presquaccident: ModulePermission = ModulePermission(view=True, edit=False, delete=False)  # Presqu'accident
    presquaccidentRapport: ModulePermission = ModulePermission(view=True, edit=False, delete=False)  # Rapport P.accident
    documentations: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    vendors: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    reports: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    people: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    planning: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    purchaseHistory: ModulePermission = ModulePermission(view=True, edit=False, delete=False)
    importExport: ModulePermission = ModulePermission(view=False, edit=False, delete=False)
    journal: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Audit
    settings: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Paramètres
    personalization: ModulePermission = ModulePermission(view=True, edit=True, delete=False)  # Personnalisation
    chatLive: ModulePermission = ModulePermission(view=True, edit=True, delete=False)  # Chat Live
    sensors: ModulePermission = ModulePermission(view=True, edit=False, delete=False)  # Capteurs MQTT
    iotDashboard: ModulePermission = ModulePermission(view=True, edit=False, delete=False)  # Dashboard IoT
    mqttLogs: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Logs MQTT (Admin)
    purchaseRequests: ModulePermission = ModulePermission(view=True, edit=False, delete=False)  # Demandes d'Achat
    whiteboard: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Tableau d'affichage
    achat: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Permission Achat - Permet de modifier les statuts des demandes d'achat
    timeTracking: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Pointage horaire - Permet de voir les données des autres utilisateurs
    cameras: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Caméras RTSP/ONVIF - Visualisation et gestion des caméras
    analyticsChecklists: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Analytics Checklists - Dashboard d'analyse des résultats des contrôles
    mes: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # M.E.S. - Suivi de production temps réel
    mesReports: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Rapports M.E.S. - Historiques et exports production
    serviceDashboard: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Dashboard Service - Tableau de bord par service
    weeklyReports: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Rapports Hebdomadaires - Rapports de service planifiés
    demandesArret: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Demandes d'arrêt - Gestion des demandes d'arrêt machine
    consignes: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Consignes - Gestion des consignes de sécurité
    consignationsLoto: ModulePermission = ModulePermission(view=True, edit=True, delete=False)  # LOTO - Consignations Lockout/Tagout
    autorisationsParticulieres: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Autorisations Particulières - Gestion des autorisations spéciales
    training: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Formation - Module de formation et questionnaire nouveaux arrivants
    contrats: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Contrats - Gestion des contrats fournisseurs
    accidentAnalysis: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Arbre des Causes - Analyse d'accidents de maintenance
    aiDashboard: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Tableau de bord IA - Vue unifiée des analyses IA
    aiAutomations: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Automatisations IA - Configuration des règles automatiques
    aiWidgets: ModulePermission = ModulePermission(view=False, edit=False, delete=False)  # Widgets IA (Adria) - Création de widgets par l'assistant IA

# Fonction helper pour obtenir les permissions par défaut selon le rôle
def get_default_permissions_by_role(role: str) -> UserPermissions:
    """Retourne les permissions par défaut selon le rôle de l'utilisateur"""
    
    # Permissions complètes pour ADMIN
    if role == "ADMIN":
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=True, delete=True),
            interventionRequests=ModulePermission(view=True, edit=True, delete=True),
            workOrders=ModulePermission(view=True, edit=True, delete=True),
            improvementRequests=ModulePermission(view=True, edit=True, delete=True),
            improvements=ModulePermission(view=True, edit=True, delete=True),
            preventiveMaintenance=ModulePermission(view=True, edit=True, delete=True),
            planningMprev=ModulePermission(view=True, edit=True, delete=True),
            assets=ModulePermission(view=True, edit=True, delete=True),
            inventory=ModulePermission(view=True, edit=True, delete=True),
            locations=ModulePermission(view=True, edit=True, delete=True),
            meters=ModulePermission(view=True, edit=True, delete=True),
            surveillance=ModulePermission(view=True, edit=True, delete=True),
            surveillanceRapport=ModulePermission(view=True, edit=True, delete=True),
            presquaccident=ModulePermission(view=True, edit=True, delete=True),
            presquaccidentRapport=ModulePermission(view=True, edit=True, delete=True),
            documentations=ModulePermission(view=True, edit=True, delete=True),
            vendors=ModulePermission(view=True, edit=True, delete=True),
            reports=ModulePermission(view=True, edit=True, delete=True),
            people=ModulePermission(view=True, edit=True, delete=True),
            planning=ModulePermission(view=True, edit=True, delete=True),
            purchaseHistory=ModulePermission(view=True, edit=True, delete=True),
            importExport=ModulePermission(view=True, edit=True, delete=True),
            journal=ModulePermission(view=True, edit=False, delete=False),
            settings=ModulePermission(view=True, edit=True, delete=False),
            personalization=ModulePermission(view=True, edit=True, delete=False),
            chatLive=ModulePermission(view=True, edit=True, delete=True),
            sensors=ModulePermission(view=True, edit=True, delete=True),
            iotDashboard=ModulePermission(view=True, edit=True, delete=False),
            mqttLogs=ModulePermission(view=True, edit=True, delete=True),
            purchaseRequests=ModulePermission(view=True, edit=True, delete=True),
            whiteboard=ModulePermission(view=True, edit=True, delete=True),
            achat=ModulePermission(view=True, edit=True, delete=True),  # Permission Achat complète pour Admin
            timeTracking=ModulePermission(view=True, edit=True, delete=True),  # Admin peut voir tous les utilisateurs
            cameras=ModulePermission(view=True, edit=True, delete=True),  # Admin peut gérer et voir les caméras
            analyticsChecklists=ModulePermission(view=True, edit=True, delete=True),  # Admin peut voir les analytics
            mes=ModulePermission(view=True, edit=True, delete=True),
            mesReports=ModulePermission(view=True, edit=True, delete=True),
            serviceDashboard=ModulePermission(view=True, edit=True, delete=True),
            weeklyReports=ModulePermission(view=True, edit=True, delete=True),
            demandesArret=ModulePermission(view=True, edit=True, delete=True),
            consignes=ModulePermission(view=True, edit=True, delete=True),
            autorisationsParticulieres=ModulePermission(view=True, edit=True, delete=True),
            training=ModulePermission(view=True, edit=True, delete=True),
            contrats=ModulePermission(view=True, edit=True, delete=True),
            accidentAnalysis=ModulePermission(view=True, edit=True, delete=True),
            aiDashboard=ModulePermission(view=True, edit=True, delete=True),
            aiAutomations=ModulePermission(view=True, edit=True, delete=True),
            aiWidgets=ModulePermission(view=True, edit=True, delete=True)
        )
    
    # Rôle spécial AFFICHAGE : Uniquement accès au tableau d'affichage
    if role == "AFFICHAGE":
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=False, delete=False),
            interventionRequests=ModulePermission(view=False, edit=False, delete=False),
            workOrders=ModulePermission(view=False, edit=False, delete=False),
            improvementRequests=ModulePermission(view=False, edit=False, delete=False),
            improvements=ModulePermission(view=False, edit=False, delete=False),
            preventiveMaintenance=ModulePermission(view=False, edit=False, delete=False),
            planningMprev=ModulePermission(view=False, edit=False, delete=False),
            assets=ModulePermission(view=False, edit=False, delete=False),
            inventory=ModulePermission(view=False, edit=False, delete=False),
            locations=ModulePermission(view=False, edit=False, delete=False),
            meters=ModulePermission(view=False, edit=False, delete=False),
            surveillance=ModulePermission(view=False, edit=False, delete=False),
            surveillanceRapport=ModulePermission(view=False, edit=False, delete=False),
            presquaccident=ModulePermission(view=False, edit=False, delete=False),
            presquaccidentRapport=ModulePermission(view=False, edit=False, delete=False),
            documentations=ModulePermission(view=False, edit=False, delete=False),
            vendors=ModulePermission(view=False, edit=False, delete=False),
            reports=ModulePermission(view=False, edit=False, delete=False),
            people=ModulePermission(view=False, edit=False, delete=False),
            planning=ModulePermission(view=False, edit=False, delete=False),
            purchaseHistory=ModulePermission(view=False, edit=False, delete=False),
            importExport=ModulePermission(view=False, edit=False, delete=False),
            journal=ModulePermission(view=False, edit=False, delete=False),
            settings=ModulePermission(view=False, edit=False, delete=False),
            personalization=ModulePermission(view=False, edit=False, delete=False),
            chatLive=ModulePermission(view=False, edit=False, delete=False),
            sensors=ModulePermission(view=False, edit=False, delete=False),
            iotDashboard=ModulePermission(view=False, edit=False, delete=False),
            mqttLogs=ModulePermission(view=False, edit=False, delete=False),
            purchaseRequests=ModulePermission(view=False, edit=False, delete=False),
            whiteboard=ModulePermission(view=True, edit=True, delete=False),
            mes=ModulePermission(view=False, edit=False, delete=False),
            mesReports=ModulePermission(view=False, edit=False, delete=False),
            serviceDashboard=ModulePermission(view=False, edit=False, delete=False),
            weeklyReports=ModulePermission(view=False, edit=False, delete=False),
            demandesArret=ModulePermission(view=False, edit=False, delete=False),
            consignes=ModulePermission(view=False, edit=False, delete=False),
            autorisationsParticulieres=ModulePermission(view=False, edit=False, delete=False),
            training=ModulePermission(view=False, edit=False, delete=False),
            contrats=ModulePermission(view=False, edit=False, delete=False),
            accidentAnalysis=ModulePermission(view=False, edit=False, delete=False)
        )
    
    # DIRECTEUR : Demande d'inter./Demandes d'amél. en visualisation et modification
    # Ordres de travail/Améliorations/Maintenance prev./Compteurs/Historique Achat en visualisation seulement
    elif role == "DIRECTEUR":
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=False, delete=False),
            interventionRequests=ModulePermission(view=True, edit=True, delete=False),
            workOrders=ModulePermission(view=True, edit=False, delete=False),
            improvementRequests=ModulePermission(view=True, edit=True, delete=False),
            improvements=ModulePermission(view=True, edit=False, delete=False),
            preventiveMaintenance=ModulePermission(view=True, edit=False, delete=False),
            planningMprev=ModulePermission(view=True, edit=False, delete=False),
            assets=ModulePermission(view=True, edit=False, delete=False),
            inventory=ModulePermission(view=True, edit=False, delete=False),
            locations=ModulePermission(view=True, edit=False, delete=False),
            meters=ModulePermission(view=True, edit=False, delete=False),
            surveillance=ModulePermission(view=True, edit=False, delete=False),
            surveillanceRapport=ModulePermission(view=True, edit=False, delete=False),
            presquaccident=ModulePermission(view=True, edit=True, delete=False),
            presquaccidentRapport=ModulePermission(view=True, edit=True, delete=False),
            documentations=ModulePermission(view=True, edit=True, delete=False),
            vendors=ModulePermission(view=True, edit=False, delete=False),
            reports=ModulePermission(view=True, edit=False, delete=False),
            people=ModulePermission(view=True, edit=False, delete=False),
            planning=ModulePermission(view=True, edit=False, delete=False),
            purchaseHistory=ModulePermission(view=True, edit=False, delete=False),
            importExport=ModulePermission(view=False, edit=False, delete=False),
            journal=ModulePermission(view=False, edit=False, delete=False),
            settings=ModulePermission(view=False, edit=False, delete=False),
            personalization=ModulePermission(view=True, edit=True, delete=False),
            chatLive=ModulePermission(view=True, edit=True, delete=False),
            cameras=ModulePermission(view=True, edit=False, delete=False),  # Directeur peut voir les caméras
            analyticsChecklists=ModulePermission(view=True, edit=False, delete=False),  # Directeur peut voir les analytics
            mes=ModulePermission(view=True, edit=False, delete=False),
            mesReports=ModulePermission(view=True, edit=False, delete=False),
            serviceDashboard=ModulePermission(view=True, edit=False, delete=False),
            weeklyReports=ModulePermission(view=True, edit=False, delete=False),
            demandesArret=ModulePermission(view=True, edit=True, delete=False),
            consignes=ModulePermission(view=True, edit=False, delete=False),
            autorisationsParticulieres=ModulePermission(view=True, edit=True, delete=False),
            training=ModulePermission(view=True, edit=False, delete=False),
            contrats=ModulePermission(view=True, edit=False, delete=False),
            accidentAnalysis=ModulePermission(view=True, edit=True, delete=False)
        )
    
    # QHSE : Demande d'inter./Demandes d'amél. en visualisation et modification
    # Ordres de travail/Améliorations/Compteurs en visualisation seulement
    # QHSE a accès complet au Plan de Surveillance et Presqu'accident (view + edit + delete)
    elif role == "QHSE":
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=False, delete=False),
            interventionRequests=ModulePermission(view=True, edit=True, delete=False),
            workOrders=ModulePermission(view=True, edit=False, delete=False),
            improvementRequests=ModulePermission(view=True, edit=True, delete=False),
            improvements=ModulePermission(view=True, edit=False, delete=False),
            preventiveMaintenance=ModulePermission(view=True, edit=False, delete=False),
            planningMprev=ModulePermission(view=True, edit=False, delete=False),
            assets=ModulePermission(view=True, edit=False, delete=False),
            inventory=ModulePermission(view=True, edit=False, delete=False),
            locations=ModulePermission(view=True, edit=False, delete=False),
            meters=ModulePermission(view=True, edit=False, delete=False),
            surveillance=ModulePermission(view=True, edit=True, delete=True),
            surveillanceRapport=ModulePermission(view=True, edit=True, delete=True),
            presquaccident=ModulePermission(view=True, edit=True, delete=True),
            presquaccidentRapport=ModulePermission(view=True, edit=True, delete=True),
            documentations=ModulePermission(view=True, edit=True, delete=True),
            vendors=ModulePermission(view=False, edit=False, delete=False),
            reports=ModulePermission(view=True, edit=False, delete=False),
            people=ModulePermission(view=False, edit=False, delete=False),
            planning=ModulePermission(view=False, edit=False, delete=False),
            purchaseHistory=ModulePermission(view=False, edit=False, delete=False),
            importExport=ModulePermission(view=False, edit=False, delete=False),
            settings=ModulePermission(view=False, edit=False, delete=False),
            personalization=ModulePermission(view=True, edit=True, delete=False),
            journal=ModulePermission(view=False, edit=False, delete=False),
            chatLive=ModulePermission(view=True, edit=True, delete=False),
            cameras=ModulePermission(view=True, edit=False, delete=False),  # QHSE peut voir les caméras
            analyticsChecklists=ModulePermission(view=True, edit=False, delete=False),  # QHSE peut voir les analytics
            mes=ModulePermission(view=True, edit=False, delete=False),
            mesReports=ModulePermission(view=True, edit=False, delete=False),
            serviceDashboard=ModulePermission(view=False, edit=False, delete=False),
            weeklyReports=ModulePermission(view=True, edit=False, delete=False),
            demandesArret=ModulePermission(view=True, edit=True, delete=False),
            consignes=ModulePermission(view=True, edit=True, delete=False),
            autorisationsParticulieres=ModulePermission(view=True, edit=True, delete=False),
            training=ModulePermission(view=True, edit=True, delete=False),
            contrats=ModulePermission(view=True, edit=True, delete=False),
            accidentAnalysis=ModulePermission(view=True, edit=True, delete=True)
        )
    
    # LABO et ADV : Demande d'inter. en visualisation et modification
    # Fournisseurs/Compteurs/Historique Achat en visualisation seulement
    elif role in ["LABO", "ADV"]:
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=False, delete=False),
            interventionRequests=ModulePermission(view=True, edit=True, delete=False),
            workOrders=ModulePermission(view=False, edit=False, delete=False),
            improvementRequests=ModulePermission(view=False, edit=False, delete=False),
            improvements=ModulePermission(view=False, edit=False, delete=False),
            preventiveMaintenance=ModulePermission(view=False, edit=False, delete=False),
            assets=ModulePermission(view=False, edit=False, delete=False),
            inventory=ModulePermission(view=False, edit=False, delete=False),
            locations=ModulePermission(view=False, edit=False, delete=False),
            meters=ModulePermission(view=True, edit=False, delete=False),
            surveillance=ModulePermission(view=False, edit=False, delete=False),
            presquaccident=ModulePermission(view=True, edit=True, delete=False),
            documentations=ModulePermission(view=True, edit=True, delete=False),
            vendors=ModulePermission(view=True, edit=False, delete=False),
            reports=ModulePermission(view=True, edit=False, delete=False),
            people=ModulePermission(view=False, edit=False, delete=False),
            planning=ModulePermission(view=False, edit=False, delete=False),
            purchaseHistory=ModulePermission(view=True, edit=False, delete=False),
            importExport=ModulePermission(view=False, edit=False, delete=False),
            journal=ModulePermission(view=False, edit=False, delete=False),
            chatLive=ModulePermission(view=True, edit=True, delete=False),
            cameras=ModulePermission(view=False, edit=False, delete=False),
            analyticsChecklists=ModulePermission(view=False, edit=False, delete=False),
            mes=ModulePermission(view=False, edit=False, delete=False),
            mesReports=ModulePermission(view=False, edit=False, delete=False),
            serviceDashboard=ModulePermission(view=False, edit=False, delete=False),
            weeklyReports=ModulePermission(view=False, edit=False, delete=False),
            demandesArret=ModulePermission(view=False, edit=False, delete=False),
            consignes=ModulePermission(view=True, edit=False, delete=False),
            autorisationsParticulieres=ModulePermission(view=False, edit=False, delete=False),
            training=ModulePermission(view=True, edit=False, delete=False),
            contrats=ModulePermission(view=True, edit=False, delete=False),
            accidentAnalysis=ModulePermission(view=True, edit=False, delete=False)
        )
    
    # PROD (RSP_PROD et PROD) : Demande d'inter./Demandes d'amél./Ordres de travail/Améliorations/Equipement en visualisation et modification
    # Inventaire/Maintenance prev. en visualisation seulement
    elif role in ["RSP_PROD", "PROD"]:
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=False, delete=False),
            interventionRequests=ModulePermission(view=True, edit=True, delete=False),
            workOrders=ModulePermission(view=True, edit=True, delete=False),
            improvementRequests=ModulePermission(view=True, edit=True, delete=False),
            improvements=ModulePermission(view=True, edit=True, delete=False),
            preventiveMaintenance=ModulePermission(view=True, edit=False, delete=False),
            assets=ModulePermission(view=True, edit=True, delete=False),
            inventory=ModulePermission(view=True, edit=False, delete=False),
            locations=ModulePermission(view=True, edit=False, delete=False),
            meters=ModulePermission(view=False, edit=False, delete=False),
            surveillance=ModulePermission(view=False, edit=False, delete=False),
            presquaccident=ModulePermission(view=True, edit=True, delete=False),
            documentations=ModulePermission(view=True, edit=True, delete=False),
            vendors=ModulePermission(view=False, edit=False, delete=False),
            reports=ModulePermission(view=True, edit=False, delete=False),
            people=ModulePermission(view=False, edit=False, delete=False),
            planning=ModulePermission(view=False, edit=False, delete=False),
            purchaseHistory=ModulePermission(view=False, edit=False, delete=False),
            importExport=ModulePermission(view=False, edit=False, delete=False),
            journal=ModulePermission(view=False, edit=False, delete=False),
            chatLive=ModulePermission(view=True, edit=True, delete=False),
            cameras=ModulePermission(view=False, edit=False, delete=False),
            analyticsChecklists=ModulePermission(view=False, edit=False, delete=False),
            mes=ModulePermission(view=True, edit=True, delete=False),
            mesReports=ModulePermission(view=True, edit=False, delete=False),
            serviceDashboard=ModulePermission(view=True, edit=False, delete=False),
            weeklyReports=ModulePermission(view=True, edit=False, delete=False),
            demandesArret=ModulePermission(view=True, edit=True, delete=False),
            consignes=ModulePermission(view=True, edit=False, delete=False),
            autorisationsParticulieres=ModulePermission(view=True, edit=False, delete=False),
            training=ModulePermission(view=True, edit=False, delete=False),
            contrats=ModulePermission(view=True, edit=False, delete=False),
            accidentAnalysis=ModulePermission(view=True, edit=True, delete=False)
        )
    
    # INDUS : Demande d'inter./Demandes d'amél./Ordres de travail/Améliorations/Equipement en visualisation et modification
    # Inventaire/Maintenance prev./Compteurs en visualisation seulement
    elif role == "INDUS":
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=False, delete=False),
            interventionRequests=ModulePermission(view=True, edit=True, delete=False),
            workOrders=ModulePermission(view=True, edit=True, delete=False),
            improvementRequests=ModulePermission(view=True, edit=True, delete=False),
            improvements=ModulePermission(view=True, edit=True, delete=False),
            preventiveMaintenance=ModulePermission(view=True, edit=False, delete=False),
            planningMprev=ModulePermission(view=True, edit=False, delete=False),
            assets=ModulePermission(view=True, edit=True, delete=False),
            inventory=ModulePermission(view=True, edit=False, delete=False),
            locations=ModulePermission(view=True, edit=False, delete=False),
            meters=ModulePermission(view=True, edit=False, delete=False),
            surveillance=ModulePermission(view=False, edit=False, delete=False),
            surveillanceRapport=ModulePermission(view=False, edit=False, delete=False),
            presquaccident=ModulePermission(view=True, edit=True, delete=False),
            presquaccidentRapport=ModulePermission(view=True, edit=True, delete=False),
            documentations=ModulePermission(view=True, edit=True, delete=False),
            vendors=ModulePermission(view=False, edit=False, delete=False),
            reports=ModulePermission(view=True, edit=False, delete=False),
            people=ModulePermission(view=False, edit=False, delete=False),
            planning=ModulePermission(view=False, edit=False, delete=False),
            purchaseHistory=ModulePermission(view=False, edit=False, delete=False),
            importExport=ModulePermission(view=False, edit=False, delete=False),
            settings=ModulePermission(view=False, edit=False, delete=False),
            personalization=ModulePermission(view=True, edit=True, delete=False),
            journal=ModulePermission(view=False, edit=False, delete=False),
            chatLive=ModulePermission(view=True, edit=True, delete=False),
            cameras=ModulePermission(view=False, edit=False, delete=False),
            analyticsChecklists=ModulePermission(view=False, edit=False, delete=False),
            mes=ModulePermission(view=True, edit=False, delete=False),
            mesReports=ModulePermission(view=True, edit=False, delete=False),
            serviceDashboard=ModulePermission(view=False, edit=False, delete=False),
            weeklyReports=ModulePermission(view=True, edit=False, delete=False),
            demandesArret=ModulePermission(view=True, edit=True, delete=False),
            consignes=ModulePermission(view=True, edit=False, delete=False),
            autorisationsParticulieres=ModulePermission(view=True, edit=False, delete=False),
            training=ModulePermission(view=True, edit=False, delete=False),
            contrats=ModulePermission(view=True, edit=False, delete=False),
            accidentAnalysis=ModulePermission(view=True, edit=True, delete=False)
        )
    
    # LOGISTIQUE : Même que PROD mais peut-être avec accès Fournisseurs
    elif role == "LOGISTIQUE":
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=False, delete=False),
            interventionRequests=ModulePermission(view=True, edit=True, delete=False),
            workOrders=ModulePermission(view=True, edit=True, delete=False),
            improvementRequests=ModulePermission(view=True, edit=True, delete=False),
            improvements=ModulePermission(view=True, edit=True, delete=False),
            preventiveMaintenance=ModulePermission(view=True, edit=False, delete=False),
            planningMprev=ModulePermission(view=True, edit=False, delete=False),
            assets=ModulePermission(view=True, edit=True, delete=False),
            inventory=ModulePermission(view=True, edit=True, delete=False),
            locations=ModulePermission(view=True, edit=False, delete=False),
            meters=ModulePermission(view=False, edit=False, delete=False),
            surveillance=ModulePermission(view=False, edit=False, delete=False),
            surveillanceRapport=ModulePermission(view=False, edit=False, delete=False),
            presquaccident=ModulePermission(view=True, edit=True, delete=False),
            presquaccidentRapport=ModulePermission(view=True, edit=True, delete=False),
            documentations=ModulePermission(view=True, edit=True, delete=False),
            vendors=ModulePermission(view=True, edit=False, delete=False),
            reports=ModulePermission(view=True, edit=False, delete=False),
            people=ModulePermission(view=False, edit=False, delete=False),
            planning=ModulePermission(view=False, edit=False, delete=False),
            purchaseHistory=ModulePermission(view=True, edit=False, delete=False),
            importExport=ModulePermission(view=False, edit=False, delete=False),
            settings=ModulePermission(view=False, edit=False, delete=False),
            personalization=ModulePermission(view=True, edit=True, delete=False),
            journal=ModulePermission(view=False, edit=False, delete=False),
            chatLive=ModulePermission(view=True, edit=True, delete=False),
            cameras=ModulePermission(view=True, edit=False, delete=False),  # Logistique peut voir les caméras
            analyticsChecklists=ModulePermission(view=False, edit=False, delete=False),
            mes=ModulePermission(view=False, edit=False, delete=False),
            mesReports=ModulePermission(view=False, edit=False, delete=False),
            serviceDashboard=ModulePermission(view=True, edit=False, delete=False),
            weeklyReports=ModulePermission(view=True, edit=False, delete=False),
            demandesArret=ModulePermission(view=True, edit=True, delete=False),
            consignes=ModulePermission(view=True, edit=False, delete=False),
            autorisationsParticulieres=ModulePermission(view=True, edit=False, delete=False),
            training=ModulePermission(view=True, edit=False, delete=False),
            contrats=ModulePermission(view=True, edit=False, delete=False),
            accidentAnalysis=ModulePermission(view=True, edit=False, delete=False)
        )
    
    # TECHNICIEN : Permissions complètes sur les modules opérationnels
    elif role == "TECHNICIEN":
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=False, delete=False),
            interventionRequests=ModulePermission(view=True, edit=True, delete=True),
            workOrders=ModulePermission(view=True, edit=True, delete=True),
            improvementRequests=ModulePermission(view=True, edit=True, delete=True),
            improvements=ModulePermission(view=True, edit=True, delete=True),
            preventiveMaintenance=ModulePermission(view=True, edit=True, delete=True),
            planningMprev=ModulePermission(view=True, edit=True, delete=True),
            assets=ModulePermission(view=True, edit=True, delete=True),
            inventory=ModulePermission(view=True, edit=True, delete=True),
            locations=ModulePermission(view=True, edit=True, delete=True),
            meters=ModulePermission(view=True, edit=True, delete=True),
            surveillance=ModulePermission(view=True, edit=True, delete=True),
            surveillanceRapport=ModulePermission(view=True, edit=True, delete=True),
            presquaccident=ModulePermission(view=True, edit=True, delete=True),
            presquaccidentRapport=ModulePermission(view=True, edit=True, delete=True),
            documentations=ModulePermission(view=True, edit=True, delete=True),
            vendors=ModulePermission(view=True, edit=True, delete=True),
            reports=ModulePermission(view=True, edit=False, delete=False),
            people=ModulePermission(view=True, edit=False, delete=False),
            planning=ModulePermission(view=True, edit=True, delete=False),
            purchaseHistory=ModulePermission(view=True, edit=True, delete=True),
            importExport=ModulePermission(view=False, edit=False, delete=False),
            settings=ModulePermission(view=False, edit=False, delete=False),
            personalization=ModulePermission(view=True, edit=True, delete=False),
            journal=ModulePermission(view=False, edit=False, delete=False),
            chatLive=ModulePermission(view=True, edit=True, delete=False),
            cameras=ModulePermission(view=True, edit=True, delete=True),  # Technicien peut gérer les caméras
            analyticsChecklists=ModulePermission(view=True, edit=False, delete=False),  # Technicien peut voir les analytics
            mes=ModulePermission(view=True, edit=True, delete=False),
            mesReports=ModulePermission(view=True, edit=False, delete=False),
            serviceDashboard=ModulePermission(view=True, edit=False, delete=False),
            weeklyReports=ModulePermission(view=True, edit=True, delete=False),
            demandesArret=ModulePermission(view=True, edit=True, delete=True),
            consignes=ModulePermission(view=True, edit=True, delete=False),
            autorisationsParticulieres=ModulePermission(view=True, edit=True, delete=False),
            training=ModulePermission(view=True, edit=True, delete=False),
            contrats=ModulePermission(view=True, edit=True, delete=False),
            accidentAnalysis=ModulePermission(view=True, edit=True, delete=True)
        )
    
    # VISUALISEUR : Visualisation uniquement sur tout
    elif role == "VISUALISEUR":
        return UserPermissions(
            dashboard=ModulePermission(view=True, edit=False, delete=False),
            interventionRequests=ModulePermission(view=True, edit=False, delete=False),
            workOrders=ModulePermission(view=True, edit=False, delete=False),
            improvementRequests=ModulePermission(view=True, edit=False, delete=False),
            improvements=ModulePermission(view=True, edit=False, delete=False),
            preventiveMaintenance=ModulePermission(view=True, edit=False, delete=False),
            planningMprev=ModulePermission(view=True, edit=False, delete=False),
            assets=ModulePermission(view=True, edit=False, delete=False),
            inventory=ModulePermission(view=True, edit=False, delete=False),
            locations=ModulePermission(view=True, edit=False, delete=False),
            meters=ModulePermission(view=True, edit=False, delete=False),
            surveillance=ModulePermission(view=True, edit=False, delete=False),
            surveillanceRapport=ModulePermission(view=True, edit=False, delete=False),
            presquaccident=ModulePermission(view=True, edit=False, delete=False),
            presquaccidentRapport=ModulePermission(view=True, edit=False, delete=False),
            documentations=ModulePermission(view=True, edit=False, delete=False),
            vendors=ModulePermission(view=True, edit=False, delete=False),
            reports=ModulePermission(view=True, edit=False, delete=False),
            people=ModulePermission(view=True, edit=False, delete=False),
            planning=ModulePermission(view=True, edit=False, delete=False),
            purchaseHistory=ModulePermission(view=True, edit=False, delete=False),
            importExport=ModulePermission(view=False, edit=False, delete=False),
            settings=ModulePermission(view=False, edit=False, delete=False),
            personalization=ModulePermission(view=True, edit=True, delete=False),
            journal=ModulePermission(view=False, edit=False, delete=False),
            chatLive=ModulePermission(view=True, edit=False, delete=False),
            cameras=ModulePermission(view=True, edit=False, delete=False),  # Visualiseur peut voir les caméras
            analyticsChecklists=ModulePermission(view=True, edit=False, delete=False),  # Visualiseur peut voir les analytics
            mes=ModulePermission(view=True, edit=False, delete=False),
            mesReports=ModulePermission(view=True, edit=False, delete=False),
            serviceDashboard=ModulePermission(view=True, edit=False, delete=False),
            weeklyReports=ModulePermission(view=True, edit=False, delete=False),
            demandesArret=ModulePermission(view=True, edit=False, delete=False),
            consignes=ModulePermission(view=True, edit=False, delete=False),
            autorisationsParticulieres=ModulePermission(view=True, edit=False, delete=False),
            training=ModulePermission(view=True, edit=False, delete=False),
            contrats=ModulePermission(view=True, edit=False, delete=False),
            accidentAnalysis=ModulePermission(view=True, edit=False, delete=False)
        )
    
    # Par défaut : permissions minimales
    else:
        return UserPermissions()


class WorkOrderStatus(str, Enum):
    OUVERT = "OUVERT"
    EN_COURS = "EN_COURS"
    ATT_MATERIEL = "ATT_MATERIEL"
    ATT_DECISION = "ATT_DECISION"
    TERMINE = "TERMINE"

class Priority(str, Enum):
    URGENTE = "URGENTE"
    HAUTE = "HAUTE"
    MOYENNE = "MOYENNE"
    NORMALE = "NORMALE"
    BASSE = "BASSE"
    AUCUNE = "AUCUNE"

class WorkOrderCategory(str, Enum):
    CHANGEMENT_FORMAT = "CHANGEMENT_FORMAT"
    TRAVAUX_PREVENTIFS = "TRAVAUX_PREVENTIFS"
    TRAVAUX_CURATIF = "TRAVAUX_CURATIF"
    TRAVAUX_DIVERS = "TRAVAUX_DIVERS"
    FORMATION = "FORMATION"
    REGLAGE = "REGLAGE"

class EquipmentStatus(str, Enum):
    OPERATIONNEL = "OPERATIONNEL"
    EN_FONCTIONNEMENT = "EN_FONCTIONNEMENT"
    A_LARRET = "A_LARRET"
    EN_MAINTENANCE = "EN_MAINTENANCE"
    HORS_SERVICE = "HORS_SERVICE"
    EN_CT = "EN_CT"
    DEGRADE = "DEGRADE"  # Dégradé (statut manuel)
    ALERTE_S_EQUIP = "ALERTE_S_EQUIP"  # Alerte automatique quand sous-équipement est Hors Service

class Frequency(str, Enum):
    HEBDOMADAIRE = "HEBDOMADAIRE"
    MENSUEL = "MENSUEL"
    TRIMESTRIEL = "TRIMESTRIEL"
    ANNUEL = "ANNUEL"

class PMStatus(str, Enum):
    ACTIF = "ACTIF"
    INACTIF = "INACTIF"

class ActionType(str, Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    COPY = "COPY"
    MOVE = "MOVE"
    SHARE = "SHARE"
    PERMISSION_CHANGE = "PERMISSION_CHANGE"

class EntityType(str, Enum):
    USER = "USER"
    WORK_ORDER = "WORK_ORDER"
    EQUIPMENT = "EQUIPMENT"
    LOCATION = "LOCATION"
    VENDOR = "VENDOR"
    INVENTORY = "INVENTORY"
    PREVENTIVE_MAINTENANCE = "PREVENTIVE_MAINTENANCE"
    PURCHASE_HISTORY = "PURCHASE_HISTORY"
    IMPROVEMENT_REQUEST = "IMPROVEMENT_REQUEST"
    IMPROVEMENT = "IMPROVEMENT"
    SURVEILLANCE = "SURVEILLANCE"
    PRESQU_ACCIDENT = "PRESQU_ACCIDENT"
    DOCUMENTATION = "DOCUMENTATION"
    SETTINGS = "SETTINGS"
    DEMANDE_ARRET = "DEMANDE_ARRET"
    WHITEBOARD = "WHITEBOARD"
    MES_PRODUCT_REFERENCE = "MES_PRODUCT_REFERENCE"
    LOTO = "LOTO"

# Audit Log Models
class AuditLog(BaseModel):
    id: str
    timestamp: datetime
    user_id: str
    user_name: str
    user_email: str
    action: ActionType
    entity_type: EntityType
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    details: Optional[str] = None
    changes: Optional[Dict] = None

class AuditLogCreate(BaseModel):
    user_id: str
    user_name: str
    user_email: str
    action: ActionType
    entity_type: EntityType
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    details: Optional[str] = None
    changes: Optional[Dict] = None

# Comment Models
class Comment(BaseModel):
    id: str
    user_id: str
    user_name: str
    text: str
    timestamp: datetime

class CommentCreate(BaseModel):
    text: str

class CommentWithPartsCreate(BaseModel):
    text: str
    parts_used: List['PartUsedCreate'] = []  # Liste des pièces utilisées

# Parts Used Models
class PartUsed(BaseModel):
    id: str
    inventory_item_id: Optional[str] = None  # None si pièce externe (texte libre)
    inventory_item_name: Optional[str] = None  # Nom de la pièce d'inventaire
    custom_part_name: Optional[str] = None  # Nom de pièce externe (texte libre)
    quantity: float  # Quantité utilisée
    source_equipment_id: Optional[str] = None  # ID équipement (si sélectionné)
    source_equipment_name: Optional[str] = None  # Nom équipement
    custom_source: Optional[str] = None  # Source personnalisée (texte libre)
    user_name: Optional[str] = None  # Nom de l'utilisateur qui a ajouté la pièce
    timestamp: datetime

class PartUsedCreate(BaseModel):
    inventory_item_id: Optional[str] = None
    inventory_item_name: Optional[str] = None
    custom_part_name: Optional[str] = None
    quantity: float
    source_equipment_id: Optional[str] = None
    source_equipment_name: Optional[str] = None
    custom_source: Optional[str] = None

# User Models
class UserRegime(str, Enum):
    """Régime de travail de l'utilisateur"""
    JOURNEE = "Journée"
    DEUX_HUIT = "2*8"
    TROIS_HUIT = "3*8"

class UserBase(BaseModel):
    nom: str
    prenom: str
    email: str  # Changé de EmailStr à str pour accepter .local
    telephone: Optional[str] = None
    role: UserRole = UserRole.VISUALISEUR
    service: Optional[str] = None
    regime: UserRegime = UserRegime.JOURNEE  # Régime de travail par défaut
    responsable_hierarchique_id: Optional[str] = None  # ID du N+1
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()

class UserCreate(UserBase):
    password: str

class UserInvite(BaseModel):
    nom: str
    prenom: str
    email: str
    telephone: Optional[str] = None
    role: UserRole = UserRole.VISUALISEUR
    service: Optional[str] = None
    regime: Optional[UserRegime] = UserRegime.JOURNEE
    permissions: Optional[UserPermissions] = None
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()

class UserUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    role: Optional[UserRole] = None
    service: Optional[str] = None
    regime: Optional[UserRegime] = None
    statut: Optional[str] = None              # "actif" ou "inactif" — modifiable par admin uniquement
    # Champs MQTT pour les consignes
    mqtt_topic: Optional[str] = None           # Topic principal pour les actions simples
    mqtt_action_ok: Optional[str] = None       # Payload à envoyer sur mqtt_topic quand OK
    mqtt_action_reception: Optional[str] = None # Payload à envoyer sur mqtt_topic à la réception
    mqtt_topic_discret: Optional[str] = None   # Topic pour envoyer le JSON détaillé
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()

class UserProfileUpdate(BaseModel):
    """Modèle pour mise à jour du profil utilisateur depuis Settings"""
    nom: Optional[str] = None
    prenom: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    service: Optional[str] = None
    regime: Optional[UserRegime] = None
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()

class UserPermissionsUpdate(BaseModel):
    permissions: UserPermissions

class User(UserBase):
    id: str
    statut: str = "actif"
    dateCreation: Optional[datetime] = None
    derniereConnexion: Optional[datetime] = None
    permissions: UserPermissions = Field(default_factory=UserPermissions)
    firstLogin: Optional[bool] = False  # True si premier login, nécessite changement de mot de passe
    # Champs MQTT pour les consignes
    mqtt_topic: Optional[str] = None           # Topic principal pour les actions simples
    mqtt_action_ok: Optional[str] = None       # Payload à envoyer sur mqtt_topic quand OK
    mqtt_action_reception: Optional[str] = None # Payload à envoyer sur mqtt_topic à la réception
    mqtt_topic_discret: Optional[str] = None   # Topic pour envoyer le JSON détaillé

    @field_validator('mqtt_action_ok', 'mqtt_action_reception', 'mqtt_topic', 'mqtt_topic_discret', mode='before')
    @classmethod
    def coerce_mqtt_to_str(cls, v):
        """Convertit float/int en str (données legacy en DB stockées en nombre)."""
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return str(int(v)) if v == int(v) else str(v)
        return v

    class Config:
        from_attributes = True

# Auth Models
class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class LoginRequest(BaseModel):
    email: str
    password: str
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()


class ForgotPasswordRequest(BaseModel):
    email: str
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class CompleteRegistrationRequest(BaseModel):
    token: str
    password: str
    prenom: str
    nom: str
    telephone: Optional[str] = None

class InviteMemberRequest(BaseModel):
    email: str
    role: UserRole
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()

class CreateMemberRequest(BaseModel):
    email: str
    prenom: str
    nom: str
    role: UserRole
    telephone: Optional[str] = None
    service: Optional[str] = None
    regime: Optional[UserRegime] = UserRegime.JOURNEE  # Régime de travail
    password: str
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()

# Work Order Models
class WorkOrderBase(BaseModel):
    titre: str
    description: str
    statut: WorkOrderStatus = WorkOrderStatus.OUVERT
    priorite: Priority = Priority.AUCUNE
    categorie: Optional[WorkOrderCategory] = None
    equipement_id: Optional[str] = None
    assigne_a_id: Optional[str] = None
    assigne_type: Optional[str] = None  # "user" ou "service"
    assigne_service: Optional[str] = None  # Nom du service si assigne_type == "service"
    emplacement_id: Optional[str] = None
    dateLimite: Optional[datetime] = None
    tempsEstime: Optional[float] = None
    createdBy: Optional[str] = None  # ID de l'utilisateur créateur
    preventive_maintenance_id: Optional[str] = None  # ID de la PM source si créé depuis PM
    checklist_id: Optional[str] = None  # ID du template de checklist associé
    service: Optional[str] = None  # Service associé pour le filtrage par responsable

class WorkOrderCreate(WorkOrderBase):
    pass

class WorkOrderUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    statut: Optional[WorkOrderStatus] = None
    priorite: Optional[Priority] = None
    categorie: Optional[WorkOrderCategory] = None
    equipement_id: Optional[str] = None
    assigne_a_id: Optional[str] = None
    assigne_type: Optional[str] = None
    assigne_service: Optional[str] = None
    emplacement_id: Optional[str] = None
    dateLimite: Optional[datetime] = None
    tempsEstime: Optional[float] = None
    tempsReel: Optional[float] = None
    service: Optional[str] = None
    att_materiel_info: Optional[str] = None
    att_decision_info: Optional[str] = None


class AddTimeSpent(BaseModel):
    hours: int
    minutes: int

class TimeEntryUpdate(BaseModel):
    hours: float
    timestamp: Optional[str] = None
    user_id: Optional[str] = None  # Permet de changer le collaborateur assigné aux heures

class CommentUpdate(BaseModel):
    text: str

class WorkOrder(WorkOrderBase):
    id: str
    numero: str
    tempsReel: Optional[float] = None
    dateCreation: datetime
    dateTermine: Optional[datetime] = None
    equipement: Optional[dict] = None
    assigneA: Optional[dict] = None
    emplacement: Optional[dict] = None
    attachments: List[dict] = []
    comments: List[Comment] = []
    time_entries: List[dict] = []
    parts_used: List[PartUsed] = []  # Pièces utilisées
    createdByName: Optional[str] = None
    att_materiel_info: Optional[str] = None
    att_decision_info: Optional[str] = None

    class Config:
        from_attributes = True

# Attachment Model
class AttachmentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    size: int
    mime_type: str
    uploaded_at: datetime
    url: str

# Equipment Models
class EquipmentBase(BaseModel):
    nom: str
    categorie: Optional[str] = None
    emplacement_id: Optional[str] = None
    statut: EquipmentStatus = EquipmentStatus.OPERATIONNEL
    statut_changed_at: Optional[datetime] = None  # Date/heure du dernier changement de statut (arrondie à l'heure)
    dateAchat: Optional[datetime] = None
    coutAchat: Optional[float] = None
    numeroSerie: Optional[str] = None
    anneeFabrication: Optional[int] = None
    garantie: Optional[str] = None
    parent_id: Optional[str] = None
    service: Optional[str] = None  # Service associé pour le filtrage par responsable

class EquipmentCreate(BaseModel):
    nom: str
    categorie: Optional[str] = None
    emplacement_id: Optional[str] = None  # Optional to allow inheritance from parent
    statut: EquipmentStatus = EquipmentStatus.OPERATIONNEL
    statut_changed_at: Optional[datetime] = None
    dateAchat: Optional[datetime] = None
    coutAchat: Optional[float] = None
    numeroSerie: Optional[str] = None
    anneeFabrication: Optional[int] = None
    garantie: Optional[str] = None
    parent_id: Optional[str] = None
    service: Optional[str] = None  # Service associé pour le filtrage par responsable

class EquipmentUpdate(BaseModel):
    nom: Optional[str] = None
    categorie: Optional[str] = None
    emplacement_id: Optional[str] = None
    statut: Optional[EquipmentStatus] = None
    statut_changed_at: Optional[datetime] = None
    dateAchat: Optional[datetime] = None
    coutAchat: Optional[float] = None
    numeroSerie: Optional[str] = None
    anneeFabrication: Optional[int] = None
    garantie: Optional[str] = None
    derniereMaintenance: Optional[datetime] = None
    parent_id: Optional[str] = None
    service: Optional[str] = None  # Service associé pour le filtrage par responsable

class Equipment(EquipmentBase):
    id: str
    derniereMaintenance: Optional[datetime] = None
    dateCreation: datetime
    emplacement: Optional[dict] = None
    parent: Optional[dict] = None
    hasChildren: bool = False
    createdBy: Optional[str] = None  # ID de l'utilisateur créateur
    statut_changed_at: Optional[datetime] = None  # Date/heure du dernier changement de statut

    class Config:
        from_attributes = True

# Modèle pour l'historique des changements de statut des équipements
class EquipmentStatusHistoryBase(BaseModel):
    equipment_id: str
    statut: EquipmentStatus
    changed_at: datetime  # Date/heure du changement (arrondie à l'heure inférieure)
    changed_by: Optional[str] = None  # ID de l'utilisateur qui a fait le changement
    changed_by_name: Optional[str] = None  # Nom de l'utilisateur pour affichage

class EquipmentStatusHistoryCreate(EquipmentStatusHistoryBase):
    pass

class EquipmentStatusHistory(EquipmentStatusHistoryBase):
    id: str

    class Config:
        from_attributes = True

# Location Models (renommées en Zone)
class LocationBase(BaseModel):
    nom: str
    adresse: Optional[str] = None
    ville: Optional[str] = None
    codePostal: Optional[str] = None
    type: Optional[str] = None
    parent_id: Optional[str] = None  # Pour hiérarchie (sous-zones)

class LocationCreate(LocationBase):
    pass

class LocationUpdate(BaseModel):
    nom: Optional[str] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    codePostal: Optional[str] = None
    type: Optional[str] = None
    parent_id: Optional[str] = None

class Location(LocationBase):
    id: str
    dateCreation: datetime
    parent: Optional[dict] = None  # Informations de la zone parente
    hasChildren: bool = False  # Indique si cette zone a des sous-zones
    level: int = 0  # Niveau dans la hiérarchie (0 = racine, 1 = sous-zone, 2 = sous-sous-zone)

    class Config:
        from_attributes = True

# Inventory Models
class InventoryBase(BaseModel):
    nom: str
    reference: str
    categorie: str
    quantite: int
    quantiteMin: int
    prixUnitaire: float
    fournisseur: str
    emplacement: str
    equipment_ids: Optional[List[str]] = []  # Liste des IDs d'équipements/sous-équipements associés
    service_id: Optional[str] = None  # ID du service d'inventaire propriétaire
    shared_service_ids: Optional[List[str]] = []  # Services ayant importé cet article (lien partagé, même stock)

class InventoryCreate(InventoryBase):
    pass

class InventoryUpdate(BaseModel):
    nom: Optional[str] = None
    reference: Optional[str] = None
    categorie: Optional[str] = None
    quantite: Optional[int] = None
    quantiteMin: Optional[int] = None
    prixUnitaire: Optional[float] = None
    fournisseur: Optional[str] = None
    emplacement: Optional[str] = None
    equipment_ids: Optional[List[str]] = None  # Liste des IDs d'équipements associés
    service_id: Optional[str] = None
    shared_service_ids: Optional[List[str]] = None

class Inventory(InventoryBase):
    id: str
    dateCreation: datetime
    derniereModification: datetime

    class Config:
        from_attributes = True

# Preventive Maintenance Models
class PreventiveMaintenanceBase(BaseModel):
    titre: str
    equipement_id: str
    frequence: Frequency
    prochaineMaintenance: datetime
    assigne_a_id: Optional[str] = None
    duree: float
    statut: PMStatus = PMStatus.ACTIF
    checklist_template_id: Optional[str] = None  # ID du modèle de checklist associé

class PreventiveMaintenanceCreate(PreventiveMaintenanceBase):
    pass

class PreventiveMaintenanceUpdate(BaseModel):
    titre: Optional[str] = None
    equipement_id: Optional[str] = None
    frequence: Optional[Frequency] = None
    prochaineMaintenance: Optional[datetime] = None
    assigne_a_id: Optional[str] = None
    duree: Optional[float] = None
    statut: Optional[PMStatus] = None
    derniereMaintenance: Optional[datetime] = None
    checklist_template_id: Optional[str] = None

class PreventiveMaintenance(PreventiveMaintenanceBase):
    id: str
    derniereMaintenance: Optional[datetime] = None
    dateCreation: datetime
    equipement: Optional[dict] = None
    assigneA: Optional[dict] = None
    checklist_template: Optional[dict] = None  # Détails du modèle de checklist

    class Config:
        from_attributes = True

# Availability Models
class UserAvailability(BaseModel):
    user_id: str
    date: datetime
    # Pour régime Journée
    disponible: Optional[bool] = None  # None = non défini (blanc), True = disponible (vert), False = indisponible (rouge)
    # Pour régime 2*8
    disponible_matin: Optional[bool] = None
    disponible_aprem: Optional[bool] = None
    # Pour régime 3*8
    disponible_nuit: Optional[bool] = None
    motif: Optional[str] = None  # Raison de l'indisponibilité (congé, maladie, etc.)

class UserAvailabilityCreate(BaseModel):
    user_id: str
    date: datetime
    disponible: Optional[bool] = None
    disponible_matin: Optional[bool] = None
    disponible_aprem: Optional[bool] = None
    disponible_nuit: Optional[bool] = None
    motif: Optional[str] = None

class UserAvailabilityUpdate(BaseModel):
    disponible: Optional[bool] = None
    disponible_matin: Optional[bool] = None
    disponible_aprem: Optional[bool] = None
    disponible_nuit: Optional[bool] = None
    motif: Optional[str] = None

class UserAvailabilityResponse(UserAvailability):
    id: str
    user: Optional[dict] = None

    class Config:
        from_attributes = True

# Vendor Models
class VendorBase(BaseModel):
    nom: str
    contact: str
    email: str
    telephone: str
    adresse: str
    specialite: str
    # Champs enrichis
    pays: Optional[str] = None
    code_postal: Optional[str] = None
    ville: Optional[str] = None
    tva_intra: Optional[str] = None
    siret: Optional[str] = None
    conditions_paiement: Optional[str] = None
    devise: Optional[str] = None
    categorie: Optional[str] = None
    sous_traitant: Optional[bool] = False
    contact_fonction: Optional[str] = None
    site_web: Optional[str] = None
    notes: Optional[str] = None
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()

class VendorCreate(VendorBase):
    pass

class VendorUpdate(BaseModel):
    nom: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    specialite: Optional[str] = None
    pays: Optional[str] = None
    code_postal: Optional[str] = None
    ville: Optional[str] = None
    tva_intra: Optional[str] = None
    siret: Optional[str] = None
    conditions_paiement: Optional[str] = None
    devise: Optional[str] = None
    categorie: Optional[str] = None
    sous_traitant: Optional[bool] = None
    contact_fonction: Optional[str] = None
    site_web: Optional[str] = None
    notes: Optional[str] = None
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        # Validation basique d'email qui accepte les domaines locaux
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.local$'
        if not re.match(email_pattern, v):
            raise ValueError('Format d\'email invalide')
        return v.lower()

class Vendor(VendorBase):
    id: str
    dateCreation: datetime

    class Config:
        from_attributes = True


# Purchase History Models (Historique Achat)
class PurchaseHistoryBase(BaseModel):
    fournisseur: str
    numeroCommande: str
    numeroReception: Optional[str] = None
    dateCreation: datetime
    article: str
    description: Optional[str] = None
    groupeStatistique: Optional[str] = None
    quantite: float
    montantLigneHT: float
    quantiteRetournee: Optional[float] = 0.0
    site: Optional[str] = None
    creationUser: Optional[str] = None

class PurchaseHistoryCreate(PurchaseHistoryBase):
    pass

class PurchaseHistoryUpdate(BaseModel):
    fournisseur: Optional[str] = None
    numeroCommande: Optional[str] = None
    numeroReception: Optional[str] = None
    dateCreation: Optional[datetime] = None
    article: Optional[str] = None
    description: Optional[str] = None
    groupeStatistique: Optional[str] = None
    quantite: Optional[float] = None
    montantLigneHT: Optional[float] = None
    quantiteRetournee: Optional[float] = None
    site: Optional[str] = None
    creationUser: Optional[str] = None

class PurchaseHistory(PurchaseHistoryBase):
    id: str
    dateEnregistrement: datetime  # Date d'enregistrement dans la BD

    class Config:
        from_attributes = True


# Meter (Compteur) Models
class MeterType(str, Enum):
    EAU = "EAU"  # Eau
    GAZ = "GAZ"  # Gaz
    ELECTRICITE = "ELECTRICITE"  # Électricité
    AIR_COMPRIME = "AIR_COMPRIME"  # Air comprimé
    VAPEUR = "VAPEUR"  # Vapeur
    FUEL = "FUEL"  # Fuel/Mazout
    SOLAIRE = "SOLAIRE"  # Énergie solaire
    AUTRE = "AUTRE"  # Autre

class Meter(BaseModel):
    id: str
    nom: str
    type: MeterType
    numero_serie: Optional[str] = None
    emplacement_id: Optional[str] = None
    emplacement: Optional[Dict] = None
    unite: str  # m³, kWh, L, etc.
    prix_unitaire: Optional[float] = None  # Prix par unité
    abonnement_mensuel: Optional[float] = None  # Abonnement fixe mensuel
    date_creation: datetime
    notes: Optional[str] = None
    actif: bool = True
    
    # MQTT Integration
    mqtt_enabled: bool = False  # Activer la collecte MQTT
    mqtt_topic: Optional[str] = None  # Topic MQTT à écouter
    mqtt_json_path: Optional[str] = None  # Chemin JSON (ex: "value" ou "sensor.temperature")
    mqtt_refresh_interval: int = 5  # Intervalle de collecte en minutes (par défaut 5 min)
    mqtt_last_value: Optional[float] = None  # Dernière valeur reçue
    mqtt_last_update: Optional[str] = None  # Dernière mise à jour MQTT

class MeterCreate(BaseModel):
    nom: str
    type: MeterType
    numero_serie: Optional[str] = None
    emplacement_id: Optional[str] = None
    unite: str = "kWh"
    prix_unitaire: Optional[float] = None
    abonnement_mensuel: Optional[float] = None
    notes: Optional[str] = None
    
    # MQTT Integration
    mqtt_enabled: bool = False
    mqtt_topic: Optional[str] = None
    mqtt_json_path: Optional[str] = None
    mqtt_refresh_interval: int = 5

class MeterUpdate(BaseModel):
    nom: Optional[str] = None
    numero_serie: Optional[str] = None
    emplacement_id: Optional[str] = None
    unite: Optional[str] = None
    prix_unitaire: Optional[float] = None
    abonnement_mensuel: Optional[float] = None
    notes: Optional[str] = None
    actif: Optional[bool] = None
    
    # MQTT Integration
    mqtt_enabled: Optional[bool] = None
    mqtt_topic: Optional[str] = None
    mqtt_json_path: Optional[str] = None
    mqtt_refresh_interval: Optional[int] = None

# Reading (Relevé) Models
class MeterReading(BaseModel):
    id: str
    meter_id: str
    meter_nom: Optional[str] = None
    date_releve: datetime
    valeur: float  # Index du compteur
    notes: Optional[str] = None
    created_by: str
    created_by_name: Optional[str] = None
    consommation: Optional[float] = None  # Calculée automatiquement
    cout: Optional[float] = None  # Calculé automatiquement
    prix_unitaire: Optional[float] = None  # Prix au moment du relevé
    abonnement_mensuel: Optional[float] = None  # Abonnement au moment du relevé
    date_creation: datetime

class MeterReadingCreate(BaseModel):
    date_releve: datetime
    valeur: float
    notes: Optional[str] = None
    prix_unitaire: Optional[float] = None
    abonnement_mensuel: Optional[float] = None

class MeterReadingUpdate(BaseModel):
    date_releve: Optional[datetime] = None
    valeur: Optional[float] = None
    notes: Optional[str] = None
    prix_unitaire: Optional[float] = None
    abonnement_mensuel: Optional[float] = None



# Intervention Request (Demande d'intervention) Models
class InterventionRequestAttachment(BaseModel):
    id: Optional[str] = None
    filename: str
    original_filename: str
    size: int
    mime_type: str
    uploaded_at: Optional[datetime] = None
    url: Optional[str] = None

class InterventionRequest(BaseModel):
    id: str
    titre: str
    description: str
    priorite: Priority
    equipement_id: Optional[str] = None
    equipement: Optional[Dict] = None
    sous_equipement_id: Optional[str] = None
    sous_equipement: Optional[Dict] = None
    emplacement_id: Optional[str] = None
    emplacement: Optional[Dict] = None
    date_limite_desiree: Optional[datetime] = None
    date_creation: datetime
    created_by: str
    created_by_name: Optional[str] = None
    work_order_id: Optional[str] = None
    work_order_numero: Optional[str] = None
    work_order_date_limite: Optional[datetime] = None
    converted_at: Optional[datetime] = None
    converted_by: Optional[str] = None
    attachments: Optional[List[Any]] = []
    refused: Optional[bool] = False
    refused_reason: Optional[str] = None
    refused_at: Optional[datetime] = None
    refused_by: Optional[str] = None
    refused_by_name: Optional[str] = None
    is_work_order_deleted: Optional[bool] = False

class InterventionRequestCreate(BaseModel):
    titre: str
    description: str
    priorite: Priority = Priority.AUCUNE
    equipement_id: Optional[str] = None
    sous_equipement_id: Optional[str] = None
    emplacement_id: Optional[str] = None
    date_limite_desiree: Optional[datetime] = None

class InterventionRequestUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    priorite: Optional[Priority] = None
    equipement_id: Optional[str] = None
    sous_equipement_id: Optional[str] = None
    emplacement_id: Optional[str] = None
    date_limite_desiree: Optional[datetime] = None


# Statut de validation pour les demandes d'amélioration
class ImprovementRequestStatus(str, Enum):
    """Statut de validation d'une demande d'amélioration"""
    SOUMISE = "SOUMISE"  # En attente de validation
    VALIDEE = "VALIDEE"  # Validée par le responsable
    REJETEE = "REJETEE"  # Rejetée par le responsable
    CONVERTIE = "CONVERTIE"  # Convertie en projet d'amélioration


# Historique de validation pour demandes d'amélioration
class ImprovementRequestHistoryEntry(BaseModel):
    """Entrée d'historique pour une demande d'amélioration"""
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    user_id: str
    user_name: str
    action: str
    old_status: Optional[str] = None
    new_status: str
    comment: Optional[str] = None


# Improvement Request (Demande d'amélioration) Models
class ImprovementRequest(BaseModel):
    id: str
    titre: str
    description: str
    priorite: Priority
    equipement_id: Optional[str] = None
    equipement: Optional[Dict] = None
    emplacement_id: Optional[str] = None
    emplacement: Optional[Dict] = None
    date_limite_desiree: Optional[datetime] = None
    date_creation: datetime
    created_by: str
    created_by_name: Optional[str] = None
    service: Optional[str] = None  # Service du demandeur pour le filtrage
    
    # Statut de validation
    status: Optional[str] = "SOUMISE"  # SOUMISE, VALIDEE, REJETEE, CONVERTIE
    validated_at: Optional[datetime] = None
    validated_by: Optional[str] = None
    validated_by_name: Optional[str] = None
    rejection_reason: Optional[str] = None
    history: List[Dict] = Field(default_factory=list)
    
    # Lien avec le projet d'amélioration créé
    improvement_id: Optional[str] = None  # ID de l'amélioration créée
    improvement_numero: Optional[str] = None  # Numéro de l'amélioration créée
    improvement_date_limite: Optional[datetime] = None  # Date limite de l'amélioration créée
    converted_at: Optional[datetime] = None  # Date de conversion
    converted_by: Optional[str] = None  # ID de qui a converti

class ImprovementRequestCreate(BaseModel):
    titre: str
    description: str
    priorite: Priority = Priority.AUCUNE
    equipement_id: Optional[str] = None
    emplacement_id: Optional[str] = None
    date_limite_desiree: Optional[datetime] = None

class ImprovementRequestUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    priorite: Optional[Priority] = None
    equipement_id: Optional[str] = None
    emplacement_id: Optional[str] = None
    date_limite_desiree: Optional[datetime] = None


class ImprovementRequestStatusUpdate(BaseModel):
    """Modèle pour valider/rejeter une demande d'amélioration"""
    status: str  # VALIDEE ou REJETEE
    comment: Optional[str] = None


# Improvement (Amélioration) Models - Copie de WorkOrder
class Improvement(BaseModel):
    id: str
    numero: str
    titre: str
    description: str
    statut: WorkOrderStatus
    priorite: Priority
    equipement_id: Optional[str] = None
    equipement: Optional[Dict] = None
    emplacement_id: Optional[str] = None
    emplacement: Optional[Dict] = None
    assigne_a_id: Optional[str] = None
    assigneA: Optional[Dict] = None
    dateLimite: Optional[datetime] = None
    tempsEstime: Optional[float] = None
    tempsReel: Optional[float] = None
    dateCreation: datetime
    dateTermine: Optional[datetime] = None
    createdBy: str
    createdByName: Optional[str] = None
    attachments: Optional[List[Dict]] = []
    comments: Optional[List[Dict]] = []
    time_entries: Optional[List[Dict]] = []

class ImprovementCreate(BaseModel):
    titre: str
    description: str
    priorite: Priority = Priority.AUCUNE
    equipement_id: Optional[str] = None
    emplacement_id: Optional[str] = None
    assigne_a_id: Optional[str] = None
    dateLimite: Optional[datetime] = None
    tempsEstime: Optional[float] = None

class ImprovementUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    statut: Optional[WorkOrderStatus] = None
    priorite: Optional[Priority] = None
    equipement_id: Optional[str] = None
    emplacement_id: Optional[str] = None
    assigne_a_id: Optional[str] = None
    dateLimite: Optional[datetime] = None
    tempsEstime: Optional[float] = None
    tempsReel: Optional[float] = None


# ==================== SETTINGS MODELS ====================
class SystemSettings(BaseModel):
    inactivity_timeout_minutes: int = 15  # Temps d'inactivité en minutes avant déconnexion
    timezone_offset: int = 1  # Décalage GMT en heures (ex: 1 pour GMT+1)
    timezone_name: Optional[str] = "Europe/Paris"  # Nom IANA du fuseau horaire
    ntp_server: str = "pool.ntp.org"  # Serveur NTP

class SystemSettingsUpdate(BaseModel):
    inactivity_timeout_minutes: Optional[int] = None
    timezone_offset: Optional[int] = None
    timezone_name: Optional[str] = None
    ntp_server: Optional[str] = None

# Timezone Configuration Models
class TimezoneConfig(BaseModel):
    timezone_offset: int = 1  # GMT+X offset
    timezone_name: Optional[str] = "Europe/Paris"
    ntp_server: str = "pool.ntp.org"

class TimezoneConfigUpdate(BaseModel):
    timezone_offset: Optional[int] = None
    timezone_name: Optional[str] = None
    ntp_server: Optional[str] = None

class NTPTestResult(BaseModel):
    success: bool
    server: str
    server_time: Optional[str] = None
    local_time: Optional[str] = None
    offset_ms: Optional[float] = None
    message: str

# SMTP Configuration Models
class SMTPConfig(BaseModel):
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "FSAO Iris"
    smtp_use_tls: bool = True
    frontend_url: str = ""
    backend_url: str = ""

class SMTPConfigUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    frontend_url: Optional[str] = None
    backend_url: Optional[str] = None

class SMTPTestRequest(BaseModel):
    test_email: EmailStr


# Plan de Surveillance Models
class SurveillanceItemStatus(str, Enum):
    PLANIFIER = "PLANIFIER"  # À planifier
    PLANIFIE = "PLANIFIE"    # Planifié mais non réalisé
    REALISE = "REALISE"      # Réalisé

class SurveillanceCategory(str, Enum):
    MMRI = "MMRI"  # Mesures de maîtrise des risques instrumentées
    INCENDIE = "INCENDIE"  # Sécurité incendie
    SECURITE_ENVIRONNEMENT = "SECURITE_ENVIRONNEMENT"  # Sécurité/Environnement
    ELECTRIQUE = "ELECTRIQUE"  # Installations électriques
    MANUTENTION = "MANUTENTION"  # Engins de manutention
    EXTRACTION = "EXTRACTION"  # Extraction des liquides
    AUTRE = "AUTRE"  # Autre

class SurveillanceResponsible(str, Enum):
    MAINT = "MAINT"
    PROD = "PROD"
    QHSE = "QHSE"
    EXTERNE = "EXTERNE"

class SurveillanceItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    classe_type: str  # Ex: "Protection incendie", "Installations électriques"
    category: str  # Catégorie dynamique (ex: "INCENDIE", "ELECTRIQUE", etc.)
    batiment: str  # Ex: "BATIMENT 1", "BATIMENT 1 ET 2"
    periodicite: str  # Ex: "6 mois", "1 an", "3 ans"
    responsable: SurveillanceResponsible
    executant: str  # Nom de l'exécutant (entreprise externe ou interne)
    description: Optional[str] = None  # Description détaillée du contrôle
    
    # Dates et suivi
    derniere_visite: Optional[str] = None  # Date ISO ou X
    prochain_controle: Optional[str] = None  # Date ISO
    status: SurveillanceItemStatus = SurveillanceItemStatus.PLANIFIER
    date_realisation: Optional[str] = None  # Date de réalisation effective
    
    # Suivi mensuel (12 mois)
    janvier: bool = False
    fevrier: bool = False
    mars: bool = False
    avril: bool = False
    mai: bool = False
    juin: bool = False
    juillet: bool = False
    aout: bool = False
    septembre: bool = False
    octobre: bool = False
    novembre: bool = False
    decembre: bool = False
    
    # Informations réglementaires et rapport
    reference_reglementaire: Optional[str] = None  # Articles de loi, arrêtés, normes
    numero_rapport: Optional[str] = None  # Numéro du rapport de contrôle
    organisme_controle: Optional[str] = None  # APAVE, SOCOTEC, DEKRA, etc.
    resultat_controle: Optional[str] = None  # Conforme / Non conforme / Avec réserves
    
    # Documents et commentaires
    commentaire: Optional[str] = None
    piece_jointe_url: Optional[str] = None  # URL du fichier uploadé (legacy, single file)
    piece_jointe_nom: Optional[str] = None  # Nom original du fichier (legacy)
    attachments: List[dict] = []  # Liste de fichiers joints [{id, filename, url, size, uploaded_at}]
    
    # Alertes
    alerte_envoyee: bool = False  # True si alerte d'échéance déjà envoyée
    alerte_date: Optional[str] = None  # Date de la dernière alerte
    duree_rappel_echeance: int = 30  # Durée en jours avant échéance pour déclencher l'alerte (défaut: 30)
    responsable_notification_id: Optional[str] = None  # ID de l'utilisateur qui recevra l'email de rappel
    email_rappel_envoye: bool = False  # True si l'email de rappel a été envoyé
    
    # Métadonnées
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    
    # Gestion par année et récurrence
    annee: Optional[int] = None  # Année du contrôle (ex: 2026)
    groupe_controle_id: Optional[str] = None  # Lien entre contrôles récurrents
    ecart_jours: Optional[int] = None  # Écart en jours entre date prévue et date réelle (+ = retard, - = avance)

class SurveillanceItemCreate(BaseModel):
    classe_type: str
    category: str  # Catégorie dynamique (ex: "INCENDIE", "ELECTRIQUE", etc.)
    batiment: str
    periodicite: str
    responsable: SurveillanceResponsible
    executant: str
    description: Optional[str] = None
    derniere_visite: Optional[str] = None
    prochain_controle: Optional[str] = None
    commentaire: Optional[str] = None
    reference_reglementaire: Optional[str] = None
    numero_rapport: Optional[str] = None
    organisme_controle: Optional[str] = None
    resultat_controle: Optional[str] = None
    duree_rappel_echeance: int = 30
    responsable_notification_id: Optional[str] = None
    groupe_controle_id: Optional[str] = None  # Pour lier les contrôles récurrents

class SurveillanceItemUpdate(BaseModel):
    classe_type: Optional[str] = None
    category: Optional[str] = None
    batiment: Optional[str] = None
    periodicite: Optional[str] = None
    responsable: Optional[SurveillanceResponsible] = None
    executant: Optional[str] = None
    description: Optional[str] = None
    derniere_visite: Optional[str] = None
    prochain_controle: Optional[str] = None
    status: Optional[SurveillanceItemStatus] = None
    date_realisation: Optional[str] = None
    janvier: Optional[bool] = None
    fevrier: Optional[bool] = None
    mars: Optional[bool] = None
    avril: Optional[bool] = None
    mai: Optional[bool] = None
    juin: Optional[bool] = None
    juillet: Optional[bool] = None
    aout: Optional[bool] = None
    septembre: Optional[bool] = None
    octobre: Optional[bool] = None
    novembre: Optional[bool] = None
    decembre: Optional[bool] = None
    commentaire: Optional[str] = None
    piece_jointe_url: Optional[str] = None
    piece_jointe_nom: Optional[str] = None
    reference_reglementaire: Optional[str] = None
    numero_rapport: Optional[str] = None
    organisme_controle: Optional[str] = None
    resultat_controle: Optional[str] = None
    duree_rappel_echeance: Optional[int] = None
    responsable_notification_id: Optional[str] = None
    annee: Optional[int] = None



# ==================== AI ANALYSIS HISTORY MODELS ====================

class AIAnalysisHistory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    file_size: Optional[int] = None
    organisme_controle: Optional[str] = None
    date_intervention: Optional[str] = None
    numero_rapport: Optional[str] = None
    site_controle: Optional[str] = None
    
    # Résultats
    controles_count: int = 0
    conformes_count: int = 0
    non_conformes_count: int = 0
    avec_reserves_count: int = 0
    
    # IDs créés
    created_item_ids: List[str] = []
    created_work_order_ids: List[str] = []
    
    # Données brutes extraites
    raw_extracted_data: Optional[dict] = None
    
    # Catégories détectées
    categories: List[str] = []
    
    # Métadonnées
    analyzed_by: Optional[str] = None
    analyzed_by_name: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())



# ==================== PRESQU'ACCIDENT (NEAR MISS) MODELS ====================

class PresquAccidentStatus(str, Enum):
    A_TRAITER = "A_TRAITER"  # À traiter
    EN_COURS = "EN_COURS"  # En cours de traitement
    TERMINE = "TERMINE"  # Terminé / Traité
    RISQUE_RESIDUEL = "RISQUE_RESIDUEL"  # Risque résiduel

class PresquAccidentService(str, Enum):
    ADV = "ADV"
    LOGISTIQUE = "LOGISTIQUE"
    PRODUCTION = "PRODUCTION"
    QHSE = "QHSE"
    MAINTENANCE = "MAINTENANCE"
    LABO = "LABO"
    INDUS = "INDUS"
    AUTRE = "AUTRE"

class PresquAccidentSeverity(str, Enum):
    FAIBLE = "FAIBLE"  # Faible
    MOYEN = "MOYEN"  # Moyen
    ELEVE = "ELEVE"  # Élevé
    CRITIQUE = "CRITIQUE"  # Critique

class PresquAccidentCategory(str, Enum):
    CHUTE_PERSONNE = "CHUTE_PERSONNE"
    CHUTE_OBJET = "CHUTE_OBJET"
    BRULURE = "BRULURE"
    COINCEMENT = "COINCEMENT"
    COUPURE = "COUPURE"
    COLLISION = "COLLISION"
    EXPOSITION_CHIMIQUE = "EXPOSITION_CHIMIQUE"
    ELECTRIQUE = "ELECTRIQUE"
    ERGONOMIQUE = "ERGONOMIQUE"
    PROJECTION = "PROJECTION"
    INCENDIE_EXPLOSION = "INCENDIE_EXPLOSION"
    AUTRE = "AUTRE"

class PresquAccidentLesion(str, Enum):
    FRACTURE = "FRACTURE"
    BRULURE = "BRULURE"
    COUPURE = "COUPURE"
    CONTUSION = "CONTUSION"
    ENTORSE = "ENTORSE"
    INTOXICATION = "INTOXICATION"
    IRRITATION = "IRRITATION"
    ELECTRISATION = "ELECTRISATION"
    ECRASEMENT = "ECRASEMENT"
    DOULEUR_MUSCULAIRE = "DOULEUR_MUSCULAIRE"
    AUCUNE = "AUCUNE"
    AUTRE = "AUTRE"

class PresquAccidentFacteur(str, Enum):
    HUMAIN = "HUMAIN"
    MATERIEL = "MATERIEL"
    ORGANISATIONNEL = "ORGANISATIONNEL"
    ENVIRONNEMENTAL = "ENVIRONNEMENTAL"

class PresquAccidentItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero: Optional[str] = None  # Format: [année]-[numéro] ex: 2026-001
    
    # Informations principales
    titre: str  # Titre court du presqu'accident
    description: str  # Description détaillée / Circonstances
    date_incident: str  # Date ISO de l'incident
    lieu: str  # Lieu de l'incident
    service: PresquAccidentService  # Service concerné
    categorie_incident: Optional[str] = None  # Catégorie/type d'incident
    
    # Équipement concerné
    equipement_id: Optional[str] = None  # ID équipement lié (depuis la base FSAO)
    equipement_nom: Optional[str] = None  # Nom de l'équipement (dénormalisé)
    
    # Personnes
    declarant: Optional[str] = None  # Nom du déclarant
    personnes_impliquees: Optional[str] = None  # Noms des personnes (séparés par virgule)
    temoins: Optional[str] = None  # Noms des témoins
    responsable_id: Optional[str] = None  # ID de l'utilisateur responsable du traitement
    
    # Analyse
    contexte_cause: Optional[str] = None  # Contexte et cause probable
    mesures_immediates: Optional[str] = None  # Mesures immédiates prises
    severite: PresquAccidentSeverity = PresquAccidentSeverity.MOYEN
    type_lesion_potentielle: Optional[str] = None  # Type de lésion potentielle
    facteurs_contributifs: List[str] = Field(default_factory=list)  # Facteurs contributifs
    conditions_incident: Optional[str] = None  # Conditions au moment de l'incident
    
    # Actions proposées par le déclarant
    actions_proposees: Optional[str] = None  # Actions proposées par l'encadrement
    
    # Réponse/Traitement (rempli par le responsable)
    actions_preventions: Optional[str] = None  # Actions de prévention
    responsable_action: Optional[str] = None  # Responsable de l'action corrective
    date_echeance_action: Optional[str] = None  # Date ISO d'échéance de l'action
    commentaire_traitement: Optional[str] = None  # Commentaire du traitement
    
    # Statut et suivi
    status: PresquAccidentStatus = PresquAccidentStatus.A_TRAITER
    date_cloture: Optional[str] = None  # Date ISO de clôture
    
    # Documents (pièces jointes initiales et de traitement)
    attachments: List[Dict[str, Any]] = Field(default_factory=list)  # Liste des pièces jointes initiales
    attachments_traitement: List[Dict[str, Any]] = Field(default_factory=list)  # Pièces jointes du traitement
    
    # Legacy fields (pour compatibilité)
    commentaire: Optional[str] = None
    piece_jointe_url: Optional[str] = None
    piece_jointe_nom: Optional[str] = None
    
    # Métadonnées
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    traite_par: Optional[str] = None  # ID de l'utilisateur qui a traité
    traite_le: Optional[str] = None  # Date du traitement

class PresquAccidentItemCreate(BaseModel):
    titre: str
    description: str
    date_incident: str
    lieu: str
    service: PresquAccidentService
    categorie_incident: Optional[str] = None
    equipement_id: Optional[str] = None
    equipement_nom: Optional[str] = None
    declarant: Optional[str] = None
    personnes_impliquees: Optional[str] = None
    temoins: Optional[str] = None
    responsable_id: Optional[str] = None
    contexte_cause: Optional[str] = None
    mesures_immediates: Optional[str] = None
    severite: PresquAccidentSeverity = PresquAccidentSeverity.MOYEN
    type_lesion_potentielle: Optional[str] = None
    facteurs_contributifs: List[str] = Field(default_factory=list)
    conditions_incident: Optional[str] = None
    actions_proposees: Optional[str] = None

class PresquAccidentItemUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    date_incident: Optional[str] = None
    lieu: Optional[str] = None
    service: Optional[PresquAccidentService] = None
    categorie_incident: Optional[str] = None
    equipement_id: Optional[str] = None
    equipement_nom: Optional[str] = None
    declarant: Optional[str] = None
    personnes_impliquees: Optional[str] = None
    temoins: Optional[str] = None
    responsable_id: Optional[str] = None
    contexte_cause: Optional[str] = None
    mesures_immediates: Optional[str] = None
    severite: Optional[PresquAccidentSeverity] = None
    type_lesion_potentielle: Optional[str] = None
    facteurs_contributifs: Optional[List[str]] = None
    conditions_incident: Optional[str] = None
    actions_proposees: Optional[str] = None
    # Champs de traitement
    actions_preventions: Optional[str] = None
    responsable_action: Optional[str] = None
    date_echeance_action: Optional[str] = None
    commentaire_traitement: Optional[str] = None
    status: Optional[PresquAccidentStatus] = None
    date_cloture: Optional[str] = None
    # Évaluation des risques (traitement)
    severite_traitement: Optional[str] = None  # "1", "2", "3", "4"
    recurrence: Optional[str] = None  # "1", "2", "3", "4"
    priorite: Optional[str] = None  # Calculé: "Faible", "Moyenne", "Élevée", "Critique"
    priorite_score: Optional[int] = None  # Score calculé (1-16)
    # Legacy
    commentaire: Optional[str] = None
    piece_jointe_url: Optional[str] = None
    piece_jointe_nom: Optional[str] = None



# ==================== DOCUMENTATIONS & PÔLES DE SERVICE ====================

class DocumentType(str, Enum):
    FORMULAIRE = "FORMULAIRE"  # Formulaire créé en ligne
    PIECE_JOINTE = "PIECE_JOINTE"  # Document uploadé (PDF, Word, Excel, etc.)
    TEMPLATE = "TEMPLATE"  # Template de formulaire

class ServicePole(str, Enum):
    MAINTENANCE = "MAINTENANCE"
    PRODUCTION = "PRODUCTION"
    QHSE = "QHSE"
    LOGISTIQUE = "LOGISTIQUE"
    LABO = "LABO"
    ADV = "ADV"
    INDUS = "INDUS"
    DIRECTION = "DIRECTION"
    RH = "RH"
    AUTRE = "AUTRE"

class PoleDeService(BaseModel):
    """Pôle de Service - Conteneur pour les documents"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str  # Nom du pôle (ex: "Maintenance", "Production")
    pole: ServicePole  # Type de pôle
    description: Optional[str] = None
    responsable: Optional[str] = None  # Responsable du pôle
    couleur: Optional[str] = "#3b82f6"  # Couleur pour l'UI
    icon: Optional[str] = "Folder"  # Icône Lucide React
    
    # Métadonnées
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: Optional[str] = None

class Document(BaseModel):
    """Document ou formulaire dans un pôle de service"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Informations de base
    titre: str
    description: Optional[str] = None
    pole_id: str  # ID du pôle de service parent
    type_document: DocumentType
    
    # Pour les pièces jointes
    fichier_url: Optional[str] = None  # URL du fichier uploadé
    fichier_nom: Optional[str] = None  # Nom original du fichier
    fichier_type: Optional[str] = None  # MIME type
    fichier_taille: Optional[int] = None  # Taille en bytes
    
    # Pour les formulaires en ligne
    formulaire_data: Optional[dict] = None  # Structure JSON du formulaire
    
    # Métadonnées
    version: str = "1.0"
    statut: str = "ACTIF"  # ACTIF, ARCHIVE, BROUILLON
    tags: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

class BonDeTravail(BaseModel):
    """Bon de Travail - Formulaire spécifique maintenance"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Travaux à réaliser
    localisation_ligne: str
    description_travaux: str
    nom_intervenants: str
    
    # Risques identifiés
    risques_materiel: List[str] = []  # Checkboxes cochées
    risques_materiel_autre: Optional[str] = None
    
    risques_autorisation: List[str] = []  # Point chaud, Espace confiné
    
    risques_produits: List[str] = []  # Toxique, Inflammable, etc.
    
    risques_environnement: List[str] = []  # Co-activité, Passage chariot, etc.
    risques_environnement_autre: Optional[str] = None
    
    # Précautions à prendre
    precautions_materiel: List[str] = []
    precautions_materiel_autre: Optional[str] = None
    
    precautions_epi: List[str] = []  # Équipements de protection
    precautions_epi_autre: Optional[str] = None
    
    precautions_environnement: List[str] = []
    precautions_environnement_autre: Optional[str] = None
    
    # Engagement
    date_engagement: str
    nom_agent_maitrise: str
    nom_representant: str
    
    # Métadonnées
    pole_id: str  # Lié au pôle Maintenance
    entreprise: str = "Non assignée"  # Entreprise du bon de travail
    statut: str = "BROUILLON"  # BROUILLON, VALIDE, ENVOYE
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: Optional[str] = None
    titre: Optional[str] = None  # Titre du bon de travail


# ==================== AUTORISATION PARTICULIERE ====================

class PersonnelAutorise(BaseModel):
    """Personnel autorisé pour l'autorisation particulière"""
    nom: str
    fonction: str

class AutorisationParticuliere(BaseModel):
    """Autorisation Particulière de Travaux - Formulaire MAINT_FE_003_V03"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero: int  # N° d'autorisation (auto-généré, >= 8000)
    
    # Informations principales
    date_etablissement: str  # Date d'établissement
    service_demandeur: str
    responsable: str
    
    # Personnel autorisé (4 entrées max)
    personnel_autorise: List[PersonnelAutorise] = []
    
    # Description des travaux (type de travaux)
    type_point_chaud: bool = False
    type_fouille: bool = False
    type_espace_clos: bool = False
    type_autre_cas: bool = False
    description_travaux: str = ""  # Champ texte libre
    
    # Horaires et lieu
    horaire_debut: str  # Format HH:MM
    horaire_fin: str  # Format HH:MM
    lieu_travaux: str
    
    # Risques potentiels (liste)
    risques_potentiels: str
    
    # Mesures de sécurité (checkboxes avec FAIT/A FAIRE)
    mesure_consignation_materiel: str = ""  # "" ou "FAIT" ou "A_FAIRE"
    mesure_consignation_electrique: str = ""
    mesure_debranchement_force: str = ""
    mesure_vidange_appareil: str = ""
    mesure_decontamination: str = ""
    mesure_degazage: str = ""
    mesure_pose_joint: str = ""
    mesure_ventilation: str = ""
    mesure_zone_balisee: str = ""
    mesure_canalisations_electriques: str = ""
    mesure_souterraines_balisees: str = ""
    mesure_egouts_cables: str = ""
    mesure_taux_oxygene: str = ""
    mesure_taux_explosivite: str = ""
    mesure_explosimetre: str = ""
    mesure_eclairage_surete: str = ""
    mesure_extincteur: str = ""
    mesure_autres: str = ""
    mesures_securite_texte: str = ""  # Champ texte libre
    
    # Équipements de protection (checkboxes)
    epi_visiere: bool = False
    epi_tenue_impermeable: bool = False
    epi_cagoule_air: bool = False
    epi_masque: bool = False
    epi_gant: bool = False
    epi_harnais: bool = False
    epi_outillage_anti_etincelle: bool = False
    epi_presence_surveillant: bool = False
    epi_autres: bool = False
    equipements_protection_texte: str = ""  # Champ texte libre
    
    # Signatures
    signature_demandeur: Optional[str] = None
    date_signature_demandeur: Optional[str] = None
    signature_responsable_securite: Optional[str] = None
    date_signature_responsable: Optional[str] = None
    
    # Lien avec les bons de travail (optionnel, plusieurs bons possibles)
    bons_travail_ids: List[str] = []
    
    # Métadonnées
    statut: str = "BROUILLON"  # BROUILLON, VALIDE
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: Optional[str] = None

class AutorisationParticuliereCreate(BaseModel):
    """Modèle pour la création d'une autorisation particulière"""
    service_demandeur: str
    responsable: str
    personnel_autorise: List[PersonnelAutorise] = []
    # Types de travaux
    type_point_chaud: bool = False
    type_fouille: bool = False
    type_espace_clos: bool = False
    type_autre_cas: bool = False
    description_travaux: str = ""
    # Horaires
    horaire_debut: str
    horaire_fin: str
    lieu_travaux: str
    risques_potentiels: str
    # Mesures de sécurité
    mesure_consignation_materiel: str = ""
    mesure_consignation_electrique: str = ""
    mesure_debranchement_force: str = ""
    mesure_vidange_appareil: str = ""
    mesure_decontamination: str = ""
    mesure_degazage: str = ""
    mesure_pose_joint: str = ""
    mesure_ventilation: str = ""
    mesure_zone_balisee: str = ""
    mesure_canalisations_electriques: str = ""
    mesure_souterraines_balisees: str = ""
    mesure_egouts_cables: str = ""
    mesure_taux_oxygene: str = ""
    mesure_taux_explosivite: str = ""
    mesure_explosimetre: str = ""
    mesure_eclairage_surete: str = ""
    mesure_extincteur: str = ""
    mesure_autres: str = ""
    mesures_securite_texte: str = ""
    # EPI
    epi_visiere: bool = False
    epi_tenue_impermeable: bool = False
    epi_cagoule_air: bool = False
    epi_masque: bool = False
    epi_gant: bool = False
    epi_harnais: bool = False
    epi_outillage_anti_etincelle: bool = False
    epi_presence_surveillant: bool = False
    epi_autres: bool = False
    equipements_protection_texte: str = ""
    # Signatures
    signature_demandeur: Optional[str] = None
    date_signature_demandeur: Optional[str] = None
    signature_responsable_securite: Optional[str] = None
    date_signature_responsable: Optional[str] = None
    bons_travail_ids: List[str] = []

class AutorisationParticuliereUpdate(BaseModel):
    """Modèle pour la mise à jour d'une autorisation particulière"""
    service_demandeur: Optional[str] = None
    responsable: Optional[str] = None
    personnel_autorise: Optional[List[PersonnelAutorise]] = None
    # Types de travaux
    type_point_chaud: Optional[bool] = None
    type_fouille: Optional[bool] = None
    type_espace_clos: Optional[bool] = None
    type_autre_cas: Optional[bool] = None
    description_travaux: Optional[str] = None
    # Horaires
    horaire_debut: Optional[str] = None
    horaire_fin: Optional[str] = None
    lieu_travaux: Optional[str] = None
    risques_potentiels: Optional[str] = None
    # Mesures de sécurité
    mesure_consignation_materiel: Optional[str] = None
    mesure_consignation_electrique: Optional[str] = None
    mesure_debranchement_force: Optional[str] = None
    mesure_vidange_appareil: Optional[str] = None
    mesure_decontamination: Optional[str] = None
    mesure_degazage: Optional[str] = None
    mesure_pose_joint: Optional[str] = None
    mesure_ventilation: Optional[str] = None
    mesure_zone_balisee: Optional[str] = None
    mesure_canalisations_electriques: Optional[str] = None
    mesure_souterraines_balisees: Optional[str] = None
    mesure_egouts_cables: Optional[str] = None
    mesure_taux_oxygene: Optional[str] = None
    mesure_taux_explosivite: Optional[str] = None
    mesure_explosimetre: Optional[str] = None
    mesure_eclairage_surete: Optional[str] = None
    mesure_extincteur: Optional[str] = None
    mesure_autres: Optional[str] = None
    mesures_securite_texte: Optional[str] = None
    # EPI
    epi_visiere: Optional[bool] = None
    epi_tenue_impermeable: Optional[bool] = None
    epi_cagoule_air: Optional[bool] = None
    epi_masque: Optional[bool] = None
    epi_gant: Optional[bool] = None
    epi_harnais: Optional[bool] = None
    epi_outillage_anti_etincelle: Optional[bool] = None
    epi_presence_surveillant: Optional[bool] = None
    epi_autres: Optional[bool] = None
    equipements_protection_texte: Optional[str] = None
    # Signatures
    signature_demandeur: Optional[str] = None
    date_signature_demandeur: Optional[str] = None
    signature_responsable_securite: Optional[str] = None
    date_signature_responsable: Optional[str] = None
    bons_travail_ids: Optional[List[str]] = None
    statut: Optional[str] = None

# Models CRUD
class PoleDeServiceCreate(BaseModel):
    nom: str
    pole: ServicePole
    description: Optional[str] = None
    responsable: Optional[str] = None
    couleur: Optional[str] = "#3b82f6"
    icon: Optional[str] = "Folder"

class PoleDeServiceUpdate(BaseModel):
    nom: Optional[str] = None
    pole: Optional[ServicePole] = None
    description: Optional[str] = None
    responsable: Optional[str] = None
    couleur: Optional[str] = None
    icon: Optional[str] = None

class DocumentCreate(BaseModel):
    titre: str
    description: Optional[str] = None
    pole_id: str
    type_document: DocumentType
    formulaire_data: Optional[dict] = None
    tags: List[str] = []

class DocumentUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    type_document: Optional[DocumentType] = None
    formulaire_data: Optional[dict] = None
    statut: Optional[str] = None
    tags: Optional[List[str]] = None

class BonDeTravailCreate(BaseModel):
    titre: str
    localisation_ligne: str
    description_travaux: str
    nom_intervenants: str
    risques_materiel: List[str] = []
    risques_materiel_autre: Optional[str] = None
    risques_autorisation: List[str] = []
    risques_produits: List[str] = []
    risques_environnement: List[str] = []
    risques_environnement_autre: Optional[str] = None
    precautions_materiel: List[str] = []
    precautions_materiel_autre: Optional[str] = None
    precautions_epi: List[str] = []
    precautions_epi_autre: Optional[str] = None
    precautions_environnement: List[str] = []
    precautions_environnement_autre: Optional[str] = None
    date_engagement: str
    nom_agent_maitrise: str
    nom_representant: str
    pole_id: str
    entreprise: str = "Non assignée"



# ==================== DEMANDES D'ARRÊT POUR MAINTENANCE ====================

class DemandeArretStatus(str, Enum):
    EN_ATTENTE = "EN_ATTENTE"
    APPROUVEE = "APPROUVEE"
    REFUSEE = "REFUSEE"
    EXPIREE = "EXPIREE"  # Auto-refusée après 7 jours
    ANNULEE = "ANNULEE"  # Annulée par l'utilisateur
    TERMINEE = "TERMINEE"  # Maintenance terminée
    EN_ATTENTE_REPORT = "EN_ATTENTE_REPORT"  # En attente de validation du report

class PeriodeType(str, Enum):
    JOURNEE_COMPLETE = "JOURNEE_COMPLETE"
    MATIN = "MATIN"  # 8h-12h
    APRES_MIDI = "APRES_MIDI"  # 13h-17h

class DemandeArretMaintenance(BaseModel):
    """Demande d'arrêt d'équipement pour maintenance"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Période demandée
    date_debut: str  # Format ISO date
    date_fin: str  # Format ISO date
    periode_debut: PeriodeType = PeriodeType.JOURNEE_COMPLETE
    periode_fin: PeriodeType = PeriodeType.JOURNEE_COMPLETE
    
    # Demandeur
    demandeur_id: str
    demandeur_nom: str
    
    # Équipements concernés (sélection multiple)
    equipement_ids: List[str] = []
    equipement_noms: List[str] = []  # Pour affichage
    
    # Ordre de travail ou maintenance préventive (optionnel)
    work_order_id: Optional[str] = None
    maintenance_preventive_id: Optional[str] = None
    
    # Commentaire libre
    commentaire: str = ""
    
    # Priorité de la demande
    priorite: str = "NORMALE"  # URGENTE, NORMALE, BASSE
    
    # Pièces jointes
    attachments: List[Dict] = []  # [{filename, url, size, type}]
    
    # Destinataire
    destinataire_id: str
    destinataire_nom: str
    destinataire_email: str
    
    # Statut et validation
    statut: DemandeArretStatus = DemandeArretStatus.EN_ATTENTE
    date_creation: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    date_expiration: str  # Auto-calculée : date_creation + 7 jours
    date_reponse: Optional[str] = None
    commentaire_reponse: Optional[str] = None
    date_proposee: Optional[str] = None  # Si refus avec proposition nouvelle date
    
    # Token pour validation par email
    validation_token: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Métadonnées
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class DemandeArretMaintenanceCreate(BaseModel):
    """Modèle pour créer une demande d'arrêt"""
    date_debut: str
    date_fin: str
    periode_debut: PeriodeType = PeriodeType.JOURNEE_COMPLETE
    periode_fin: PeriodeType = PeriodeType.JOURNEE_COMPLETE
    equipement_ids: List[str] = []
    work_order_id: Optional[str] = None
    maintenance_preventive_id: Optional[str] = None
    commentaire: str = ""
    priorite: str = "NORMALE"
    attachments: List[Dict] = []
    destinataire_id: str  # Si non fourni, prendre le premier user avec rôle RSP_PROD

class DemandeArretMaintenanceUpdate(BaseModel):
    """Modèle pour mettre à jour une demande"""
    statut: Optional[DemandeArretStatus] = None
    commentaire_reponse: Optional[str] = None
    date_proposee: Optional[str] = None

# ==================== PLANNING EQUIPEMENT ====================

class PlanningEquipementEntry(BaseModel):
    """Entrée dans le planning équipement (après validation d'une demande)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    equipement_id: str
    date_debut: str
    date_fin: str
    periode_debut: PeriodeType
    periode_fin: PeriodeType
    statut: EquipmentStatus = EquipmentStatus.EN_MAINTENANCE
    demande_arret_id: str  # Référence à la demande d'arrêt
    work_order_id: Optional[str] = None
    maintenance_preventive_id: Optional[str] = None
    commentaire: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ==================== USER PREFERENCES ====================

class ThemeMode(str, Enum):
    LIGHT = "light"
    DARK = "dark"
    AUTO = "auto"

class SidebarPosition(str, Enum):
    LEFT = "left"
    RIGHT = "right"

class SidebarBehavior(str, Enum):
    ALWAYS_OPEN = "always_open"
    MINIMIZABLE = "minimizable"
    AUTO_COLLAPSE = "auto_collapse"

class DisplayDensity(str, Enum):
    COMPACT = "compact"
    NORMAL = "normal"
    SPACIOUS = "spacious"

class FontSize(str, Enum):
    SMALL = "small"
    NORMAL = "normal"
    LARGE = "large"

class DateFormat(str, Enum):
    DD_MM_YYYY = "DD/MM/YYYY"
    MM_DD_YYYY = "MM/DD/YYYY"
    YYYY_MM_DD = "YYYY-MM-DD"

class TimeFormat(str, Enum):
    H24 = "24h"
    H12 = "12h"

class Currency(str, Enum):
    EUR = "€"
    USD = "$"
    GBP = "£"

class MenuCategory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    icon: Optional[str] = None
    order: int = 0
    items: List[str] = []  # Liste des IDs de menu items

class MenuItem(BaseModel):
    id: str
    label: str
    path: str
    icon: str
    module: str
    order: int = 0
    visible: bool = True
    favorite: bool = False
    category_id: Optional[str] = None

class UserPreferences(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    
    # Apparence générale
    theme_mode: ThemeMode = ThemeMode.LIGHT
    primary_color: str = "#2563eb"  # Bleu par défaut
    secondary_color: str = "#64748b"  # Gris par défaut
    background_image_url: Optional[str] = None
    display_density: DisplayDensity = DisplayDensity.NORMAL
    font_size: FontSize = FontSize.NORMAL
    
    # Sidebar
    sidebar_bg_color: str = "#1f2937"  # Gris foncé par défaut
    sidebar_position: SidebarPosition = SidebarPosition.LEFT
    sidebar_behavior: SidebarBehavior = SidebarBehavior.MINIMIZABLE
    sidebar_width: int = 256  # pixels (16rem = 256px)
    sidebar_icon_color: str = "#ffffff"
    
    # Organisation du menu
    menu_categories: List[MenuCategory] = []
    menu_items: List[MenuItem] = []
    
    # Organisation du header
    header_icon_order: List[str] = []
    
    # Préférences d'affichage
    default_home_page: str = "/dashboard"
    date_format: DateFormat = DateFormat.DD_MM_YYYY
    time_format: TimeFormat = TimeFormat.H24
    currency: Currency = Currency.EUR
    language: str = "fr"
    
    # Dashboard personnalisé
    dashboard_widgets: List[str] = []  # IDs des widgets à afficher
    dashboard_layout: Dict = {}  # Configuration du layout
    
    # Notifications
    notifications_enabled: bool = True
    email_notifications: bool = True
    push_notifications: bool = True
    sound_enabled: bool = True
    stock_alert_threshold: int = 5
    
    # Page de personnalisation
    customization_view_mode: str = "tabs"  # "tabs" ou "scroll"
    
    # Thèmes prédéfinis
    preset_theme: Optional[str] = None  # "orange", "vert", "blanc", "bleu", "custom"
    
    # Préférences IA
    ai_assistant_name: str = "Adria"  # Nom de l'assistant IA
    ai_assistant_gender: str = "female"  # "male" ou "female"
    ai_llm_provider: str = "gemini"  # "gemini", "openai", "anthropic", "deepseek", "mistral"
    ai_llm_model: str = "gemini-2.5-flash"  # Modèle LLM par défaut
    # Preference onglet Dashboard Service
    service_dashboard_tab: Optional[str] = None
    
    # Visite guidée
    tour_completed: bool = False
    tour_completed_at: Optional[str] = None
    
    # Sécurité personnelle : délai de déconnexion automatique par inactivité (minutes)
    # None = utilise le réglage global de l'administrateur
    inactivity_timeout_minutes: Optional[int] = None
    
    # Métadonnées
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def coerce_datetime_to_str(cls, v):
        """Accepte datetime ou str — convertit datetime en ISO string."""
        if hasattr(v, 'isoformat'):
            return v.isoformat()
        return v

class UserPreferencesCreate(BaseModel):
    user_id: str
    theme_mode: Optional[ThemeMode] = ThemeMode.LIGHT
    primary_color: Optional[str] = "#2563eb"
    secondary_color: Optional[str] = "#64748b"
    background_image_url: Optional[str] = None
    display_density: Optional[DisplayDensity] = DisplayDensity.NORMAL
    font_size: Optional[FontSize] = FontSize.NORMAL
    sidebar_bg_color: Optional[str] = "#1f2937"
    sidebar_position: Optional[SidebarPosition] = SidebarPosition.LEFT
    sidebar_behavior: Optional[SidebarBehavior] = SidebarBehavior.MINIMIZABLE
    sidebar_width: Optional[int] = 256
    sidebar_icon_color: Optional[str] = "#ffffff"
    menu_categories: Optional[List[MenuCategory]] = []
    menu_items: Optional[List[MenuItem]] = []
    header_icon_order: Optional[List[str]] = []
    default_home_page: Optional[str] = "/dashboard"
    date_format: Optional[DateFormat] = DateFormat.DD_MM_YYYY
    time_format: Optional[TimeFormat] = TimeFormat.H24
    currency: Optional[Currency] = Currency.EUR
    language: Optional[str] = "fr"
    dashboard_widgets: Optional[List[str]] = []
    dashboard_layout: Optional[Dict] = {}
    notifications_enabled: Optional[bool] = True
    email_notifications: Optional[bool] = True
    push_notifications: Optional[bool] = True
    sound_enabled: Optional[bool] = True
    stock_alert_threshold: Optional[int] = 5
    customization_view_mode: Optional[str] = "tabs"
    preset_theme: Optional[str] = None

class UserPreferencesUpdate(BaseModel):
    theme_mode: Optional[ThemeMode] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    background_image_url: Optional[str] = None
    display_density: Optional[DisplayDensity] = None
    font_size: Optional[FontSize] = None
    sidebar_bg_color: Optional[str] = None
    sidebar_position: Optional[SidebarPosition] = None
    sidebar_behavior: Optional[SidebarBehavior] = None
    sidebar_width: Optional[int] = None
    sidebar_icon_color: Optional[str] = None
    menu_categories: Optional[List[MenuCategory]] = None
    menu_items: Optional[List[MenuItem]] = None
    header_icon_order: Optional[List[str]] = None
    default_home_page: Optional[str] = None
    date_format: Optional[DateFormat] = None
    time_format: Optional[TimeFormat] = None
    currency: Optional[Currency] = None
    language: Optional[str] = None
    dashboard_widgets: Optional[List[str]] = None
    dashboard_layout: Optional[Dict] = None
    notifications_enabled: Optional[bool] = None
    email_notifications: Optional[bool] = None
    push_notifications: Optional[bool] = None
    sound_enabled: Optional[bool] = None
    stock_alert_threshold: Optional[int] = None
    customization_view_mode: Optional[str] = None
    preset_theme: Optional[str] = None
    # Préférences IA
    ai_assistant_name: Optional[str] = None
    ai_assistant_gender: Optional[str] = None
    ai_llm_provider: Optional[str] = None
    ai_llm_model: Optional[str] = None
    # Preference onglet Dashboard Service
    service_dashboard_tab: Optional[str] = None
    # Visite guidée
    tour_completed: Optional[bool] = None
    tour_completed_at: Optional[str] = None
    # Sécurité personnelle : délai de déconnexion automatique par inactivité (minutes)
    # None = utilise le réglage global de l'administrateur
    inactivity_timeout_minutes: Optional[int] = None

# ==================== SUPPORT HELP REQUEST ====================

class HelpRequest(BaseModel):
    screenshot: str  # Base64 encoded image
    user_message: Optional[str] = None
    page_url: str
    browser_info: str
    console_logs: Optional[List[str]] = []
    
class HelpRequestResponse(BaseModel):
    success: bool
    message: str
    request_id: Optional[str] = None


# ==================== MANUEL UTILISATEUR ====================

class ManualSection(BaseModel):
    """Une section du manuel (peut contenir des sous-sections)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str  # Markdown format
    order: int
    parent_id: Optional[str] = None  # Pour les sous-sections
    target_roles: List[str] = []  # Rôles concernés (vide = tous)
    target_modules: List[str] = []  # Modules concernés (vide = général)
    level: str = "beginner"  # "beginner", "advanced", "both"
    images: List[str] = []  # URLs des images/captures
    video_url: Optional[str] = None
    keywords: List[str] = []  # Pour la recherche
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ManualChapter(BaseModel):
    """Un chapitre du manuel contenant plusieurs sections"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    icon: str = "BookOpen"
    order: int
    sections: List[str] = []  # IDs des sections
    target_roles: List[str] = []
    target_modules: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ManualVersion(BaseModel):
    """Version du manuel pour historique"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    version: str  # ex: "1.0", "1.1"
    release_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    changes: List[str] = []  # Liste des modifications
    author_id: str
    author_name: str
    is_current: bool = True

class ManualCreate(BaseModel):
    """Pour créer/mettre à jour le contenu du manuel"""
    chapters: List[ManualChapter]
    sections: List[ManualSection]
    version: str
    changes: List[str] = []

class ManualSearchRequest(BaseModel):
    """Requête de recherche dans le manuel"""
    query: str
    role_filter: Optional[str] = None
    module_filter: Optional[str] = None
    level_filter: Optional[str] = None

class ManualSearchResult(BaseModel):
    """Résultat de recherche"""
    section_id: str
    chapter_id: str
    title: str
    excerpt: str
    relevance_score: float

class ManualExportRequest(BaseModel):
    """Requête d'export PDF"""
    role_filter: Optional[str] = None
    module_filter: Optional[str] = None
    include_images: bool = True
    include_toc: bool = True


# =====================================
# CHAT LIVE MODELS
# =====================================

class ChatAttachment(BaseModel):
    """Fichier joint dans un message de chat"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    original_filename: str
    file_path: str
    file_size: int  # en bytes
    mime_type: str
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ChatReaction(BaseModel):
    """Réaction emoji sur un message"""
    user_id: str
    user_name: str
    emoji: str
    added_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ChatMessage(BaseModel):
    """Message de chat"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    user_role: str
    message: str
    recipient_ids: List[str] = []  # Vide = message de groupe, sinon privé
    recipient_names: List[str] = []  # Noms des destinataires (pour affichage)
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    is_deleted: bool = False
    deleted_at: Optional[str] = None
    reply_to_id: Optional[str] = None  # ID du message auquel on répond
    reply_to_preview: Optional[str] = None  # Aperçu du message cité
    reactions: List[ChatReaction] = []
    attachments: List[ChatAttachment] = []
    deletable_until: str = Field(default_factory=lambda: (datetime.now(timezone.utc).timestamp() + 10))  # Timestamp + 10s
    is_private: bool = False  # True si message privé

class ChatMessageCreate(BaseModel):
    """Créer un nouveau message"""
    message: str
    recipient_ids: List[str] = []
    reply_to_id: Optional[str] = None

class ChatMessageDelete(BaseModel):
    """Supprimer un message"""
    message_id: str

class UserChatActivity(BaseModel):
    """Activité utilisateur dans le chat"""
    user_id: str
    last_seen_timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    is_online: bool = False
    last_activity: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ChatReactionAdd(BaseModel):
    """Ajouter une réaction à un message"""
    emoji: str

class ChatFileTransfer(BaseModel):
    """Transférer un fichier vers un OT/Amélioration/Maintenance"""
    attachment_id: str
    target_type: str  # "work_order", "improvement", "preventive_maintenance"
    target_id: str

class ChatEmailTransfer(BaseModel):
    """Transférer un fichier par email"""
    attachment_id: str
    recipient_user_ids: List[str]
    message: Optional[str] = None



# =======================
# MQTT Models
# =======================

class MQTTConfig(BaseModel):
    """Configuration du broker MQTT"""
    host: str
    port: int = 1883
    username: Optional[str] = ""
    password: Optional[str] = ""
    use_ssl: bool = False
    client_id: str = "gmao_iris"



# === Role Management Models ===
class RoleBase(BaseModel):
    """Base model pour les rôles configurables"""
    code: str  # Code unique du rôle (ex: "ADMIN", "RSP_SERVICE")
    label: str  # Libellé affiché (ex: "Administrateur", "Responsable de service")
    description: Optional[str] = None
    color_bg: str = "bg-gray-100"  # Couleur de fond du badge
    color_text: str = "text-gray-700"  # Couleur du texte du badge
    is_system: bool = False  # True pour les rôles système non supprimables
    permissions: UserPermissions = Field(default_factory=UserPermissions)

class RoleCreate(RoleBase):
    pass

class RoleUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    color_bg: Optional[str] = None
    color_text: Optional[str] = None
    permissions: Optional[UserPermissions] = None

class Role(RoleBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None
    created_by: Optional[str] = None
    
    class Config:
        from_attributes = True

# === Service Responsable Models ===
class ServiceResponsable(BaseModel):
    """Association entre un service et son responsable"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    service: str  # Nom du service (PRODUCTION, LOGISTIQUE, etc.)
    user_id: str  # ID de l'utilisateur responsable
    user_name: Optional[str] = None  # Nom complet pour affichage
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: Optional[str] = None

class ServiceResponsableCreate(BaseModel):
    service: str
    user_id: str

class ServiceResponsableUpdate(BaseModel):
    user_id: str


# =======================
# Sensor (Capteur) Models
# =======================

class SensorType(str, Enum):
    TEMPERATURE = "TEMPERATURE"  # Température
    HUMIDITY = "HUMIDITY"  # Humidité
    PRESSURE = "PRESSURE"  # Pression
    AIR_QUALITY = "AIR_QUALITY"  # Qualité de l'air
    LIGHT = "LIGHT"  # Luminosité
    MOTION = "MOTION"  # Mouvement/Présence
    DOOR = "DOOR"  # Ouverture porte/fenêtre
    WATER_LEVEL = "WATER_LEVEL"  # Niveau d'eau
    VOLTAGE = "VOLTAGE"  # Tension électrique
    CURRENT = "CURRENT"  # Courant électrique
    POWER = "POWER"  # Puissance électrique
    ENERGY = "ENERGY"  # Énergie
    FLOW = "FLOW"  # Débit
    VIBRATION = "VIBRATION"  # Vibration
    NOISE = "NOISE"  # Niveau sonore
    CO2 = "CO2"  # CO2
    OTHER = "OTHER"  # Autre

class Sensor(BaseModel):
    id: str
    nom: str
    type: SensorType
    emplacement_id: Optional[str] = None
    emplacement: Optional[Dict] = None
    unite: str  # °C, %, bar, lux, ppm, etc.
    mqtt_topic: str  # Topic MQTT obligatoire
    format_json: bool = False  # Mettre en forme le contenu JSON
    formula: Optional[str] = None  # Formule à appliquer à la valeur (ex: x/100, (x-32)*5/9)
    current_value: Optional[float] = None  # Valeur actuelle
    last_update: Optional[datetime] = None  # Dernière mise à jour
    min_threshold: Optional[float] = None  # Seuil minimum pour alerte
    max_threshold: Optional[float] = None  # Seuil maximum pour alerte
    alert_enabled: bool = False  # Activer les alertes
    notes: Optional[str] = None
    actif: bool = True
    date_creation: datetime
    created_by: str

class SensorCreate(BaseModel):
    nom: str
    type: SensorType
    emplacement_id: Optional[str] = None
    unite: str
    mqtt_topic: str
    format_json: bool = False
    formula: Optional[str] = None  # Formule à appliquer à la valeur (ex: x/100, (x-32)*5/9)
    min_threshold: Optional[float] = None
    max_threshold: Optional[float] = None
    alert_enabled: bool = False
    notes: Optional[str] = None

class SensorUpdate(BaseModel):
    nom: Optional[str] = None
    type: Optional[SensorType] = None
    emplacement_id: Optional[str] = None
    unite: Optional[str] = None
    mqtt_topic: Optional[str] = None
    format_json: Optional[bool] = None
    formula: Optional[str] = None  # Formule à appliquer à la valeur (ex: x/100, (x-32)*5/9)
    min_threshold: Optional[float] = None
    max_threshold: Optional[float] = None
    alert_enabled: Optional[bool] = None
    notes: Optional[str] = None
    actif: Optional[bool] = None

class SensorReading(BaseModel):
    id: str
    sensor_id: str
    sensor_nom: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    timestamp: datetime


# =======================
# Alert & Notification Models
# =======================

class AlertType(str, Enum):
    SENSOR_THRESHOLD = "SENSOR_THRESHOLD"  # Seuil capteur dépassé
    METER_THRESHOLD = "METER_THRESHOLD"  # Seuil compteur dépassé
    SENSOR_OFFLINE = "SENSOR_OFFLINE"  # Capteur hors ligne
    METER_OFFLINE = "METER_OFFLINE"  # Compteur hors ligne

class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"

class AlertAction(str, Enum):
    CREATE_WORKORDER = "CREATE_WORKORDER"  # Créer un OT
    SEND_EMAIL = "SEND_EMAIL"  # Envoyer un email
    SEND_CHAT_MESSAGE = "SEND_CHAT_MESSAGE"  # Message dans Chat Live
    NOTIFICATION_ONLY = "NOTIFICATION_ONLY"  # Notification uniquement

class Alert(BaseModel):
    id: str
    type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    source_type: str  # 'sensor' ou 'meter'
    source_id: str
    source_name: str
    value: Optional[float] = None
    threshold: Optional[float] = None
    threshold_type: Optional[str] = None  # 'min' ou 'max'
    actions_executed: List[AlertAction] = []
    read: bool = False
    archived: bool = False
    created_at: datetime
    read_at: Optional[datetime] = None
    read_by: Optional[str] = None

class AlertCreate(BaseModel):
    type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    source_type: str
    source_id: str
    source_name: str
    value: Optional[float] = None
    threshold: Optional[float] = None
    threshold_type: Optional[str] = None

class AlertActionConfig(BaseModel):
    """Configuration des actions automatiques pour un capteur/compteur"""
    source_type: str  # 'sensor' ou 'meter'
    source_id: str
    enabled: bool = True
    actions: List[AlertAction] = []
    email_recipients: List[str] = []  # Pour SEND_EMAIL
    workorder_template: Optional[Dict] = None  # Pour CREATE_WORKORDER

    value: float
    unit: str
    date_creation: datetime

class SensorReadingCreate(BaseModel):
    value: float

    username: Optional[str] = None
    password: Optional[str] = None
    use_ssl: bool = False
    client_id: str = "gmao_iris"

class MQTTPublish(BaseModel):
    """Publier un message MQTT"""
    topic: str
    payload: str
    qos: int = Field(default=0, ge=0, le=2)
    retain: bool = False

class MQTTSubscribe(BaseModel):
    """S'abonner à un topic MQTT"""
    topic: str
    qos: int = Field(default=0, ge=0, le=2)

class MQTTMessage(BaseModel):
    """Message MQTT reçu"""
    topic: str
    payload: str
    qos: int

# ============================================================================
# PURCHASE REQUEST MODELS (Demandes d'Achat)
# ============================================================================

class PurchaseRequestType(str, Enum):
    """Type de demande d'achat"""
    PIECE_DETACHEE = "PIECE_DETACHEE"  # Pièce détachée
    EQUIPEMENT = "EQUIPEMENT"  # Équipement
    CONSOMMABLE = "CONSOMMABLE"  # Consommable
    SERVICE = "SERVICE"  # Service/Prestation
    OUTILLAGE = "OUTILLAGE"  # Outillage
    FOURNITURE = "FOURNITURE"  # Fourniture de bureau
    AUTRE = "AUTRE"  # Autre

class PurchaseRequestUrgency(str, Enum):
    """Niveau d'urgence"""
    NORMAL = "NORMAL"
    URGENT = "URGENT"
    TRES_URGENT = "TRES_URGENT"

class PurchaseRequestStatus(str, Enum):
    """Statut de la demande d'achat"""
    SOUMISE = "SOUMISE"  # Transmise au N+1
    VALIDEE_N1 = "VALIDEE_N1"  # Validée par N+1
    APPROUVEE_ACHAT = "APPROUVEE_ACHAT"  # Approuvée par service achat
    ACHAT_EFFECTUE = "ACHAT_EFFECTUE"  # Achat effectué
    RECEPTIONNEE = "RECEPTIONNEE"  # Réceptionnée
    DISTRIBUEE = "DISTRIBUEE"  # Distribuée au destinataire
    REFUSEE_N1 = "REFUSEE_N1"  # Refusée par N+1
    REFUSEE_ACHAT = "REFUSEE_ACHAT"  # Refusée par service achat

class PurchaseRequestHistoryEntry(BaseModel):
    """Entrée d'historique pour une demande d'achat"""
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    user_id: str
    user_name: str
    action: str  # Exemple: "Création", "Validation N+1", "Refus", etc.
    old_status: Optional[str] = None
    new_status: str
    comment: Optional[str] = None

class PurchaseRequestBase(BaseModel):
    """Modèle de base pour une demande d'achat"""
    type: PurchaseRequestType
    designation: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = None
    quantite: int = Field(..., gt=0)
    unite: str = Field(default="Unité")  # Unité, Kg, L, m, etc.
    reference: Optional[str] = None
    fournisseur_suggere: Optional[str] = None
    urgence: PurchaseRequestUrgency = PurchaseRequestUrgency.NORMAL
    justification: str = Field(..., min_length=10)
    destinataire_id: Optional[str] = None  # ID de l'utilisateur destinataire final (optionnel)
    destinataire_nom: str  # Nom du destinataire (texte libre ou depuis utilisateur)
    
    # Lien optionnel avec inventaire
    inventory_item_id: Optional[str] = None
    
    # Fichiers joints
    attached_files: List[str] = Field(default_factory=list)  # URLs des fichiers

class PurchaseRequestCreate(PurchaseRequestBase):
    """Modèle pour créer une demande d'achat"""
    pass

class PurchaseRequestUpdate(BaseModel):
    """Modèle pour mettre à jour une demande d'achat"""
    type: Optional[PurchaseRequestType] = None
    designation: Optional[str] = None
    description: Optional[str] = None
    quantite: Optional[int] = None
    unite: Optional[str] = None
    reference: Optional[str] = None
    fournisseur_suggere: Optional[str] = None
    urgence: Optional[PurchaseRequestUrgency] = None
    justification: Optional[str] = None
    destinataire_id: Optional[str] = None
    destinataire_nom: Optional[str] = None
    inventory_item_id: Optional[str] = None

class PurchaseRequestStatusUpdate(BaseModel):
    """Modèle pour changer le statut d'une demande"""
    status: PurchaseRequestStatus
    comment: Optional[str] = None

class PurchaseRequest(PurchaseRequestBase):
    """Modèle complet d'une demande d'achat"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero: str  # Numéro unique DA-YYYY-XXXXX
    demandeur_id: str
    demandeur_nom: str
    demandeur_email: str
    status: PurchaseRequestStatus = PurchaseRequestStatus.SOUMISE
    
    # Archivage
    archived: bool = False
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None
    archived_by_name: Optional[str] = None
    
    # Responsables
    responsable_n1_id: Optional[str] = None
    responsable_n1_nom: Optional[str] = None
    
    # Historique et traçabilité
    history: List[PurchaseRequestHistoryEntry] = Field(default_factory=list)
    
    # Dates
    date_creation: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    date_derniere_modification: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    date_validation_n1: Optional[str] = None
    date_approbation_achat: Optional[str] = None
    date_achat_effectue: Optional[str] = None
    date_reception: Optional[str] = None
    date_distribution: Optional[str] = None
    
    # Inventaire
    added_to_inventory: bool = False
    inventory_added_by: Optional[str] = None
    inventory_added_at: Optional[str] = None

    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============================================================================
# CHECKLIST MODELS (Checklists de Contrôles Préventifs)
# ============================================================================

class ChecklistItemType(str, Enum):
    """Type de réponse pour un item de checklist"""
    YES_NO = "YES_NO"  # Oui/Non (conforme/non conforme)
    NUMERIC = "NUMERIC"  # Valeur numérique avec seuils
    TEXT = "TEXT"  # Texte libre

class ChecklistItemBase(BaseModel):
    """Item de contrôle dans une checklist"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str = Field(..., min_length=1, max_length=500)  # Libellé du contrôle
    type: ChecklistItemType = ChecklistItemType.YES_NO
    order: int = 0  # Ordre d'affichage
    required: bool = True  # Obligatoire ou non
    
    # Pour les valeurs numériques
    unit: Optional[str] = None  # Unité (°C, bar, mm, etc.)
    min_value: Optional[float] = None  # Valeur min acceptable
    max_value: Optional[float] = None  # Valeur max acceptable
    expected_value: Optional[float] = None  # Valeur attendue
    
    # Instructions supplémentaires
    instructions: Optional[str] = None

class ChecklistTemplateBase(BaseModel):
    """Modèle de base pour un template de checklist"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    equipment_ids: List[str] = Field(default_factory=list)  # Équipements associés
    items: List[ChecklistItemBase] = Field(default_factory=list)
    is_template: bool = True  # Est un modèle réutilisable

class ChecklistTemplateCreate(ChecklistTemplateBase):
    """Création d'un template de checklist"""
    pass

class ChecklistTemplateUpdate(BaseModel):
    """Mise à jour d'un template de checklist"""
    name: Optional[str] = None
    description: Optional[str] = None
    equipment_ids: Optional[List[str]] = None
    items: Optional[List[ChecklistItemBase]] = None
    is_template: Optional[bool] = None

class ChecklistTemplate(ChecklistTemplateBase):
    """Template de checklist complet"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by_id: str
    created_by_name: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# === Exécution d'une checklist (lors d'un ordre de travail) ===

class ChecklistItemResponse(BaseModel):
    """Réponse à un item de checklist lors de l'exécution"""
    item_id: str
    item_label: str
    item_type: ChecklistItemType
    
    # Réponse selon le type
    value_yes_no: Optional[bool] = None  # Pour YES_NO
    value_numeric: Optional[float] = None  # Pour NUMERIC
    value_text: Optional[str] = None  # Pour TEXT
    
    # Conformité
    is_compliant: bool = True  # Conforme ou non
    
    # En cas de problème
    has_issue: bool = False
    issue_description: Optional[str] = None  # Commentaire sur le problème
    issue_photos: List[str] = Field(default_factory=list)  # URLs des photos
    
    # Métadonnées
    answered_at: Optional[str] = None
    answered_by_id: Optional[str] = None
    answered_by_name: Optional[str] = None

class ChecklistExecutionBase(BaseModel):
    """Exécution d'une checklist"""
    checklist_template_id: str
    checklist_name: str
    work_order_id: Optional[str] = None  # Ordre de travail associé
    preventive_maintenance_id: Optional[str] = None  # Maintenance préventive associée
    equipment_id: Optional[str] = None
    equipment_name: Optional[str] = None
    
    responses: List[ChecklistItemResponse] = Field(default_factory=list)
    
    # Résumé
    total_items: int = 0
    completed_items: int = 0
    compliant_items: int = 0
    non_compliant_items: int = 0
    
    # Commentaire général
    general_comment: Optional[str] = None
    general_photos: List[str] = Field(default_factory=list)

class ChecklistExecutionCreate(BaseModel):
    """Création d'une exécution de checklist"""
    checklist_template_id: str
    work_order_id: Optional[str] = None
    preventive_maintenance_id: Optional[str] = None
    equipment_id: Optional[str] = None

class ChecklistExecutionUpdate(BaseModel):
    """Mise à jour d'une exécution (ajout de réponses)"""
    responses: Optional[List[ChecklistItemResponse]] = None
    general_comment: Optional[str] = None
    general_photos: Optional[List[str]] = None
    status: Optional[str] = None  # "in_progress", "completed"

class ChecklistExecution(ChecklistExecutionBase):
    """Exécution de checklist complète"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "in_progress"  # "in_progress", "completed"
    
    executed_by_id: str
    executed_by_name: str
    
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None



# ==================== SYSTEM UPDATE HISTORY MODELS ====================

class UpdateStatus(str, Enum):
    """Statut d'une mise à jour"""
    SUCCESS = "success"
    FAILED = "failed"
    IN_PROGRESS = "in_progress"

class SystemUpdateHistory(BaseModel):
    """Historique des mises à jour du système"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Informations de version
    version_before: str
    version_after: str
    
    # Informations temporelles
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    
    # Statut et résultat
    status: UpdateStatus = UpdateStatus.IN_PROGRESS
    success: bool = False
    
    # Détails techniques
    files_modified: List[str] = []
    files_added: List[str] = []
    files_deleted: List[str] = []
    total_files_changed: int = 0
    
    # Logs et messages
    update_message: Optional[str] = None
    error_message: Optional[str] = None
    logs: List[str] = []
    
    # Informations sur le déclencheur
    triggered_by: str = "automatic"  # "automatic", "manual", "admin"
    triggered_by_user_id: Optional[str] = None
    triggered_by_user_name: Optional[str] = None
    
    # Backup
    backup_created: bool = False
    backup_path: Optional[str] = None
    
    # Métadonnées
    git_commit_hash: Optional[str] = None
    github_repo: Optional[str] = None
    
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# === Notification Models ===
class NotificationType(str, Enum):
    PM_UPCOMING = "pm_upcoming"  # Maintenance préventive à venir
    PM_OVERDUE = "pm_overdue"    # Maintenance préventive en retard
    WO_ASSIGNED = "wo_assigned"  # Ordre de travail assigné
    WO_STATUS = "wo_status"      # Changement de statut OT
    EQUIPMENT_STATUS = "equipment_status"  # Changement statut équipement
    SYSTEM = "system"            # Notification système

class NotificationPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

class NotificationBase(BaseModel):
    type: NotificationType
    title: str
    message: str
    priority: NotificationPriority = NotificationPriority.MEDIUM
    user_id: str  # Destinataire
    link: Optional[str] = None  # Lien vers la ressource concernée
    metadata: Optional[Dict[str, Any]] = None  # Données supplémentaires

class NotificationCreate(NotificationBase):
    pass

class Notification(NotificationBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    read_at: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== WEEKLY REPORT MODELS ====================

class ReportFrequency(str, Enum):
    """Fréquence d'envoi des rapports"""
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    ANNUAL = "annual"

class DayOfWeek(str, Enum):
    """Jour de la semaine pour l'envoi"""
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"

class ReportPeriod(str, Enum):
    """Période couverte par le rapport"""
    PREVIOUS_WEEK = "previous_week"
    CURRENT_WEEK = "current_week"
    PREVIOUS_MONTH = "previous_month"
    CURRENT_MONTH = "current_month"
    PREVIOUS_YEAR = "previous_year"
    LAST_7_DAYS = "last_7_days"
    LAST_30_DAYS = "last_30_days"
    LAST_365_DAYS = "last_365_days"

class ReportSendStatus(str, Enum):
    """Statut d'envoi d'un rapport"""
    SENT = "sent"
    FAILED = "failed"
    PARTIAL = "partial"
    GENERATED = "generated"

# --- Sous-modèles pour les sections ---
class WorkOrdersSectionConfig(BaseModel):
    """Configuration de la section Ordres de Travail"""
    enabled: bool = True
    include_created: bool = True
    include_completed: bool = True
    include_overdue: bool = True
    include_in_progress: bool = True
    include_completion_rate: bool = True

class EquipmentSectionConfig(BaseModel):
    """Configuration de la section Équipements"""
    enabled: bool = True
    include_broken: bool = True
    include_maintenance: bool = True
    include_availability: bool = True
    include_alerts: bool = True

class PendingRequestsSectionConfig(BaseModel):
    """Configuration de la section Demandes en attente"""
    enabled: bool = True
    include_improvements: bool = True
    include_purchases: bool = True
    include_interventions: bool = True

class TeamPerformanceSectionConfig(BaseModel):
    """Configuration de la section Performance équipe"""
    enabled: bool = True
    include_time_spent: bool = True
    include_by_technician: bool = True

class ReportSectionsConfig(BaseModel):
    """Configuration complète des sections du rapport"""
    work_orders: WorkOrdersSectionConfig = WorkOrdersSectionConfig()
    equipment: EquipmentSectionConfig = EquipmentSectionConfig()
    pending_requests: PendingRequestsSectionConfig = PendingRequestsSectionConfig()
    team_performance: TeamPerformanceSectionConfig = TeamPerformanceSectionConfig()

# --- Modèle principal du template ---
class ReportScheduleConfig(BaseModel):
    """Configuration de la planification du rapport"""
    frequency: ReportFrequency = ReportFrequency.WEEKLY
    day_of_week: Optional[DayOfWeek] = DayOfWeek.MONDAY  # Pour hebdomadaire
    day_of_month: Optional[int] = 1  # Pour mensuel (1-31)
    month_of_year: Optional[int] = 1  # Pour annuel (1-12)
    time: str = "07:00"  # HH:MM format
    timezone: str = "Europe/Paris"

class ReportRecipientsConfig(BaseModel):
    """Configuration des destinataires"""
    emails: List[str] = []
    include_service_managers: bool = False

class WeeklyReportTemplateCreate(BaseModel):
    """Création d'un modèle de rapport"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    service: str = Field(..., min_length=1)
    is_active: bool = True
    schedule: ReportScheduleConfig = ReportScheduleConfig()
    recipients: ReportRecipientsConfig = ReportRecipientsConfig()
    sections: ReportSectionsConfig = ReportSectionsConfig()
    period: ReportPeriod = ReportPeriod.PREVIOUS_WEEK

class WeeklyReportTemplateUpdate(BaseModel):
    """Mise à jour d'un modèle de rapport"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    service: Optional[str] = None
    is_active: Optional[bool] = None
    schedule: Optional[ReportScheduleConfig] = None
    recipients: Optional[ReportRecipientsConfig] = None
    sections: Optional[ReportSectionsConfig] = None
    period: Optional[ReportPeriod] = None

class WeeklyReportTemplate(BaseModel):
    """Modèle de rapport complet"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    service: str
    is_active: bool = True
    
    schedule: ReportScheduleConfig = ReportScheduleConfig()
    recipients: ReportRecipientsConfig = ReportRecipientsConfig()
    sections: ReportSectionsConfig = ReportSectionsConfig()
    period: ReportPeriod = ReportPeriod.PREVIOUS_WEEK
    
    # Métadonnées
    created_by: str
    created_by_name: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_sent_at: Optional[str] = None
    send_count: int = 0

    class Config:
        from_attributes = True

# --- Historique des envois ---
class WeeklyReportHistoryCreate(BaseModel):
    """Création d'une entrée d'historique"""
    template_id: str
    template_name: str
    period_start: str
    period_end: str
    recipients: List[str]
    status: ReportSendStatus = ReportSendStatus.SENT
    pdf_path: Optional[str] = None
    email_count: int = 0
    errors: List[str] = []

class WeeklyReportHistory(WeeklyReportHistoryCreate):
    """Entrée d'historique complète"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sent_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    sent_by: Optional[str] = None
    sent_by_name: Optional[str] = None

    class Config:
        from_attributes = True

# --- Paramètres globaux ---
class WeeklyReportSettingsUpdate(BaseModel):
    """Mise à jour des paramètres globaux"""
    enabled: Optional[bool] = None
    default_timezone: Optional[str] = None
    sender_email: Optional[str] = None
    sender_name: Optional[str] = None

class WeeklyReportSettings(BaseModel):
    """Paramètres globaux des rapports"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    enabled: bool = True
    default_timezone: str = "Europe/Paris"
    sender_email: Optional[str] = None
    sender_name: str = "FSAO Iris - Rapports"
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    class Config:
        from_attributes = True



# ==================== TEAM MANAGEMENT & TIME TRACKING MODELS ====================

class MemberType(str, Enum):
    """Type de membre d'équipe"""
    USER = "user"           # Utilisateur existant de l'app
    TEMPORARY = "temporary" # Intérimaire/temporaire (entrée manuelle)

class TimeEntryStatus(str, Enum):
    """Statut d'une entrée de pointage"""
    COMPLETE = "complete"   # Arrivée + Départ enregistrés
    PARTIAL = "partial"     # Seulement arrivée ou départ
    ABSENT = "absent"       # Absence déclarée

class TimeEntrySource(str, Enum):
    """Source du pointage"""
    MANUAL_BUTTON = "manual_button"     # Bouton arrivée/départ
    MANUAL_ENTRY = "manual_entry"       # Saisie manuelle des heures
    PRESENT_AT_POST = "present_at_post" # Bouton "Présent à poste"
    NFC_BADGE = "nfc_badge"             # Badge NFC (futur)

class AbsenceType(str, Enum):
    """Types d'absences"""
    CP = "CP"               # Congés payés
    RTT = "RTT"             # RTT
    MALADIE = "MALADIE"     # Maladie
    FORMATION = "FORMATION" # Formation
    RQP = "RQP"             # RQP
    TT = "TT"               # Télétravail

# --- Rythmes de travail ---
class WorkRhythmConfig(BaseModel):
    """Configuration d'un rythme de travail"""
    default_start: str = "08:00"
    default_end: str = "17:00"
    break_start: str = "12:00"
    break_end: str = "13:00"
    break_duration_minutes: int = 60
    weekly_hours: float = 35.0

class WorkRhythmCreate(BaseModel):
    """Création d'un rythme de travail"""
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    config: WorkRhythmConfig = WorkRhythmConfig()
    service: Optional[str] = None  # null = global

class WorkRhythm(WorkRhythmCreate):
    """Rythme de travail complet"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_system: bool = False  # true = non supprimable
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    class Config:
        from_attributes = True

# --- Membres d'équipe (temporaires/intérimaires) ---
class TeamMemberCreate(BaseModel):
    """Création d'un membre temporaire"""
    nom: str = Field(..., min_length=1, max_length=100)
    prenom: str = Field(..., min_length=1, max_length=100)
    service: str = Field(..., min_length=1)
    poste: Optional[str] = None
    mission_start: str  # Date ISO
    mission_end: str    # Date ISO
    work_rhythm: str = "journee"
    work_rhythm_config: Optional[WorkRhythmConfig] = None
    competences: List[str] = []
    badge_id: Optional[str] = None
    notes: Optional[str] = None

class TeamMemberUpdate(BaseModel):
    """Mise à jour d'un membre temporaire"""
    nom: Optional[str] = None
    prenom: Optional[str] = None
    poste: Optional[str] = None
    mission_start: Optional[str] = None
    mission_end: Optional[str] = None
    work_rhythm: Optional[str] = None
    work_rhythm_config: Optional[WorkRhythmConfig] = None
    competences: Optional[List[str]] = None
    badge_id: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class TeamMember(BaseModel):
    """Membre d'équipe complet"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: MemberType = MemberType.TEMPORARY
    user_id: Optional[str] = None  # null pour intérimaires
    nom: str
    prenom: str
    service: str
    poste: Optional[str] = None
    mission_start: Optional[str] = None
    mission_end: Optional[str] = None
    work_rhythm: str = "journee"
    work_rhythm_config: WorkRhythmConfig = WorkRhythmConfig()
    competences: List[str] = []
    badge_id: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    class Config:
        from_attributes = True

# --- Entrées de pointage ---
class TimeEntryCreate(BaseModel):
    """Création d'une entrée de pointage"""
    member_id: str
    member_type: MemberType = MemberType.USER
    date: str  # YYYY-MM-DD
    clock_in: Optional[str] = None   # HH:MM
    clock_out: Optional[str] = None  # HH:MM
    absence_type: Optional[AbsenceType] = None
    absence_reason: Optional[str] = None
    notes: Optional[str] = None

class TimeEntryManual(BaseModel):
    """Saisie manuelle d'un pointage"""
    member_id: str
    date: str  # YYYY-MM-DD
    clock_in: str  # HH:MM
    clock_out: str  # HH:MM
    reason: Optional[str] = "Saisie manuelle"
    notes: Optional[str] = None

class TimeEntry(BaseModel):
    """Entrée de pointage complète"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: str
    member_type: MemberType = MemberType.USER
    member_name: str
    service: str
    date: str  # YYYY-MM-DD
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    break_duration_minutes: int = 60
    worked_hours: float = 0.0
    theoretical_hours: float = 7.0
    overtime_hours: float = 0.0
    status: TimeEntryStatus = TimeEntryStatus.PARTIAL
    absence_type: Optional[AbsenceType] = None
    absence_reason: Optional[str] = None
    source: TimeEntrySource = TimeEntrySource.MANUAL_BUTTON
    badge_id: Optional[str] = None
    validated: bool = True  # Auto-validation par défaut
    validated_by: Optional[str] = None
    validated_at: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    class Config:
        from_attributes = True

# --- Absences ---
class AbsenceCreate(BaseModel):
    """Déclaration d'absence"""
    member_id: str
    member_type: MemberType = MemberType.USER
    absence_type: AbsenceType
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    reason: Optional[str] = None
    notes: Optional[str] = None

class Absence(AbsenceCreate):
    """Absence complète"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_name: str = ""
    service: str = ""
    days_count: int = 0
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    class Config:
        from_attributes = True

# --- Solde heures supplémentaires ---
class OvertimeBalance(BaseModel):
    """Solde d'heures supplémentaires"""
    member_id: str
    member_type: MemberType = MemberType.USER
    member_name: str
    year: int
    month: int
    total_overtime: float = 0.0
    recovered: float = 0.0
    balance: float = 0.0

    class Config:
        from_attributes = True




# ==================== GENERIC API RESPONSE MODELS ====================

class MessageResponse(BaseModel):
    """Réponse générique avec message"""
    message: str

class SuccessResponse(BaseModel):
    """Réponse générique avec succès et message"""
    success: bool
    message: str

class VersionResponse(BaseModel):
    """Réponse version de l'application"""
    version: str
    versionName: str
    releaseDate: str

class InviteMemberResponse(BaseModel):
    """Réponse après invitation d'un membre"""
    message: str
    email: str
    role: str

class ValidateInvitationResponse(BaseModel):
    """Réponse de validation d'invitation"""
    valid: bool
    email: str
    role: Optional[str] = None

class InventoryStatsResponse(BaseModel):
    """Statistiques inventaire"""
    rupture: int
    niveau_bas: int

class ToggleMonitoringResponse(BaseModel):
    """Réponse toggle surveillance stock"""
    message: str
    stock_monitoring_enabled: bool

class NotificationCountResponse(BaseModel):
    """Compteur de notifications non lues"""
    unread_count: int

class ResetPasswordAdminResponse(BaseModel):
    """Réponse réinitialisation mot de passe admin"""
    success: bool
    message: str
    tempPassword: str
    emailSent: bool

class ResetSectionResponse(BaseModel):
    """Réponse réinitialisation section"""
    success: bool
    section: str
    deleted_count: int

class ResetAllResponse(BaseModel):
    """Réponse réinitialisation complète"""
    success: bool
    total_deleted: int
    details: Dict[str, int]
