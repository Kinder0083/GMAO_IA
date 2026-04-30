#!/usr/bin/env python3
"""
dedupe_service_responsables.py
===============================
Supprime les doublons dans la collection `service_responsables`.

Le diagnostic a montré 4 entrées identiques pour le même responsable
(Gregory Bueno) sur le service Maintenance. Ce script garde 1 seule
entrée par couple (service, user_id) et supprime les autres.

Usage :
    cd /opt/gmao-iris/backend
    /opt/gmao-iris/venv/bin/python3 scripts/dedupe_service_responsables.py            # dry-run
    /opt/gmao-iris/venv/bin/python3 scripts/dedupe_service_responsables.py --apply    # applique
"""
import os
import sys
from collections import defaultdict

try:
    from pymongo import MongoClient
    from dotenv import load_dotenv
except ModuleNotFoundError as e:
    sys.stderr.write(f"\n[ERREUR] Module manquant : {e.name}\n")
    sys.stderr.write("Lancez avec : /opt/gmao-iris/venv/bin/python3 scripts/dedupe_service_responsables.py\n\n")
    sys.exit(2)

APPLY = "--apply" in sys.argv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

c = MongoClient(os.environ["MONGO_URL"])
db = c[os.environ.get("DB_NAME", "gmao_iris")]

SEP = "=" * 75
print(SEP)
print(f"  DÉDOUBLONNAGE service_responsables  ({'APPLY' if APPLY else 'DRY-RUN'})")
print(f"  Base : {db.name}")
print(SEP)

all_docs = list(db.service_responsables.find({}))
print(f"\nTotal documents : {len(all_docs)}")

groups = defaultdict(list)
for d in all_docs:
    key = (str(d.get("service", "")).lower().strip(), str(d.get("user_id", "")))
    groups[key].append(d)

duplicates = []
for key, docs in groups.items():
    if len(docs) > 1:
        # garder le premier, supprimer les autres
        docs_sorted = sorted(docs, key=lambda x: str(x.get("_id")))
        keep = docs_sorted[0]
        remove = docs_sorted[1:]
        duplicates.append((key, keep, remove))

if not duplicates:
    print("\n✅ Aucun doublon détecté.")
    c.close()
    sys.exit(0)

print(f"\nDoublons détectés : {len(duplicates)} groupe(s)\n")
total_to_remove = 0
for (service, user_id), keep, remove in duplicates:
    print(f"  ▸ service='{service}'  user_id={user_id}  user_name={keep.get('user_name','?')}")
    print(f"      ✓ KEEP   _id={keep['_id']}")
    for r in remove:
        print(f"      ✗ DELETE _id={r['_id']}")
        total_to_remove += 1

print(f"\nTotal à supprimer : {total_to_remove}")

if not APPLY:
    print("\n--- DRY-RUN : aucune suppression effectuée. Relancez avec --apply pour valider. ---")
    c.close()
    sys.exit(0)

n = 0
for (_, _, remove) in duplicates:
    for r in remove:
        res = db.service_responsables.delete_one({"_id": r["_id"]})
        n += res.deleted_count

print(f"\n✅ {n} doublon(s) supprimé(s).")
c.close()
