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

### Session 24 mars 2026 (suite 3) — DI : Sous-équipement + Emplacement automatique
- **Feature: Dissociation équipement/sous-équipement dans les DI** - Tests: iteration_160.json - 11/11
  - `InterventionRequestFormDialog.jsx`: restructuration layout (Équipement + Sous-équipement + Emplacement hors du grid Priorité/Date), suppression du guard `hasChildren` (toujours charger les enfants), Emplacement comme SELECT éditable avec label '(rempli automatiquement)', préservation `sous_equipement_id` en mode édition, reset emplacement quand équipement change
  - `models.py`: ajout `sous_equipement_id` + `sous_equipement: Optional[Dict]` dans les 3 modèles `InterventionRequest`, `InterventionRequestCreate`, `InterventionRequestUpdate`
  - `routes/intervention_requests.py`: ajout import `get_equipment_by_id` + `get_location_by_id` depuis `routes/shared.py`, résolution du sous-équipement à la création et à l'update, propagation `sous_equipement_id` + `sous_equipement` lors de la conversion DI → OT
  - Comportement aligné avec les OT : l'équipement feuille (sous-équipement si sélectionné) devient l'équipement principal, emplacement auto-rempli depuis le parent


- **Feature: Push notifications pour OT assignés + alertes équipements** - Tests: iteration_159.json - 20/20
  - `web_push.py`: fix `notify_work_order_status_changed_web` (champ `assigne_a_id` au lieu de `assignedTo`)
  - `web_push.py`: fix `notify_equipment_alert_web` (filtre statut `$in: ['ACTIF', 'actif']`, libellés français)
  - `routes/equipments.py`: ajout `import asyncio` + import inline `notify_equipment_alert_web` dans PATCH `/status` (existait) + dans PUT `/equipments` (ajouté)
  - `web_push.py`: déactivation automatique subscriptions invalides (HTTP 0 + "Invalid" dans message, en plus de 404/410)
  - Nettoyage: désactivation manuelle de 2 subscriptions p256dh invalides en DB (user 69924657cdcae11ec6b0776e)
  - Tests: push déclenché pour 11 utilisateurs actifs lors d'une alerte équipement; OT assignation et changement statut vérifiés
- **Feature: Notifications Push PWA** - Tests: iteration_158.json - 100%
  - `routes/notifications.py`: ajout `import os` manquant (fix endpoint `/api/web-push/vapid-key`)
  - `consignes_routes.py`: `send_web_push_to_user()` après création consigne
  - `sw.js`: clic notification `new_consigne` → naviguer vers `/chat-live`
  - `ConsignePopup.jsx`: bannière "Activer les notifications" (BellRing + bouton Activer/Non)
  - `Header.jsx`: bouton toggle Bell/BellOff avec tooltip, masqué si permission refusée

## Schéma DB Clé
- `work_orders`, `counters`, `user_preferences`, `equipments` (inchangés)
- `web_push_subscriptions`: `{user_id, subscription: {endpoint, keys}, browser, is_active}`
- `widget_permissions`: `{widget_id, allowed_user_ids: []}`

## Credentials de Test
- Admin: `buenogy@gmail.com` / `TestAdmin2026!`
- Technicien local: `axel@gmail.com` / `TestTech2026!`

## Backlog
- P2: Tester le script `MAJ_FSAO.sh`
- Refactorisation DB: normaliser les types UUID/ObjectId et String/Datetime dans toutes les collections
- En attente des prochaines consignes utilisateur
