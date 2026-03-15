# FSAO Iris - GMAO

## Problem Statement
Application GMAO (Gestion de Maintenance Assistee par Ordinateur) pour la gestion de maintenance industrielle.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide icons
- **Backend**: FastAPI, Python 3.11
- **Database**: MongoDB (motor async)
- **Auth**: JWT tokens

## Session 16 Mars 2026

### Bug Fix P0 - Donnees invisibles apres restauration de backup
- **Probleme** : Apres restauration d'un backup depuis une autre installation, les DI etaient comptees dans le Dashboard mais invisibles dans le menu DI.
- **Causes racines** (3) :
  1. `process_import_item()` supprimait le champ `id` des documents
  2. Les champs obligatoires (description, titre, created_by, priorite) etaient filtres comme NaN pendant l'import, rendant les documents invalides pour Pydantic
  3. Les enums en minuscule (ex: "haute" au lieu de "HAUTE") causaient des erreurs de validation
  4. L'endpoint de listing crashait completement si UN SEUL document etait invalide (pas de try/catch par document)
- **Corrections** :
  1. `process_import_item()` : preserve `id` comme string
  2. `clean_item_for_export()` : preserve le UUID original
  3. Endpoints GET intervention-requests et work-orders : resilients avec auto-completion des champs manquants + try/catch par document
  4. `serialize_doc()` : preserve le `id` existant au lieu de toujours ecraser avec `_id`
  5. Endpoint `POST /api/restore/fix-missing-ids` : corrige IDs + champs requis + enums + alias de champs
  6. Post-restore automatique dans `_do_restore()` corrige les ids manquants
  7. Bouton "Reparer les donnees restaurees" dans le frontend
- **Testing** : 100% (iterations 131, 132, 133)

### Bug Fix P0 - Upload chunke pour restauration (contourne Nginx 413)
- Upload chunke 5Mo par morceau (3 endpoints)
- **Testing** : 100% (iteration 131)

## Prioritized Backlog
### P0 - DONE
- Upload chunke pour restauration
- Donnees invisibles apres restauration (IDs + champs requis + enums + resilience)

### P1
- (PENDING USER VERIFICATION) Telechargement de sauvegarde (window.open + JWT)
- Validation utilisateur de tous les bugs corriges sur Proxmox

### P2
- Script de mise a jour serveur (update_service.py) - EN PAUSE

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Key Files Modified
- `/app/backend/server.py` - Endpoints resilients (intervention-requests, work-orders, serialize_doc)
- `/app/backend/import_export_routes.py` - Upload chunke + fix-missing-ids + process_import_item + clean_item_for_export
- `/app/backend/backup_service.py` - _clean_item_for_export corrige
- `/app/frontend/src/pages/RestoreTab.jsx` - Upload chunke + bouton reparation
