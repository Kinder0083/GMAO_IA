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

### P0 résolus
- **Crash écran blanc DnD Activité Maintenance** : intercepteur axios stringifie `detail`, frontend sécurise payload, backend pool fournit titre fallback.
- **Doublons d'affectation** : un même OT/Amélioration/PM ne peut plus être affecté 2× au même technicien le même jour (guard frontend + 409 backend sur POST et PUT).
- **GlobalErrorBoundary** : fallback visible global (recharger / retour accueil).
- **Pool visuel "déjà planifié"** : dans le panneau latéral, les OT/Amél/PM planifiés sur la période visible sont grisés, barrés, non draggables, avec badge "Planifié ×N" et tooltip détaillant technicien(s) + dates. Nouveau toggle "Masquer déjà planifiés".

## Backlog
- P1 : Filtres rapides checkboxes "OT seulement / Amél. seulement / PM seulement / Cacher congés" sur Planning.
- P2 : Test script `MAJ_FSAO.sh`
- P2 : Export PDF/Excel du panneau de filtre Historique d'Achat
- P2 : Presets favoris Rapports MES
- P2 : Export PDF "Vue d'ensemble" Rapport MES
- P2 : Notifications proactives si TRS < seuil
