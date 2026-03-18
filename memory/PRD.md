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
  - `notifications.py`: `if not _db` → `if _db is None:` (crash PyMongo)
  - `usePWA.js`: syncWithBackend + forceResubscribe au chargement (renouvellement auto des abonnements expirés)
  - `Settings.jsx`: Bouton test/renouvellement
  - `sw.js`: tag + requireInteraction dans les options push
  - **Bell icon test double canal**: envoie MAINTENANT Expo + Web Push (avant: Expo seulement)
  - **Diagnostic détaillé**: erreurs récentes visibles dans Santé Système
- **P4 Déduplication services** — Corrigé (18/03/2026)
  - `service_responsables`: 'Maintenance' → 'MAINTENANCE'
  - Normalisation complète des 5 collections (32 documents) vers les majuscules
- **Monitoring Santé Notifications** — Implémenté (18/03/2026)
  - Backend: 4 endpoints + cron 30 min + alerte admin
  - Endpoint purge des abonnements inactifs
  - Frontend: Section détaillée avec 5 indicateurs, erreurs récentes, historique, bouton purge
- **P2 Logique membres service** — Corrigé (18/03/2026)
  - `notify_service_assignment()`: utilise `users.service` (regex insensible casse)
  - `/assignment-targets`: compte les vrais membres actifs

### Tâches à venir
- **(P3)** Tester le script de mise à jour `MAJ_FSAO.sh` (à la demande de l'utilisateur)

## Points importants pour le déploiement
- **Le code doit être déployé** pour que les corrections prennent effet sur la production
- **Après déploiement**: les utilisateurs qui chargent l'app verront leurs abonnements push automatiquement renouvelés par `usePWA.js`
- **La cloche dans People** teste maintenant les DEUX canaux (Expo + Web Push)
