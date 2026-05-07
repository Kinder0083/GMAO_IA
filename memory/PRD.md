# PRD - GMAO Iris

## Problem statement original
Application GMAO/CMMS full-stack (React + FastAPI + MongoDB) pour gérer interventions, améliorations, maintenances préventives, planning d'équipe, achats, MES, formations, accidents.

## Personas
- ADMIN
- Responsables service (Maintenance, Production, QHSE...)
- Techniciens

## Modules clés
- Ordres de Travail (OT) avec étapes de réalisation
- Améliorations avec étapes de réalisation
- Maintenance Préventive
- Planning : "Rythme" (disponibilités) + "Activité Maintenance" (charge équipe DnD)
- Charge globale 30 jours (graphique + export PDF)
- Achats / Historique
- **MES (Manufacturing Execution System) + IA d'auto-mapping JSON** ← nouveau
- Accidents
- Notifications, Audit, Rôles & Permissions

## Last update (7 May 2026 — fork)

### P0 résolus
- Crash écran blanc DnD Activité Maintenance (3 corrections : interceptor axios, payload, pool)
- Doublons d'affectation OT/Amél/PM (frontend + 409 backend POST/PUT)
- GlobalErrorBoundary : fallback rouge global
- Pool visuel "déjà planifié" (gris + barré + badge)
- HoverCard "Voir l'OT" → vue (non édition) via `?view=`

### P1 livrés (MES + IA d'auto-mapping)
- Nouveau **mode payload `JSON_UNIFIED`** sur les machines MES (en alternative au mode `MULTI_TOPIC` historique).
- **IA d'auto-mapping** (Claude Sonnet 4.5 via Emergent Universal Key) :
  - `POST /api/mes/ai/analyze-payload` : analyse un payload JSON, retourne mapping détecté avec target métier (cadence, total, state, oee, temperature, …) + heuristique en fallback.
  - `POST /api/mes/ai/sniff-mqtt` : capture live ≥ 95s sur un topic via la collection `mqtt_messages`.
  - `GET/PUT /api/mes/ai/config` : config admin (modèle, provider, enabled).
  - `POST /api/mes/ai/test-mapping/{machine_id}` : valide le mapping sur le dernier message reçu.
- **Formulaire "vivant"** :
  - Toggle "Mode classique / JSON unifié + IA" dans `Ajouter une machine` et `Paramètres machine`.
  - Modale `PayloadDetectionDialog` avec 2 onglets (coller exemple / capture live) et checkboxes par champ détecté.
  - Bouton **"Tester le mapping"** : payload brut + valeurs extraites côte à côte.
  - L'utilisateur ajoute des champs custom via checkbox SANS reprogrammer.
- **Section Paramètres spéciaux** : `MESAIModelSettings` (sélection modèle LLM + on/off).
- **Backend collector** (`mes_service._record_unified_sync`) parse le JSON, applique les mappings, stocke dans `live_values`, et route cadence/total/state/shift_end vers les handlers existants pour préserver TRS / rapports.

## Backlog
- P2 : Filtres rapides checkboxes "OT/Amél/PM/Cacher congés" sur Planning
- P2 : Test script `MAJ_FSAO.sh`
- P2 : Export PDF/Excel du panneau de filtre Historique d'Achat
- P2 : Presets favoris Rapports MES
- P2 : Export PDF "Vue d'ensemble" Rapport MES
- P2 : Notifications proactives si TRS < seuil
- P3 : Affichage des `live_values` étendus sur la fiche machine MES (température, OEE, etc. au-delà des 3 KPIs historiques)
