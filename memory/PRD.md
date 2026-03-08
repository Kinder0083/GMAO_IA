# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Widgets dashboard connectes a de vraies donnees (8 mars 2026)
- **Backend**: Nouvel endpoint `GET /api/dashboard/widget-data` retournant: low_stock, out_of_stock, recent_incidents_30d, total_incidents, upcoming_maintenance_7d, overdue_mprev, recent_status_changes_7d
- **Frontend**: Widgets `Stock bas`, `Incidents recents`, `Maintenances a venir`, `Planning M.Prev`, `Changements statut`, `Taux completion OT`, `Charge de travail` connectes aux donnees reelles
- **Templates**: 4 nouveaux templates dans Dashboard Service: MTTR, Maintenances a venir (7j), Charge equipe, Changements statut recents
- **Fichiers**: `server.py`, `Dashboard.jsx`, `api.js`, `custom_widgets_routes.py`

### Bugfix: Dashboard vide apres personnalisation (8 mars 2026)
- Fix `getStatConfig()` + reconciliation layout avec widgets actives

### Systeme d'archivage IA presqu'accidents (8 mars 2026)
- Collection `ai_pa_archives`, archivage auto, exclusion des incidents deja analyses

### Fix systeme de mise a jour v7.1 (8 mars 2026)
- Auto-exit processus + supervisor restart garanti

### Bugfix: NoneType dans generate-report (8 mars 2026)
- Fix `(it.get('contexte_cause') or '')[:80]`

## Architecture
```
Backend:
  server.py                      # + endpoint dashboard/widget-data
  update_service.py              # v7.1
  ai_presqu_accident_routes.py   # IA + archivage
  custom_widgets_routes.py       # + 4 nouveaux templates
  presqu_accident_routes.py

Frontend:
  pages/Dashboard.jsx            # Widgets avec donnees reelles
  pages/PresquAccidentArchivesIA.jsx
  pages/PresquAccidentRapport.jsx
  components/Personnalisation/DashboardSection.jsx
  services/api.js                # + dashboardAPI
  App.js
```

## IMPORTANT: Doublon backend/backend/
Toute modification dans /app/backend/ doit etre copiee dans /app/backend/backend/

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Integrations
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)
