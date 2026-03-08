# FSAO Iris - GMAO

## Description
Application de GMAO complete (FastAPI + React + MongoDB).

## Fonctionnalites implementees

### Fix systeme de mise a jour v7.0 (8 mars 2026)
**3 differences critiques identifiees entre la MAJ par l'app et les commandes SSH manuelles:**
1. **Redemarrage** (cause principale): l'app faisait `supervisorctl restart gmao-iris-backend` avec un nom de processus potentiellement faux et erreurs masquees par `2>/dev/null`. L'utilisateur fait `reboot`. Fix: le script de redemarrage fait maintenant un `reboot` systematique apres sauvegarde du resultat, exactement comme la methode manuelle.
2. **yarn build**: l'app limitait la memoire Node.js a 1GB (`NODE_OPTIONS=--max_old_space_size=1024`), ce qui pouvait faire echouer le build. Fix: limite retiree.
3. **Logs**: Les erreurs du script de redemarrage etaient masquees. Fix: tout est logue dans `/var/log/gmao-iris-restart.log`.

### Bugfix: NoneType dans generate-report (8 mars 2026)
- Cause: `contexte_cause` stocke en `null` dans MongoDB. `dict.get('key','')` retourne `None` quand la cle existe avec valeur null. `None[:80]` = crash.
- Fix: `(it.get('contexte_cause') or '')[:80]` dans 3 occurrences

### Systeme d'archivage IA des presqu'accidents (8 mars 2026)
- Collection `ai_pa_archives` pour stocker les rapports IA archives
- `analyze-trends` et `generate-report` excluent les incidents deja archives, archivent automatiquement
- Endpoints CRUD: GET /archives, GET /archives/{id}, DELETE /archives/{id}
- Bouton "Archives IA" sur la page "Rapport P.accident"
- Page /presqu-accident-archives-ia avec stats et liste des archives

### Import en masse presqu'accidents (8 mars 2026)
- Endpoint POST /api/presqu-accident/import-bulk avec tous les champs

### Logique de fallback IA (8 mars 2026)
- Chaine: modele prefere utilisateur -> OpenAI -> Claude

## Architecture
```
Backend:
  update_service.py              # v7.0 avec reboot post-MAJ
  ai_presqu_accident_routes.py   # IA + archivage + CRUD archives + fallback
  server.py                      # endpoints principaux
  presqu_accident_routes.py      # import-bulk

Frontend:
  pages/PresquAccidentArchivesIA.jsx
  pages/PresquAccidentRapport.jsx
  components/AIPATrendAnalyzer.jsx
  components/AIQHSEReport.jsx
  services/api.js
  App.js
```

## IMPORTANT: Doublon backend/backend/
Toute modification doit etre copiee dans les DEUX emplacements.

## Credentials
- Admin: buenogy@gmail.com / Admin2024!

## Integrations
- Gemini, OpenAI, Claude (via emergentintegrations + Emergent LLM Key)
- Note: Budget Gemini depasse - fallback OpenAI actif
