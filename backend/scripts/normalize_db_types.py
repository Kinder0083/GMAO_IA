#!/usr/bin/env python3
"""
normalize_db_types.py
=====================
Migration : normalisation des types en base de données MongoDB.

Opérations effectuées :
  1. dateTermine (string ISO → datetime BSON)  sur work_orders
  2. dateCreation, dateMiseAJour, updatedAt idem sur toutes les collections
  3. tempsEstime / temps_estime (string → float, en heures)
  4. Rapport final des documents modifiés

⚠️  IMPORTANT : Ce script modifie directement la base de données.
    Faites une sauvegarde MongoDB AVANT de l'exécuter en production :
        mongodump --uri="$MONGO_URL" --out=/tmp/backup_$(date +%Y%m%d_%H%M%S)

Usage :
    cd /opt/gmao-iris/backend
    source ../venv/bin/activate
    python3 scripts/normalize_db_types.py [--dry-run]

    --dry-run  : simule sans écrire (affiche ce qui serait modifié)
"""

import os
import sys
import re
from datetime import datetime, timezone

# --- Vérification des dépendances avec message d'aide explicite ---
try:
    from pymongo import MongoClient
    from dotenv import load_dotenv
except ModuleNotFoundError as e:
    missing = str(e).split("'")[1] if "'" in str(e) else str(e)
    sys.stderr.write(f"\n[ERREUR] Module Python manquant : {missing}\n\n")
    sys.stderr.write("Ce script doit être exécuté avec l'environnement Python du backend.\n\n")
    sys.stderr.write("Solutions possibles :\n\n")
    sys.stderr.write("  1) Activer le venv du backend (recommandé) :\n")
    sys.stderr.write("     cd /opt/gmao-iris/backend\n")
    sys.stderr.write("     source ../venv/bin/activate  # ou 'source venv/bin/activate'\n")
    sys.stderr.write("     python3 scripts/normalize_db_types.py --dry-run\n\n")
    sys.stderr.write("  2) Installer les dépendances en système (root) :\n")
    sys.stderr.write("     pip3 install pymongo python-dotenv\n")
    sys.stderr.write("     python3 /opt/gmao-iris/backend/scripts/normalize_db_types.py --dry-run\n\n")
    sys.stderr.write("  3) Utiliser directement le python du venv sans l'activer :\n")
    sys.stderr.write("     /opt/gmao-iris/venv/bin/python3 /opt/gmao-iris/backend/scripts/normalize_db_types.py --dry-run\n\n")
    sys.exit(2)

DRY_RUN = "--dry-run" in sys.argv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME   = os.environ.get("DB_NAME", "gmao")

if not MONGO_URL:
    print("[ERREUR] Variable MONGO_URL manquante dans le .env")
    sys.exit(1)

client = MongoClient(MONGO_URL)
db     = client[DB_NAME]

SEP = "=" * 60
mode = "DRY-RUN (simulation)" if DRY_RUN else "ÉCRITURE RÉELLE"

print(SEP)
print(f"  MIGRATION BASE DE DONNÉES — {mode}")
print(f"  Base : {DB_NAME}  |  Date : {datetime.now().strftime('%d/%m/%Y %H:%M')}")
print(SEP)

if DRY_RUN:
    print("\n[DRY-RUN] Aucune modification ne sera effectuée.\n")
else:
    print("\n[ATTENTION] Modification réelle. Ctrl+C pour annuler dans les 5 secondes.")
    import time
    for i in range(5, 0, -1):
        print(f"  Démarrage dans {i}s...", end="\r")
        time.sleep(1)
    print("\n")


# ─── Utilitaires ─────────────────────────────────────────────────────────────
def parse_iso(val):
    """Convertit une string ISO en datetime naïf UTC. Retourne None si impossible."""
    if not isinstance(val, str):
        return None
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        return dt.replace(tzinfo=None)  # naïf UTC pour MongoDB Motor
    except (ValueError, AttributeError):
        return None


def parse_duration_to_hours(val):
    """
    Convertit une durée en heures (float).
    Formats supportés : "2h30", "2h", "30min", "1.5", 90 (minutes), 1.5 (heures)
    Retourne None si non convertible.
    """
    if isinstance(val, (int, float)):
        # Si la valeur semble être en minutes (> 24), la convertir en heures
        # Heuristique : si > 24 et entier, probablement en minutes
        if isinstance(val, int) and val > 24:
            return round(val / 60.0, 2)
        return float(val)
    if isinstance(val, str):
        val = val.strip()
        # Format "2h30" ou "2h 30min"
        m = re.match(r"^(\d+(?:\.\d+)?)\s*h\s*(\d+)?", val, re.IGNORECASE)
        if m:
            hours = float(m.group(1))
            mins = float(m.group(2)) if m.group(2) else 0
            return round(hours + mins / 60, 2)
        # Format "30min" ou "30m"
        m = re.match(r"^(\d+(?:\.\d+)?)\s*(?:min|m)$", val, re.IGNORECASE)
        if m:
            return round(float(m.group(1)) / 60, 2)
        # Format numérique pur "1.5"
        try:
            return float(val)
        except ValueError:
            return None
    return None


# ─── 1. Normalisation des champs de date ────────────────────────────────────
DATE_COLLECTIONS = {
    "work_orders": ["dateTermine", "dateCreation", "dateMiseAJour", "updatedAt", "date_limite"],
    "users":       ["dateCreation", "updatedAt", "last_login"],
    "equipments":  ["dateCreation", "updatedAt", "date_installation"],
    "consignes":   ["dateCreation", "date_validite", "updatedAt"],
    "intervention_requests": ["dateCreation", "updatedAt", "date_limite_desiree"],
    "preventive_maintenance": ["dateCreation", "updatedAt", "prochaine_date", "derniere_date"],
}

print("=== 1. NORMALISATION DATES (string → datetime) ===\n")
total_dates_fixed = 0

for collection_name, date_fields in DATE_COLLECTIONS.items():
    coll = db[collection_name]
    fixed_coll = 0

    for field in date_fields:
        # Trouver les documents où ce champ est une string
        docs = list(coll.find({field: {"$type": "string"}}, {"_id": 1, field: 1}))
        for doc in docs:
            val = doc.get(field)
            parsed = parse_iso(val)
            if parsed:
                if not DRY_RUN:
                    coll.update_one({"_id": doc["_id"]}, {"$set": {field: parsed}})
                fixed_coll += 1
                total_dates_fixed += 1

    if fixed_coll > 0:
        print(f"  [{collection_name}] {fixed_coll} date(s) converties")

if total_dates_fixed == 0:
    print("  Aucune date string trouvée — base déjà propre ou collections vides.")
else:
    print(f"\n  Total dates normalisées : {total_dates_fixed}")

# ─── 2. Normalisation tempsEstime ────────────────────────────────────────────
print("\n=== 2. NORMALISATION tempsEstime (string/minutes → heures float) ===\n")
wo_coll = db["work_orders"]

# Cas A : tempsEstime est une string
str_est = list(wo_coll.find({"tempsEstime": {"$type": "string"}}, {"_id": 1, "tempsEstime": 1}))
fixed_str = 0
for doc in str_est:
    h = parse_duration_to_hours(doc["tempsEstime"])
    if h is not None and h > 0:
        if not DRY_RUN:
            wo_coll.update_one({"_id": doc["_id"]}, {"$set": {"tempsEstime": h}})
        fixed_str += 1

# Cas B : temps_estime (snake_case) est numérique → copier dans tempsEstime
snake_est = list(wo_coll.find(
    {"temps_estime": {"$type": ["int", "double"]}, "tempsEstime": {"$exists": False}},
    {"_id": 1, "temps_estime": 1}
))
fixed_snake = 0
for doc in snake_est:
    h = parse_duration_to_hours(doc["temps_estime"])
    if h is not None and h > 0:
        if not DRY_RUN:
            wo_coll.update_one({"_id": doc["_id"]}, {"$set": {"tempsEstime": h}})
        fixed_snake += 1

# Cas C : temps_estime est une string (templates) → convertir et copier
snake_str = list(wo_coll.find(
    {"temps_estime": {"$type": "string"}, "tempsEstime": {"$exists": False}},
    {"_id": 1, "temps_estime": 1}
))
fixed_snake_str = 0
for doc in snake_str:
    h = parse_duration_to_hours(doc["temps_estime"])
    if h is not None and h > 0:
        if not DRY_RUN:
            wo_coll.update_one({"_id": doc["_id"]}, {"$set": {"tempsEstime": h}})
        fixed_snake_str += 1

print(f"  tempsEstime string → float      : {fixed_str}")
print(f"  temps_estime numérique → copiés : {fixed_snake}")
print(f"  temps_estime string → convertis : {fixed_snake_str}")
total_est = fixed_str + fixed_snake + fixed_snake_str
if total_est == 0:
    print("  Aucune normalisation nécessaire sur tempsEstime.")
else:
    print(f"\n  Total tempsEstime normalisés : {total_est}")

# ─── 3. Rapport final ─────────────────────────────────────────────────────────
print(f"\n{SEP}")
print(f"  MIGRATION TERMINÉE — mode : {mode}")
print(f"  Dates normalisées  : {total_dates_fixed}")
print(f"  tempsEstime fixés  : {total_est}")
if DRY_RUN:
    print("\n  → Relancez sans --dry-run pour appliquer les modifications.")
else:
    print("\n  → Redémarrez le backend : supervisorctl restart gmao-iris-backend")
print(SEP)

client.close()
