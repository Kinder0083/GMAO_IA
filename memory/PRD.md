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

### Session 22 mars 2026 (suite - fork)
- **Fix P0: Admins absents des listes d'assignation** - Tests: iteration_155.json - 100%
  - Cause racine: filtre MongoDB `deleted_at` trop restrictif pour données legacy
  - Nouveau filtre global: `NOT_DELETED = {"deleted_at": {"$in": [None, "", False, 0]}}` dans `routes/shared.py`
  - Appliqué dans: `users.py`, `service_manager.py`, `work_orders.py`, `equipments.py`, `intervention_requests.py`, `improvements.py`, `reports.py`, `server.py`
- **Fix tri OT** : tri descendant (récent → ancien) avec gestion types mixtes datetime/string
- **Mise à jour README.md** v1.10.0 → v1.11.0 : documentation complète des nouvelles fonctionnalités

### Session 23 mars 2026
- **Édition temps passé : date de pointage + permissions étendues** - Tests: iteration_156.json - 100%
  - Ajout champ date de pointage éditable (CalendarPicker shadcn, navigation libre entre mois)
  - Backend: `TimeEntryUpdate` accepte `timestamp` optionnel, **sauvegardé en datetime** (pas string) pour compatibilité rapports
  - Permission étendue: `require_permission("workOrders", "delete")` au lieu de `get_current_admin_user`
  - Frontend: `canManageTimeEntries = isAdmin() || (canEdit('workOrders') && canDelete('workOrders'))`
- **Fix date pointage dans rapports** : timestamps sauvegardés en `datetime` Python (pas string ISO) pour compatibilité `$gte/$lte` MongoDB
- **Tri OT** : filtre par défaut "Ouvert" au lieu de "Tous"
- **Permissions visibilité widgets dashboard** - Tests: iteration_157.json - 100%
  - Bouton bouclier (Shield) sur chaque widget en mode édition admin
  - Dialog avec liste d'utilisateurs + cases à cocher (admins cochés/grisés, non-admins modifiables)
  - Collection `widget_permissions` : `{widget_id, allowed_user_ids}`
  - Non-admins ne voient que les widgets autorisés

## Schéma DB Clé
- `work_orders`: `{_id, id, numero, statut, att_materiel_info, att_decision_info, ...}`
- `counters`: `{_id: "work_order_numero", seq: <dernier_numero>}`
- `user_preferences`: `{user_id, preferences: {dashboard_layout: {items: [...]}, ...}}`
- `equipments`: `{_id, id, nom, parent_id, ...}`

## Credentials de Test
- Admin: `buenogy@gmail.com` / `TestAdmin2026!`

### Session 24 mars 2026 (fork)
- **Fix P0: Écran blanc (crash React) à la connexion d'un technicien avec consignes en attente**
  - **Bug 1 (ConsignePopup.jsx)**: `currentConsigne` dans les dépendances `useCallback` → `loadPendingConsignes` recréée à chaque changement de consigne → `useEffect` ré-exécuté → boucle API. Corrigé via `useRef` pour lire l'état courant sans dépendance.
  - **Bug 2 (usePermissions.js - ROOT CAUSE)**: `isAdmin`, `canView`, `canEdit`, `canDelete` créées inline à chaque render → nouvelle référence à chaque render → `visibleWidgets` (useMemo dans Dashboard.jsx) recalculé à chaque render → `useEffect([preferences, visibleWidgets])` se déclenchait à chaque render → `setLayoutItems(nouveau_tableau)` → re-render → boucle infinie ("Maximum update depth exceeded"). Corrigé en stabilisant toutes les fonctions avec `useCallback` dans `usePermissions.js`.
  - Résultat: 0 "Maximum update depth exceeded" en console, popup de consigne s'affiche et s'acquitte correctement.

## Credentials de Test
- Admin: `buenogy@gmail.com` / `TestAdmin2026!`
- Technicien local: `axel@gmail.com` / `TestTech2026!`

## Backlog
- P2: Tester le script `MAJ_FSAO.sh`
- Refactorisation DB: normaliser les types UUID/ObjectId et String/Datetime dans toutes les collections (prévention régressions futures)
- En attente des prochaines consignes utilisateur
