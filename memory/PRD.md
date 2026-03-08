# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Dashboard Service avec onglets par service (8 mars 2026)
- **9 onglets** : ADV, LOGISTIQUE, PRODUCTION, QHSE, MAINTENANCE, LABO, INDUS, DIRECTION, AUTRE
- Chaque onglet est independant avec ses propres widgets
- Preference d'onglet sauvegardee automatiquement (`service_dashboard_tab`)
- Templates accessibles depuis chaque onglet, widgets crees lies au service actif
- **Design style classeur** avec onglets arrondis en haut
- **Fichiers**: `ServiceDashboard.jsx`, `custom_widgets_routes.py`, `models.py`

### Upload Excel local pour widgets personnalises (8-9 mars 2026)
- Endpoint `POST /api/custom-widgets/upload/excel` pour uploader un fichier Excel local
- Toggle dans l'editeur de widget entre "Serveur Samba / Reseau" et "Fichier local (upload)"
- Support .xlsx, .xls, .csv
- Preview des donnees du fichier uploade (feuilles + 10 premieres lignes)
- **Bug critique corrige**: import `Path` de `fastapi` au lieu de `pathlib` corrige avec `FilePath`
- **Fichiers**: `CustomWidgetEditor.jsx`, `custom_widgets_routes.py`

### Permission 'contrats' ajoutee (8 mars 2026)
- Ajoutee dans `UserPermissions` + `get_default_permissions_by_role()` pour 10 roles
- Migration endpoint corrige (KeyError 'id' -> fallback `_id`)
- 13 roles existants migres
- **Fichiers**: `models.py`, `roles_routes.py`

### Widgets dashboard connectes a de vraies donnees (8 mars 2026)
- Endpoint `GET /api/dashboard/widget-data`, 10 widgets avec donnees reelles
- 4 nouveaux templates maintenance (MTTR, Maintenances a venir, Charge equipe, Changements statut)

### Bugfix: Dashboard vide apres personnalisation (8 mars 2026)
- Fix `getStatConfig()` + reconciliation layout

### Systeme d'archivage IA presqu'accidents (8 mars 2026)
- Collection `ai_pa_archives`, archivage auto par lots de 150

### Systeme de mise a jour v7.1 (8 mars 2026)
- Auto-exit processus + supervisor restart garanti
- **STATUS: NON FONCTIONNEL** - L'utilisateur a confirme que cela ne marche toujours pas sur son serveur. A traiter ulterieurement.

## Architecture
```
Backend:
  server.py                      # endpoint dashboard/widget-data
  update_service.py              # v7.1 (non fonctionnel)
  ai_presqu_accident_routes.py   # IA + archivage
  custom_widgets_routes.py       # templates + service param + upload Excel local
  roles_routes.py                # migration permissions + services list
  models.py                      # contrats permission + service_dashboard_tab

Frontend:
  pages/Dashboard.jsx            # Widgets donnees reelles
  pages/ServiceDashboard.jsx     # REECRIT - onglets par service
  pages/CustomWidgetEditor.jsx   # Upload Excel local + toggle SMB/local
  pages/PresquAccidentArchivesIA.jsx
  services/api.js
  App.js
```

## IMPORTANT: Doublon backend/backend/
Toute modification dans /app/backend/ doit etre copiee dans /app/backend/backend/

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Integrations
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)

## Backlog
1. **P0 (Differe)**: Systeme de mise a jour - ne fonctionne pas sur le serveur de production
2. **P2**: Nettoyage du repertoire duplique `backend/backend/`
3. Ameliorations futures selon besoins utilisateur
