# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Capture photo camera + preview dans formulaire Presqu'accident (9 mars 2026)
- Boutons "Photo" (camera capture) et "Fichier" ajoutés au formulaire de creation
- Grille de miniatures avec preview des images, icones pour videos/fichiers
- Bouton X pour retirer un fichier avant sauvegarde
- Mode edition : utilise AttachmentUploader + AttachmentsList + AttachmentGallery (lightbox)
- **Fichiers**: `PresquAccidentList.jsx`

### Action QR "Signaler un presqu'accident" (9 mars 2026)
- Bouton ajouté en 7e position dans les actions rapides QR
- Migration auto des configs existantes via ensure_default_actions()
- **Fichiers**: `qr_routes.py`, `QREquipmentPage.jsx`

### Mise a jour permissions + README (9 mars 2026)
- 48 modules synchronises backend/frontend
- Migration des 13 roles existants
- README.md mis a jour v1.9.0

### Evaluation en temps reel des formules (9 mars 2026)
- Auto-evaluation debounce 600ms, badge live, panneau detail

### Constructeur visuel de formules (9 mars 2026)
- Chips sources, boutons operateurs, palette fonctions, coloration syntaxique

### Pre-visualisation interactive Excel (9 mars 2026)
- Grille interactive, modes Cellule/Colonne, onglets multi-feuilles

### Nettoyage repertoire duplique (9 mars 2026)
### Dashboard Service avec onglets (8 mars 2026)
### Upload Excel local (8-9 mars 2026)
### Permission 'contrats' + Migration (8 mars 2026)
### Widgets dashboard donnees reelles (8 mars 2026)
### Bugfix: Dashboard vide (8 mars 2026)
### Archivage IA presqu'accidents (8 mars 2026)

### Systeme de mise a jour v7.1 (8 mars 2026)
- **STATUS: NON FONCTIONNEL** sur serveur de production. Differe.

## Architecture
```
Backend: server.py, models.py, custom_widgets_routes.py, formula_engine.py, roles_routes.py, qr_routes.py
Frontend: PresquAccidentList.jsx, RolesManagement.jsx, ServiceDashboard.jsx, CustomWidgetEditor.jsx, QREquipmentPage.jsx, Dashboard.jsx
Shared: AttachmentUploader.jsx, AttachmentsList.jsx, AttachmentGallery.jsx
```

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Integrations
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)

## Backlog
1. **P0 (Differe)**: Systeme de mise a jour - ne fonctionne pas sur serveur de production
2. Ameliorations futures selon besoins utilisateur
