# Scripts de maintenance GMAO Iris

Ce dossier contient les scripts utilitaires à exécuter directement sur le serveur de production.

## Usage général

```bash
cd /opt/gmao-iris/backend
source ../venv/bin/activate
python3 scripts/<nom_du_script>.py
```

---

## Scripts disponibles

### `check_ecart_temps.py` — Diagnostic widget Écart Temps Est./Réel

Analyse la base de données pour expliquer la valeur affichée dans le widget du tableau de bord.

**Ce qu'il détecte :**
- OT terminés sans `tempsEstime` ou `tempsReel` → exclus du calcul
- `dateTermine` stockée en string ISO (cause silencieuse d'exclusion)
- Mélange de champs `tempsEstime` (camelCase) vs `temps_estime` (snake_case)
- Calcul réel avec les deux logiques (avant/après correctif)

```bash
python3 scripts/check_ecart_temps.py
```

---

### `fix_mes_tzinfo.py` — Correctif erreur MES en boucle

Corrige l'erreur `AttributeError: 'str' object has no attribute 'tzinfo'`
qui génère 100 000+ lignes d'erreurs dans les logs depuis le 31/03/2026.

**Ce qu'il fait :**
- Patche `mes_service.py` pour gérer les timestamps stockés en string
- Crée une sauvegarde automatique du fichier avant modification

```bash
python3 scripts/fix_mes_tzinfo.py
supervisorctl restart gmao-iris-backend
```

---

### `normalize_db_types.py` — Migration : normalisation des types MongoDB

Convertit les champs de date (string ISO → datetime BSON) et les champs
`tempsEstime` (string/minutes → float heures) dans toute la base.

**Toujours faire un dry-run avant :**

```bash
# Simulation (sans modification)
python3 scripts/normalize_db_types.py --dry-run

# Application réelle (après vérification)
mongodump --uri="$MONGO_URL" --out=/tmp/backup_$(date +%Y%m%d_%H%M%S)
python3 scripts/normalize_db_types.py
```

---

## Ordre d'exécution recommandé (après une mise à jour)

```bash
# 1. Diagnostic (lecture seule, sans risque)
python3 scripts/check_ecart_temps.py

# 2. Correctif MES si des erreurs sont présentes dans les logs
python3 scripts/fix_mes_tzinfo.py

# 3. Normalisation DB (avec backup préalable)
python3 scripts/normalize_db_types.py --dry-run   # vérifier d'abord
python3 scripts/normalize_db_types.py             # puis appliquer

# 4. Redémarrer le backend
supervisorctl restart gmao-iris-backend
```
