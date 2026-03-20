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
  - Integre dans TOUS les endpoints upload
  - Parametrage dans Parametres Speciaux
  - Endpoints API: GET/PUT /settings/image-compression

### Session 20 mars 2026 (fork)
- **[FEATURE] Edition/Suppression des temps et commentaires (OT) - Admin only**
  - 4 endpoints backend: PUT/DELETE time-entries, PUT/DELETE comments
  - Historique des time_entries affiché dans WorkOrderDialog
  - Icones crayon/poubelle pour admins, edition inline
  - Recalcul automatique du tempsReel
  - Audit log integre pour toutes les modifications
  - Tests: 100% backend, 100% frontend

- **[FEATURE] Filtres de période fonctionnels sur Rapports & Analytiques**
  - Boutons "Cette semaine/Ce mois/Ce trimestre/Cette année" désormais actifs
  - Backend: GET /reports/analytics accepte param `period` (SEMAINE, MOIS, TRIMESTRE, ANNEE)
  - Filtre appliqué sur: widgets KPI, répartition OT par statut/priorité, MTTR, maintenances
  - Nouvelle colonne "Interventions" dans Performance des équipements (par période)
  - Labels dynamiques reflétant la période sélectionnée
  - Défaut: "Ce mois"
  - Tests: 100% backend (9/9), 100% frontend

## Backlog
- **(P3)** Tester le script de mise a jour `MAJ_FSAO.sh`
- Refactoring potentiel de server.py (13000+ lignes) en routeurs separes
