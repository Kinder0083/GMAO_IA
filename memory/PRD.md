# FSAO Iris - GMAO

## Problem Statement
Application GMAO (Gestion de Maintenance Assistee par Ordinateur) pour la gestion de maintenance industrielle.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide icons, @xyflow/react
- **Backend**: FastAPI, Python 3.11
- **Database**: MongoDB (motor async)
- **Auth**: JWT tokens
- **Realtime**: WebSocket via RealtimeManager
- **AI**: Gemini, OpenAI (GPT-5.2), Claude (via emergentintegrations)

## Session 14 Mars 2026

### Phase 20 - Module Arbre des Causes (Analyse d'Accidents)
- **Fonctionnalite complete** : Module d'analyse d'accidents de maintenance avec 4 methodologies et IA integree
- **Backend** (`accident_analysis_routes.py`) :
  - CRUD complet pour les analyses (list, create, get, update, soft delete)
  - 5 endpoints IA : QQOQCP, 5 Pourquoi, Ishikawa (5M), ALARM, Generation d'actions
  - 3 endpoints de creation d'actions correctives : OT, Maintenance Preventive, Checklist
  - Configuration du modele IA (GET/PUT /settings/ai-config)
  - Fallback chain LLM (OpenAI → Gemini → Anthropic)
- **Frontend** :
  - `AccidentAnalysisPage.jsx` : Page de liste avec creation, recherche, suppression
  - `AccidentAnalysisDetail.jsx` : Page de detail avec stepper 5 phases :
    1. QQOQCP (6 champs + aide IA)
    2. 5 Pourquoi (iterations + identification cause racine)
    3. Ishikawa 5M (5 categories + diagramme visuel + IA)
    4. ALARM (7 categories de facteurs + IA)
    5. Actions correctives (generation IA + creation OT/MP/Checklist)
  - `AccidentAISettings.jsx` : Configuration du modele IA dans Parametres speciaux
- **Menu** : Entree "Arbre des Causes" ajoutee dans la sidebar avec migration automatique
- **Routes** : `/accident-analysis` et `/accident-analysis/:id`
- **Testing** : Backend 92% (AI timeout expected), Frontend 100% (iteration_128)

## Session 13 Mars 2026

### Phase 19 - Refonte complete du mode offline (ConnectivityManager)
- ConnectivityManager singleton pour detection fiable de la connectivite
- Fix sync photos offline, token expire, double-serialisation

### Phase 18 - Dialog statut OT accessible aux utilisateurs view-only
- StatusChangeDialog apres validation du pointage pour TOUS les utilisateurs

### Phase 17 - Persistance offline du menu + Indicateur hors ligne
- Preferences utilisateur cachees dans localStorage comme fallback offline

### Phase 16 - Bug Fix + Amelioration : Pointage horaire du personnel
- Auto-decouverte des utilisateurs ayant pointe du temps

### Phase 15 - Stockage Hors Ligne dans Sante Systeme + OfflineDisabled sur IA/Export

### Phase 14 - Mode Offline Complet PWA (Phases 1, 2, 3)

### Phase 13 - Bug Fix: Affichage OT supprime dans liste DI

## Session 12 Mars 2026

### Phase 12 - Corbeille avec Soft Delete et Restauration
### Phase 11 - Drag & Drop pour pieces jointes (3 formulaires)
### Phase 10 - Bug Fix: Miniatures photos dans formulaire modification OT

## Session 11 Mars 2026

### Phase 9 - Admin peut modifier ses propres permissions
### Phase 8 - Corrections Demandes d'Intervention
### Phase 7 - Cache-busting automatique
### Phase 6 - Formulaire DI Public via QR Code + Photos + KPI
### Phase 5 - Analyse IA Historique Achat
### Phase 4 - WebSocket Demandes d'Intervention
### Phase 3 - Bug Roles + Categories Menu
### Phase 2 - Bugs DI + Refus + Camera native
### Phase 1 - Permissions + PJ + Selection Equipement

## Prioritized Backlog
### P0
- (RESOLU) Module Arbre des Causes - Analyse d'accidents

### P1
- Validation utilisateur de tous les bugs corriges
- Filtres avances sur la page DI

### P2
- Systeme de mise a jour serveur - EN PAUSE par l'utilisateur

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Key Files
- `/app/backend/accident_analysis_routes.py` - Routes backend Arbre des Causes
- `/app/frontend/src/pages/AccidentAnalysisPage.jsx` - Page liste
- `/app/frontend/src/pages/AccidentAnalysisDetail.jsx` - Page detail avec 5 phases
- `/app/frontend/src/components/Settings/AccidentAISettings.jsx` - Config IA
- `/app/frontend/src/services/api.js` - accidentAnalysisAPI
