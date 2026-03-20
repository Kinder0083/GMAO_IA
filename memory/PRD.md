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
  - Widgets KPI recalcules avec donnees reelles
  - Suppression widget "Tendance des couts" (donnees fictives)
  - Taux de realisation, MTTR, M.Prev, M.Corr
- **[FEATURE] Pointage horaire ameliore** :
  - Navigation entre semaines (fleches + affichage semaine)
  - Resume hebdomadaire des heures par categorie
  - Export PDF avec semaine personnalisable
  - Vue tableau par defaut, lignes vides masquees
  - OT supprimes exclus du calcul

## Backlog
- **(P3)** Tester le script de mise a jour `MAJ_FSAO.sh`
