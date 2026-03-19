# FSAO Iris - GMAO (Gestion de Maintenance Assistee par Ordinateur)

## Description
Application GMAO complete pour la gestion de maintenance industrielle.

## Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS
- **Backend**: FastAPI + Motor (MongoDB async)
- **Base de donnees**: MongoDB
- **Notifications**: Web Push (VAPID) + Expo Push (mobile)

## Taches accomplies

### Sessions precedentes
- Monitoring sante des notifications
- Logique de notification de service (P2) - tous les membres
- Normalisation casse des services (P4)
- Champ temps estime DI->OT

### Session actuelle (18 mars 2026)
- **[P0] Fix notifications Web Push** : Simplification usePWA.js + web_push.py + sw.js + migration reactivation HTTP 400
- **[BUG] Fix "vous ne pouvez modifier que votre propre statut"** : Comparaison UUID vs ObjectId dans set-password-permanent corrigee

## Backlog
- **(P3)** Tester le script de mise a jour `MAJ_FSAO.sh`
