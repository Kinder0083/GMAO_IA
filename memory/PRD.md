# FSAO Iris - PRD (Product Requirements Document)

## Probleme Original
Application GMAO (Gestion de Maintenance Assistee par Ordinateur) / FSAO (Fonctionnement des Services Assistee par Ordinateur) avec module "Arbre des Causes" pour l'analyse d'accidents.

## Fonctionnalites Principales
1. **Methodologies d'analyse** : QQOQCP, 5 Pourquoi, Diagramme d'Ishikawa (5M), grille ALARM
2. **IA** : Analyse guidee par une IA (OpenAI, Gemini, Claude via Emergent LLM)
3. **Admin** : Page de configuration pour activer/desactiver les methodes
4. **Grille ALARM** : Grille de cases a cocher detaillee
5. **Sauvegarde/Restauration** : Systeme robuste avec upload par morceaux, reparation de donnees
6. **Rapports PDF** : Generation de rapports PDF
7. **Actions manuelles** : Ajout d'actions correctives
8. **PWA** : Notifications push, installation, mode hors-ligne
9. **Personnalisation** : Couleurs, menu, theme par utilisateur
10. **Google Drive** : Integration pour stockage de sauvegardes

## Architecture
- **Frontend** : React + Shadcn UI
- **Backend** : FastAPI (Python)
- **Base de donnees** : MongoDB
- **Authentification** : JWT
- **IA** : Emergent LLM Key (OpenAI, Gemini, Claude)

## Taches Accomplies

### 15 Mars 2026 - Bug P0 Preferences
- [x] Fix race condition des doublons user_preferences apres restauration
- [x] Deduplication par user_id dans process_import_item
- [x] Nettoyage post-restauration automatique des doublons
- [x] Rechargement des preferences cote frontend apres restauration

### 15 Mars 2026 - Actions Correctives Semi-Automatiques
- [x] Fix creation checklists: inserees dans checklist_templates au lieu de checklists
- [x] Fix creation maintenance preventive: equipement_id obligatoire + validation
- [x] Dialogue semi-automatique CreateChecklistDialog (items editables, selection equipements)
- [x] Dialogue semi-automatique CreatePreventiveDialog (selection equipement requis, frequence, assignation)
- [x] Enrichissement prompt IA pour proposer des items de checklist et frequences suggerees

### Sessions precedentes
- [x] Systeme de sauvegarde/restauration robuste (chunked upload, 50+ collections)
- [x] Reparation et diagnostic des donnees post-restauration
- [x] Correction de la corruption de donnees lors de l'import
- [x] Correction du bouton "Exporter" desactive
- [x] Correction du lien SSH non cliquable
- [x] Sauvegarde des preferences de personnalisation

## Taches En Attente
- [ ] **(P1)** Validation utilisateur finale du flux sauvegarde/restauration
- [ ] **(P2)** Fiabilisation du script update_service.py
- [ ] **(P3)** Refactoring de process_import_item (trop complexe)

## Credentials de Test
- Admin: `buenogy@gmail.com` / `Admin2024!`
- GitHub: `Kinder0083/GMAO`
