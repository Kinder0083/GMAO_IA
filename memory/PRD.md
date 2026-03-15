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

## Session 16 Mars 2026

### Bug Fix P0 - Upload chunke pour restauration de sauvegarde
- **Probleme** : La restauration de sauvegarde echouait avec "Request entity too large" (erreur Nginx 413) sur le serveur Proxmox quand le fichier ZIP > 25Mo. La config `client_max_body_size` de Nginx ne pouvait pas etre modifiee de maniere fiable.
- **Solution** : Implementation d'un upload chunke qui contourne completement la limite Nginx :
  - Le fichier est decoupe en morceaux de 5Mo cote frontend
  - Chaque morceau est envoye sequentiellement au backend
  - Le backend assemble les morceaux et lance la restauration
- **Endpoints crees** :
  - `POST /api/restore/chunked/init` : Initialise une session (retourne session_id)
  - `POST /api/restore/chunked/upload` : Upload d'un chunk individuel
  - `POST /api/restore/chunked/complete` : Assemble et restaure
- **Frontend** (`RestoreTab.jsx`) :
  - Detection automatique : chunke pour >5Mo, classique sinon
  - Barre de progression avec phases (envoi X/Y, restauration...)
  - Zone de depot indiquant "aucune limite de taille"
- **Backend** (`import_export_routes.py`) :
  - Fonction `_do_restore()` partagee entre upload classique et chunke (DRY)
  - Nettoyage automatique des fichiers temporaires dans `finally`
  - Repertoire `/app/backend/chunked_uploads/` pour le stockage temporaire
- **Script** (`post-update.sh`) : Amelioration du correctif Nginx pour couvrir tous les cas
- **Testing** : 100% backend (14/14), 100% frontend - iteration_131

## Session 15 Mars 2026 (suite)

### Feature - Centralisation des modeles IA
- **Probleme** : 3 listes de modeles hardcodees et incoherentes
- **Corrections** : Backend source unique + endpoint GET /api/ai/available-models
- **Testing** : API curl OK (9 modeles), Screenshot dropdown confirme

## Session 16 Fevrier 2026

### Bug Fix P0 - Script d'installation gmao-iris-install.sh
- **Probleme** : Le script d'installation sur Proxmox echouait avec 3 erreurs
- **Corrections** : bcrypt, syntaxe bash, attente MongoDB
- **Testing** : Backend health OK, login OK

## Session 15 Mars 2026

### Bug Fix P0 - Creation MP depuis Arbre des Causes
- Collection MongoDB corrigee + structure adaptee
- **Testing** : 100% - iteration_130

### Feature P1 - Actions Correctives Manuelles
- Bouton "Ajouter manuellement", formulaire inline, badge "Manuelle"
- **Testing** : 100% - iteration_130

### Feature - Boutons Notifications & Installation PWA dans Parametres
- Boutons dans Settings.jsx

### Module Arbre des Causes (Phase 20-21)
- Module complet d'analyse d'accidents avec 4 methodologies et IA

## Prioritized Backlog
### P0
- (DONE) Upload chunke pour restauration
- (DONE) Module Arbre des Causes
- (DONE) Script installation gmao-iris-install.sh
- (DONE) Bug creation MP depuis Arbre des Causes

### P1
- (PENDING USER VERIFICATION) Telechargement de sauvegarde (window.open + JWT token)
- Validation utilisateur de tous les bugs corriges
- Filtres avances sur la page DI

### P2
- Script de mise a jour serveur (update_service.py) - EN PAUSE par l'utilisateur

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Key Files
- `/app/backend/import_export_routes.py` - Routes import/export + upload chunke
- `/app/frontend/src/pages/RestoreTab.jsx` - UI restauration avec upload chunke
- `/app/backend/post-update.sh` - Script post-update avec fix Nginx
- `/app/gmao-iris-install.sh` - Script d'installation Proxmox
- `/app/backend/backup_routes.py` - Routes sauvegardes automatiques
- `/app/backend/backup_service.py` - Service de backup
- `/app/backend/accident_analysis_routes.py` - Routes Arbre des Causes
- `/app/frontend/src/pages/BackupTab.jsx` - UI sauvegardes automatiques
