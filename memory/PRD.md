# PRD — GMAO Iris (CMMS / MES)

## Original problem statement
Application full-stack CMMS (Computerized Maintenance Management System) avec module M.E.S
(Manufacturing Execution System) pour ~25 machines en production 24/7 (3x8 shifts).
Stack : React + FastAPI + MongoDB + MQTT + ESP32 edge-computing.

## Personas
- Admin / Responsable maintenance : pilotage Dashboard, OT, MAJ planning.
- Technicien maintenance : exécution OT, suivi maintenance préventive.
- Production / Direction : Rapports M.E.S, TRS, top/flop, shifts.

## Architecture
- ESP32 calcule la cadence (cp/min) localement et publie sur MQTT (state, total, shift_end).
- Backend ne stocke plus de pulses bruts → agrégations directes (`mes_cadence_history`,
  `mes_daily_summary`, `mes_shift_summary`).
- Timezone géré via Python `zoneinfo` (DST automatique).

## Implémenté (CHANGELOG résumé)
- 2026-Q1 : M.E.S cp/min + état explicite + Parent/Sous-équipement
- 2026-Q1 : Timezone DST automatique (`timezone_helper.py`)
- 2026-Q1 : Migration architecture M.E.S vers ESP32 (suppression `mes_pulses`)
- 2026-Q1 : Indexes M.E.S, fix erreur 500 `QueryExceededMemoryLimitNoDiskUseAllowed`
- 2026-Q1 : Délai de rétention M.E.S configurable depuis l'UI
- 2026-Q1 : Rapports 3x8 shifts (`mes_shift_summary`)
- 2026-Q1 : Refonte page Rapports M.E.S — Vue d'ensemble, Top/Flop, Heatmap
- 2026-04-30 : **Fix widget "Charge OT restante"** — `_compute_time_widgets` ne filtre
  plus sur le champ legacy `actif` (souvent stale), uniquement sur `statut`. Ajout
  scripts `cleanup_user_actif_field.py` et `dedupe_service_responsables.py`.
- 2026-04-30 : **Panneau "Cohérence des données"** dans Paramètres spéciaux
  (admin only). Scan + simulation + réparation des incohérences connues
  (actif↔statut, doublons service_responsables). Routes
  `GET /api/admin/data-integrity/scan` et `POST /api/admin/data-integrity/repair`.
  Extensible : ajouter un nouveau check = 1 entrée dans le dict `CHECKS`
  de `routes/data_integrity.py`.
- 2026-04-30 : **Scan cohérence automatique quotidien** à 02h30 (APScheduler)
  + email d'alerte si issues détectées via `health_alert_service` (type
  `data_integrity`, cooldown 24h). Card "Cohérence des données" sur
  `/system-health` avec scan on-demand. Nouveau type d'alerte configurable
  dans la section Alertes Email. Endpoint `GET /admin/data-integrity/last-scan`.
- 2026-04-30 : **Fix bug "Pointage horaire du personnel"** (rapports). Les
  modifications de date sur les time_entries d'OT/amélioration n'étaient
  plus remontées au rapport après modification legacy (timestamp stocké en
  string). Ajout du check `time_entries_integrity` qui détecte et répare :
  timestamp en string → datetime, user_id non-canonique → canonique,
  user_id orphelin → marquage `user_name='[Utilisateur supprimé]'`
  (conservation de l'historique). Intégré au panneau Cohérence des données.
- 2026-04-30 : **Badge topbar Cohérence des données** (admin only).
  Composant `DataIntegrityHeaderIcon` qui affiche compteur orange si
  actionable_issues > 0, click → /system-health. Refresh auto 5min.
  Intégré au registry HEADER_ICONS_REGISTRY avec module='__admin__'.
- 2026-04-30 : **Check informational `orphan_user_assignments`**. Liste les
  OT, améliorations et maintenances préventives ayant des pointages assignés
  à un utilisateur supprimé. Pas de réparation auto : tableau groupé par
  type avec lien `Ouvrir →` qui navigue vers `/work-orders?open=<uuid>` ou
  `/improvements?open=<uuid>` pour réassignation manuelle. Le badge topbar
  exclut les checks informational du compteur (uniquement actionable_issues).
- 2026-04-30 : **Modal "Réassigner pointages orphelins"** dans le panneau
  Cohérence des données. Bouton "Réassigner" sur chaque ligne d'OT/amélioration
  ouvre un modal listant les pointages concernés + Select des users actifs.
  Réassignation en masse (loop sur `PUT /<col>/{id}/time-entries/{entry_id}`),
  toast progressif (succès/partiel/échec), re-scan auto après succès.
  Composant `OrphanReassignDialog.jsx`.
- 2026-04-30 : **Documentation v1.12.0**. README.md bumpé à 1.12.0 avec sections
  enrichies (M.E.S. ESP32, Cohérence, DST). CHANGELOG.md complet pour Avril 2026.
  `gmao-iris-install.sh` v1.12.0 — création auto des index MongoDB en install fraîche
  + post-update.sh re-vérifie les index à chaque `git pull`. Manuel utilisateur :
  +1 chapitre `ch-coherence-data` (3 sections) + sections M.E.S. ESP32 et
  Rapports Vue d'ensemble. Script idempotent
  `scripts/update_manual_default_content.py` pour mises à jour futures.
- 2026-05-01 : **Nouveau check `work_orders_duplicate_numero`**. Détecte les
  OT différents partageant le même numéro humain (#XXXX) — cause signalée en
  prod : désync du compteur atomique MongoDB après reset/import. Réparation
  automatique : OT le plus ancien (par `dateCreation`) garde son numéro, les
  autres sont renumérotés via le compteur ; le compteur global est
  resynchronisé sur le max des numéros existants pour éviter toute collision
  future. Tableau UI avec liens "Ouvrir" vers chaque doublon.
- 2026-05-01 : **Sécurité retry-on-conflict** dans `get_next_work_order_numero()`
  (`/app/backend/routes/shared.py`). Si le compteur atomique tombe sur un numéro
  déjà utilisé (cas après reset/import non détecté), la fonction incrémente
  jusqu'à trouver un libre (max 100 tentatives avec saut de 1000 en fallback).
  Garantit l'unicité même sans utiliser le check de cohérence.
- 2026-05-01 : **Sécurité retry-on-conflict étendue** aux 3 autres générateurs
  de numéros : `get_next_improvement_numero()` (améliorations), 
  `get_next_purchase_request_numero(year)` (DA-YYYY-XXXXX, compteur annuel), et
  `get_next_loto_numero()` (LOTO-XXXX). Helper générique 
  `_get_next_atomic_numero()` factorise le pattern. Migration automatique :
  initialisation au max existant à la première utilisation. Refactor des
  consommateurs : `routes/improvements.py`, `purchase_request_routes.py`,
  `qr_inventory_routes.py`, `routes/inventory.py`, `loto_routes.py`. Tous les
  numéros (OT, améliorations, DA, LOTO) sont maintenant protégés contre les
  collisions, même en cas de reset/import/migration.
- 2026-05-01 : **Déplacement de zones via menu contextuel**. Sur Ctrl+clic-droit
  sur une carte de zone (page Zones), nouvelle option **« Déplacer vers... »** en
  tête de menu. Sous-menu déroulant au hover affichant l'arborescence complète
  des zones cibles (avec indentation par niveau, exclusion des descendants pour
  éviter les cycles, option spéciale "Zone racine"). Click instantané = move
  temps réel via API (broadcast WebSocket existant). Backend renforcé : détection
  cycles (zone vers descendant), auto-référence interdite, profondeur max 3
  niveaux conservée, support `parent_id=""` pour désigner la racine. Composants :
  `GlobalContextMenu.jsx` (logique sous-menu), `Locations.jsx` (attributs
  `data-zone-*` sur les cards), `routes/locations.py` (validations).
- 2026-05-01 : **Parité formulaire « Nouvelle demande d'amélioration »** avec
  les demandes d'intervention. Le champ Équipement ne propose désormais que les
  équipements parents (via `equipmentsAPI.getParents`). Quand un parent avec
  enfants est sélectionné, un nouveau champ **Sous-équipement** apparaît
  conditionnellement avec la liste de ses enfants (chargée via
  `/api/equipments/{id}/children`). L'emplacement est auto-rempli depuis
  l'équipement parent (label *(rempli automatiquement)*). Section **Joindre
  des fichiers** ajoutée : drag & drop, bouton **Parcourir**, bouton
  **Appareil photo** (capture caméra mobile), miniatures de prévisualisation
  pour les images, suppression individuelle, modal de visualisation plein
  écran. Limite 25MB par fichier, compression image automatique côté backend.
  Backend : ajout constante `MAX_FILE_SIZE` dans `routes/improvements.py`,
  nouvelle route `DELETE /api/improvement-requests/{id}/attachments/{attachment_id}`,
  route `GET` dual-mode (par filename ou attachment_id UUID), correction du
  PUT (`model_dump(exclude_unset=True)`) pour permettre la déassignation
  explicite de `sous_equipement_id` à `null`. Frontend : refonte complète
  de `ImprovementRequestFormDialog.jsx` calquée sur
  `InterventionRequestFormDialog.jsx`. Ajout de `deleteAttachment` dans
  `improvementRequestsAPI`.
- 2026-05-01 : **Recopie automatique des pièces jointes lors de la conversion
  DI → Amélioration**. Quand une demande d'amélioration est convertie en
  amélioration via `POST /api/improvement-requests/{id}/convert-to-improvement`,
  toutes les PJ attachées à la demande sont désormais physiquement copiées dans
  `/app/backend/uploads/improvements/` avec un nouvel UUID (isolation totale :
  suppression d'une PJ côté amélioration ne touche pas la demande, et vice
  versa). La copie est non-bloquante (try/except logger) : un échec de copie
  fichier n'empêche pas la conversion. Champ tracé `copied_from_request` ajouté
  sur chaque PJ recopiée pour audit. Le technicien voit immédiatement les
  photos contextuelles dans l'amélioration sans avoir à revenir sur la DI.
- 2026-05-01 : **Étapes de réalisation** sur OT et améliorations. Nouveau
  composant réutilisable `EtapesRealisationField.jsx` ajouté juste avant la
  section *Joindre des fichiers* dans les formulaires de création/édition
  (`WorkOrderFormDialog`, `ImprovementFormDialog`). Chaque étape : numéro
  auto, textarea auto-redimensionnable, boutons ↑/↓/🗑, drag & drop HTML5
  pour réordonner, bouton "+ Ajouter une étape" en bas. Suppression
  re-numérote les suivantes. **Verrouillage** : une étape cochée par un
  technicien ne peut plus être modifiée, déplacée ni supprimée par l'admin
  — uniquement ajout d'étapes en fin de liste autorisé. **Réouverture
  automatique du statut** : si l'admin ajoute une nouvelle étape sur un
  OT/amélioration au statut `TERMINE`, celui-ci repasse en `OUVERT` avec
  `dateTermine=null`. **Mot-clé "checklist"** : si l'utilisateur saisit
  "checklist" dans une étape et quitte le champ (blur), un nouveau dialogue
  `ChecklistPickerDialog` propose les templates disponibles (avec mise en
  avant des checklists liées à l'équipement). Sélection → l'étape est
  préfixée par "Checklist : <nom> — <texte>" + badge violet + champs
  `checklist_template_id` / `checklist_template_name` stockés. **Vue
  détail** : nouveau composant `EtapesRealisationViewer.jsx` affiche les
  étapes avec checkboxes interactives + barre de progression (X/Y, %).
  Bouton "Exécuter" sur chaque étape liée à une checklist ouvre
  `ChecklistExecutionDialog` en `mode="etape"` (ne termine pas l'OT, juste
  l'étape). À la fin de l'exécution, l'étape est **automatiquement cochée**
  côté backend (PUT `/api/checklists/executions/{id}` avec
  `status=completed` détecte l'étape liée via `checklist_template_id`).
  Backend : nouveau module `routes/etapes_helper.py` (fonctions
  `normalize_etapes`, `merge_etapes_with_lock`, `mark_etape_completed`,
  `mark_etape_uncompleted`), routes `POST /work-orders/{id}/etapes/{eid}/toggle`
  et `POST /improvements/{id}/etapes/{eid}/toggle` (toggle protégé : seul
  l'auteur ou un admin peut décocher), modèles `WorkOrder`, `Improvement`,
  `ChecklistExecutionCreate`/`Base` enrichis avec `etapes_realisation` et
  `improvement_id`. Tests pytest 8/8 PASS.
- 2026-05-01 : **Filtrage des utilisateurs inactifs sur le Planning**.
  `usePlanning.js` utilise désormais `usersAPI.getActive()` au lieu de
  `getAll()` — exclut tout utilisateur au statut `inactif` de la liste du
  Planning du Personnel.
- 2026-05-01 : **Activité Maintenance** — nouveau menu Planning à 2 onglets.
  L'onglet **Rythme** conserve le Planning du Personnel actuel.
  Le nouvel onglet **Activité Maintenance** est un planificateur de charge
  pour les techniciens du service Maintenance. Vues toggle Semaine (Lun-Dim)
  / Jour avec navigation prev/today/next. Bandeau récap équipe en haut
  (Techniciens / Capacité / Planifié / Surcharges). Grille avec 1 ligne par
  technicien et barre de charge journalière colorée
  (vert ≤7h, jaune 7-8h, rouge clignotant >8h). Pool latéral de tâches non
  affectées (OT/Améliorations/MP non terminés) avec recherche, filtres et
  drag & drop vers les cellules. Bouton **+ Ajouter** sur chaque cellule
  ouvre un `AssignmentDialog` qui supporte 5 types : WORK_ORDER, IMPROVEMENT,
  PREVENTIVE_MAINTENANCE (avec sélection de référence depuis le pool),
  FREE_TASK (titre + desc + durée + catégorie REUNION/FORMATION/ASTREINTE/AUTRE +
  couleur auto), CONGE. La création d'un CONGE crée automatiquement la
  disponibilité `disponible=False` correspondante (sync bidirectionnelle
  avec l'onglet Rythme). Drag & drop pour déplacer une affectation entre
  cellules (changement user_id et date). Bouton **Auto-fit** propose une
  répartition automatique des éléments du pool sur la période en respectant
  la capacité 8h/jour et les indispos. Backend : nouveau module
  `routes/maintenance_assignments.py` avec CRUD, `unassigned-pool` et
  `auto-suggest` (apply=true pour créer). Modèles
  `MaintenanceAssignment*` ajoutés à `models.py`. Permissions :
  ADMIN, responsable service Maintenance, ou utilisateurs avec
  `planning.admin`/`planning.edit` peuvent créer/modifier/supprimer.
  Tests pytest **11/11 PASS**, frontend testing agent OK end-to-end.
- 2026-05-01 : **Étapes de réalisation dans PDF + push notifs**. Le bouton
  "Télécharger PDF" du `WorkOrderDialog` génère désormais une section
  dédiée "Etapes de realisation (X/Y)" avec checkbox visuelle, numérotation,
  description, info de validation (qui/quand) et lien vers checklist
  associée le cas échéant — insérée juste avant la section "Rapport
  detaille". Les push notifications d'assignation d'OT ajoutent un suffixe
  `· N étape(s)` au body (POST, PUT initial, et changement d'assignee).
- 2026-05-01 : **Onglets Activité multi-services dynamiques**. `PlanningHub`
  charge les utilisateurs actifs et génère automatiquement un onglet
  "Activité <Service>" pour chaque service (parmi MAINTENANCE / PRODUCTION
  / QHSE / LOGISTIQUE / LABO) ayant au moins 1 user actif. Maintenance
  reste prioritaire (toujours en premier, même sans user). La page
  `ActiviteMaintenance.jsx` accepte désormais un prop `service` et est
  réutilisable telle quelle pour tous les services.
- 2026-05-01 : **Sync inverse CONGE ← availability**. Nouveau module
  `routes/conge_sync.py` (`sync_availability_to_conge`,
  `cleanup_conge_for_availability`) appelé par les routes
  `/api/availabilities` POST/PUT/DELETE. Quand un user MAINTENANCE est
  marqué `disponible=False` dans le Rythme, un assignment CONGE
  `auto_generated=true` lié par `linked_availability_id` est créé
  automatiquement (8h, gris). La suppression de l'avail supprime le CONGE
  auto. Le passage à `disponible=True` supprime aussi le CONGE auto. Tests
  pytest 9/9 PASS.
- 2026-05-01 : **Vue Charge globale 30j**. Nouveau sous-onglet dans Activité
  Maintenance : `ChargeGlobaleView.jsx` affiche un graphique Recharts à
  barres empilées (OT / Amélioration / M.Préventive / Tâches libres /
  Congés) sur 30 jours glissants, avec ligne de référence rouge =
  capacité de l'équipe (nb_techs × 8h). Tooltip détaillé par jour, mise
  en sourdine des week-ends. Bandeau stats au-dessus : période, capacité
  totale, planifié + occupation (%), jours en surcharge.
- 2026-05-01 : **Export PDF de la Charge globale** (bouton "Exporter en
  PDF" en haut à droite). html2canvas + jsPDF côté frontend, A4 paysage,
  header daté + image du graphique + footer "GMAO Iris". Nom de fichier :
  `Charge-Globale-<SERVICE>-<YYYY-MM-DD>.pdf`.
- 2026-05-01 : **Hardening Activité Maintenance**. (1) Dans
  `AssignmentDialog`, le clic sur un type (WORK_ORDER/IMPROVEMENT/PM…)
  réinitialise la référence sélectionnée et la barre de recherche pour
  éviter une référence stale du type précédent. La validation utilise
  désormais `selectedRefItem` (référence présente dans le pool ET du bon
  type) en plus de `selectedRefId`, supprimant le faux positif "Référence
  requise" lorsqu'on enchaîne plusieurs types. (2) Cell rendering rendu
  null-safe : fallback FREE_TASK sur `meta`, key fallback, defaut
  '(Sans titre)' et 0h. (3) Nouveau composant `ActiviteErrorBoundary`
  qui isole les erreurs au sous-arbre Activité (au lieu de l'écran
  blanc complet) avec bouton "Recharger la page".

## Backlog priorisé
### P1
- (en attente vérif user) Validation prod du fix widget Charge OT restante.
- (en attente vérif user) Exécution scripts cleanup_user_actif_field & dedupe_service_responsables.

### P2
- Test du script `MAJ_FSAO.sh`.
- Export PDF/Excel filtré pour Historique d'Achat.
- Presets favoris pour Rapports M.E.S.
- Export PDF "Vue d'ensemble" Rapports M.E.S.
- Notifs proactives si TRS site < seuil.

## Fichiers clés
- `/app/backend/server.py` — `_compute_time_widgets` ligne ~565
- `/app/backend/mes_service.py` — agrégations ESP32
- `/app/backend/mes_routes.py` — endpoint `/api/mes/reports/overview`
- `/app/backend/timezone_helper.py` — DST
- `/app/backend/scripts/diagnose_charge_ot_widget.py` — diagnostic widget
- `/app/backend/scripts/cleanup_user_actif_field.py` — resync `actif` <- `statut`
- `/app/backend/scripts/dedupe_service_responsables.py` — dédoublonnage responsables
- `/app/frontend/src/pages/MESReportsPage.jsx` — Rapports M.E.S
- `/app/frontend/src/components/Settings/TimezoneSettings.jsx`

## Credentials
Voir `/app/memory/test_credentials.md`.

## Workflow déploiement
Le user opère un Proxmox indépendant : développement ici → `git push` → user fait
`git pull` sur Proxmox + restart service. Les migrations / diagnostics sont fournis
sous forme de scripts Python avec `--dry-run` par défaut.
