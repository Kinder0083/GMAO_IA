# FSAO Iris - GMAO

## Problem Statement
Application GMAO (Gestion de Maintenance Assistee par Ordinateur) pour la gestion de maintenance industrielle.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide icons, @xyflow/react
- **Backend**: FastAPI, Python 3.11
- **Database**: MongoDB (motor async)
- **Auth**: JWT tokens
- **Realtime**: WebSocket via RealtimeManager
- **AI**: Gemini, OpenAI (GPT-5.2), Claude (via emergentintegrations)

## Session 16 Mars 2026 (2)

### Bug Fix P0 - Donnees invisibles apres restauration de backup
- **Probleme** : Apres restauration d'un backup depuis une autre installation, les DI etaient comptees dans le Dashboard (7 DI en attente) mais invisibles dans le menu DI. Les OTs, equipements et autres modules pouvaient aussi etre affectes.
- **Cause racine** : `process_import_item()` dans `import_export_routes.py` faisait `cleaned.pop("id")` supprimant definitivement le champ `id` des documents. Les modeles Pydantic (InterventionRequest, etc.) requi`erent `id: str`, causant une erreur 500 silencieuse.
- **Corrections** :
  1. `process_import_item()` : preserve `id` comme string apres le pop (ligne 457-475)
  2. `clean_item_for_export()` : preserve le UUID original au lieu de toujours utiliser `_id` (lignes 392-408 import_export + 29-43 backup_service)
  3. Nouvel endpoint `POST /api/restore/fix-missing-ids` : ajoute `id=str(_id)` a TOUS les documents sans champ `id` dans toutes les collections
  4. Post-restore automatique dans `_do_restore()` : corrige les ids manquants apres chaque restauration
  5. Bouton "Corriger les identifiants manquants" dans le frontend (RestoreTab.jsx)
- **Impact** : 23 567 documents corriges dans la DB de test (intervention_requests, work_orders, equipments, users, etc.)
- **Testing** : 100% backend (14/14), 100% frontend - iterations 131+132

## Session 16 Mars 2026 (1)

### Bug Fix P0 - Upload chunke pour restauration de sauvegarde
- **Probleme** : Erreur "Request entity too large" (Nginx 413) sur Proxmox
- **Solution** : Upload chunke (5Mo par morceau) contournant la limite Nginx
- **Endpoints** : chunked/init, chunked/upload, chunked/complete
- **Testing** : 100% - iteration_131

## Prioritized Backlog
### P0
- (DONE) Upload chunke pour restauration
- (DONE) Donnees invisibles apres restauration
- (DONE) Module Arbre des Causes
- (DONE) Script installation gmao-iris-install.sh

### P1
- (PENDING USER VERIFICATION) Telechargement de sauvegarde (window.open + JWT token)
- Validation utilisateur de tous les bugs corriges

### P2
- Script de mise a jour serveur (update_service.py) - EN PAUSE

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Key Files
- `/app/backend/import_export_routes.py` - Routes import/export + upload chunke + fix-missing-ids
- `/app/backend/backup_service.py` - Service de backup avec export corrige
- `/app/frontend/src/pages/RestoreTab.jsx` - UI restauration avec upload chunke + bouton fix
- `/app/backend/post-update.sh` - Script post-update avec fix Nginx
