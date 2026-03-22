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
  - Route PUT: correction `is_status_only`
  - Tests: iteration_153.json - 100%

- **Fix: Numéros OT en doublon** - Complet et testé
  - Compteur atomique MongoDB (`counters.work_order_numero` + `findOneAndUpdate` + `$inc`)
  - Corrigé dans 4 fichiers

- **Fix: Notifications cloche (Header)** - Complet et testé
  - Backend: `/api/bell-counts` retourne `att_materiel` et `att_decision` séparément
  - Frontend: Header affiche "OT Att Materiel" et "OT Att Decision" (conditionnel si > 0)
  - Navigation filtre vers le bon statut (`ATT_MATERIEL` ou `ATT_DECISION`)

## Schéma DB Clé
- `work_orders`: `{_id, id, numero, statut, att_materiel_info, att_decision_info, titre, ...}`
- `counters`: `{_id: "work_order_numero", seq: <dernier_numero>}`
- `equipments`: `{_id, id, nom, parent_id, ...}`

## Credentials de Test
- Admin: `buenogy@gmail.com` / `TestAdmin2026!`

## Backlog
- P2: Tester le script `MAJ_FSAO.sh`
- Aucune autre tâche explicitement demandée
