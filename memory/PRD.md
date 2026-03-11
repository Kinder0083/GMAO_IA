# FSAO Iris - GMAO

## Problem Statement
Application GMAO (Gestion de Maintenance Assistee par Ordinateur) pour la gestion de maintenance industrielle.
Plateforme integree avec gestion des equipements, ordres de travail, consignations LOTO, documentations, surveillance temps reel, IA, chat live, planning et rapports hebdomadaires.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, react-winbox, react-contexify, Lucide icons
- **Backend**: FastAPI, Python 3.11
- **Database**: MongoDB (motor async)
- **Auth**: JWT tokens
- **Realtime**: WebSocket via RealtimeManager
- **AI**: Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)
- **Email**: SMTP configurable (Parametres Speciaux)
- **PWA**: Service Worker, notifications push VAPID

## Session 11 Mars 2026 - Phase 2

### Bug fix: Colonne Equipement vide
- **Cause racine**: `db.equipments.find_one({"id": ...})` ne trouvait rien car les equipements n'ont pas de champ `id` en base (ils utilisent `_id` ObjectId)
- **Fix**: Remplacement par `get_equipment_by_id()` et `get_location_by_id()` qui utilisent `ObjectId`
- Corrige dans les endpoints create ET update des demandes d'intervention

### Refonte UI pieces jointes DI (identique aux OT)
- Suppression du mode camera inline (navigator.mediaDevices.getUserMedia) 
- Remplacement par `<input type="file" capture="environment">` pour ouvrir l'app camera native
- UI identique aux ordres de travail : boutons "Parcourir" + "Appareil photo"
- Liste de fichiers avec nom, taille, bouton Supprimer
- Backend endpoints existants: POST/GET/DELETE /api/intervention-requests/{id}/attachments

### Fonctionnalite "Refus d'intervention"
- Nouvelle icone Ban (sens interdit) dans la colonne Actions
- Dialogue `RefuseInterventionDialog.jsx` pour saisir le motif du refus
- Backend `POST /api/intervention-requests/{id}/refuse` enregistre le refus
- Email envoye au demandeur avec le motif du refus
- Enregistrement dans le journal d'audit
- Colonne "Ordre N°" affiche "REFUS" en rouge avec tooltip du motif au survol
- Champs ajoutes au modele: refused, refused_reason, refused_at, refused_by, refused_by_name

### Transfert pieces jointes DI -> OT
- Lors de la conversion d'une DI en OT, les pieces jointes sont copiees
- Copie physique des fichiers de /uploads/intervention-requests/ vers /uploads/work-orders/
- Enregistrement des attachments dans le nouvel OT

### Testing: 100% (iteration_116 + iteration_117)
- Backend: 9/9 tests iteration_117, 17/17 tests iteration_116
- Frontend: 100% verifie sur les deux iterations

## Session 11 Mars 2026 - Phase 1

### Permissions Grid
- 12 nouveaux modules ajoutes: Dashboard Service, M.E.S, Rapports M.E.S, Contrats, Formations, Rapports Hebdo., Consignations LOTO, Cameras, Gestion d'equipe, Analytics Checklists, Demandes d'arret, Autorisations Part.

### Selection equipement DI (hierarchique)
- Dropdown Equipement: uniquement les parents (sans parent_id)
- Nouveau dropdown Sous-equipement: enfants charges via GET /api/equipments/{id}/children
- Champ Emplacement masque mais auto-rempli depuis le parent

## Prioritized Backlog
### P0 (Critical)
- Systeme de mise a jour (/api/updates/apply) - EN PAUSE par l'utilisateur

### P1 (Upcoming)
- Aucune tache planifiee - attente instructions utilisateur

## Architecture
```
/app
├── backend/
│   ├── server.py               # FastAPI main app (11K+ lines)
│   ├── models.py               # Modeles Pydantic (InterventionRequest with refused fields)
│   ├── uploads/
│   │   ├── work-orders/        # PJ ordres de travail
│   │   └── intervention-requests/ # PJ demandes d'intervention
│   └── email_service.py
└── frontend/src/
    ├── components/
    │   ├── Common/PermissionsGrid.jsx      # 45 modules
    │   ├── InterventionRequests/
    │   │   ├── InterventionRequestFormDialog.jsx  # Camera native + fichiers
    │   │   ├── RefuseInterventionDialog.jsx       # NEW - Dialogue refus
    │   │   ├── InterventionRequestDialog.jsx
    │   │   └── ConvertToWorkOrderDialog.jsx
    │   └── WorkOrders/
    │       └── WorkOrderFormDialog.jsx     # Reference UI fichiers
    └── pages/
        └── InterventionRequests.jsx        # Liste + Ban icon + REFUS label
```

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
