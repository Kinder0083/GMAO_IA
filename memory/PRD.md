# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Corrections systeme de mise a jour (8 mars 2026)
**3 bugs critiques corriges:**
1. **Backend (update_service.py)**: Approche "worker externe" remplacee par "in-process" - logs MongoDB temps reel, support --extra-index-url, detection venv pip
2. **Frontend (UpdateWarningOverlay.jsx)**: L'admin qui lance la mise a jour se faisait deconnecter par sa propre notification WebSocket AVANT que la MAJ ne demarre. Fix: flag sessionStorage `admin_updating`
3. **Frontend (Updates.jsx + UpdateNotificationBadge.jsx)**: Token sauvegarde avant broadcast, timeout 180s, flag admin_updating

### Import en masse presqu'accidents (8 mars 2026)
- Nouvel endpoint POST /api/presqu-accident/import-bulk
- Sauvegarde TOUS les champs: status, commentaire_traitement, responsable_action
- Frontend utilise le nouvel endpoint au lieu de createItem individuel

## Architecture
```
Backend:
  update_service.py           # v5.0 in-process (MODIFIE)
  server.py                   # endpoint /updates/apply (MODIFIE)
  presqu_accident_routes.py   # endpoint /import-bulk (NOUVEAU)

Frontend:
  components/Common/UpdateWarningOverlay.jsx    # Fix deconnexion admin (MODIFIE)
  components/Common/UpdateNotificationBadge.jsx # Fix deconnexion admin (MODIFIE)
  pages/Updates.jsx                             # Fix token + timeout (MODIFIE)
  pages/PresquAccidentList.jsx                  # Import via import-bulk (MODIFIE)
```

## IMPORTANT: Doublon backend/backend/
Les fichiers sont dupliques dans /app/backend/backend/. Toute modification doit etre copiee dans les DEUX emplacements.

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
