# FSAO Iris - GMAO

## Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS
- **Backend**: FastAPI + Motor (MongoDB async)
- **Base de donnees**: MongoDB

### Structure Backend (post-refactoring)
```
backend/
├── server.py (6490 lignes - orchestrateur principal)
├── routes/
│   ├── shared.py (utilitaires partagés: db, serialize_doc, find_*)
│   ├── work_orders.py (CRUD, Attachments, Comments, Admin edits)
│   ├── equipments.py (CRUD, Status, Hiérarchie)
│   ├── users.py (CRUD, Permissions, Rôles)
│   ├── notifications.py (CRUD, Web Push)
│   ├── reports.py (Analytics, Filtres par période)
│   ├── intervention_requests.py (DI CRUD, Attachments)
│   ├── settings.py (Settings, SMTP, Image Compression)
│   ├── vendors.py (Fournisseurs, Historique Achats)
│   └── improvements.py (Améliorations, Demandes)
├── qr_routes.py (existant)
├── presqu_accident_routes.py (existant)
└── ...autres modules existants
```

## Taches accomplies

### Sessions precedentes
- Monitoring sante des notifications
- Logique de notification de service (P2)
- Normalisation casse des services (P4)
- Champ temps estime DI->OT

### Session 18-20 mars 2026
- **[P0] Fix notifications Web Push**
- **[BUG] Fix "vous ne pouvez modifier que votre propre statut"**
- **[BUG] Fix compteur DI dashboard**
- **[BUG] Fix equipements filtres par service**
- **[FEATURE] Refonte page Rapports**
- **[FEATURE] Pointage horaire** (Navigation semaines, resume hebdo, export PDF)
- **[FEATURE] Compression automatique des images**

### Session 20 mars 2026 (fork)
- **[FEATURE] Edition/Suppression temps et commentaires OT (Admin)**
  - Tests: 100% backend, 100% frontend
- **[FEATURE] Filtres de periode sur Rapports & Analytiques**
  - Tests: 100% backend (9/9), 100% frontend
- **[REFACTORING] server.py en routeurs séparés**
  - 9 modules extraits (6553 lignes)
  - server.py: 13043 -> 6490 lignes (-50%)
  - Module shared.py pour utilitaires communs
  - Tests de regression: 100% (27/27 backend, 100% frontend)

## Backlog
- **(P3)** Tester le script de mise a jour `MAJ_FSAO.sh`
