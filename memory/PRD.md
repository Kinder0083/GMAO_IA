# FSAO Iris - GMAO (Gestion de la Maintenance Assistée par Ordinateur)

## Problème original
Application CMMS/GMAO complète pour la gestion de la maintenance industrielle, développée avec React/FastAPI/MongoDB.

## Personas utilisateurs
- **Administrateurs** : Gestion complète (équipements, utilisateurs, rapports, configuration)
- **Techniciens** : Exécution des ordres de travail, suivi des interventions
- **Managers** : Supervision, rapports, analyses

## Architecture technique
- **Frontend** : React, Tailwind CSS, Shadcn UI
- **Backend** : FastAPI (Python) - Architecture modulaire avec 22+ fichiers de routes
- **Base de données** : MongoDB (Motor async)
- **Temps réel** : WebSockets (realtime_manager)
- **Intégrations** : OpenAI/Emergent LLM Key, Web Push PWA (VAPID)

## Structure du code
```
/app/backend/
├── server.py (~1740 lignes - point d'entrée principal)
├── models.py (modèles Pydantic)
├── routes/
│   ├── __init__.py
│   ├── shared.py (utilitaires partagés: db, audit_service, serialize_doc)
│   ├── auth.py (authentification)
│   ├── work_orders.py (ordres de travail)
│   ├── equipments.py (équipements)
│   ├── intervention_requests.py (demandes d'intervention)
│   ├── reports.py (rapports & analytiques)
│   ├── notifications.py (notifications)
│   ├── users.py (gestion utilisateurs)
│   ├── settings.py (paramètres)
│   ├── vendors.py (fournisseurs)
│   ├── improvements.py (suggestions d'amélioration)
│   ├── inventory.py (inventaire)
│   ├── preventive_maintenance.py (maintenance préventive)
│   ├── locations.py (emplacements)
│   ├── meters.py (compteurs)
│   ├── audit.py (journal d'audit)
│   ├── availability.py (disponibilité)
│   ├── support.py (support)
│   ├── service_manager.py (gestionnaire de service)
│   ├── notification_health.py (santé notifications + corbeille)
│   ├── update_routes.py (mises à jour)
│   ├── update_management.py (gestion des mises à jour)
│   └── admin.py (administration)
└── [~60 fichiers de modules externes: surveillance, AI, MQTT, etc.]
```

## Fonctionnalités implémentées
- Gestion des équipements (CRUD, arborescence, pièces jointes)
- Ordres de travail (création, suivi, temps, commentaires, édition/suppression admin)
- Demandes d'intervention
- Maintenance préventive (calendrier, checklists)
- Inventaire et pièces de rechange
- Gestion des emplacements
- Compteurs et relevés
- Journal d'audit complet
- Rapports & Analytiques (filtres période: semaine/mois/trimestre/année)
- Gestion des utilisateurs et rôles
- Notifications push (Web Push)
- Chat en direct
- Tableaux blancs collaboratifs
- Consignes et LOTO
- Import/Export de données
- Sauvegarde et restauration
- Surveillance et caméras (Frigate)
- MQTT (IoT)
- IA (maintenance, chat, analyses, widgets)
- Gestion des contrats
- Formation

## Tâches complétées (session actuelle - 2026-03-20)
- [x] Edition/Suppression des entrées de temps dans les OT (Admin only) + audit
- [x] Edition/Suppression des commentaires dans les OT (Admin only) + audit
- [x] Filtres de période fonctionnels sur page Rapports & Analytiques
- [x] **Refactoring massif de server.py** : de ~13000 lignes à ~1740 lignes avec 22+ fichiers de routes modulaires
- [x] Tests de régression complets passés (23/23)

## Backlog
- **(P3)** Tester le script de mise à jour `MAJ_FSAO.sh`
- En attente des consignes utilisateur pour les prochaines tâches
