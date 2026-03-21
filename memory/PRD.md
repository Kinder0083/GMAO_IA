# FSAO Iris - GMAO (Gestion de la Maintenance Assistée par Ordinateur)

## Problème original
Application CMMS/GMAO complète pour la gestion de la maintenance industrielle, développée avec React/FastAPI/MongoDB.

## Personas utilisateurs
- **Administrateurs** : Gestion complète (équipements, utilisateurs, rapports, configuration)
- **Techniciens** : Exécution des ordres de travail, suivi des interventions
- **Managers** : Supervision, rapports, analyses

## Architecture technique
- **Frontend** : React, Tailwind CSS, Shadcn UI
- **Backend** : FastAPI (Python) - Architecture modulaire avec 22+ fichiers de routes core + 51 modules externes
- **Base de données** : MongoDB (Motor async) - 106 collections, ~38 Mo
- **Temps réel** : WebSockets (realtime_manager)
- **Intégrations** : OpenAI/Emergent LLM Key, Web Push PWA (VAPID)

## Structure du code
```
/app/backend/
├── server.py (~1740 lignes - point d'entrée principal)
├── models.py (modèles Pydantic)
├── routes/
│   ├── shared.py (utilitaires partagés: db, audit_service, serialize_doc, get_equipment_by_id)
│   ├── auth.py, work_orders.py, equipments.py, intervention_requests.py
│   ├── reports.py, notifications.py, users.py, settings.py
│   ├── vendors.py, improvements.py, inventory.py, preventive_maintenance.py
│   ├── locations.py, meters.py, audit.py, availability.py
│   ├── support.py, service_manager.py, notification_health.py
│   ├── update_routes.py, update_management.py, admin.py
│   └── (22 modules core total)
└── [~51 fichiers de modules externes]
```

## Tâches complétées
- [x] Edition/Suppression des entrées de temps dans les OT (Admin only) + audit
- [x] Edition/Suppression des commentaires dans les OT (Admin only) + audit
- [x] Filtres de période fonctionnels sur page Rapports & Analytiques
- [x] Refactoring massif de server.py : de ~13000 à ~1740 lignes (22+ modules core)
- [x] Section Architecture Backend & Services dans la page Santé Système
- [x] **Correction dropdown Equipement dans OT et DI** :
  - Dropdown principal affiche uniquement les équipements parents (via `?parents_only=true`)
  - Second dropdown "Sous-equipement" apparaît quand un parent avec enfants est sélectionné
  - `get_equipment_by_id` enrichi pour retourner `parent_id`
  - Comportement identique entre OT et DI
  - 8 parents avec enfants, 128 parents nommés au total

## Backlog
- **(P3)** Tester le script de mise à jour `MAJ_FSAO.sh`
- En attente des consignes utilisateur pour les prochaines tâches

## Credentials de test
- Admin: buenogy@gmail.com / TestAdmin2026!
