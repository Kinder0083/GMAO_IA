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
- **Frontend** : Upload de fichiers : bouton "+ Ajouter un fichier" et glisser-deposer depuis le bureau
- **Frontend** : Integration WebSocket pour synchronisation temps reel
- **Frontend** : Journal d'Audit mis a jour avec nouveaux types d'actions et d'entites
- **Backend** : Endpoint IA pour generation de formulaires (description texte, Excel/image, JSON)
- **Backend** : Endpoints config modele IA (GET/PUT /ai-model-config)
- **Backend** : Templates systeme peuples avec vrais champs (12 pour BdT, 9 pour Autorisation)
- **Backend** : Templates systeme maintenant modifiables
- **Frontend** : Bouton "Creation IA" avec dialogue 3 modes (description, fichier, JSON)
- **Frontend** : Visualisation complete des templates systeme (tous les champs affiches)
- **Frontend** : Section "Modele IA pour formulaires" dans Parametres Speciaux
- **Testing** : 23/23 backend tests PASS, 14/14 frontend verifications PASS (iteration 106)
- **Testing** : 8/8 backend + 8/8 frontend PASS pour templates IA (iteration 107)

### Sessions precedentes
- Editeur de widgets personnalises avec preview Excel et constructeur formules
- Synchronisation permissions frontend/backend
- Documentation README et chapitres PWA
- Bouton "Presqu'accident" dans QR Code + capture camera/photo
- Reorganisation menus Parametres/Personnalisations
- Harmonisation interface Inventaire avec onglets de service

### Session 10 Mars 2026 - Filtres chronologiques + Bug Historique Rapports
- **Frontend** : Ajout filtres chronologiques sur la page "Demandes d'amelioration" (ImprovementRequests.jsx) - boutons Toutes/Aujourd'hui/Cette semaine/Ce mois/Cette annee/Personnalise
- **Frontend** : Verification et validation des filtres chronologiques deja presents sur "Demandes d'intervention" (InterventionRequests.jsx)
- **Frontend** : Ajout data-testid sur les boutons de filtre des deux pages pour coherence
- **Bug Fix** : Correction du bug ou les rapports ne s'enregistraient pas dans l'Historique
  - Backend: /ai-weekly-reports/generate + /templates/{id}/test sauvegardent maintenant dans weekly_report_history
  - Frontend: Badge violet "Genere (IA)" + callback onGenerated pour refresh auto
- **Feature** : Visualisation complete des rapports dans l'Historique
  - Backend: 4 nouveaux endpoints: /content, /html, /pdf (generation a la volee), /send-email
  - Frontend: ReportViewDialog (resume executif, sections, indicateurs, points d'attention, actions prioritaires)
  - Frontend: 4 boutons d'action par ligne (Visualiser, Telecharger PDF, Imprimer, Envoyer email)
  - Fix serialisation: exclusion _id MongoDB pour eviter ecrasement des UUID
- **Optimisation** : Limite l'horizon du Planning M.Prev. a aujourd'hui + 12 mois
  - dateFin dynamique = min(fin d'annee, aujourd'hui + 12 mois)
  - Navigation future bloquee au-dela de 12 mois (bouton desactive)
  - Stats annuelles calculees uniquement dans la plage valide
  - Indicateur "Horizon : Mois Annee" affiche dans la navigation
  - Passe/archivage inchange, WebSocket preserve
- **Feature** : Auto-approbation des demandes d'arret quand demandeur = destinataire
  - Backend: Si demandeur_id == destinataire_id, statut passe directement a APPROUVEE sans email
  - Backend: Entrees planning creees immediatement (meme logique que validation par token)
  - Frontend: Toast different "Demande auto-approuvee" vs "Demande envoyee"
  - Flux normal preserve quand destinataire est une autre personne
- **Bug Fix** : Synchronisation temps reel Equipements ↔ Planning M.Prev
  - Backend: emit_event pour equipments ne filtre plus l'utilisateur courant (tous les clients recoivent la notif)
  - Backend: update_equipment_status_for_maintenance ecrit dans status_history + broadcast WebSocket
  - Frontend: Chaine reactived = WebSocket status_changed → loadData() → useEffect → loadStatusHistory()
- **Feature** : Reordonnement des equipements par les admins (page /assets)
  - Backend: PUT /api/equipments/reorder avec validation role ADMIN
  - Backend: GET /api/equipments trie par display_order
  - Frontend: Bouton "Modifier l'ordre" (admin only) avec mode reordonnement
  - Frontend: Fleches haut/bas + drag-and-drop (@dnd-kit) + numeros de position
  - Frontend: Boutons Enregistrer/Annuler, cartes avec bordure pointillee bleue
- **Testing** : 100% PASS (iter_113: WS sync, iter_114: 8/8 backend + frontend reorder)

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
