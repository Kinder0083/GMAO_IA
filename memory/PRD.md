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
├── bon_de_travail_reportlab.py (NOUVEAU - générateur PDF ReportLab)
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

### Session 13 avril 2026 — Clic-droit suppression (Documentations)
- **Feature: Menu contextuel clic-droit** sur les documents dans `PoleDetails.jsx` — seulement visible pour admins et créateurs (`canEdit`), affiche le nom du fichier + bouton "Supprimer" rouge → ouvre la boîte de dialogue de confirmation existante.
- **Fix ExplorerView**: option "Supprimer" du menu clic-droit désormais restreinte aux admins et créateurs du document/dossier (`canDelete = isAdmin || created_by === currentUser.id`).

### Session 13 avril 2026 (fork — correctif Bon de Travail dialog unifié)
- **Fix P0: "Impossible d'enregistrer"** — Faute de frappe `loadExplorer` → `loadExplorerContents` dans `ExplorerView.jsx` (ligne 645)
- **Fix P0: Mauvais formulaire** — `PoleDetails.jsx` et `Documentations.jsx` utilisaient les vieilles routes (`BonDeTravailForm.jsx`/`BonDeTravailView.jsx`). Toutes les entrées (Ajouter formulaire, Modifier, Voir) ouvrent maintenant le bon dialog `BonDeTravailPrintDialog` (MAINT/FE/004 V2) sans navigation. Testé 5/5 scénarios OK.

### Session 13 avril 2026 (fork — correctif enregistrement Bon de Travail)
- **Fix P0: "Impossible d'enregistrer"** dans `BonDeTravailPrintDialog.jsx` — Faute de frappe dans `ExplorerView.jsx` ligne 645 : callback `onSaved` appelait `loadExplorer(...)` (inexistant) au lieu de `loadExplorerContents(...)`. Le bug déclenchait une `ReferenceError` catchée qui affichait le toast d'erreur à l'utilisateur même si la sauvegarde DB avait réussi. Correction : une seule ligne.

### Session 12 avril 2026 (suite 2 — Bon de Travail impression)
- **Feature: Impression PDF ReportLab — Bon de Travail MAINT/FE/004 V2**
  - `bon_de_travail_reportlab.py` : générateur ReportLab A4 fidèle au document officiel. En-tête 3 colonnes (logo IRIS + titre + référence), sous-en-tête rédacteur/approbateur, texte introductif, section 1 (Travaux à réaliser), section 2 (Risques - 2 colonnes), section 3 (Précautions - 2 colonnes), section 4 (Engagement + tableau signatures), pied de page. Cases cochées avec ■/□.
  - `documentations_routes.py` : endpoint `POST /api/documentations/bons-de-travail/generate-pdf` — accepte un dict, génère le PDF, retourne `application/pdf`.
  - `BonDeTravailPrintDialog.jsx` : dialog React avec 4 sections (Travaux/Risques/Précautions/Engagement), checkboxes, champs texte conditionnels (Autre préciser), boutons "Imprimer vierge" (dict vide → ReportLab) et "Imprimer" (données saisies → ReportLab). S'ouvre dans nouvel onglet + dialogue d'impression système.
  - `FormTemplatesPage.jsx` : icône Printer bleue sur la carte système "Bon de travail" (visible au survol, à côté de l'œil), `stopPropagation()` pour ne pas ouvrir la vue. Texte "Survoler pour imprimer" dans la carte. Dialog `BonDeTravailPrintDialog` intégré.

### Session 12 avril 2026 (suite — notifications veille/éteint)
- **Fix: TTL + Urgency push notifications** (`web_push.py`) — `ttl=604800` (7 jours file d'attente FCM/Apple) + `headers={"Urgency": "high"}` (bypass Doze Android + APNs priority=10 iOS).
- **Fix: Service Worker v3** (`sw.js`) — `renotify: true`, `silent: false`, `requireInteraction: true` par défaut.
- **Feature: Info notifications plateformes** (`Settings.jsx`) — bloc ambre pour Android (chemin batterie Chrome) et bleu pour iOS (16.4+, installation requise). Détection automatique via `navigator.userAgent`.

### Session 12 avril 2026
- **Fix: Widgets dashboard comptaient les utilisateurs inactifs**
- **Feature: Persistance visite guidée en base de données**
- **Fix: Santé notifications faux positif 0 abonnements**
- **Feature: Bannière réabonnement push automatique (PWABanner.jsx)**
- **Fix P0: Abonnement expiré faux positif VAPID**
- **Fix: JWT expiry 1h → 30j + intercepteur refresh automatique**
- **Feature: CRUD pointages Ordres d'Améliorations**

### Session 08 avril 2026
- Feature: Onglet "MongoDB Natif" (Import/Export)
- Fix: Statut CONVERTIE manquant
- Fix: Erreur MES tzinfo
- Feature: Formulaire DA Équipement parent/enfant
- Fix: Formulaire DI Submit

### Session 10 avril 2026
- Feature: Exclure inactifs des dropdowns (10 composants)
- Feature: Guide PWA contextuel dans Paramètres
- Feature: Activation/Désactivation utilisateurs
- Feature: Modification collaborateur entrée de temps (OT)

### Session 23 mars 2026
- Édition temps passé : date de pointage + permissions étendues
- Fix date pointage dans rapports
- Tri OT filtre par défaut "Ouvert"
- Permissions visibilité widgets dashboard

### Session 22 mars 2026 (fork)
- Fix P0: Admins absents des listes d'assignation
- Fix tri OT (gestion types mixtes datetime/string)

### Session 24 mars 2026 (fork)
- Fix P0: Écran blanc (crash React) technicien avec consignes
- Feature: Push notifications Consignes
- Feature: Push notifications OT assignés + alertes équipements
- Feature: Formulaire DI — Sous-équipement + Emplacement automatique

### Session 25 mars 2026 (fork)
- Migration DB complète (ObjectId → String, dates ISO → datetime)

### Session 10 avril 2026 (suite 2 — correctifs prod)
- Fix: DI invalides en boucle (work_order_numero float)
- Fix: OT créateur "PUBLIC" erreur boucle
- Script migration prod

## Fichiers Clés
- `bon_de_travail_reportlab.py` — Générateur ReportLab (NOUVEAU)
- `documentations_routes.py` — Routes documentation + PDF
- `BonDeTravailPrintDialog.jsx` — Dialog impression (NOUVEAU)
- `FormTemplatesPage.jsx` — Page modèles formulaires
- `web_push.py` — Notifications Push VAPID
- `sw.js` — Service Worker PWA (v3)
- `Settings.jsx` — Page paramètres avec info push mobile

## Schéma DB Clé
- `work_orders`: `{_id, id, numero, statut, ...}`
- `counters`: `{_id: "work_order_numero", seq: <dernier_numero>}`
- `user_preferences`: `{user_id, preferences: {dashboard_layout: {items: [...]}, ...}}`
- `equipments`: `{_id, id, nom, parent_id, ...}`
- `web_push_subscriptions`: `{user_id, subscription: {endpoint, keys}, browser, is_active}`
- `widget_permissions`: `{widget_id, allowed_user_ids: []}`

## Credentials de Test
- Admin: `buenogy@gmail.com` / `TestAdmin2026!`
- Technicien: `axel@gmail.com` / `TestTech2026!`

## Backlog
- P1: Migration DB normalisation IDs (UUID vs ObjectId → String) — en attente approbation utilisateur
- P2: Ajouter colonne "Sous-équipement" dans la liste des DI
- P2: Page paramètres préférences de notifications Push
- P2: Tester le script `MAJ_FSAO.sh`
