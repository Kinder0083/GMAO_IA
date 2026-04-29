#!/usr/bin/env python3
"""
ensure_mes_indexes.py
=====================
Crée les index nécessaires pour les performances M.E.S.
À lancer une fois après une grosse accumulation de pulses (>100k).

Sans cet index, MongoDB tente de trier en mémoire et échoue avec :
    "Sort exceeded memory limit of 104857600 bytes"

Cet index résout définitivement ce souci.

Usage :
    cd /opt/gmao-iris/backend
    source ../venv/bin/activate     # ou /opt/gmao-iris/venv/bin/activate
    python3 scripts/ensure_mes_indexes.py
"""

import os
import sys
import time

try:
    from pymongo import MongoClient
    from dotenv import load_dotenv
except ModuleNotFoundError as e:
    sys.stderr.write(f"\n[ERREUR] Module manquant : {e.name}\n")
    sys.stderr.write("Lancez avec : /opt/gmao-iris/venv/bin/python3 scripts/ensure_mes_indexes.py\n\n")
    sys.exit(2)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

c = MongoClient(os.environ["MONGO_URL"])
db = c[os.environ.get("DB_NAME", "gmao_iris")]

print("=" * 60)
print("  CRÉATION DES INDEX M.E.S.")
print("=" * 60)

# Compter les documents pour estimer le temps
n_pulses = db.mes_pulses.estimated_document_count()
print(f"\nNombre estimé de pulses : {n_pulses:,}")
if n_pulses > 1_000_000:
    print(f"⚠️  Avec {n_pulses:,} documents, l'index peut prendre quelques minutes à créer.")

print()


def create_index_safely(collection, keys, name):
    """Crée un index. Affiche un message si déjà existant."""
    existing = collection.index_information()
    if name in existing:
        print(f"  ✓ Index '{name}' déjà présent sur {collection.name}")
        return
    print(f"  → Création index '{name}' sur {collection.name}...", flush=True)
    t0 = time.time()
    collection.create_index(keys, name=name, background=True)
    elapsed = time.time() - t0
    print(f"    ✅ Créé en {elapsed:.1f}s")


# Index principal — résout le bug "Sort exceeded memory limit"
create_index_safely(
    db.mes_pulses,
    [("machine_id", 1), ("timestamp", 1)],
    "machine_id_timestamp_idx",
)

# Index secondaire pour le nettoyage par date
create_index_safely(
    db.mes_pulses,
    [("timestamp", 1)],
    "timestamp_idx",
)

# Index pour mes_cadence_history (utilisé par les graphiques)
create_index_safely(
    db.mes_cadence_history,
    [("machine_id", 1), ("timestamp", 1)],
    "machine_id_timestamp_idx",
)

# Index pour mes_alerts
create_index_safely(
    db.mes_alerts,
    [("machine_id", 1), ("created_at", -1)],
    "machine_id_created_at_idx",
)

print()
print("=" * 60)
print("  ✅ TERMINÉ")
print("=" * 60)
print("\nIndexes actuels sur mes_pulses :")
for name, info in db.mes_pulses.index_information().items():
    keys = info.get("key", [])
    print(f"  - {name}  →  {keys}")

print("\n→ Vous pouvez redémarrer le backend (recommandé) :")
print("  sudo supervisorctl restart gmao-iris-backend")

c.close()
