# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Pre-visualisation interactive Excel (9 mars 2026)
- Apres upload d'un fichier Excel, une grille interactive type tableur apparait
- Lettres de colonnes (A, B, C...) et numeros de lignes (1, 2, 3...)
- Mode selection "Cellule" : clic sur une cellule remplit automatiquement la reference (ex: B3)
- Mode selection "Colonne" : clic sur une colonne remplit automatiquement le nom de colonne
- Onglets de feuilles pour fichiers multi-feuilles (ex: Production, Maintenance)
- Indicateur visuel de la selection en cours
- **Fichiers**: `CustomWidgetEditor.jsx` (composant ExcelPreviewTable), `custom_widgets_routes.py` (endpoint preview ameliore)

### Nettoyage repertoire duplique (9 mars 2026)
- Suppression de /app/backend/backend/ (copie obsolete du code backend)
- Plus besoin de copier les fichiers dans le sous-repertoire

### Dashboard Service avec onglets par service (8 mars 2026)
- **9 onglets** : ADV, LOGISTIQUE, PRODUCTION, QHSE, MAINTENANCE, LABO, INDUS, DIRECTION, AUTRE
- Chaque onglet est independant avec ses propres widgets
- Preference d'onglet sauvegardee automatiquement (`service_dashboard_tab`)
- Templates accessibles depuis chaque onglet, widgets crees lies au service actif
- Design style classeur avec onglets arrondis en haut
- **Fichiers**: `ServiceDashboard.jsx`, `custom_widgets_routes.py`, `models.py`

### Upload Excel local pour widgets personnalises (8-9 mars 2026)
- Endpoint `POST /api/custom-widgets/upload/excel` pour uploader un fichier Excel local
- Toggle dans l'editeur de widget entre "Serveur Samba / Reseau" et "Fichier local (upload)"
- Support .xlsx, .xls, .csv
- Bug critique corrige: import `Path` de `fastapi` au lieu de `pathlib`
- **Fichiers**: `CustomWidgetEditor.jsx`, `custom_widgets_routes.py`

### Permission 'contrats' ajoutee (8 mars 2026)
- Migration endpoint corrige (KeyError 'id' -> fallback `_id`)
- **Fichiers**: `models.py`, `roles_routes.py`

### Widgets dashboard connectes a de vraies donnees (8 mars 2026)
- Endpoint `GET /api/dashboard/widget-data`, 10 widgets avec donnees reelles

### Bugfix: Dashboard vide apres personnalisation (8 mars 2026)
- Fix `getStatConfig()` + reconciliation layout

### Systeme d'archivage IA presqu'accidents (8 mars 2026)
- Collection `ai_pa_archives`, archivage auto par lots de 150

### Systeme de mise a jour v7.1 (8 mars 2026)
- **STATUS: NON FONCTIONNEL** - L'utilisateur a confirme que cela ne marche toujours pas. A traiter ulterieurement.

## Architecture
```
Backend:
  server.py                      # endpoint dashboard/widget-data
  update_service.py              # v7.1 (non fonctionnel)
  custom_widgets_routes.py       # upload Excel + preview interactif + templates
  roles_routes.py                # migration permissions + services list
  models.py                      # contrats permission + service_dashboard_tab

Frontend:
  pages/ServiceDashboard.jsx     # Onglets par service
  pages/CustomWidgetEditor.jsx   # Upload Excel + preview interactif (ExcelPreviewTable)
  pages/Dashboard.jsx            # Widgets donnees reelles
```

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Integrations
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)

## Backlog
1. **P0 (Differe)**: Systeme de mise a jour - ne fonctionne pas sur le serveur de production
2. Ameliorations futures selon besoins utilisateur
