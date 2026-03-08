# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Constructeur visuel de formules (9 mars 2026)
- Remplace l'ancien textarea par un constructeur interactif
- Chips cliquables pour les sources ($Source1, $Source2...)
- Boutons operateurs (+, -, *, /, %, parentheses, 0, 100)
- Palette de fonctions par categorie (Math, Logique, Pourcentage, Comptage)
- Apercu avec coloration syntaxique (sources en bleu, fonctions en violet)
- Textarea editable pour saisie directe (mode hybride)
- Compatible avec le moteur formula_engine.py existant
- **Fichiers**: `CustomWidgetEditor.jsx` (composant VisualFormulaBuilder)

### Pre-visualisation interactive Excel (9 mars 2026)
- Grille interactive type tableur avec lettres de colonnes et numeros de lignes
- Mode "Cellule" et mode "Colonne" pour remplir automatiquement les references
- Onglets de feuilles pour fichiers multi-feuilles
- **Fichiers**: `CustomWidgetEditor.jsx` (ExcelPreviewTable), `custom_widgets_routes.py`

### Nettoyage repertoire duplique (9 mars 2026)
- Suppression de /app/backend/backend/

### Dashboard Service avec onglets par service (8 mars 2026)
- 9 onglets : ADV, LOGISTIQUE, PRODUCTION, QHSE, MAINTENANCE, LABO, INDUS, DIRECTION, AUTRE
- **Fichiers**: `ServiceDashboard.jsx`, `custom_widgets_routes.py`

### Upload Excel local (8-9 mars 2026)
- Endpoint POST /api/custom-widgets/upload/excel
- Toggle Samba/Local dans l'editeur
- **Fichiers**: `CustomWidgetEditor.jsx`, `custom_widgets_routes.py`

### Permission 'contrats' + Migration (8 mars 2026)
- **Fichiers**: `models.py`, `roles_routes.py`

### Widgets dashboard donnees reelles (8 mars 2026)
- Endpoint GET /api/dashboard/widget-data

### Bugfix: Dashboard vide (8 mars 2026)
### Archivage IA presqu'accidents (8 mars 2026)

### Systeme de mise a jour v7.1 (8 mars 2026)
- **STATUS: NON FONCTIONNEL** sur serveur de production. Differe.

## Architecture
```
Backend:
  server.py                      # endpoint dashboard/widget-data
  custom_widgets_routes.py       # upload Excel + preview interactif + templates
  formula_engine.py              # moteur de formules (inchange)
  roles_routes.py                # migration permissions + services list

Frontend:
  pages/ServiceDashboard.jsx     # Onglets par service
  pages/CustomWidgetEditor.jsx   # Upload Excel + preview interactif + VisualFormulaBuilder
  pages/Dashboard.jsx            # Widgets donnees reelles
```

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Integrations
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)

## Backlog
1. **P0 (Differe)**: Systeme de mise a jour - ne fonctionne pas sur serveur de production
2. Ameliorations futures selon besoins utilisateur
