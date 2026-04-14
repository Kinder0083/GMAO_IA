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

### Session 14 avril 2026 (fork) — Correctifs Autorisation Particulière
- **Fix P0: Logo print** — `autorisation_particuliere_v4_template.py` : ajout de `style="width:100%;height:auto;display:block;"` sur la balise `<img>` du logo IRIS dans l'en-tête d'impression. Le logo prend désormais toute la largeur de sa cellule tout en conservant son ratio.
- **Fix P0: Routing FormTemplatesPage** — `FormTemplatesPage.jsx` : le clic sur la carte système "Autorisation particulière" (`id === 'default-autorisation'`) ouvre maintenant `setShowAutorisationPrint(true)` (dialog V4) au lieu de `handleViewTemplate(template)` (ancien visualiseur).
- **Fix P0: AutorisationParticuliereView** — Remplacement de tous les `navigate('/autorisations-particulieres/new')` et `navigate('/autorisations-particulieres/edit/:id')` par le nouveau `AutorisationParticulierePrintDialog`. Bouton "Nouvelle Autorisation" et bouton icône (FileText) ouvrent le dialog. Prop `key={selectedAutorisation?.id || 'new'}` pour forcer le remontage lors du changement de sélection.


- **Correction template HTML (14 points)** selon comparaison PDF généré vs PDF cible :
  - En-tête : structure correcte 4 colonnes × 4 lignes (Date col1, MAINT/FE/003 col2+3, Version4 col4)
  - Séparateur gris (#CCCCCC, colspan=4) présent en ligne 3
  - Cases à cocher natives (`<input type="checkbox" checked>`) au lieu des symboles Unicode ●○
  - Types de travaux : flex `space-between` sur 2 lignes (3 checkboxes + autre cas)
  - Champs texte inline (`<input type="text" value="...">`) au lieu de textarea blocs
  - En-tête tableau précautions : `PRECAUTIONS A PRENDRE` (colspan=8) | `EQUIPEMENT COMPLEMENTAIRE` (colspan=3)
  - Tous les libellés du tableau **SANS ACCENTS** (ex: DECONTAMINATION, EGOUTS ET CABLES PROTEGES...)
  - Précautions supplémentaires : ligne pied de tableau fond gris (#f0f0f0)
  - Validation : layout flex inline (2 colonnes sur même ligne)
  - Visa AM : tableau 50/50 avec zone textarea
  - Vérification post-travaux : lignes hauteur 15mm
  - @page A4 portrait avec marges 8mm/10mm
  - Compact (espacements 2-4px) pour tenir sur 1 page A4

### Session 13 avril 2026 (fork) — AutorisationParticulière MAINT/FE/003 V4
- **Feature: Dialog AutorisationParticulierePrintDialog** — Nouveau composant React intégré pour l'Autorisation Particulière de Travaux (MAINT/FE/003 V4). Même pattern que `BonDeTravailPrintDialog`. Sections complètes : Types de travaux (checkboxes), Informations travaux (6 champs), Tableau précautions 3 sections × 9 lignes (boutons NON/OUI/FAIT compact), Précautions supplémentaires, Validation, Vérification post-travaux (30min/1h/2h).
- **Backend: `/api/documentations/autorisations-particulieres/save`** — POST, enregistre dans la collection `autorisations_particulieres` avec `form_version: 4`, `pole_id` requis (400 si absent), retourne `{id, status, titre}`.
- **Backend: `/api/documentations/autorisations-particulieres/generate-html`** — POST, génère HTML A4 complet (MAINT/FE/003 V4) depuis `autorisation_particuliere_v4_template.py`. Utilisé pour impression/export PDF via `window.print()`.
- **Intégration FormTemplatesPage**: Bouton `Printer` au survol de la carte "Autorisation particulière" (data-testid: `btn-print-autorisation`). Label "Survoler pour remplir".
- **Intégration PoleDetails**: Remplace `navigate('/autorisations-particulieres/new')` par ouverture du dialog. Menu clic-droit "Voir/Modifier l'autorisation" charge les données existantes dans le dialog via `form_data`.
- **Intégration ExplorerView**: Remplace `navigate('/autorisations-particulieres/new')` par ouverture du dialog.
- **Tests**: iteration_166.json — 100% (14/14 backend, tous scénarios frontend).

### Session 13 avril 2026 — Suppression modèles formulaires vers corbeille
- **Feature: Suppression soft** des modèles de formulaires personnalisés. Icône Trash2 au survol de la carte (côté Eye icon), visible uniquement pour admin ou `canDelete('documentations')`. Les modèles système ne peuvent pas être supprimés. Dialog de confirmation "Déplacer dans la corbeille". Le modèle disparaît de la liste et apparaît dans la page Corbeille avec le label "Modèle de formulaire" jusqu'à l'expiration du délai de rétention configuré. Backend: soft-delete (`deleted_at`) + `form_templates` ajouté à `TRASH_COLLECTIONS`. Permission étendue : admin OU `documentations.delete`.

### Session 13 avril 2026 — Menu contextuel clic-droit complet (Documentations)
- **Feature: Menu clic-droit complet** pour tous les éléments dans PoleDetails.jsx : Documents (Visualiser, Télécharger, Imprimer, Partager par email, Renommer, Supprimer), Bons de travail (Voir/Modifier, Imprimer, Partager par email, Renommer, Supprimer), Autorisations (Voir, Imprimer, Supprimer), Formulaires (Voir, Supprimer). Dialog de renommage intégré. Accès restreint aux admins/créateurs.
- **ExplorerView**: Bons de travail ont maintenant le menu complet identique aux documents (Copier, Couper, Envoyer vers, Partager, Masquer, Renommer, Supprimer). `handleDelete` et `handleRename` étendus pour le type 'bon'. `canDelete` restreint admins/créateurs.

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
