"""
Configuration OpenAPI/Swagger enrichie pour FSAO Iris
"""

# Description principale de l'API
API_DESCRIPTION = """
# FSAO Iris - API de Fonctionnement des Services Assistée par Ordinateur

Système complet de gestion de maintenance industrielle avec module **M.E.S.** (Manufacturing Execution System).

## Modules principaux

| Module | Description |
|--------|-------------|
| **Authentification** | Connexion, inscription, gestion des tokens JWT |
| **Ordres de Travail** | CRUD, pièces jointes, suivi du temps |
| **Équipements** | Hiérarchie d'actifs, statuts, historique |
| **Maintenance Préventive** | Planification, fréquences, exécution automatique |
| **M.E.S.** | Suivi de production en temps réel, TRS, rebuts, alertes |
| **Inventaire** | Gestion des pièces de rechange, seuils d'alerte |
| **MQTT** | Communication temps réel avec les capteurs |
| **Rapports** | Génération PDF/Excel, planification d'envoi automatique |

## Authentification

Toutes les routes protégées nécessitent un token JWT dans le header :

```
Authorization: Bearer <token>
```

Le token est obtenu via `POST /api/auth/login`.

## Rôles

- **ADMIN** : Accès complet à toutes les fonctionnalités
- **RESPONSABLE_SERVICE** : Gestion de son service
- **TECHNICIEN** : Opérations de maintenance
- **OPERATEUR** : Consultation et saisie basique
"""

# Tags ordonnés avec descriptions
OPENAPI_TAGS = [
    {
        "name": "Authentification",
        "description": "Connexion, inscription, gestion du profil, tokens JWT et invitations"
    },
    {
        "name": "Utilisateurs",
        "description": "Gestion des utilisateurs, permissions, mots de passe et rôles"
    },
    {
        "name": "Ordres de Travail",
        "description": "Création, suivi et clôture des ordres de travail (correctifs et préventifs)"
    },
    {
        "name": "Équipements",
        "description": "Gestion hiérarchique des actifs industriels, statuts et historique"
    },
    {
        "name": "Maintenance Préventive",
        "description": "Planification des maintenances, fréquences, pièces jointes et exécution automatique"
    },
    {
        "name": "Checklists",
        "description": "Modèles de checklists et historique d'exécution"
    },
    {
        "name": "MES",
        "description": "Manufacturing Execution System - Suivi de production, TRS (Disponibilité x Performance x Qualité), machines, rebuts, alertes, références produit et rapports"
    },
    {
        "name": "Inventaire",
        "description": "Gestion des pièces de rechange, quantités, seuils de réapprovisionnement et surveillance des stocks"
    },
    {
        "name": "Emplacements",
        "description": "Gestion des localisations physiques des équipements et stocks"
    },
    {
        "name": "mqtt",
        "description": "Configuration et gestion des connexions MQTT pour la communication temps réel avec les capteurs"
    },
    {
        "name": "mqtt-logs",
        "description": "Consultation et gestion des logs de messages MQTT reçus"
    },
    {
        "name": "sensors",
        "description": "Configuration des capteurs IoT, lectures et historique des données"
    },
    {
        "name": "alerts",
        "description": "Système d'alertes configurables pour équipements et capteurs"
    },
    {
        "name": "cameras",
        "description": "Gestion des caméras de surveillance industrielle"
    },
    {
        "name": "frigate",
        "description": "Intégration Frigate NVR pour la détection d'objets et la surveillance vidéo"
    },
    {
        "name": "Fournisseurs",
        "description": "Gestion des fournisseurs et contacts"
    },
    {
        "name": "Compteurs",
        "description": "Suivi des compteurs d'équipements (heures de fonctionnement, cycles, etc.)"
    },
    {
        "name": "purchase-requests",
        "description": "Demandes d'achat de pièces et matériaux avec workflow de validation"
    },
    {
        "name": "Historique Achats",
        "description": "Historique des achats et consommation des pièces"
    },
    {
        "name": "demandes-arret",
        "description": "Gestion des demandes d'arrêt de production (planification, suivi, approbation)"
    },
    {
        "name": "demandes-arret-attachments",
        "description": "Pièces jointes associées aux demandes d'arrêt"
    },
    {
        "name": "demandes-arret-reports",
        "description": "Rapports et statistiques des demandes d'arrêt"
    },
    {
        "name": "documentations",
        "description": "Gestion documentaire : pôles de service, documents techniques, bons de travail et formulaires personnalisés"
    },
    {
        "name": "surveillance",
        "description": "Plan de surveillance : items de contrôle, inspections et suivi des non-conformités"
    },
    {
        "name": "Surveillance History",
        "description": "Historique et statistiques du plan de surveillance"
    },
    {
        "name": "presqu-accident",
        "description": "Déclaration et suivi des presqu'accidents et incidents de sécurité"
    },
    {
        "name": "autorisations",
        "description": "Autorisations particulières de travaux (permis de feu, ATEX, etc.)"
    },
    {
        "name": "Demandes Intervention",
        "description": "Demandes d'intervention technique soumises par les opérateurs"
    },
    {
        "name": "Demandes Amélioration",
        "description": "Propositions d'amélioration continue"
    },
    {
        "name": "Améliorations",
        "description": "Suivi des projets d'amélioration en cours"
    },
    {
        "name": "chat",
        "description": "Messagerie instantanée en temps réel entre les membres de l'équipe"
    },
    {
        "name": "Consignes",
        "description": "Consignes de service transmises entre les équipes"
    },
    {
        "name": "Notifications",
        "description": "Système de notifications en temps réel"
    },
    {
        "name": "Roles",
        "description": "Gestion des rôles personnalisés et des responsables de service"
    },
    {
        "name": "Team Management",
        "description": "Gestion des équipes, compétences et affectations"
    },
    {
        "name": "Time Tracking",
        "description": "Pointage des heures, absences et suivi du temps de travail"
    },
    {
        "name": "Weekly Reports",
        "description": "Rapports hebdomadaires automatisés avec modèles personnalisables"
    },
    {
        "name": "Analytics Checklists",
        "description": "Tableaux de bord et analyses des checklists exécutées"
    },
    {
        "name": "work-order-templates",
        "description": "Ordres type : modèles réutilisables pour la création rapide d'ordres de travail"
    },
    {
        "name": "Custom Widgets",
        "description": "Widgets personnalisables pour le tableau de bord"
    },
    {
        "name": "Whiteboard",
        "description": "Tableau blanc collaboratif pour les réunions d'équipe"
    },
    {
        "name": "Whiteboard Objects",
        "description": "API granulaire pour les objets du tableau blanc"
    },
    {
        "name": "User Preferences",
        "description": "Préférences utilisateur (thème, langue, notifications, disposition du dashboard)"
    },
    {
        "name": "Timezone",
        "description": "Configuration des fuseaux horaires"
    },
    {
        "name": "Import/Export",
        "description": "Import et export de données en masse (Excel)"
    },
    {
        "name": "ai",
        "description": "Assistant IA intégré pour l'aide à la maintenance et l'analyse"
    },
    {
        "name": "manual",
        "description": "Gestion des manuels techniques et documentation constructeur"
    },
    {
        "name": "SSH Terminal",
        "description": "Terminal SSH distant pour l'accès aux équipements connectés"
    },
    {
        "name": "tailscale",
        "description": "Intégration Tailscale VPN pour l'accès réseau sécurisé"
    },
    {
        "name": "Paramètres",
        "description": "Configuration globale du système et paramètres SMTP"
    },
    {
        "name": "Support",
        "description": "Soumission de demandes de support technique"
    },
    {
        "name": "Audit",
        "description": "Journal d'audit des actions utilisateurs"
    },
    {
        "name": "Administration",
        "description": "Outils d'administration : réinitialisation des données et gestion avancée"
    },
    {
        "name": "Service Manager",
        "description": "Tableau de bord responsable de service : statut, équipe et statistiques"
    },
    {
        "name": "Système",
        "description": "Informations système et version de l'application"
    },
]

# Exemples de réponses d'erreur réutilisables
ERROR_401 = {
    401: {
        "description": "Non authentifié - Token JWT manquant ou invalide",
        "content": {
            "application/json": {
                "example": {"detail": "Token invalide ou expiré"}
            }
        }
    }
}

ERROR_403 = {
    403: {
        "description": "Accès refusé - Permissions insuffisantes",
        "content": {
            "application/json": {
                "example": {"detail": "Accès refusé. Permissions insuffisantes."}
            }
        }
    }
}

ERROR_404 = {
    404: {
        "description": "Ressource non trouvée",
        "content": {
            "application/json": {
                "example": {"detail": "Élément non trouvé"}
            }
        }
    }
}

ERROR_422 = {
    422: {
        "description": "Erreur de validation des données",
        "content": {
            "application/json": {
                "example": {"detail": [{"loc": ["body", "field"], "msg": "field required", "type": "value_error.missing"}]}
            }
        }
    }
}

ERROR_500 = {
    500: {
        "description": "Erreur interne du serveur",
        "content": {
            "application/json": {
                "example": {"detail": "Erreur serveur interne"}
            }
        }
    }
}

# Combinaisons courantes
STANDARD_ERRORS = {**ERROR_401, **ERROR_403, **ERROR_500}
CRUD_ERRORS = {**ERROR_401, **ERROR_403, **ERROR_404, **ERROR_422, **ERROR_500}
AUTH_ERRORS = {**ERROR_401, **ERROR_422, **ERROR_500}
