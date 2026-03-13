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

### Phase 12 - Corbeille avec Soft Delete et Restauration
- **Soft Delete**: Les suppressions d'OT, ameliorations, DI, equipements, presqu'accidents, utilisateurs et surveillance marquent les items au lieu de les supprimer
- **Page Corbeille** (`/trash`): Liste les elements supprimes avec Restaurer/Supprimer definitivement
- **Bouton Restaurer dans le Journal**: A cote de chaque entree de suppression
- **Parametres Speciaux**: Section "Corbeille" avec delai de retention configurable (defaut 2j)
- **Cron job**: Purge automatique toutes les 12h
- **Testing**: 100% (iteration_126)


### Phase 11 - Drag & Drop pour pièces jointes (3 formulaires)
- **Fonctionnalité**: Zone de glisser-déposer ajoutée aux 3 formulaires de l'application
  - Formulaire OT (WorkOrderFormDialog.jsx) - `data-testid="wo-drop-zone"`
  - Formulaire DI (InterventionRequestFormDialog.jsx) - `data-testid="di-drop-zone"`
  - Formulaire public DI via QR (PublicInterventionForm.jsx) - `data-testid="public-di-drop-zone"`
- **Implémentation**: état `isDragging`, `dragCounter` ref, handlers `handleDragEnter/Leave/Over/Drop`
- **UX**: Bordure pointillée, feedback visuel bleu au survol, icône Upload, texte "Glissez-deposez"
- **Boutons existants conservés**: Parcourir + Appareil photo (OT/DI), Prendre photo + Galerie (Public)
- **Testing**: 100% - 13 tests frontend passés (iteration_125), régression miniatures OT validée

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

## Session 13 Mars 2026

### Phase 14 - Mode Offline Complet PWA (Phases 1, 2, 3)

#### Phase 1 - App Shell Caching
- **Service Worker** reecrit (`sw.js`) : cache l'App Shell (HTML, JS, CSS, images, fonts)
- **Strategies** : Network-First pour navigation, Cache-First pour assets statiques, Network-Only pour API
- **offline.html** : Page de fallback quand l'app n'a jamais ete visitee en ligne
- **Fix critique** : `App.js` supprimait TOUS les caches au demarrage — corrige

#### Phase 2 - Sync donnees et fichiers offline
- **IndexedDB v2** : Nouveau store `fileStore` pour photos/PJ offline
- **Upload offline** : FormData serialises et stockes dans IndexedDB, sync au retour en ligne
- **OfflineBanner** : Banniere persistante avec compteur, taille stockage, progression sync
- **Toasts globaux** : Notifications pour actions bloquees, enregistrees, synchronisees

#### Phase 3 - Experience utilisateur offline
- **OfflineIndicator enrichi** : Derniere sync, fichiers stockes, force sync cliquable
- **OfflineDisabled** : Composant wrapper pour desactiver les features IA/chat offline
- **useOfflineCapabilities** : Hook de capacites disponibles selon le statut
- **Testing** : 100% (iteration_127)

### Phase 15 - Stockage Hors Ligne dans Sante Systeme + OfflineDisabled sur IA/Export
- **Section SystemHealth** : Ajout d'une carte "Stockage Hors Ligne" avec KPIs (en attente, en echec, fichiers, espace), boutons Forcer sync et Vider cache, note explicative
- **OfflineDisabled wrapper** applique sur 13 pages :
  - IA : PurchaseHistory, PresquAccidentRapport, SurveillancePlan, Vendors, AnalyticsChecklistsPage, AISensorAnalysis
  - Export : Journal, Reports, SurveillanceRapport, SurveillanceAIDashboard, IoTDashboard, MESReportsPage, ImportExportTab, Personnalisation
- **Chat** : Avertissement offline dans ChatLive et icone WifiOff dans AIChatWidget
- **Testing** : Screenshots OK (boutons visibles/cliquables en ligne, section Stockage Hors Ligne affichee)

### Phase 13 - Bug Fix: Affichage OT supprimé dans liste DI
- **Probleme**: Quand un OT issu d'une DI est soft-deleted, le numero de l'OT restait affiché normalement dans la colonne "Ordre N°" de la liste des DI
- **Fix Backend**: Modification de `GET /api/intervention-requests` pour vérifier si les OT liés sont soft-deleted via une requête batch sur `work_orders` avec `deleted_at`
- **Fix Frontend**: Affichage "~~OT #XXXX~~" (texte barré gris) au lieu du lien bleu cliquable quand `is_work_order_deleted=true`
- **Modèle**: Ajout du champ `is_work_order_deleted: Optional[bool] = False` au modèle `InterventionRequest`
- **Testing**: Backend curl validé (flag correct), Frontend screenshot validé (texte barré visible)

## Prioritized Backlog
### P0
- (RESOLU) Miniatures photos dans formulaire modification OT
- (RESOLU) Drag & Drop pieces jointes (OT, DI, Public DI)
- (RESOLU) Affichage OT supprime dans la liste DI
- (RESOLU) Mode Offline Complet PWA (App Shell, Sync fichiers, UX offline)

### P1
- Validation utilisateur de tous les bugs DI/OT corriges
- Attente instructions utilisateur

### P2
- Systeme de mise a jour serveur - EN PAUSE par l'utilisateur
- Filtres avances sur la page DI (date, priorite, statut, createur)

## Key Files Modified (Session 12 Mars)
- `/app/frontend/src/components/WorkOrders/WorkOrderFormDialog.jsx` - Fix chargement miniatures + cleanup blob URLs + drag & drop
- `/app/frontend/src/components/InterventionRequests/InterventionRequestFormDialog.jsx` - Drag & drop
- `/app/frontend/src/components/QR/PublicInterventionForm.jsx` - Drag & drop
- `/app/README.md` - Mise a jour version 1.10.0 avec toutes les nouvelles fonctionnalites
- `/app/CHANGELOG.md` - Ajout version 1.10.0
- Base de donnees `manual_sections` - 6 nouvelles sections ajoutees (drag & drop OT/DI, DI publique QR, KPI dashboard, IA achats, cache-busting)

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
