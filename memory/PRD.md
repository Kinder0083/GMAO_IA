# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Evaluation en temps reel des formules (9 mars 2026)
- Auto-evaluation avec debounce 600ms a chaque modification de la formule
- Badge live dans le header (= valeur en vert, ou Erreur en rouge)
- Panneau detail avec resultat numerique et valeurs de test utilisees
- Noms de sources convertis en underscore pour compatibilite backend ($Source_1)
- Corrections : appel API, gestion des espaces dans les noms, erreurs Pydantic
- **Fichiers**: `CustomWidgetEditor.jsx` (VisualFormulaBuilder)

### Constructeur visuel de formules (9 mars 2026)
- Chips cliquables pour les sources, boutons operateurs, palette de fonctions
- Apercu avec coloration syntaxique, textarea editable en mode hybride
- **Fichiers**: `CustomWidgetEditor.jsx` (VisualFormulaBuilder)

### Pre-visualisation interactive Excel (9 mars 2026)
- Grille interactive type tableur, modes Cellule/Colonne, onglets multi-feuilles
- **Fichiers**: `CustomWidgetEditor.jsx` (ExcelPreviewTable), `custom_widgets_routes.py`

### Nettoyage repertoire duplique (9 mars 2026)
- Suppression de /app/backend/backend/

### Dashboard Service avec onglets par service (8 mars 2026)
- 9 onglets, preference sauvegardee, design style classeur
- **Fichiers**: `ServiceDashboard.jsx`, `custom_widgets_routes.py`

### Upload Excel local (8-9 mars 2026)
- Endpoint POST /api/custom-widgets/upload/excel, toggle Samba/Local
- **Fichiers**: `CustomWidgetEditor.jsx`, `custom_widgets_routes.py`

### Permission 'contrats' + Migration (8 mars 2026)
### Widgets dashboard donnees reelles (8 mars 2026)
### Bugfix: Dashboard vide (8 mars 2026)
### Archivage IA presqu'accidents (8 mars 2026)

### Systeme de mise a jour v7.1 (8 mars 2026)
- **STATUS: NON FONCTIONNEL** sur serveur de production. Differe.

## Architecture
```
Backend:
  server.py, custom_widgets_routes.py, formula_engine.py, roles_routes.py
Frontend:
  pages/ServiceDashboard.jsx, pages/CustomWidgetEditor.jsx, pages/Dashboard.jsx
```

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Integrations
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)

## Backlog
1. **P0 (Differe)**: Systeme de mise a jour
2. Ameliorations futures selon besoins utilisateur
