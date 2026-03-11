# FSAO Iris - GMAO

## Problem Statement
Application GMAO (Gestion de Maintenance Assistee par Ordinateur) pour la gestion de maintenance industrielle.
Plateforme integree avec gestion des equipements, ordres de travail, consignations LOTO, documentations, surveillance temps reel, IA, chat live, planning et rapports hebdomadaires.

## Core Modules
1. **Dashboard Service** : Vue d'ensemble par pole de service avec statistiques
2. **Ordres de Travail (OT)** : CRUD complet, workflow, impressions, etats
3. **Equipements** : Gestion, QR codes, historique, criticite
4. **Consignations LOTO** : Procedures de securite electrique avec etapes detaillees
5. **Documentations** : Explorateur de fichiers avec gestion avancee (copier, couper, coller, permissions, partage, etc.)
6. **Maintenance Preventive** : Planification, execution, historique
7. **Ameliorations** : Suivi des demandes d'amelioration
8. **Inventaire** : Gestion des pieces de rechange par service
9. **Surveillance** : Surveillance en temps reel des equipements
10. **IA** : Historique et tendances IA (Adria), chat contextuel
11. **Chat Live** : Communication temps reel entre utilisateurs
12. **Planning** : Gestion du planning equipe
13. **Rapports Hebdomadaires** : Generation automatique
14. **Presqu'accidents** : Signalement avec capture photo/camera
15. **Contrats** : Gestion des contrats de maintenance
16. **Demandes d'Achat** : Processus de demande d'achat

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, react-winbox, react-contexify, Lucide icons
- **Backend**: FastAPI, Python 3.11
- **Database**: MongoDB (motor async)
- **Auth**: JWT tokens
- **Realtime**: WebSocket via RealtimeManager
- **AI**: Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)
- **Email**: SMTP configurable (Parametres Speciaux)
- **PWA**: Service Worker, notifications push VAPID

## What's been implemented (latest)

### Session 11 Mars 2026 - Permissions, Pieces Jointes, Selection Equipement
- **Tache 1 - Mise a jour Permissions** : 12 nouveaux modules ajoutes a la grille de permissions (PermissionsGrid.jsx)
  - Dashboard Service, M.E.S, Rapports M.E.S, Contrats, Formations, Rapports Hebdo.
  - Consignations LOTO, Cameras, Gestion d'equipe, Analytics Checklists, Demandes d'arret, Autorisations Part.
- **Tache 2 - Pieces jointes demandes d'intervention** :
  - Backend: 3 nouveaux endpoints (POST upload, GET download, DELETE) pour /api/intervention-requests/{id}/attachments
  - Backend: Repertoire d'upload dedie /app/backend/uploads/intervention-requests/
  - Backend: Modele InterventionRequest enrichi avec champ attachments
  - Frontend: Bouton capture photo via camera (navigator.mediaDevices)
  - Frontend: Zone drag-and-drop pour fichiers + bouton Parcourir
  - Frontend: Liste de fichiers avec preview image et suppression
- **Tache 3 - Refonte selection equipement** :
  - Frontend: Le selecteur Equipement n'affiche que les parents (sans parent_id)
  - Frontend: Nouveau selecteur Sous-equipement apparait si l'equipement parent a des enfants
  - Frontend: Champ Emplacement masque mais auto-rempli depuis l'equipement parent
  - Frontend: Appel GET /api/equipments/{id}/children pour charger les sous-equipements
- **Testing** : 17/17 backend tests PASS, frontend 100% verifie (iteration_116.json)
- **Bug Fix** : Endpoint DELETE /api/intervention-requests corrige (newline manquante)

### Session 10 Mars 2026 - Filtres chronologiques + Bug Historique Rapports
- **Frontend** : Ajout filtres chronologiques sur la page "Demandes d'amelioration" (ImprovementRequests.jsx) - boutons Toutes/Aujourd'hui/Cette semaine/Ce mois/Cette annee/Personnalise
- **Frontend** : Verification et validation des filtres chronologiques deja presents sur "Demandes d'intervention" (InterventionRequests.jsx)
- **Bug Fix** : Correction du bug ou les rapports ne s'enregistraient pas dans l'Historique
- **Feature** : Visualisation complete des rapports dans l'Historique
- **Optimisation** : Limite l'horizon du Planning M.Prev. a aujourd'hui + 12 mois
- **Feature** : Auto-approbation des demandes d'arret quand demandeur = destinataire
- **Bug Fix** : Synchronisation temps reel Equipements <-> Planning M.Prev
- **Feature** : Reordonnement des equipements par les admins (page /assets)
- **Feature** : Gestion visibilite icones header par utilisateur (page /people)
- **Testing** : Backend 6/6 curl tests PASS + screenshots frontend validates

### Session 9 Mars 2026 - Refonte Module Documentations
- Backend/Frontend refonte complete du module Documentations avec menu contextuel, presse-papiers, visionneuse, drag & drop
- Backend/Frontend IA pour generation de formulaires
- Testing : 23/23 backend + 14/14 frontend PASS

## Prioritized Backlog
### P0 (Critical)
- Systeme de mise a jour (/api/updates/apply) - EN PAUSE par l'utilisateur

### P1 (Upcoming)
- Aucune tache planifiee - attente instructions utilisateur

### P2 (Future)
- Templates de widgets additionnels
- Ameliorations futures suggerees par l'utilisateur

## Architecture
```
/app
├── backend/
│   ├── server.py               # FastAPI main app (11K+ lines)
│   ├── documentations_routes.py # Module Documentations (1800+ lines)
│   ├── realtime_manager.py     # WebSocket manager
│   ├── email_service.py        # Service SMTP
│   ├── models.py               # Modeles Pydantic
│   ├── uploads/
│   │   ├── work-orders/        # PJ ordres de travail
│   │   └── intervention-requests/ # PJ demandes d'intervention (NEW)
│   └── routes/                 # Routes additionnelles
└── frontend/
    └── src/
        ├── components/
        │   ├── Common/
        │   │   └── PermissionsGrid.jsx  # UPDATED - 12 new modules
        │   ├── InterventionRequests/
        │   │   └── InterventionRequestFormDialog.jsx  # REWRITTEN
        │   ├── ui/               # Shadcn components
        │   └── Layout/
        │       ├── Sidebar.jsx
        │       └── menuConfig.js
        ├── pages/
        ├── hooks/
        │   ├── useEquipments.js
        │   └── useRealtimeData.js
        ├── contexts/
        └── services/
            └── api.js
```

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
