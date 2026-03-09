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
### Session 9 Mars 2026 - Refonte Module Documentations
- **Backend** : 7 nouveaux endpoints (copy, move, permissions, send-to, share-email, insert-targets, insert-into)
- **Backend** : Endpoint explorer ameliore avec tri (name/date/type) et filtrage par permissions (hidden_for_external, hidden_for_users)
- **Backend** : Integration audit/journal pour toutes les actions documentations (COPY, MOVE, SHARE, PERMISSION_CHANGE)
- **Backend** : 4 nouveaux ActionTypes ajoutes au modele (COPY, MOVE, SHARE, PERMISSION_CHANGE)
- **Frontend** : ExplorerView refait avec menu contextuel complet (clic droit fichier/dossier/espace vide)
- **Frontend** : Presse-papiers interne (Copier/Couper/Coller)
- **Frontend** : Visionneuse integree (PDF, images, texte)
- **Frontend** : Dialogues: Partager par FSAO (email SMTP), Inserer dans OT/Amelioration/M.Prev, Renommer, Nouveau dossier, Envoyer vers
- **Frontend** : Icones de permissions (cadenas = masque ext, buste = masque utilisateurs)
- **Frontend** : Drag & drop pour deplacer fichiers/dossiers
- **Frontend** : Integration WebSocket pour synchronisation temps reel
- **Frontend** : Journal d'Audit mis a jour avec nouveaux types d'actions et d'entites
- **Testing** : 23/23 backend tests PASS, 14/14 frontend verifications PASS

### Sessions precedentes
- Editeur de widgets personnalises avec preview Excel et constructeur formules
- Synchronisation permissions frontend/backend
- Documentation README et chapitres PWA
- Bouton "Presqu'accident" dans QR Code + capture camera/photo
- Reorganisation menus Parametres/Personnalisations
- Harmonisation interface Inventaire avec onglets de service

## Prioritized Backlog
### P0 (Critical)
- Systeme de mise a jour (/api/updates/apply) - EN PAUSE par l'utilisateur

### P1 (Upcoming)
- Aucune tache planifiee - attente instructions utilisateur

### P2 (Future)
- Templates de widgets additionnels
- Ameliorations futures suggereees par l'utilisateur

## Architecture
```
/app
├── backend/
│   ├── server.py               # FastAPI main app (11K+ lines)
│   ├── documentations_routes.py # Module Documentations (1800+ lines)
│   ├── realtime_manager.py     # WebSocket manager
│   ├── email_service.py        # Service SMTP
│   ├── routes/                 # Routes additionnelles
│   └── models.py               # Modeles Pydantic
└── frontend/
    └── src/
        ├── components/
        │   ├── documentations/
        │   │   └── ExplorerView.jsx  # Explorateur de fichiers complet
        │   ├── ui/               # Shadcn components
        │   └── Common/           # Composants partages
        ├── pages/
        │   ├── Documentations.jsx # Page principale
        │   └── ...
        ├── hooks/
        │   ├── useDocumentations.js # Hook avec WebSocket
        │   └── useRealtimeData.js   # Hook generique WebSocket
        ├── contexts/
        │   └── AIContextMenuContext.jsx
        └── services/
            └── api.js            # API client
```

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
