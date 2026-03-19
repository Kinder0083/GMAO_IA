# FSAO Iris - GMAO

## Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS
- **Backend**: FastAPI + Motor (MongoDB async)
- **Base de donnees**: MongoDB

## Taches accomplies

### Sessions precedentes
- Monitoring sante des notifications
- Logique de notification de service (P2)
- Normalisation casse des services (P4)
- Champ temps estime DI->OT

### Session actuelle (18 mars 2026)
- **[P0] Fix notifications Web Push** : Simplification usePWA.js + web_push.py + sw.js + migration reactivation HTTP 400
- **[BUG] Fix "vous ne pouvez modifier que votre propre statut"** : Comparaison UUID vs ObjectId dans set-password-permanent
- **[BUG] Fix compteur DI dashboard** : Exclusion des DI soft-deleted dans le KPI et le dashboard service

## Backlog
- **(P3)** Tester le script de mise a jour `MAJ_FSAO.sh`
