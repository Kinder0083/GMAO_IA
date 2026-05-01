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
- MES (TRS, alarmes)
- Accidents
- Notifications, Audit, Rôles & Permissions

## Last update (1 May 2026 — fork)
### P0 résolu
- Crash "Écran blanc" lors du drag & drop OT/IMP/PM dans Activité Maintenance.
  - Cause : backend renvoyait `title: null` parfois → 422 → React Error #31 sur rendu d'array `detail`.
  - Fix : (1) intercepteur axios normalise `detail` en string, (2) `ActiviteMaintenance.handleDrop` sécurise le payload (titre fallback, durée numérique), (3) endpoint pool back-end fournit titre fallback + skip items sans id.

## Backlog
- P1 : Filtres rapides checkboxes "OT seulement / Amél. seulement / PM seulement / Cacher congés" sur Planning.
- P2 : Test script `MAJ_FSAO.sh`
- P2 : Export PDF/Excel du panneau de filtre Historique d'Achat
- P2 : Presets favoris Rapports MES
- P2 : Export PDF "Vue d'ensemble" Rapport MES
- P2 : Notifications proactives si TRS < seuil
