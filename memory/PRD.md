# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Mise a jour permissions + README (9 mars 2026)
- 48 modules de permissions synchronises entre backend et frontend
- Ajouts frontend: consignationsLoto, contrats
- Ajouts backend: aiDashboard, aiAutomations, aiWidgets
- Migration des 13 roles existants avec les nouvelles permissions
- README.md mis a jour: Dashboard Service, Excel upload/preview, formules, nouveaux endpoints, collections MongoDB
- Version passee a 1.9.0

### Evaluation en temps reel des formules (9 mars 2026)
- Auto-evaluation avec debounce 600ms, badge live, panneau detail

### Constructeur visuel de formules (9 mars 2026)
- Chips sources, boutons operateurs, palette fonctions, coloration syntaxique

### Pre-visualisation interactive Excel (9 mars 2026)
- Grille interactive, modes Cellule/Colonne, onglets multi-feuilles

### Nettoyage repertoire duplique (9 mars 2026)
- Suppression de /app/backend/backend/

### Dashboard Service avec onglets (8 mars 2026)
- 9 onglets, preference sauvegardee, design classeur

### Upload Excel local (8-9 mars 2026)
### Permission 'contrats' + Migration (8 mars 2026)
### Widgets dashboard donnees reelles (8 mars 2026)
### Bugfix: Dashboard vide (8 mars 2026)
### Archivage IA presqu'accidents (8 mars 2026)

### Systeme de mise a jour v7.1 (8 mars 2026)
- **STATUS: NON FONCTIONNEL** sur serveur de production. Differe.

## Architecture
```
Backend: server.py, models.py (48 permissions), custom_widgets_routes.py, formula_engine.py, roles_routes.py
Frontend: RolesManagement.jsx (48 modules), ServiceDashboard.jsx, CustomWidgetEditor.jsx, Dashboard.jsx
```

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Integrations
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)

## Backlog
1. **P0 (Differe)**: Systeme de mise a jour - ne fonctionne pas sur serveur de production
2. Ameliorations futures selon besoins utilisateur
