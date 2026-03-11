# FSAO Iris - GMAO

## Problem Statement
Application GMAO (Gestion de Maintenance Assistee par Ordinateur) pour la gestion de maintenance industrielle.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide icons
- **Backend**: FastAPI, Python 3.11
- **Database**: MongoDB (motor async)
- **Auth**: JWT tokens
- **Realtime**: WebSocket
- **AI**: Gemini, OpenAI, Claude (via emergentintegrations)

## Session 11 Mars 2026

### Phase 3 - Bug Roles + Categories Menu
- **Bug roles "Role non trouve"** : Les roles n'avaient pas de champ `id` en base (seulement `_id` ObjectId). Auto-migration ajoutee dans `get_all_roles` qui ajoute le champ `id` manquant. Helper `_find_role()` cherche par `id` puis `_id`.
- **Categories menu pliees par defaut** : `Sidebar.jsx` ligne 107 changee de `!== false` a `=== true`. `MenuOrganizationSection.jsx` initialise `expandedCategories` a `false`.
- Testing: 100% (iteration_118)

### Phase 2 - Bugs DI + Refus + Camera native
- **Bug colonne Equipement vide** : Backend utilisait `find_one({"id":...})` au lieu de helpers `get_equipment_by_id()`/`get_location_by_id()` avec ObjectId
- **Camera native** : Remplacement getUserMedia par `<input capture="environment">` identique aux OT
- **Refus d'intervention** : Icone Ban, dialogue motif, email, journal audit, "REFUS" rouge avec tooltip
- **Transfert PJ DI→OT** : Copie fichiers lors conversion
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

## Key Files
- `/app/backend/roles_routes.py` - Gestion des roles (FIXED)
- `/app/backend/server.py` - FastAPI main (11K+ lines)
- `/app/frontend/src/pages/InterventionRequests.jsx` - Liste DI + REFUS
- `/app/frontend/src/components/InterventionRequests/RefuseInterventionDialog.jsx`
- `/app/frontend/src/components/InterventionRequests/InterventionRequestFormDialog.jsx`
- `/app/frontend/src/components/Common/PermissionsGrid.jsx`
- `/app/frontend/src/components/Layout/Sidebar.jsx` - Categories pliees
- `/app/frontend/src/components/Personnalisation/MenuOrganizationSection.jsx`

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
