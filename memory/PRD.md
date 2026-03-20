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

### Session 18-20 mars 2026
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

### Session 20 mars 2026 (fork)
- **[FEATURE] Edition/Suppression des temps et commentaires (OT) - Admin only**
  - 4 endpoints backend: PUT/DELETE /work-orders/{id}/time-entries/{entry_id}, PUT/DELETE /work-orders/{id}/comments/{comment_id}
  - Affichage de l'historique des time_entries dans WorkOrderDialog
  - Icones crayon (edit) et poubelle (delete) visibles uniquement pour les admins
  - Edition inline des temps et commentaires
  - Recalcul automatique du tempsReel lors de modification/suppression
  - Modele WorkOrder enrichi avec time_entries
  - Tests: 100% backend (9/9), 100% frontend

## Backlog
- **(P3)** Tester le script de mise a jour `MAJ_FSAO.sh`
- Refactoring potentiel de server.py (13000+ lignes) en routeurs separes
