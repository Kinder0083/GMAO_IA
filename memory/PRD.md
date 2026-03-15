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

## Session 15 Mars 2026

### Bug Fix P0 - Creation MP depuis Arbre des Causes
- **Probleme** : Les maintenances preventives creees depuis les actions correctives du module Arbre des Causes n'apparaissaient pas dans le module Maintenance Preventive
- **Cause racine** : Collection MongoDB incorrecte (`preventive_maintenance` singulier au lieu de `preventive_maintenances` pluriel) + structure de donnees incompatible avec le modele `PreventiveMaintenanceBase`
- **Corrections** :
  - `accident_analysis_routes.py` : Collection corrigee + structure adaptee (equipement_id, prochaineMaintenance, duree, dateCreation, statut=ACTIF)
  - `AccidentAnalysisDetail.jsx` : Frequence corrigee `MENSUELLE` → `MENSUEL`
  - Collection unifiee dans `ai_chat_routes.py`, `ai_maintenance_routes.py`, `gmao_data_service.py`
- **Testing** : 100% backend (9/9), 100% frontend - iteration_130

### Feature P1 - Actions Correctives Manuelles
- **Fonctionnalite** : Ajout d'actions correctives manuelles dans l'onglet "Actions correctives & preventives"
- **Frontend** (`AccidentAnalysisDetail.jsx`) :
  - Bouton "Ajouter manuellement" dans le header
  - Formulaire inline : titre (requis), description, type (OT/MP/Checklist), priorite
  - Badge "Manuelle" pour les actions manuelles + bouton "Supprimer"
  - Sauvegarde automatique avec les actions IA existantes
- **Backend** (`accident_analysis_routes.py`) :
  - Rapport PDF inclut colonne "Source" (IA/Manuelle)
- **Testing** : 100% - iteration_130

### Feature - Boutons Notifications & Installation PWA dans Parametres
- **Fonctionnalite** : Nouvel encadre "Application" dans la page Parametres utilisateur
- **Frontend** (`Settings.jsx`) :
  - Bouton "Activer les notifications" : appelle `subscribe()` de `usePushNotifications` (meme fonction que le prompt auto au login)
  - Bouton "Installer l'application" : appelle `install()` de `useInstallPrompt` (meme fonction que le prompt auto)
  - Etats adaptatifs : desactive si deja active/installe, messages contextuels selon l'etat
- **Testing** : Screenshot OK

## Session 14 Mars 2026

### Phase 21 - Integration Arbre des Causes (Permissions, README, Manuel)
- **Permissions** : Ajout `accidentAnalysis` dans `UserPermissions` (models.py) pour tous les roles
  - ADMIN/QHSE/TECHNICIEN = full (view+edit+delete)
  - DIRECTEUR/PROD/RSP_PROD/INDUS = view+edit
  - LOGISTIQUE/LABO/ADV/VISUALISEUR = view only
  - AFFICHAGE = aucun acces
- **PermissionsGrid.jsx** : Ajout de l'entree dans la grille frontend
- **Migration startup** : Migration automatique des permissions au demarrage du serveur
- **README.md** : Section complete "IA - Arbre des Causes" avec description des 5 phases
- **Manuel utilisateur** : Section detaillee dans manual_default_content.json
- **Icone sidebar** : Import `GitBranch` dans menuConfig.js

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
  - `AccidentAnalysisDetail.jsx` : Page de detail avec stepper 5 phases
  - `AccidentAISettings.jsx` : Configuration du modele IA dans Parametres speciaux
- **Menu** : Entree "Arbre des Causes" ajoutee dans la sidebar
- **Routes** : `/accident-analysis` et `/accident-analysis/:id`
- **Testing** : Backend 92% (AI timeout expected), Frontend 100% (iteration_128)

## Prioritized Backlog
### P0
- (DONE) Module Arbre des Causes - Analyse d'accidents
- (DONE) Integration permissions, README, manuel
- (DONE) Bug creation MP depuis Arbre des Causes
- (DONE) Actions correctives manuelles

### P1
- Validation utilisateur de tous les bugs corriges
- Filtres avances sur la page DI

### P2
- Script de mise a jour serveur - EN PAUSE par l'utilisateur

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Key Files
- `/app/backend/accident_analysis_routes.py` - Routes backend Arbre des Causes
- `/app/backend/models.py` - Permissions accidentAnalysis (ligne ~74)
- `/app/frontend/src/pages/AccidentAnalysisPage.jsx` - Page liste
- `/app/frontend/src/pages/AccidentAnalysisDetail.jsx` - Page detail avec 5 phases
- `/app/frontend/src/components/Settings/AccidentAISettings.jsx` - Config IA
- `/app/frontend/src/components/Common/PermissionsGrid.jsx` - Grille permissions
- `/app/frontend/src/components/Layout/menuConfig.js` - IconMap sidebar
- `/app/frontend/src/services/api.js` - accidentAnalysisAPI
- `/app/README.md` - Documentation
- `/app/backend/manual_default_content.json` - Manuel utilisateur
