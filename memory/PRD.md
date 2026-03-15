# FSAO Iris - PRD (Product Requirements Document)

## Problème Original
Application GMAO (Gestion de Maintenance Assistée par Ordinateur) / FSAO (Fonctionnement des Services Assistée par Ordinateur) avec module "Arbre des Causes" pour l'analyse d'accidents.

## Fonctionnalités Principales
1. **Méthodologies d'analyse** : QQOQCP, 5 Pourquoi, Diagramme d'Ishikawa (5M), grille ALARM
2. **IA** : Analyse guidée par une IA (OpenAI, Gemini, Claude via Emergent LLM)
3. **Admin** : Page de configuration pour activer/désactiver les méthodes
4. **Grille ALARM** : Grille de cases à cocher détaillée
5. **Sauvegarde/Restauration** : Système robuste avec upload par morceaux, réparation de données
6. **Rapports PDF** : Génération de rapports PDF
7. **Actions manuelles** : Ajout d'actions correctives
8. **PWA** : Notifications push, installation, mode hors-ligne
9. **Personnalisation** : Couleurs, menu, thème par utilisateur
10. **Google Drive** : Intégration pour stockage de sauvegardes

## Architecture
- **Frontend** : React + Shadcn UI
- **Backend** : FastAPI (Python)
- **Base de données** : MongoDB
- **Authentification** : JWT
- **IA** : Emergent LLM Key (OpenAI, Gemini, Claude)

## Tâches Accomplies (15 Mars 2026)
- [x] Système de sauvegarde/restauration robuste (chunked upload, 50+ collections)
- [x] Réparation et diagnostic des données post-restauration
- [x] Correction de la corruption de données lors de l'import (ObjectId, JSON, NaN)
- [x] Correction du bouton "Exporter" désactivé
- [x] Correction du lien SSH non cliquable
- [x] Sauvegarde des préférences de personnalisation
- [x] **P0 FIX** : Race condition des doublons user_preferences après restauration

## Tâches En Attente
- [ ] **(P1)** Validation utilisateur finale du flux sauvegarde/restauration
- [ ] **(P2)** Fiabilisation du script update_service.py
- [ ] **(P3)** Refactoring de process_import_item (trop complexe)

## Credentials de Test
- Admin: `buenogy@gmail.com` / `Admin2024!`
- GitHub: `Kinder0083/GMAO`
