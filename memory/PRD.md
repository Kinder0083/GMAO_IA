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
