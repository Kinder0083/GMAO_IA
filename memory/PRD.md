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
├── server.py (setup principal, routers)
├── models.py (modèles Pydantic)
└── routes/
    ├── shared.py (db, serialize_doc, helpers)
    ├── work_orders.py
    ├── equipments.py
    └── notification_health.py
```

## Fonctionnalités Implémentées

### Session Précédente
- Refactoring backend modulaire (12+ fichiers)
- Page Santé Système avec métriques architecture
- Dropdown Équipement parent/enfant (OT & DI)
- Export PDF individuel des OT (jsPDF)
- Export PDF en masse des OT avec mode sélection

### Session Actuelle (22 mars 2026)
- **Fix: Statuts OT "Att Matériel" et "Att Décision"** - Complet et testé
  - Modèle `WorkOrder` response: ajout `att_materiel_info`, `att_decision_info`
  - Route PUT: correction `is_status_only` pour autoriser les champs info avec le statut
  - Frontend: `StatusChangeDialog.jsx` avec champs conditionnels
  - Frontend: Tooltips sur badges de statut dans la liste OT
  - Tests: iteration_153.json - 100% backend et frontend

## Schéma DB Clé
- `work_orders`: `{_id, id, numero, statut (OUVERT|EN_COURS|ATT_MATERIEL|ATT_DECISION|TERMINE), att_materiel_info, att_decision_info, titre, description, ...}`
- `equipments`: `{_id, id, nom, parent_id, ...}`

## Credentials de Test
- Admin: `buenogy@gmail.com` / `TestAdmin2026!`

## Backlog
- P2: Tester le script `MAJ_FSAO.sh`
- Aucune autre tâche explicitement demandée
