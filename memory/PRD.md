# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Bugfix: NoneType dans generate-report (8 mars 2026)
- **Cause racine**: `contexte_cause` stocke en `null` dans MongoDB. `dict.get('contexte_cause', '')` retourne `None` (pas `''`) quand la cle existe avec valeur null. `None[:80]` provoque `'NoneType' object is not subscriptable`.
- **Fix**: Remplace `it.get('contexte_cause','')[:80]` par `(it.get('contexte_cause') or '')[:80]` dans les 3 occurrences (analyze-trends x2 + generate-report x1)
- **Budget LLM**: Le budget Gemini etait depasse ($5.05 > $5.00 max). Le fallback vers OpenAI gpt-4o-mini fonctionne correctement.

### Systeme d'archivage IA des presqu'accidents (8 mars 2026)
- **Backend**: Collection `ai_pa_archives` pour stocker les rapports IA archives
- **Backend**: `analyze-trends` et `generate-report` excluent les incidents deja archives et archivent automatiquement
- **Backend**: Endpoints CRUD: GET /archives, GET /archives/{id}, DELETE /archives/{id}
- **Frontend**: Bouton "Archives IA" sur la page "Rapport P.accident"
- **Frontend**: Page /presqu-accident-archives-ia avec stats et liste des archives

### Corrections systeme de mise a jour (8 mars 2026)
1. **Backend (update_service.py)**: Approche "worker externe" remplacee par "in-process"
2. **Frontend (UpdateWarningOverlay.jsx)**: Fix deconnexion admin via flag sessionStorage
3. **Frontend (Updates.jsx + UpdateNotificationBadge.jsx)**: Token sauvegarde avant broadcast

### Import en masse presqu'accidents (8 mars 2026)
- Endpoint POST /api/presqu-accident/import-bulk avec tous les champs

### Logique de fallback IA (8 mars 2026)
- Chaine: modele prefere utilisateur -> OpenAI -> Claude
- Limitation a 150 incidents par lot

## Architecture
```
Backend:
  ai_presqu_accident_routes.py   # IA + archivage + CRUD archives + fallback
  update_service.py              # v6.0 in-process
  server.py                      # endpoints principaux
  presqu_accident_routes.py      # import-bulk

Frontend:
  pages/PresquAccidentArchivesIA.jsx          # Page archives IA
  pages/PresquAccidentRapport.jsx             # Bouton Archives IA
  components/AIPATrendAnalyzer.jsx            # Dialog analyse tendances
  components/AIQHSEReport.jsx                 # Dialog rapport QHSE
  services/api.js                             # Methodes archives
  App.js                                      # Route archives
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

## Integrations 3rd party
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)
- Note: Budget Gemini depasse - fallback OpenAI actif
