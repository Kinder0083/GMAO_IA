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

# Tags ordonnes avec descriptions
OPENAPI_TAGS = [
    {
        "name": "Authentification",
        "description": "Connexion, inscription, gestion du profil, tokens JWT et invitations"
    },
    {
        "name": "Utilisateurs",
        "description": "Gestion des utilisateurs, permissions, mots de passe et roles"
    },
    {
        "name": "Ordres de Travail",
        "description": "Creation, suivi et cloture des ordres de travail (correctifs et preventifs)"
    },
    {
        "name": "Equipements",
        "description": "Gestion hierarchique des actifs industriels, statuts et historique"
    },
    {
        "name": "Maintenance Preventive",
        "description": "Planification des maintenances, frequences, pieces jointes et execution automatique"
    },
    {
        "name": "Checklists",
        "description": "Modeles de checklists et historique d'execution"
    },
    {
        "name": "MES",
        "description": "Manufacturing Execution System - Suivi de production, TRS (Disponibilite x Performance x Qualite), machines, rebuts, alertes, references produit et rapports"
    },
    {
        "name": "Inventaire",
        "description": "Gestion des pieces de rechange, quantites, seuils de reapprovisionnement et surveillance des stocks"
    },
    {
        "name": "Emplacements",
        "description": "Gestion des localisations physiques des equipements et stocks"
    },
    {
        "name": "mqtt",
        "description": "Configuration et gestion des connexions MQTT pour la communication temps reel avec les capteurs"
    },
    {
        "name": "mqtt-logs",
        "description": "Consultation et gestion des logs de messages MQTT recus"
    },
    {
        "name": "sensors",
        "description": "Configuration des capteurs IoT, lectures et historique des donnees"
    },
    {
        "name": "alerts",
        "description": "Systeme d'alertes configurables pour equipements et capteurs"
    },
    {
        "name": "cameras",
        "description": "Gestion des cameras de surveillance industrielle"
    },
    {
        "name": "frigate",
        "description": "Integration Frigate NVR pour la detection d'objets et la surveillance video"
    },
    {
        "name": "Fournisseurs",
        "description": "Gestion des fournisseurs et contacts"
    },
    {
        "name": "Compteurs",
        "description": "Suivi des compteurs d'equipements (heures de fonctionnement, cycles, etc.)"
    },
    {
        "name": "purchase-requests",
        "description": "Demandes d'achat de pieces et materiaux avec workflow de validation"
    },
    {
        "name": "Historique Achats",
        "description": "Historique des achats et consommation des pieces"
    },
    {
        "name": "demandes-arret",
        "description": "Gestion des demandes d'arret de production (planification, suivi, approbation)"
    },
    {
        "name": "demandes-arret-attachments",
        "description": "Pieces jointes associees aux demandes d'arret"
    },
    {
        "name": "demandes-arret-reports",
        "description": "Rapports et statistiques des demandes d'arret"
    },
    {
        "name": "documentations",
        "description": "Gestion documentaire : poles de service, documents techniques, bons de travail et formulaires personnalises"
    },
    {
        "name": "surveillance",
        "description": "Plan de surveillance : items de controle, inspections et suivi des non-conformites"
    },
    {
        "name": "Surveillance History",
        "description": "Historique et statistiques du plan de surveillance"
    },
    {
        "name": "presqu-accident",
        "description": "Declaration et suivi des presqu'accidents et incidents de securite"
    },
    {
        "name": "autorisations",
        "description": "Autorisations particulieres de travaux (permis de feu, ATEX, etc.)"
    },
    {
        "name": "Demandes Intervention",
        "description": "Demandes d'intervention technique soumises par les operateurs"
    },
    {
        "name": "Demandes Amelioration",
        "description": "Propositions d'amelioration continue"
    },
    {
        "name": "Ameliorations",
        "description": "Suivi des projets d'amelioration en cours"
    },
    {
        "name": "chat",
        "description": "Messagerie instantanee en temps reel entre les membres de l'equipe"
    },
    {
        "name": "Consignes",
        "description": "Consignes de service transmises entre les equipes"
    },
    {
        "name": "Notifications",
        "description": "Systeme de notifications en temps reel"
    },
    {
        "name": "Roles",
        "description": "Gestion des roles personnalises et des responsables de service"
    },
    {
        "name": "Team Management",
        "description": "Gestion des equipes, competences et affectations"
    },
    {
        "name": "Time Tracking",
        "description": "Pointage des heures, absences et suivi du temps de travail"
    },
    {
        "name": "Weekly Reports",
        "description": "Rapports hebdomadaires automatises avec modeles personnalisables"
    },
    {
        "name": "Analytics Checklists",
        "description": "Tableaux de bord et analyses des checklists executees"
    },
    {
        "name": "work-order-templates",
        "description": "Ordres type : modeles reutilisables pour la creation rapide d'ordres de travail"
    },
    {
        "name": "Custom Widgets",
        "description": "Widgets personnalisables pour le tableau de bord"
    },
    {
        "name": "Whiteboard",
        "description": "Tableau blanc collaboratif pour les reunions d'equipe"
    },
    {
        "name": "Whiteboard Objects",
        "description": "API granulaire pour les objets du tableau blanc"
    },
    {
        "name": "User Preferences",
        "description": "Preferences utilisateur (theme, langue, notifications, disposition du dashboard)"
    },
    {
        "name": "Timezone",
        "description": "Configuration des fuseaux horaires"
    },
    {
        "name": "Import/Export",
        "description": "Import et export de donnees en masse (Excel)"
    },
    {
        "name": "ai",
        "description": "Assistant IA integre pour l'aide a la maintenance et l'analyse"
    },
    {
        "name": "manual",
        "description": "Gestion des manuels techniques et documentation constructeur"
    },
    {
        "name": "SSH Terminal",
        "description": "Terminal SSH distant pour l'acces aux equipements connectes"
    },
    {
        "name": "tailscale",
        "description": "Integration Tailscale VPN pour l'acces reseau securise"
    },
    {
        "name": "Parametres",
        "description": "Configuration globale du systeme et parametres SMTP"
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
        "description": "Outils d'administration : reinitialisation des donnees et gestion avancee"
    },
    {
        "name": "Service Manager",
        "description": "Tableau de bord responsable de service : statut, equipe et statistiques"
    },
    {
        "name": "Systeme",
        "description": "Informations systeme et version de l'application"
    },
]

# Exemples de reponses d'erreur reutilisables
ERROR_401 = {
    401: {
        "description": "Non authentifie - Token JWT manquant ou invalide",
        "content": {
            "application/json": {
                "example": {"detail": "Token invalide ou expire"}
            }
        }
    }
}

ERROR_403 = {
    403: {
        "description": "Acces refuse - Permissions insuffisantes",
        "content": {
            "application/json": {
                "example": {"detail": "Acces refuse. Permissions insuffisantes."}
            }
        }
    }
}

ERROR_404 = {
    404: {
        "description": "Ressource non trouvee",
        "content": {
            "application/json": {
                "example": {"detail": "Element non trouve"}
            }
        }
    }
}

ERROR_422 = {
    422: {
        "description": "Erreur de validation des donnees",
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
