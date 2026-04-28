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

### Session 28 avril 2026 (suite) — Gestion automatique heure d'été/hiver (DST-aware)

**Problème résolu** : Avant cette mise à jour, l'admin devait modifier manuellement l'offset GMT 2× par an au passage heure d'été ↔ hiver. La configuration stockait un offset numérique figé.

**Solution autonome** :
- **Backend** : Nouveau helper `timezone_helper.py` utilisant `zoneinfo` (lib standard Python 3.9+) pour calculer dynamiquement l'offset à partir d'un nom IANA (`Europe/Paris`, `America/New_York`, etc.)
- L'offset effectif est désormais **recalculé en temps réel** à chaque appel des endpoints `/api/timezone/offset`, `/api/timezone/config`, `/api/timezone/current-time`
- **Migration auto** au premier accès : si un ancien enregistrement n'a qu'un `timezone_offset` numérique, on déduit le nom IANA correspondant (mapping `OFFSET_TO_DEFAULT_IANA`) et on le persiste.
- Nouvel endpoint `/api/timezone/dst-info?timezone_name=...` retournant : `is_dst`, `current_offset`, `standard_offset`, `next_transition` (date+heure ISO), `next_transition_offset`, `next_is_dst_after`
- Liste IANA enrichie groupée par région (Europe, Amériques, Afrique, Asie, Pacifique)
- **Frontend** :
  - Badge dynamique 🌞 "Heure d'été en cours" / ❄️ "Heure d'hiver en cours" dans le widget heure
  - Indication "Prochain changement : dimanche 25 octobre 2026 à 01:00 → GMT+1 (heure d'hiver)"
  - Liste groupée par région avec offset courant et indicateur DST par fuseau
  - Mention pour les fuseaux sans DST (ex: Asia/Kolkata, America/Phoenix) : "Ce fuseau n'observe pas de changement d'heure"
- **Tests pytest** : 10/10 passés (`/app/backend/tests/test_timezone_helper.py`) — couvre Paris hiver/été, Kolkata sans DST, Phoenix sans DST, repli IANA invalide, prochain changement.

**Files modifiés / créés** :
- `/app/backend/timezone_helper.py` (NOUVEAU)
- `/app/backend/timezone_routes.py` (refonte DST-aware)
- `/app/backend/models.py` (offset `int` → `float` pour supporter +5:30, etc.)
- `/app/backend/tests/test_timezone_helper.py` (NOUVEAU - 10 tests)
- `/app/frontend/src/components/Settings/TimezoneSettings.jsx` (refonte UI)

**Aucune intervention requise sur Proxmox** : la migration des données est automatique au premier appel.


### Session 28 avril 2026 — Évolution module M.E.S (cp/min + sous-équipement)

**Fonctionnalités ajoutées** :
1. **Type machine** : Champ "Type" dans les dialogues d'ajout/paramétrage M.E.S avec deux options :
   - `Imp` (impulsion 1/0) — comportement historique conservé
   - `cp/min` (cadence directe) — nouvelle option : la machine publie directement sa cadence en cp/min (ex: `45`)
2. **Topic d'état séparé (cp/min)** : Champ conditionnel "Topic etat (ACTIVE/IDLE)" affiché uniquement quand `type = cp/min`. La machine publie son état explicite ("ACTIVE" / "IDLE") sur ce topic dédié.
3. **Dropdown Équipement scindé** : Le dropdown unique "Equipement" est remplacé par deux menus :
   - **Equipement parent** (obligatoire) — uniquement les équipements racines (sans `parent_id`)
   - **Sous-équipement** (optionnel, en cascade depuis le parent)

**Modifications techniques** :
- **Backend `mes_service.py`** :
  - Nouveaux champs sur `mes_machines` : `type` (Imp/cp/min, défaut "Imp" pour rétro-compatibilité), `mqtt_topic_state`, `sub_equipment_id`, `current_cadence`, `current_cadence_at`, `state_explicit`, `state_updated_at`
  - `_subscribe_machine` souscrit aux deux topics quand type=cp/min
  - `_handle_mqtt_message_sync` route le message reçu vers : impulsion (Imp), cadence directe (cp/min) ou état (cp/min state)
  - `_record_direct_cadence_sync` synthétise des impulsions à partir de la cadence reçue × delta de temps écoulé (cap à 5 min)
  - `_record_state_sync` met à jour `is_running` selon "ACTIVE" / "IDLE"
  - `get_realtime_metrics` : pour cp/min utilise `current_cadence` directement (au lieu de compter les pulses), `is_running` selon état explicite
  - `_check_alerts` : pour cp/min avec état explicite, alerte STOPPED basée sur `state_updated_at` au lieu de `last_pulse_at`
  - `delete_machine` se désabonne des deux topics
- **Frontend `MESPage.jsx`** :
  - `CreateMachineModal` et `MachineSettingsModal` : split equipement parent/sous, dropdown Type, champ conditionnel Topic état
  - Affichage liste/dashboard machine : "Parent → Sous-équipement"
- **Rétro-compatibilité** : Les machines existantes sans champ `type` sont traitées comme `"Imp"` (default). Aucun impact sur le suivi en place.

**Tests effectués** :
- Backend : POST/PUT/DELETE `/api/mes/machines` avec tous les nouveaux champs (curl, OK)
- Frontend : screenshot du modal "Ajouter une machine" et "Paramètres machine" avec switch Imp ↔ cp/min validé

**Files modifiés** :
- `/app/backend/mes_service.py`
- `/app/frontend/src/pages/MESPage.jsx`


### Session 26 avril 2026 — Drill-down widgets Dashboard (raccourcis avec filtres)

**Fonctionnalité ajoutée** : Chaque widget du tableau de bord est désormais un raccourci cliquable qui navigue vers la page source avec les filtres pré-appliqués correspondant aux données affichées.

**Comportement** :
- Curseur "main" + ombre/bordure bleue au survol + icône `ExternalLink` en bas à droite
- Navigation dans le même onglet via `useNavigate` + paramètre `?widget=xxx` dans l'URL
- Bannière bleue dismissable sur la page cible : "Vue filtrée depuis le tableau de bord : [label]"
- Fermer la bannière réinitialise les filtres par défaut

**Mapping widget → filtre** :
- `ecart_temps` → `/work-orders` : TERMINE + 30 derniers jours
- `charge_maintenance` → `/work-orders` : tous non-terminés (NON_TERMINE)
- `work_orders_active` → `/work-orders` : non-terminés
- `overdue_tasks` → `/work-orders` : en retard
- `maintenance_stats` → `/work-orders` : TERMINE ce mois
- `team_activity` → `/work-orders` : EN_COURS
- `di_en_attente` → `/intervention-requests` : DI non converties et non refusées
- `di_temps_reponse` → `/intervention-requests` : toutes les DI
- `equipment_alerts` → `/assets` : ALERTE_S_EQUIP
- `equipment_status_overview` → `/assets` : DEGRADE
- `equipment_maintenance` → `/assets` : EN_MAINTENANCE
- `low_stock` → `/inventory` (filtre futur)
- `planning_mprev_summary` / `upcoming_maintenance` → `/planning-mprev`

**Fichiers modifiés** :
- `Dashboard.jsx` : `useNavigate` + `ExternalLink` icon + champ `link` sur tous les stats
- `WorkOrders.jsx` : `useEffect` lecture `?widget=` + filtre `NON_TERMINE` + bannière
- `InterventionRequests.jsx` : `filterStatus` + logique EN_ATTENTE via `!work_order_id && !refused` + bannière
- `Assets.jsx` : `useSearchParams` + `useEffect` widget + bannière
- **Tests** : iteration_172 — 13/13 ✅ (fix appliqué sur le bug DI en attente)



**Bug corrigé** : Le backend avait le chemin `/app/backend` codé en dur dans `documentations_routes.py` (4 occurrences). Sur le serveur de production (`/opt/gmao-iris/`), tous les fichiers étaient introuvables → HTTP 404.

**Correction** : Ajout de `BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))` — chemin calculé dynamiquement depuis l'emplacement réel du fichier. Fonctionne sur tous les environnements.

**Fichier modifié** : `backend/documentations_routes.py` — routes `view`, `download`, `copy`, export PDF.

---

### Session 15 avril 2026 — Intégration FilePreviewRenderer (.docx + .xlsx)

**Fonctionnalité ajoutée** : Prévisualisation in-app des fichiers Word (.docx) et Excel (.xlsx/.csv) avec chargement dynamique des bibliothèques.

**Architecture** :
- **`components/shared/FilePreviewRenderer.jsx`** : Composant principal. Détecte le type de fichier, charge dynamiquement `mammoth` (docx → HTML) ou `xlsx`/SheetJS (xlsx/csv → tableau HTML) via `import()`. Fallback gracieux pour les types non supportés.
- **`pages/Documentations.jsx`** : Bouton Eye ouvre maintenant le dialog de prévisualisation in-app (plus `window.open`). Champs corrigés (`fichier_nom`, `fichier_type`). Fallback remplacé par `FilePreviewRenderer`.
- **`components/documentations/ExplorerView.jsx`** : Dialog visualiseur (double-clic) utilise `FilePreviewRenderer` pour docx/xlsx au lieu de l'ancien fallback "Prévisualisation non disponible".
- **`components/shared/AttachmentGallery.jsx`** : Miniatures WORD (fond bleu) et EXCEL (fond vert). Lightbox utilise `FilePreviewRenderer` pour les fichiers Word/Excel.
- **Tests** : iteration_170 (bugs trouvés) + iteration_171 (100% passé) ✅



**Fonctionnalité ajoutée** : Appuyer sur Echap ferme n'importe quelle boîte de dialogue de l'application, sans enregistrer.

**Architecture** :
- **`hooks/useEscapeToClose.js`** : Hook React avec pile LIFO. Quand plusieurs modales sont ouvertes, Echap ferme uniquement la plus haute. Une seule écoute globale `keydown` est montée/démontée proprement.
- **Dialogs Radix/Shadcn (107 usages)** : Echap géré **nativement** par Radix UI — aucun changement nécessaire ✅
- **`InactivityHandler.jsx`** : `onOpenChange={() => {}}` intentionnel — ne répond pas à Echap (voulu ✅)
- **Modales personnalisées corrigées** (7 fichiers) :
  - `AccidentAnalysis/CreateChecklistDialog.jsx` (`open` prop → `onClose`)
  - `AccidentAnalysis/CreatePreventiveDialog.jsx` (`open` prop → `onClose`)
  - `pages/MESPage.jsx` (`MachineSettingsModal` + `CreateMachineModal`, toujours ouvertes quand montées)
  - `pages/MESReportsPage.jsx` (`showScheduleModal`)
  - `components/shared/AttachmentGallery.jsx` (lightbox photo, `lightbox.open`)
- **Tests** : Lint ✅ (0 erreur), HTTP 200 ✅

### Session 14 avril 2026 — Déconnexion inactivité : réglage per-user (Personnalisation → Sécurité)

**Problème résolu** : Le délai de déconnexion automatique était un réglage global unique pour tous les utilisateurs (stocké dans `global_settings`). Chaque utilisateur doit pouvoir définir son propre délai.

**Corrections** :
- **`models.py`** : Ajout `inactivity_timeout_minutes: Optional[int] = None` dans `UserPreferences` ET `UserPreferencesUpdate`
- **`routes/settings.py`** : `model_dump(exclude_unset=True)` au lieu de `if v is not None` → permet de sauvegarder `null` pour reset
- **Nouveau `SecurityPreferencesSection.jsx`** : composant d'interface pour définir son timeout personnel (1-120 min) via `PUT /api/user-preferences`
- **`Personnalisation.jsx`** : Ajout de l'onglet "Sécurité" avec `SecurityPreferencesSection`
- **`InactivityHandler.jsx`** : Lit depuis `usePreferences()` context (préférence personnelle en priorité), fallback vers setting global admin (403 ignoré silencieusement)
- **Comportement** : Chaque utilisateur définit son propre délai. `null` = utilise le défaut global de l'admin (15 min). Les préférences de chaque utilisateur sont totalement indépendantes.
- **Tests** : iteration_169.json — 100% backend (12/12) + 100% frontend (5/5) ✅

### Session 14 avril 2026 — Fix filtrage permissions dans Personnalisation (Organisation menu + Header)

**Problème résolu** : Les onglets "Organisation du menu" et "Organisation du Header" affichaient TOUS les menus/icônes sans filtrage de permissions.
**Corrections** : `isMenuAccessible()` dans `MenuOrganizationSection.jsx`, `isIconAccessible()` + champ `module` dans `HeaderOrganizationSection.jsx`.
**Tests** : iteration_168.json — 100% (20/20 frontend) ✅

### Session 14 avril 2026 (fork) — Fix menu "Personnalisation" invisible pour non-ADMIN

**Problème résolu** : Le menu "Personnalisation" dans la sidebar n'apparaissait pas pour les utilisateurs non-ADMIN même lorsque l'administrateur leur avait accordé la permission `personalization.view = true`.

**Double cause racine** :
1. **`Sidebar.jsx`** : le bouton "Personnalisation" était entièrement dans le bloc `{user.role === 'ADMIN' && (...)}` — inaccessible pour tout non-ADMIN
2. **`MainLayout.jsx`** : le `setUser()` n'incluait pas `permissions` dans l'objet `user` passé à `Sidebar.jsx` (seuls `nom`, `role`, `firstLogin`, `id` étaient stockés) → `user.permissions` était toujours `undefined`

**Corrections appliquées** :
- **`MainLayout.jsx`** : ajout de `permissions: parsedUser.permissions || {}` dans le `setUser()` (ligne 105-111)
- **`Sidebar.jsx`** : extraction du bouton "Personnalisation" hors du bloc ADMIN-only → rendu conditionnel séparé : `user.role === 'ADMIN' || user.permissions?.personalization?.view === true`
- Les autres menus admin (System Health, Special Settings, Import/Export, MQTT, SSH, etc.) restent ADMIN-only (intentionnel)
- Ajout de `data-testid="sidebar-personnalisation"` pour testabilité
- **Test** : screenshot confirmé — menu Personnalisation visible pour `axel@gmail.com` (TECHNICIEN avec `personalization.view = true`) ✅

### Session 14 avril 2026 (fork) — Permissions module-niveau backend (isAdminForModule complet)

**Problème résolu** : Un technicien avec `workOrders.edit=True` était bloqué par des vérifications ADMIN strictes dans le backend pour : modifier la catégorie d'un OT, modifier/supprimer des commentaires.

**Solution** : Ajout de `require_admin_for_module(module)` dans `dependencies.py` — accorde l'accès si ADMIN global OU `permissions[module].edit == True`. Appliqué à **tous les modules sans exception** :

- **`dependencies.py`** : nouvelle fonction `require_admin_for_module(module)`
- **`work_orders.py`** : `update_work_order` (check `has_wo_edit`), `update_comment`, `delete_comment`
- **`improvements.py`** : validation/rejet DAs (liste + update status)
- **`availability.py`** : create/update/delete disponibilités → `require_admin_for_module("planning")`
- **`inventory.py`** : create/delete services inventaire → condition `has_module_edit`
- **`preventive_maintenance.py`** : trigger exécution → `require_admin_for_module("preventiveMaintenance")`
- **Opérations système restent ADMIN-only** : audit, backup, settings, users, mises à jour
- **Tests** : iteration_167.json — 100% (17/17 backend), toutes régressions validées ✅

### Session 14 avril 2026 — Badge "Droits complets" dans PermissionsGrid
- **`PermissionsGrid.jsx`** : 
  - Ligne en fond ambre + label en gras dès que `edit === true` sur le module
  - Badge pill ambre "Droits complets" (icône ShieldCheck) affiché inline dans la colonne Module
  - Compteur en haut "N module(s) en droits complets" visible globalement
  - Note explicative ambre en bas : "Droits complets : l'activation de l'Édition sur un module confère à l'utilisateur les mêmes droits qu'un administrateur sur cette page"
  - data-testid ajoutés sur les lignes et badges pour testabilité
- Validé visuellement par screenshot : dialog "Modifier les permissions" affiche correctement tous les badges

### Session 14 avril 2026 — Extension isAdminForModule aux modules DI, Améliorations, Plans d'amélioration
- **`InterventionRequests.jsx`** : import `usePermissions`, `isAdminForModule('interventionRequests')` et `canDeletePerm('interventionRequests')` remplacent les checks `role === 'ADMIN'` pour `canConvert` et `canDelete`
- **`ImprovementRequests.jsx`** : import `usePermissions`, `isAdminForModule('improvementRequests')` pour `canValidate` (validation) et `canConvert` (conversion en plan d'amélioration)
- **`PreventiveMaintenance.jsx`** : déjà correct — utilise `permissions.preventiveMaintenance.edit/delete` directement depuis l'objet user → aucun changement nécessaire
- **`Improvements.jsx`** / composants : aucun check admin explicite → déjà géré via `ImprovementDialog.jsx` (session précédente)
- Lint ✅ toutes les pages

### Session 14 avril 2026 — Permissions basées sur les modules (isAdminForModule)
- **`usePermissions.js`** : ajout de `isAdminForModule(module)` — retourne `true` si admin global OU si `permissions[module].edit === true`. Exporté dans le hook.
- **`WorkOrderDialog.jsx`** : `isAdmin()` → `isAdminForModule('workOrders')` (2 occurrences : `canManageTimeEntries` et affichage boutons commentaires)
- **`ImprovementDialog.jsx`** : `canManageTimeEntries` utilise `isAdminForModule('improvements')`
- **`ConsignationsLOTO.jsx`** : boutons de validation consignation → `isAdminForModule('consignationsLoto')`
- **`Documentations.jsx`** : bouton "Modèles" → `isAdminForModule('documentations')` + ajout import `usePermissions`
- Testé : technicien avec `workOrders.edit=True` obtient les droits admin sur la page OT ✅

### Session 14 avril 2026 — Fix template contamination + email avec PJ
- **Bug 1 (template contamination)** : `ExplorerView.jsx` — ajout de `newAutoKey` (counter) incrémenté à chaque ouverture d'un dialog vierge → `key={editAutoData?.id || \`new-auto-${newAutoKey}\`}` force le remontage complet du dialog, empêchant la réutilisation de l'état précédent
- **Bug 2 (email sans PJ)** : Remplacement des 3 blocs `mailto:` (document, bon, autorisation) dans `FullContextMenu` par l'ouverture du dialog FSAO → `onShareEmail(item, type)`. Backend `/share-email` étendu :
  - `document` : pièce jointe depuis le fichier disque (existant)
  - `bon` : génération HTML via `generate_bon_travail_html` + conversion PDF WeasyPrint
  - `autorisation` : génération HTML via `generate_autorisation_v4_html` + conversion PDF WeasyPrint
  - `weasyprint==68.1` ajouté à requirements.txt
- Tests : bon ✅ / autorisation ✅ — emails envoyés avec PJ PDF

### Session 14 avril 2026 — Nettoyage ancien formulaire AutorisationParticuliereForm
- Suppression de `AutorisationParticuliereForm.jsx` (674 lignes, formulaire obsolète)
- Suppression de l'import dans `App.js`
- Suppression des routes `/autorisations-particulieres/new` et `/autorisations-particulieres/edit/:id`
- La route `/autorisations-particulieres` (liste) pointe toujours vers `AutorisationParticuliereView` qui ouvre le dialog V4
- Lint ✅ — aucune référence résiduelle

### Session 14 avril 2026 — Envoyer vers / Copier / Déplacer / Permissions pour autorisations et bons
- `copy_node` : ajout des cas `'bon'` (db.bons_travail) et `'autorisation'` (db.autorisations_particulieres) pour copie vers autre pôle/dossier
- `move_node` : idem pour déplacement (couper-coller)
- `toggle_permissions` : sélection de collection généralisée (document → db.documents, folder → db.doc_folders, bon → db.bons_travail, autorisation → db.autorisations_particulieres)
- `send_to_pole` bénéficie automatiquement des fixes via son appel à `copy_node`
- Tests : copy ✅ / move ✅ / permissions toggle ✅
- P2 "Sous-équipement dans liste DI" : déjà implémenté (colonne présente ligne 284 d'InterventionRequests.jsx, données peuplées par le backend)

### Session 14 avril 2026 (fork) — Menu contextuel autorisation particulière
- **Fix : menu contextuel manquant sur les autorisations** dans `ExplorerView.jsx` → ajout du cas `itemType === 'autorisation'` dans `FullContextMenu` avec toutes les actions : Voir/Modifier, Imprimer, Copier, Couper, Coller, Envoyer vers, Partager email/FSAO, permissions admin, Renommer, Supprimer
- Backend : ajout de `DELETE /documentations/autorisations-particulieres/{id}` et `PATCH /documentations/autorisations-particulieres/{id}` dans `documentations_routes.py`
- Frontend `api.js` : ajout de `deleteAutorisation` et `updateAutorisation` dans `documentationsAPI`
- Handlers mis à jour : `handleDelete`, `handlePrint`, rename handler — tous gèrent désormais `'autorisation'`
- Tests API : Créer ✅ / Renommer ✅ / Supprimer ✅

### Session 14 avril 2026 (fork) — Correctifs Autorisation Particulière — Fix ExplorerView
- **Fix bug sauvegarde dans répertoire** : 
  - Backend `save_autorisation_v4` : ajout du champ `folder_id` dans le document MongoDB (exclusion de `folder_id` du `form_data`)
  - Backend `get_explorer_contents` : query de `autorisations_particulieres` filtrée par `folder_id` (même logique que `documents`), ajoutée à la réponse JSON
  - Frontend `AutorisationParticulierePrintDialog` : prop `folderId` acceptée et incluse dans le payload de sauvegarde
  - Frontend `ExplorerView` : state `editAutoData`, rendu des autorisations (couleur amber), double-clic pour édition, prop `folderId={currentFolderId}` transmise, callback `onSaved` recharge l'explorateur du dossier courant
  - Résultat vérifié par test API : autorisation sauvegardée dans un sous-dossier, retrouvée dans l'explorateur du même sous-dossier ✅

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
