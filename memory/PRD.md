# FSAO Iris - GMAO (Gestion de Maintenance Assistee par Ordinateur)

## Description
Application GMAO complete pour la gestion de maintenance industrielle, incluant ordres de travail, equipements, maintenance preventive, notifications push, chat en temps reel, et bien plus.

## Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS
- **Backend**: FastAPI + Motor (MongoDB async)
- **Base de donnees**: MongoDB
- **Notifications**: Web Push (VAPID) + Expo Push (mobile)
- **Temps reel**: WebSocket

## Fonctionnalites principales
- Gestion des ordres de travail (OT) et demandes d'intervention (DI)
- Maintenance preventive planifiee
- Gestion des equipements et inventaire
- Notifications push (Web + Mobile)
- Chat en temps reel
- Systeme de roles et permissions
- Dashboard IoT/MQTT
- Systeme M.E.S.
- Rapports et analytics

## Taches accomplies

### Sessions precedentes
- Monitoring sante des notifications
- Logique de notification de service (P2) - tous les membres
- Normalisation casse des services (P4)
- Champ temps estime DI->OT

### Session actuelle (18 mars 2026)
- **[P0 CRITIQUE] Fix notifications Web Push** :
  - Analyse comparative complete avec le depot GitHub fonctionnel (https://github.com/Kinder0083/GMAO-PWA/)
  - Cause racine identifiee : boucle de desactivation/reabonnement
  - `usePWA.js` simplifie avec auto-sync au mount (comme version GitHub) + detection changement VAPID
  - `web_push.py` : suppression HTTP 400 de la liste de desactivation (seuls 404 et 410)
  - `sw.js` simplifie pour correspondre a la version GitHub fonctionnelle
  - Migration au demarrage pour reactiver les abonnements desactives par HTTP 400
  - Tous les endpoints API valides (VAPID key, subscribe, test, unsubscribe, dual-channel)

## Backlog
- **(P3)** Tester le script de mise a jour `MAJ_FSAO.sh`

## Fichiers cles notification
- `backend/web_push.py` - Logique d'envoi Web Push
- `backend/notifications.py` - Endpoints notification (Expo + Web Push)
- `backend/server.py` - Endpoints web-push (~lignes 9307-9410), migration reactivation (~lignes 12083-12108)
- `frontend/src/hooks/usePWA.js` - Hook de gestion Push cote client (auto-sync + subscribe + VAPID check)
- `frontend/src/components/shared/PWABanner.jsx` - Auto-subscribe et banniere
- `frontend/public/sw.js` - Service Worker
