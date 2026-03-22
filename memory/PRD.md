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
├── user_preferences_routes.py (GET/PUT/POST preferences)
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
- **Fix: Statuts OT "Att Matériel" et "Att Décision"** - Tests: iteration_153.json - 100%
- **Fix: Numéros OT en doublon** - Compteur atomique MongoDB
- **Fix: Notifications cloche (Header)** - Compteurs séparés att_materiel / att_decision
- **Fix: Scroll Dialog Historique IA** - overflow-hidden + min-h-0
- **Feature: Raccourcis Dashboard** - Tests: iteration_154.json - 100%
  - Menu contextuel global (CTRL + clic droit) disponible partout
  - Création raccourci page courante (auto-détection nom + icône)
  - Création raccourci d'adresse (URL, chemin réseau)
  - Affichage style Windows sur le dashboard (icône + nom)
  - Mode Modifier : drag & drop, édition (taille, icône custom, position label), suppression
  - Backend: ajout route PUT /api/user-preferences
  - Fix: PreferencesContext structure aplatie

## Composants Dashboard
```
/app/frontend/src/components/Dashboard/
├── GlobalContextMenu.jsx (Menu CTRL+clic droit)
├── SortableShortcut.jsx (Rendu raccourci style Windows)
├── ShortcutEditDialog.jsx (Dialog édition raccourci)
├── DashboardEditToolbar.jsx (Barre d'outils mode édition)
└── MaintenanceStatusPendingAlert.jsx
```

## Schéma DB Clé
- `work_orders`: `{_id, id, numero, statut, att_materiel_info, att_decision_info, ...}`
- `counters`: `{_id: "work_order_numero", seq: <dernier_numero>}`
- `user_preferences`: `{user_id, preferences: {dashboard_layout: {items: [...]}, ...}}`
- `equipments`: `{_id, id, nom, parent_id, ...}`

## Credentials de Test
- Admin: `buenogy@gmail.com` / `TestAdmin2026!`

## Backlog
- P2: Tester le script `MAJ_FSAO.sh`
- Aucune autre tâche explicitement demandée
