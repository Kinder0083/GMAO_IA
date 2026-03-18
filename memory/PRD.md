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
  - `notifications.py`: `if not _db` → `if _db is None:`
  - `usePWA.js`: syncWithBackend + forceResubscribe
  - `Settings.jsx`: Bouton test/renouvellement
- **P4 Déduplication services** — Corrigé (18/03/2026)
  - `service_responsables`: 'Maintenance' → 'MAINTENANCE'
- **Monitoring Santé Notifications** — Implémenté (18/03/2026)
  - Backend: 3 endpoints + cron 30 min + alerte admin
  - Frontend: Carte + section détaillée dans Santé Système
- **P2 Logique membres service** — Corrigé (18/03/2026)
  - `notify_service_assignment()`: utilise `users.service` (regex insensible casse) au lieu de `service_responsables`
  - `/assignment-targets`: compte les vrais membres actifs depuis `users.service`
  - MAINTENANCE : 4 membres notifiés au lieu de 2 responsables
  - `service_responsables` reste utilisé pour trouver les *responsables* (manager lookup, email escalation)

### Tâches à venir
- **(P3)** Tester le script de mise à jour `MAJ_FSAO.sh` (à la demande de l'utilisateur)

### Backlog
- Dédupliquer d'autres inconsistances de casse dans les collections si nécessaire
