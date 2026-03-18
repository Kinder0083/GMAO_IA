# FSAO Iris - PRD (Product Requirements Document)

## Probleme Original
Application GMAO / FSAO avec module "Arbre des Causes" pour l'analyse d'accidents.

## Architecture
- **Frontend** : React + Shadcn UI
- **Backend** : FastAPI (Python)
- **Base de donnees** : MongoDB
- **IA** : Emergent LLM Key (OpenAI, Gemini, Claude)

## Taches Accomplies

### 18 Mars 2026 - Fix Lightbox photos bloquée (ne se ferme pas)
- [x] **ROOT CAUSE**: `createPortal(element, document.body)` rendait la lightbox hors de l'arbre Radix Dialog → les clics étaient interceptés
- [x] Fix: Supprimé `createPortal`, rendu en `fixed` dans l'arbre composant + `onPointerDown` + `stopPropagation`
- [x] Corrigé dans 3 fichiers: AttachmentGallery.jsx, WorkOrderFormDialog.jsx, InterventionRequestFormDialog.jsx
- [x] Test validé: ouverture lightbox + fermeture via bouton X fonctionnelle

### 18 Mars 2026 - Fix Validation OT (Erreur lors de la validation)
- [x] **ROOT CAUSE**: Les endpoints `/comments` et `/add-time` utilisaient `ObjectId(wo_id)` qui crashait sur les UUID
- [x] Créé helper `find_work_order_flexible()` (cherche par `id` UUID puis fallback `_id` ObjectId)
- [x] Corrigé 6 endpoints OT: add-comment, add-time, delete, upload-attachment, add-parts, get-comments
- [x] Test validé: commentaire + temps enregistrés avec succès via le frontend
- [x] **ROOT CAUSE**: `<SelectItem value="">` dans AssigneeSelector crashait React quand un utilisateur en base avait un `id` vide
- [x] Fix frontend: filtre `.filter(item => item.id)` avant rendu des SelectItem
- [x] Fix backend: skip les utilisateurs sans `id` dans `/api/assignment-targets`
- [x] Fix perte assignation service lors de l'édition d'un OT (chargement assigne_type/assigne_service)
- [x] Fix affichage service dans la liste des OT (badge bleu)
- [x] Fix conversion DI→OT transmet maintenant assigne_type et assigne_service
- [x] Fix BonDeTravailForm: fallback défensif pour tableaux undefined
- [x] Nettoyage doublons OT en base de données
- [x] Index uniques sur champ `id` pour 25 collections (protection anti-doublons permanente)
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
