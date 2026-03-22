# GMAO FSAO Iris - PRD

## Problème Original
Application GMAO (Gestion de Maintenance Assistée par Ordinateur) complète pour la gestion d'équipements, d'ordres de travail, de maintenance préventive, d'inventaire, etc.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI (port 3000)
- **Backend**: FastAPI + Motor (MongoDB async) (port 8001)
- **DB**: MongoDB (gmao_iris)
- **Intégrations**: OpenAI/Emergent LLM Key, Web Push PWA (VAPID)

## Structure Backend Modulaire
```
/app/backend/
├── server.py (setup principal, routers, startup events)
├── models.py (modèles Pydantic)
└── routes/
    ├── shared.py (db, serialize_doc, helpers, get_next_work_order_numero)
    ├── work_orders.py
    ├── equipments.py
    ├── intervention_requests.py
    └── notification_health.py
```

## Fonctionnalités Implémentées

### Sessions Précédentes
- Refactoring backend modulaire (12+ fichiers)
- Page Santé Système avec métriques architecture
- Dropdown Équipement parent/enfant (OT & DI)
- Export PDF individuel des OT (jsPDF)
- Export PDF en masse des OT avec mode sélection

### Session Actuelle (22 mars 2026)
- **Fix: Statuts OT "Att Matériel" et "Att Décision"** - Complet et testé
  - Modèle `WorkOrder` response: ajout `att_materiel_info`, `att_decision_info`
  - Route PUT: correction `is_status_only` pour autoriser les champs info avec le statut
  - Tests: iteration_153.json - 100% backend et frontend

- **Fix: Numéros OT en doublon** - Complet et testé
  - Cause: `count_documents({})` non-atomique, sensible aux suppressions/restaurations
  - Solution: Compteur atomique MongoDB (`counters.work_order_numero` + `findOneAndUpdate` + `$inc`)
  - Corrigé dans 4 fichiers: `work_orders.py`, `intervention_requests.py`, `surveillance_routes.py`, `ai_maintenance_routes.py`
  - Startup event initialise le compteur au max existant
  - Vérifié: le compteur ne recule jamais après suppression

## Schéma DB Clé
- `work_orders`: `{_id, id, numero, statut, att_materiel_info, att_decision_info, titre, description, ...}`
- `counters`: `{_id: "work_order_numero", seq: <dernier_numero>}` (compteur atomique)
- `equipments`: `{_id, id, nom, parent_id, ...}`

## Credentials de Test
- Admin: `buenogy@gmail.com` / `TestAdmin2026!`

## Backlog
- P2: Tester le script `MAJ_FSAO.sh`
- Aucune autre tâche explicitement demandée
