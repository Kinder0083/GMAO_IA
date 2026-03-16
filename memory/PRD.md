# FSAO Iris - PRD (Product Requirements Document)

## Probleme Original
Application GMAO / FSAO avec module "Arbre des Causes" pour l'analyse d'accidents.

## Architecture
- **Frontend** : React + Shadcn UI
- **Backend** : FastAPI (Python)
- **Base de donnees** : MongoDB
- **IA** : Emergent LLM Key (OpenAI, Gemini, Claude)

## Taches Accomplies

### 16 Mars 2026 - Refactoring process_import_item
- [x] Decomposition de la fonction monolithique (166 lignes) en 8 fonctions specialisees
- [x] Pipeline clair : clean_nan_values -> restore_document_id -> parse_json_fields -> convert_numeric_fields -> convert_date_fields -> apply_module_defaults -> upsert_user_preferences -> persist_document
- [x] Tests de regression OK (export/import CSV, preferences utilisateur, filtres OT)

### 15 Mars 2026 - Bug P0 Preferences
- [x] Fix race condition doublons user_preferences apres restauration

### 15 Mars 2026 - Actions Correctives Semi-Automatiques
- [x] Fix checklists: insertion dans checklist_templates (bon module)
- [x] Fix maintenance preventive: equipement_id obligatoire
- [x] Dialogues semi-automatiques (CreateChecklistDialog, CreatePreventiveDialog)

### 15 Mars 2026 - Bug Filtres OT
- [x] Fix: OT crees par IA utilisaient created_at au lieu de dateCreation

### Sessions precedentes
- [x] Systeme sauvegarde/restauration robuste (chunked upload, 50+ collections)
- [x] Reparation/diagnostic donnees post-restauration
- [x] Corrections import (corruption donnees, ObjectId, JSON, NaN)
- [x] Fix bouton Exporter, lien SSH, preferences personnalisation

## Taches En Attente
- [ ] **(P1)** Validation utilisateur finale flux sauvegarde/restauration (VALIDEE par utilisateur)
- [ ] **(P2)** Fiabilisation script update_service.py

## Credentials
- Admin: buenogy@gmail.com / Admin2024!
- GitHub: Kinder0083/GMAO
