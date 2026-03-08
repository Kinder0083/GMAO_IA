# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Correction import presqu'accidents (8 mars 2026)
- BUGFIX: L'import des presqu'accidents extraits du fichier Excel ne sauvegardait pas tous les champs
- Cause racine: l'ancien code utilisait `createItem` qui forcait `status=A_TRAITER` et ne passait pas `commentaire_traitement`, `responsable_action`, `status`
- Solution: Nouvel endpoint `POST /api/presqu-accident/import-bulk` qui accepte TOUS les champs
- Frontend modifie pour utiliser le nouvel endpoint et envoyer toutes les donnees extraites
- Resultat: 169 items correctement importes avec TERMINE:113, EN_COURS:17, A_TRAITER:39

### Correction systeme de mise a jour v5.0 (8 mars 2026)
- BUGFIX CRITIQUE (P0): Remplacement de l'approche "worker externe" par une approche "in-process"
- Cause racine: le worker externe ne demarrait pas sur le serveur de production, aucun log enregistre
- Solution: mise a jour in-process dans le process FastAPI avec logs MongoDB temps reel
- Support `--extra-index-url` pour le package prive `emergentintegrations`
- Detection automatique du venv pip, git pull avec fallback, sauvegarde/restauration .env

### Extraction IA Presqu'accidents
- Parse fichiers Excel .xls (xlrd) et .xlsx (openpyxl)
- Support PDF et Images via Gemini LLM
- Mapping intelligent des en-tetes Excel vers les champs de l'application
- Mapping services (PRODUCTION, MAINTENANCE, QUALITE->QHSE, LABORATOIRE->LABO, etc.)
- Mapping statuts (SOLDEE->TERMINE, EN COURS->EN_COURS, SUPPRIMEE->TERMINE, etc.)

## Architecture
```
/app/backend/
  presqu_accident_routes.py   # Endpoints: ai/extract, import-bulk, CRUD
  update_service.py           # Systeme de mise a jour v5.0 (in-process)
  server.py                   # Routes principales

/app/frontend/src/
  pages/PresquAccidentList.jsx # Extraction IA + import en masse
  pages/Updates.jsx            # Page admin mise a jour
```

## Backlog
- Aucune tache en attente

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## 3rd Party Integrations
- Gemini (via emergentintegrations + EMERGENT_LLM_KEY) pour extraction PDF/images
