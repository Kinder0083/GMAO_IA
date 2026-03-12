# FSAO Iris - GMAO

## Problem Statement
Application GMAO (Gestion de Maintenance Assistee par Ordinateur) pour la gestion de maintenance industrielle.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide icons
- **Backend**: FastAPI, Python 3.11
- **Database**: MongoDB (motor async)
- **Auth**: JWT tokens
- **Realtime**: WebSocket via RealtimeManager
- **AI**: Gemini, OpenAI, Claude (via emergentintegrations)

## Session 12 Mars 2026

### Phase 10 - Bug Fix: Miniatures photos dans formulaire modification OT
- **Probleme**: Les photos transferees d'une DI vers un OT n'etaient visibles que dans le dialogue de visualisation (oeil) et pas dans le dialogue de modification (crayon)
- **Cause racine**: Le chargement async des blob URLs pour les miniatures etait fonctionnel mais manquait de robustesse (pas de nettoyage, pas de protection contre les races conditions)
- **Fix**: Amelioration du `useEffect` dans `WorkOrderFormDialog.jsx`:
  - Ajout d'un flag `cancelled` pour annuler les operations async perimees
  - Ajout du nettoyage des blob URLs (`URL.revokeObjectURL`) a la fermeture du dialogue
  - Reset des attachments avant le chargement async
  - Support des formats alternatifs d'attachments (`nom`, `taille`, `type` en plus de `original_filename`, `size`, `mime_type`)
  - Reset de `previewImage` a l'ouverture
- **Testing**: 100% - Backend et frontend valides par testing agent (API download 200, miniatures blob visibles dans les dialogues edition et visualisation)

## Session 11 Mars 2026

### Phase 9 - Admin peut modifier ses propres permissions
- Suppression de la restriction backend qui empechait un admin de modifier ses propres permissions
- Testing: curl valide (200 OK au lieu de 400)

### Phase 8 - Corrections Demandes d'Intervention (icones, photos, transfert)
- **Logique icones**: Crayon seul si DI en attente, Oeil seul si convertie/refusee. Corbeille toujours visible selon permissions.
- **Photos DI dans formulaire (Crayon)**: Miniatures chargees via fetch authentifie avec blob URLs (avant conversion)
- **Photos DI dans visualisation (Oeil)**: AttachmentGallery integre au dialogue (miniatures + lightbox plein ecran)
- **Compatibilite PJ**: Support ancien format (id string, chemin uploads/intervention_requests/) et nouveau (ObjectId, uploads/intervention-requests/)
- **Transfert DI->OT**: Photos copiees vers le dossier OT avec fallback ancien chemin
- Testing: 100% (iteration_123, iteration_124 - 10/10 backend + Playwright frontend)

### Phase 7 - Cache-busting automatique (plus besoin de CTRL+MAJ+F5)
- **Service Worker**: `sw.js` modifie pour forcer `cache: 'no-store'` sur les navigation requests
- **Detection de version**: Hook `useVersionCheck.js` verifie `/version.json` toutes les 5 min + au retour sur l'onglet. Recharge automatiquement si nouvelle version detectee
- **Post-build script**: `post-build.sh` remplace les timestamps dans `sw.js` et `version.json` a chaque `yarn build`

### Phase 6 - Formulaire DI Public via QR Code + Photos + KPI
- **Fonctionnalite**: "Creer une demande d'intervention" accessible SANS authentification depuis le QR code
- **Backend**: POST /api/qr/public/intervention-request, POST /api/qr/public/intervention-request/{id}/attachments
- **Frontend**: `PublicInterventionForm.jsx` - Formulaire mobile-first epure
- **Email notification**: Envoi auto aux admins avec 2 boutons action (Convertir en OT / Refuser)
- **KPI Dashboard**: Widgets "DI en attente" et "Temps reponse DI"
- Testing: 100%

### Phase 5 - Analyse IA Historique Achat
- Boutons "Analyse IA" et "Archives IA" sur la page Historique Achat
- Pattern identique au module Presqu'accidents (LLM fallback chain, auto-archivage)
- Testing: 100%

### Phase 4 - WebSocket Demandes d'Intervention
- Fix: Suppression de `exclude_user` dans les emit_event des DI pour support multi-appareils
- Testing: valide

### Phase 3 - Bug Roles + Categories Menu
- Auto-migration des roles + categories menu pliees par defaut
- Testing: 100%

### Phase 2 - Bugs DI + Refus + Camera native
- Bug colonne Equipement, Camera native, Refus d'intervention, Transfert PJ DI->OT
- Testing: 100%

### Phase 1 - Permissions + PJ + Selection Equipement
- 12 modules ajoutes a PermissionsGrid, selection equipement hierarchique, endpoints PJ
- Testing: 100%

## Prioritized Backlog
### P0
- (RESOLU) Miniatures photos dans formulaire modification OT

### P1
- Validation utilisateur de tous les bugs DI/OT corriges
- Attente instructions utilisateur

### P2
- Systeme de mise a jour serveur - EN PAUSE par l'utilisateur
- Filtres avances sur la page DI (date, priorite, statut, createur)

## Key Files Modified (Session 12 Mars)
- `/app/frontend/src/components/WorkOrders/WorkOrderFormDialog.jsx` - Fix chargement miniatures + cleanup blob URLs

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
