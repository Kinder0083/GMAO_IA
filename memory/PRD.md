# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Systeme d'archivage IA des presqu'accidents (8 mars 2026)
- **Backend**: Nouvelle collection `ai_pa_archives` pour stocker les rapports IA archives
- **Backend**: Les endpoints `analyze-trends` et `generate-report` excluent desormais les incidents deja archives et archivent automatiquement les resultats
- **Backend**: Nouveaux endpoints CRUD pour les archives: GET /archives, GET /archives/{id}, DELETE /archives/{id}
- **Frontend**: Bouton "Archives IA" ajoute sur la page "Rapport P.accident"
- **Frontend**: Nouvelle page /presqu-accident-archives-ia avec stats (archives totales, incidents archives, incidents totaux, restant a analyser) et liste des archives avec possibilite de consulter ou supprimer

### Corrections systeme de mise a jour (8 mars 2026)
**3 bugs critiques corriges:**
1. **Backend (update_service.py)**: Approche "worker externe" remplacee par "in-process" - logs MongoDB temps reel, support --extra-index-url, detection venv pip
2. **Frontend (UpdateWarningOverlay.jsx)**: L'admin qui lance la mise a jour se faisait deconnecter par sa propre notification WebSocket AVANT que la MAJ ne demarre. Fix: flag sessionStorage `admin_updating`
3. **Frontend (Updates.jsx + UpdateNotificationBadge.jsx)**: Token sauvegarde avant broadcast, timeout 180s, flag admin_updating

### Import en masse presqu'accidents (8 mars 2026)
- Nouvel endpoint POST /api/presqu-accident/import-bulk
- Sauvegarde TOUS les champs: status, commentaire_traitement, responsable_action
- Frontend utilise le nouvel endpoint au lieu de createItem individuel

### Logique de fallback IA (8 mars 2026)
- Chaine de fallback: modele prefere utilisateur -> OpenAI -> Claude
- Respect des preferences utilisateur (provider/model) depuis les parametres
- Limitation a 150 incidents par analyse pour eviter timeouts/depassement tokens

## Architecture
```
Backend:
  ai_presqu_accident_routes.py   # Logique IA avec fallback + archivage automatique + CRUD archives
  update_service.py              # v6.0 in-process (MODIFIE)
  server.py                      # endpoint /updates/apply (MODIFIE)
  presqu_accident_routes.py      # endpoint /import-bulk (NOUVEAU)

Frontend:
  pages/PresquAccidentArchivesIA.jsx          # Page archives IA (NOUVEAU)
  pages/PresquAccidentRapport.jsx             # Bouton Archives IA ajoute (MODIFIE)
  components/AIPATrendAnalyzer.jsx            # Dialog analyse tendances
  components/AIQHSEReport.jsx                 # Dialog rapport QHSE
  components/Common/UpdateWarningOverlay.jsx  # Fix deconnexion admin (MODIFIE)
  components/Common/UpdateNotificationBadge.jsx # Fix deconnexion admin (MODIFIE)
  pages/Updates.jsx                           # Fix token + timeout (MODIFIE)
  services/api.js                             # Methodes archives ajoutees (MODIFIE)
  App.js                                      # Route archives ajoutee (MODIFIE)
```

## IMPORTANT: Doublon backend/backend/
Les fichiers sont dupliques dans /app/backend/backend/. Toute modification doit etre copiee dans les DEUX emplacements.

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Collections MongoDB cles
- `presqu_accident_items`: incidents de presqu'accidents
- `ai_pa_archives`: archives des analyses IA (type: trend_analysis | qhse_report)
- `ai_analysis_history`: historique brut des analyses
- `user_preferences`: preferences utilisateur (ai_llm_provider, ai_llm_model)
- `settings`: parametres globaux

## Integrations 3rd party
- Gemini (via emergentintegrations) - extraction et analyse IA
- OpenAI (via emergentintegrations) - fallback pour rapports
- Claude/Anthropic (via emergentintegrations) - second fallback pour rapports
- Toutes utilisent la cle Emergent LLM Key
