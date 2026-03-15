# FSAO Iris - PRD (Product Requirements Document)

## Probleme Original
Application GMAO / FSAO avec module "Arbre des Causes" pour l'analyse d'accidents.

## Architecture
- **Frontend** : React + Shadcn UI
- **Backend** : FastAPI (Python)
- **Base de donnees** : MongoDB
- **IA** : Emergent LLM Key (OpenAI, Gemini, Claude)

## Taches Accomplies

### 15 Mars 2026 - Bug P0 Preferences
- [x] Fix race condition doublons user_preferences apres restauration

### 15 Mars 2026 - Actions Correctives Semi-Automatiques
- [x] Fix checklists: insertion dans checklist_templates (bon module)
- [x] Fix maintenance preventive: equipement_id obligatoire
- [x] Dialogues semi-automatiques (CreateChecklistDialog, CreatePreventiveDialog)
- [x] Prompt IA enrichi (checklist_items, frequence_suggere)

### 15 Mars 2026 - Bug Filtres OT
- [x] Fix: OT crees par IA utilisaient `created_at` au lieu de `dateCreation` (champ utilise par les filtres)
- [x] Fix applique aussi dans ai_chat_routes.py (OT crees par assistant IA Adria)
- [x] Correction retroactive des OT existants en DB
- [x] Ajout champs manquants (id, comments, attachments, parts_used)

### Sessions precedentes
- [x] Systeme sauvegarde/restauration robuste (chunked upload, 50+ collections)
- [x] Reparation/diagnostic donnees post-restauration
- [x] Corrections import (corruption donnees, ObjectId, JSON, NaN)
- [x] Fix bouton Exporter, lien SSH, preferences personnalisation

## Taches En Attente
- [ ] **(P1)** Validation utilisateur finale flux sauvegarde/restauration
- [ ] **(P2)** Fiabilisation script update_service.py
- [ ] **(P3)** Refactoring process_import_item

## Credentials
- Admin: `buenogy@gmail.com` / `Admin2024!`
- GitHub: `Kinder0083/GMAO`
