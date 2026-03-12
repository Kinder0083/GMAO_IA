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

## Session 11 Mars 2026

### Phase 9 - Admin peut modifier ses propres permissions
- Suppression de la restriction backend qui empechait un admin de modifier ses propres permissions
- Ligne supprimee: `if str(user_id) == str(current_user.get('id')): raise HTTPException("Vous ne pouvez pas modifier vos propres permissions")`
- La restriction sur la suppression de soi-meme est conservee (securite)
- Testing: curl valide (200 OK au lieu de 400)

### Phase 8 - Corrections Demandes d'Intervention (icones, photos, transfert)
- **Logique icones**: Crayon seul si DI en attente, Oeil seul si convertie/refusee. Supprimer masque aussi.
- **Photos DI dans visualisation**: AttachmentGallery integre au dialogue (miniatures + lightbox plein ecran)
- **Compatibilite PJ**: Support ancien format (id string, chemin uploads/intervention_requests/) et nouveau (ObjectId, uploads/intervention-requests/)
- **Transfert DI->OT**: Photos copiees vers le dossier OT avec fallback ancien chemin
- Testing: 100% (iteration_123 - 10/10 backend, tous tests frontend)

### Phase 7 - Cache-busting automatique (plus besoin de CTRL+MAJ+F5)
- **Service Worker**: `sw.js` modifie pour forcer `cache: 'no-store'` sur les navigation requests
- **Detection de version**: Hook `useVersionCheck.js` verifie `/version.json` toutes les 5 min + au retour sur l'onglet. Recharge automatiquement si nouvelle version detectee
- **Post-build script**: `post-build.sh` remplace les timestamps dans `sw.js` et `version.json` a chaque `yarn build`
- **Nginx**: Header `no-cache` ajoute pour `version.json`
- **Procedure de mise a jour**: `yarn build` execute automatiquement `post-build.sh`

### Phase 6 - Formulaire DI Public via QR Code + Photos + KPI
- **Fonctionnalite**: "Creer une demande d'intervention" accessible SANS authentification depuis le QR code
- **Backend**: POST /api/qr/public/intervention-request, POST /api/qr/public/intervention-request/{id}/attachments (meme format et chemin que standard)
- **Frontend**: `PublicInterventionForm.jsx` - Formulaire mobile-first epure
- **Email notification**: Envoi auto aux admins avec 2 boutons action (Convertir en OT / Refuser)
- **Liens email**: ?action=convert&id=xxx et ?action=refuse&id=xxx ouvrent les dialogues
- **Photos DI**: Miniatures dans le dialogue de visualisation via AttachmentGallery
- **KPI Dashboard**: Widgets "DI en attente" et "Temps reponse DI" (GET /api/intervention-requests/stats/kpi)
- Testing: 100% (iterations 120, 121, 122)

### Phase 5 - Analyse IA Historique Achat
- **Fonctionnalite**: Boutons "Analyse IA" et "Archives IA" ajoutes sur la page Historique Achat
- **Backend**: `ai_purchase_history_routes.py` enregistre dans `server.py` (analyse tendances, rapport, archives CRUD)
- **Frontend**: `AIPurchaseAnalyzer.jsx` (dialogue analyse), `PurchaseHistoryArchivesIA.jsx` (page archives), route `/purchase-history-archives-ia`
- **API**: `purchaseHistoryAPI` dans `api.js` enrichi avec `aiAnalyzeTrends`, `aiGenerateReport`, `getAIArchives`, `getAIArchive`, `deleteAIArchive`
- **Pattern**: Identique au module Presqu'accidents (LLM fallback chain, auto-archivage, KPI, anomalies, recommandations)
- Testing: 100% (iteration_119)

### Phase 4 - WebSocket Demandes d'Intervention
- **Probleme**: Les DI creees depuis le telephone (PWA) n'apparaissaient pas en temps reel sur la version web
- **Cause racine**: Le backend excluait l'utilisateur createur du broadcast WebSocket (`exclude_user=current_user["id"]`). Quand le meme compte est utilise sur 2 appareils, le 2e appareil ne recevait pas l'evenement
- **Fix backend**: Suppression de `exclude_user` dans les emit_event des DI (create/update/delete/refuse). Nettoyage `_id` et attachments avant broadcast
- **Fix frontend**: Ajout de `handleRefreshAndNotify()` qui dispatch `gmao-data-refresh` pour le fallback local
- **Testing**: Test multi-appareils WebSocket valide - meme user_id recoit les events sur tous les appareils

### Phase 3 - Bug Roles + Categories Menu
- **Bug roles "Role non trouve"**: Auto-migration ajoutee dans `get_all_roles` + helper `_find_role()`. 13 roles migres
- **Categories menu pliees par defaut**: `Sidebar.jsx` et `MenuOrganizationSection.jsx` modifies
- Testing: 100% (iteration_118)

### Phase 2 - Bugs DI + Refus + Camera native
- Bug colonne Equipement vide corrige (get_equipment_by_id avec ObjectId)
- Camera native (capture="environment") identique aux OT
- Refus d'intervention (Ban icon, dialogue motif, email, journal audit, "REFUS" rouge)
- Transfert PJ DI->OT lors conversion
- Testing: 100% (iteration_117)

### Phase 1 - Permissions + PJ + Selection Equipement
- 12 modules ajoutes a PermissionsGrid
- Selection equipement hierarchique (parent/sous-equipement)
- Endpoints upload/download/delete pour PJ
- Testing: 100% (iteration_116)

## Prioritized Backlog
### P0
- Systeme de mise a jour - EN PAUSE par l'utilisateur

### P1
- Attente instructions utilisateur

## Key Files Modified
- `/app/backend/server.py` - DI endpoints: emit sans exclude_user, nettoyage _id avant broadcast
- `/app/backend/roles_routes.py` - _find_role helper, auto-migration id
- `/app/frontend/src/pages/InterventionRequests.jsx` - handleRefreshAndNotify, Ban icon, REFUS label
- `/app/frontend/src/hooks/useInterventionRequests.js` - Hook avec useRealtimeData (deja present)
- `/app/frontend/src/components/InterventionRequests/InterventionRequestFormDialog.jsx`
- `/app/frontend/src/components/InterventionRequests/RefuseInterventionDialog.jsx`
- `/app/frontend/src/components/Layout/Sidebar.jsx` - Categories pliees par defaut
- `/app/frontend/src/components/Personnalisation/MenuOrganizationSection.jsx`

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
