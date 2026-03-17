# FSAO Iris - PRD (Product Requirements Document)

## Probleme Original
Application GMAO / FSAO avec module "Arbre des Causes" pour l'analyse d'accidents.

## Architecture
- **Frontend** : React + Shadcn UI
- **Backend** : FastAPI (Python)
- **Base de donnees** : MongoDB
- **IA** : Emergent LLM Key (OpenAI, Gemini, Claude)

## Taches Accomplies

### 17 Mars 2026 - Fix P0 Ecran Blanc (Assignation Services)
- [x] Fix perte assignation service lors de l'édition d'un OT (WorkOrderFormDialog, PreventiveMaintenanceFormDialog, ImprovementFormDialog chargent assigne_type/assigne_service)
- [x] Fix affichage service dans la liste des OT (badge bleu avec nom du service)
- [x] Fix conversion DI→OT transmet maintenant assigne_type et assigne_service au backend
- [x] Fix ConvertToImprovementDialog: ajout états assigneeType/assigneeService manquants
- [x] Fix BonDeTravailForm: fallback défensif pour éviter crash sur tableaux undefined
- [x] Nettoyage doublons OT en base de données
- [x] Tests automatisés: 100% backend + frontend

### 17 Mars 2026 - Assignation aux Services
- [x] Nouveau composant AssigneeSelector réutilisable (services en haut, utilisateurs alphabétiques)
- [x] Endpoint GET /api/assignment-targets (pôles + utilisateurs triés)
- [x] Notification service: tous les membres du service notifiés lors d'une assignation
- [x] Harmonisation orthographe "Assigner à" dans toute l'application
- [x] Intégration dans 4 formulaires: WorkOrderFormDialog, PreventiveMaintenanceFormDialog, ImprovementFormDialog, ConvertToWorkOrderDialog
- [x] Nouveaux champs modèle: assigne_type, assigne_service

### 17 Mars 2026 - Bug Permissions UUID
- [x] Fix helper find_user_flexible pour gérer ObjectId ET UUID
- [x] 8 endpoints utilisateur corrigés

### 17 Mars 2026 - Système MAJ externalisé
- [x] MAJ_FSAO.sh créé (fusion update_manual.sh + MAJ_SSH.sh)
- [x] update_service.py: apply_update lance le script externe

### 16 Mars 2026 - Refactoring Import
- [x] process_import_item décomposé en 8 fonctions spécialisées

### 15 Mars 2026
- [x] Fix P0 race condition user_preferences
- [x] Actions correctives semi-automatiques (checklists + maintenance préventive)
- [x] Fix filtres OT (created_at -> dateCreation)

## Taches En Attente
- [ ] **(P2)** Tester MAJ_FSAO.sh sur serveur Proxmox
- [ ] **(P3)** Dédupliquer services MAINTENANCE/Maintenance dans service_responsables

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
- GitHub: Kinder0083/GMAO
