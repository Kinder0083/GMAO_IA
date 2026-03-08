# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Bugfix: Dashboard vide apres personnalisation (8 mars 2026)
- **Cause**: `getStatConfig()` ne supportait que 8/19 widgets. Les widgets sans config etaient filtres et le layout sauvegarde n'incluait pas les nouveaux widgets actives.
- **Fix**: Ajout configs pour 11 widgets manquants + reconciliation auto du layout avec les widgets actives
- **Fichier**: `frontend/src/pages/Dashboard.jsx`

### Fix systeme de mise a jour v7.1 (8 mars 2026)
- Le processus backend s'arrete lui-meme (`os._exit(0)`) → supervisor redemarre avec le nouveau code
- Retire la limite memoire Node.js de yarn build
- Logs dans `/var/log/gmao-iris-restart.log`
- **Fichier**: `backend/update_service.py`

### Bugfix: NoneType dans generate-report (8 mars 2026)
- Fix `(it.get('contexte_cause') or '')[:80]` dans 3 occurrences
- **Fichier**: `backend/ai_presqu_accident_routes.py`

### Systeme d'archivage IA presqu'accidents (8 mars 2026)
- Collection `ai_pa_archives`, archivage auto, exclusion des incidents deja analyses
- Bouton "Archives IA" + page dediee
- **Fichiers**: `backend/ai_presqu_accident_routes.py`, `frontend/src/pages/PresquAccidentArchivesIA.jsx`

### Corrections anterieures (sessions precedentes)
- Reecriture systeme de mise a jour (P0)
- Correction import/export presqu'accidents
- Logique de fallback IA (Gemini → OpenAI → Claude)

## Architecture
```
Backend:
  update_service.py              # v7.1 auto-exit + supervisor
  ai_presqu_accident_routes.py   # IA + archivage + fallback
  server.py                      # endpoints principaux
  presqu_accident_routes.py      # import-bulk

Frontend:
  pages/Dashboard.jsx                         # Fix widgets + reconciliation layout
  pages/PresquAccidentArchivesIA.jsx          # Page archives IA
  pages/PresquAccidentRapport.jsx             # Bouton Archives IA
  components/Personnalisation/DashboardSection.jsx # Config widgets
  services/api.js
  App.js
```

## IMPORTANT: Doublon backend/backend/
Toute modification dans /app/backend/ doit etre copiee dans /app/backend/backend/

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Integrations
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)
