# FSAO Iris - GMAO (Gestion de Maintenance Assistée par Ordinateur)

## Description
Application GMAO complète pour la gestion de maintenance industrielle, incluant ordres de travail, équipements, maintenance préventive, notifications push, chat en temps réel, et bien plus.

## Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS
- **Backend**: FastAPI + Motor (MongoDB async)
- **Base de données**: MongoDB
- **Notifications**: Web Push (VAPID) + Expo Push (mobile)
- **Temps réel**: WebSocket

## Fonctionnalités principales
- Gestion des ordres de travail (OT) et demandes d'intervention (DI)
- Maintenance préventive planifiée
- Gestion des équipements et inventaire
- Notifications push (Web + Mobile)
- Chat en temps réel
- Système de rôles et permissions
- Dashboard IoT/MQTT
- Système M.E.S.
- Rapports et analytics

## Tâches accomplies

### Session précédente
- Monitoring santé des notifications
- Logique de notification de service (P2) - tous les membres
- Normalisation casse des services (P4)
- Champ temps estimé DI→OT

### Session actuelle (18 mars 2026)
- **[P0 CRITIQUE] Fix notifications Web Push** :
  - Analyse comparative complète avec le dépôt GitHub fonctionnel
  - Identification de la cause racine : boucle de désactivation/réabonnement
  - Simplification de `usePWA.js` (suppression syncWithBackend, VAPID version tracking, force resubscribe)
  - Correction de `web_push.py` : suppression de HTTP 400 de la liste de désactivation (seuls 404 et 410 désactivent)
  - Simplification de `sw.js` pour correspondre à la version GitHub fonctionnelle
  - Migration au démarrage pour réactiver les abonnements injustement désactivés par HTTP 400

## Backlog
- **(P3)** Tester le script de mise à jour `MAJ_FSAO.sh`

## Fichiers clés notification
- `backend/web_push.py` - Logique d'envoi Web Push
- `backend/notifications.py` - Endpoints notification (Expo + Web Push)
- `backend/server.py` - Endpoints web-push (lignes ~9295-9410)
- `frontend/src/hooks/usePWA.js` - Hook de gestion Push côté client
- `frontend/src/components/shared/PWABanner.jsx` - Auto-subscribe et bannière
- `frontend/public/sw.js` - Service Worker
