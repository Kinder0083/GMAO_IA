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
