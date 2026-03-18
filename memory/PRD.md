# FSAO Iris - GMAO (Gestion de Maintenance Assistée par Ordinateur)

## Description
Application web PWA de gestion de maintenance industrielle. Frontend React + Backend FastAPI + MongoDB.

## Utilisateurs
- **ADMIN** : Gestion complète
- **TECHNICIEN** : Ordres de travail, interventions
- **DEMANDEUR** : Demandes d'intervention

## Architecture
- Frontend: React (CRA) + Shadcn/UI + TailwindCSS
- Backend: FastAPI + Motor (async MongoDB)
- DB: MongoDB (gmao_iris)
- Push: Web Push VAPID (PWA) + Expo Push (mobile)

## Fonctionnalités principales
- Ordres de travail (OT) : création, assignation, suivi, clôture
- Demandes d'intervention (DI) : création, conversion en OT
- Équipements : gestion, statut, historique
- Maintenance préventive : planification, planning
- Notifications push : Web (PWA) et Mobile (Expo)
- Chat live, inventaire, rapports, etc.

## Authentification
- JWT Bearer token (champ `access_token` dans la réponse login)
- Compte admin: buenogy@gmail.com / Admin2024!

## État actuel - Mars 2026

### Complété
- Bug P0 écran blanc (AssigneeSelector) — Corrigé
- Bug validation OT (UUID vs ObjectId) — Corrigé
- Bug lightbox photo (React Portal) — Corrigé
- Bugs PWA mobile (visite guidée, safe area) — Corrigés
- Index uniques MongoDB (25 collections) — Mis en place
- **Bug P0 Notifications (web + PWA)** — Corrigé (18/03/2026)
  - `notifications.py` L.147: `if not _db` → `if _db is None:` (crash PyMongo)
  - `usePWA.js`: syncWithBackend + forceResubscribe au chargement
  - `Settings.jsx`: Bouton test/renouvellement notifications
  - `sw.js`: tag + requireInteraction dans les options push
- **P4 Déduplication services** — Corrigé (18/03/2026)
  - `service_responsables`: 'Maintenance' → 'MAINTENANCE'

### Tâches à venir
- **(P2)** Corriger la logique de détection des membres d'un service (notifier tous les membres, pas seulement les responsables)
- **(P3)** Tester le script de mise à jour `MAJ_FSAO.sh` (à la demande de l'utilisateur)

### Backlog
- Dédupliquer d'autres inconsistances de casse dans les collections si nécessaire

## Clés d'API
- VAPID keys dans backend/.env
- MongoDB: mongodb://localhost:27017 / DB: gmao_iris
