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

### Session actuelle (18-20 mars 2026)
- **[P0] Fix notifications Web Push** : Simplification usePWA.js + web_push.py + sw.js
- **[BUG] Fix "vous ne pouvez modifier que votre propre statut"** : UUID vs ObjectId
- **[BUG] Fix compteur DI dashboard** : Exclusion des DI soft-deleted
- **[BUG] Fix equipements filtres par service** : Suppression du filtre service
- **[FEATURE] Refonte page Rapports** :
  - Pointage : vue tableau par defaut, OT supprimes exclus, lignes vides masquees, fix timestamp string
  - Suppression widget "Tendance des couts de maintenance" (donnees fictives)
  - Widget "Taux de realisation" : OT termines / total OT du mois
  - Widget "MTTR - Temps avant realisation" : moyenne creation -> termine
  - Widget "Maintenances preventives" : realise/total/pourcentage du mois
  - Widget "Maintenances correctives" : realise/total/pourcentage du mois

## Backlog
- **(P3)** Tester le script de mise a jour `MAJ_FSAO.sh`
