# FSAO Iris - GMAO

## Problem Statement
Application GMAO (Gestion de Maintenance Assistee par Ordinateur) pour la gestion de maintenance industrielle.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide icons
- **Backend**: FastAPI, Python 3.11
- **Database**: MongoDB (motor async)
- **Auth**: JWT tokens

## Session 16 Mars 2026

### Bug Fix P0 DEFINITIF - Donnees invisibles apres restauration de backup
- **Probleme** : Les DI restaurees apparaissaient dans le dashboard (count) mais pas dans les listes
- **4 causes racines identifiees et corrigees** :
  1. `process_import_item()` supprimait le champ `id` -> CORRIGE: preserve comme string
  2. Champs obligatoires (description, titre) filtres comme NaN -> CORRIGE: defaults + endpoint resilient
  3. `created_by` et autres champs convertis en ObjectId par `process_import_item` -> CORRIGE: suppression de la conversion ObjectId + conversion string dans endpoints et serialize_doc
  4. **50+ collections NON sauvegardees** (accident_analyses, app_settings, checklists...) -> CORRIGE: 101+ collections dans EXPORT_MODULES + backup dynamique
- **Corrections implementees** :
  - `server.py` : serialize_doc et endpoints DI/OT convertissent ObjectId en string
  - `import_export_routes.py` : process_import_item ne convertit plus les champs en ObjectId, EXPORT_MODULES etendu a 101+ collections, fix-missing-ids convertit ObjectId en string
  - `backup_service.py` : backup dynamique des collections non listees dans EXPORT_MODULES
  - Endpoint diagnostic GET /api/restore/diagnostic pour investiguer les problemes
  - Bouton "Lancer le diagnostic" dans le frontend
- **Testing** : 100% (iterations 131, 132, 133, 134)

### Bug Fix P0 - Upload chunke (contourne Nginx 413)
- Upload chunke 5Mo/morceau (3 endpoints)
- **Testing** : 100% (iteration 131)

## Prioritized Backlog
### P0 - DONE
- Upload chunke + donnees invisibles + ObjectId conversion + backup complet

### P1
- (PENDING USER VERIFICATION) Telechargement de sauvegarde (window.open + JWT)
- Validation utilisateur sur Proxmox

### P2
- Script de mise a jour serveur (update_service.py) - EN PAUSE

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Key Files Modified
- `/app/backend/server.py` - serialize_doc, endpoints DI/OT resilients
- `/app/backend/import_export_routes.py` - EXPORT_MODULES 101+, fix-missing-ids, process_import_item, diagnostic
- `/app/backend/backup_service.py` - backup dynamique
- `/app/frontend/src/pages/RestoreTab.jsx` - diagnostic + reparation
