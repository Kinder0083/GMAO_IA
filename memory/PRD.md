# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Correction systeme de mise a jour v5.0 (8 mars 2026)
- BUGFIX CRITIQUE (P0): Remplacement de l'approche "worker externe" (update_worker.py) par une approche "in-process"
- Cause racine: le worker externe (processus Python separe) ne demarrait pas correctement sur le serveur de production, aucun log n'etait enregistre
- Solution: la mise a jour s'execute maintenant directement dans le process FastAPI (comme l'ancienne version fonctionnelle)
- Logs sauvegardes dans MongoDB en temps reel a chaque etape via motor (async)
- Support `--extra-index-url` pour le package prive `emergentintegrations`
- Detection automatique du venv pip (`/opt/gmao-iris/venv/bin/pip`)
- Git pull avec fallback vers git fetch + reset --hard
- Sauvegarde/restauration des fichiers .env avant/apres git pull
- Redemarrage planifie via script bash detache (3 secondes apres la fin)
- Backup du build frontend avant yarn build, avec restauration en cas d'echec

### Extraction IA Presqu'accidents (8 mars 2026)
- Bouton "Extraction IA" dans la section Presqu'accident
- Parse fichiers Excel .xls (xlrd) et .xlsx (openpyxl)
- Support PDF et Images (PNG, JPG, JPEG, WEBP) via Gemini LLM
- Extraction automatique: numero, service, date, lieu, categorie, description, mesures immediates
- Conversion dates Excel (format numerique) en YYYY-MM-DD
- Mapping automatique des services (PRODUCTION, MAINTENANCE, QUALITE, etc.)
- Dialog de selection avec checkboxes pour choisir les items a importer
- Import en masse via l'API existante createItem
- Nettoyage automatique des valeurs "None"/"null" dans les reponses Gemini
- Generation automatique de titre si absent (fallback: "PA X - description")

### Module Formation et Questionnaire (7 mars 2026)
- Sessions de formation avec slides editables et questionnaire QCM (20 questions)
- Envoi de liens ephemeres par email
- Page publique sans authentification pour les nouveaux arrivants
- Historique des reponses, calcul automatique du score
- Integration au systeme de permissions

## Architecture
```
/app/backend/
  update_service.py           # Systeme de mise a jour v5.0 (in-process)
  update_worker.py            # OBSOLETE (conserve pour compatibilite)
  update_manager.py           # Gestionnaire de versions
  presqu_accident_routes.py   # Endpoint /ai/extract (Excel + PDF/Images via Gemini)
  training_routes.py          # Module formation
  server.py                   # Routes + endpoints

/app/frontend/src/
  pages/Updates.jsx           # Page admin mise a jour
  pages/PresquAccidentList.jsx # Bouton Extraction IA + dialog multi-format
  pages/TrainingPage.jsx       # Page admin formation
  pages/TrainingPublicPage.jsx # Page publique nouveaux arrivants
```

## Backlog
- (P2) Scanner QR integre (via camera) - DEJA FAIT dans une session precedente
- (P2) Mode inventaire rapide (scan successif) - DEJA FAIT dans une session precedente

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## 3rd Party Integrations
- Gemini (via emergentintegrations + EMERGENT_LLM_KEY) pour extraction PDF/images
