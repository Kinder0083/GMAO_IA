# FSAO Iris - GMAO (Gestion de Maintenance Assistée par Ordinateur)

## Description
Application web PWA de gestion de maintenance industrielle. Frontend React + Backend FastAPI + MongoDB.

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
  - Bell icon: envoie Expo + Web Push (avant: Expo seulement)
  - Diagnostic détaillé + purge inactifs dans Santé Système
- **P4 Déduplication services** + normalisation casse — Corrigé
- **Monitoring Santé Notifications** — Implémenté
- **P2 Logique membres service** — Corrigé
- **Champ "Temps estimé" dans conversion DI → OT** — Implémenté (18/03/2026)
  - ConvertToWorkOrderDialog: champ "Durée de réalisation estimée (heures)" ajouté
  - Backend: paramètre `temps_estime` dans convert-to-work-order → stocké dans `tempsEstime`

### Tâches à venir
- **(P3)** Tester le script de mise à jour `MAJ_FSAO.sh` (à la demande de l'utilisateur)
