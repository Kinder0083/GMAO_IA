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
- **[P0] Fix notifications Web Push**
- **[BUG] Fix "vous ne pouvez modifier que votre propre statut"**
- **[BUG] Fix compteur DI dashboard** : Exclusion DI soft-deleted
- **[BUG] Fix equipements filtres par service**
- **[FEATURE] Refonte page Rapports** : Widgets KPI reels + pointage ameliore
- **[FEATURE] Pointage horaire** : Navigation semaines, resume hebdo, export PDF
- **[FEATURE] Compression automatique des images** :
  - Module image_compressor.py (Pillow)
  - Integre dans TOUS les endpoints upload (OT, DI, chat, presqu'accidents, ameliorations, demandes arret)
  - Parametrage dans Parametres Speciaux (resolution max, qualite, format)
  - Transparent pour l'utilisateur
  - Endpoints API: GET/PUT /settings/image-compression

## Backlog
- **(P3)** Tester le script de mise a jour `MAJ_FSAO.sh`
