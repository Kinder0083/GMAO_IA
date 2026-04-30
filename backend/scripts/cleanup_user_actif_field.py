#!/usr/bin/env python3
"""
cleanup_user_actif_field.py
============================
Resynchronise le champ legacy `actif` (boolean) avec `statut` (ACTIF/INACTIF)
qui est la source de vérité gérée par l'UI.

Pourquoi ?
----------
Le diagnostic du widget "Charge OT restante" a révélé que plusieurs utilisateurs
ont `actif=False` (legacy, jamais mis à jour) alors que leur `statut="ACTIF"`.
Cela cassait plusieurs filtres backend.

Règle appliquée :
    - Si statut (insensible à la casse) == "inactif"   →  actif = False
    - Sinon                                            →  actif = True

Usage :
    cd /opt/gmao-iris/backend
    /opt/gmao-iris/venv/bin/python3 scripts/cleanup_user_actif_field.py            # dry-run
    /opt/gmao-iris/venv/bin/python3 scripts/cleanup_user_actif_field.py --apply    # applique réellement
"""
import os
import re
import sys

try:
    from pymongo import MongoClient
    from dotenv import load_dotenv
except ModuleNotFoundError as e:
    sys.stderr.write(f"\n[ERREUR] Module manquant : {e.name}\n")
    sys.stderr.write("Lancez avec : /opt/gmao-iris/venv/bin/python3 scripts/cleanup_user_actif_field.py\n\n")
    sys.exit(2)

APPLY = "--apply" in sys.argv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

c = MongoClient(os.environ["MONGO_URL"])
db = c[os.environ.get("DB_NAME", "gmao_iris")]

SEP = "=" * 75
print(SEP)
print(f"  RESYNC du champ `actif` <- `statut`  ({'APPLY' if APPLY else 'DRY-RUN'})")
print(f"  Base : {db.name}")
print(SEP)

inactif_re = re.compile(r"^inactif$", re.IGNORECASE)

users = list(db.users.find(
    {},
    {"_id": 1, "id": 1, "email": 1, "actif": 1, "statut": 1, "service": 1}
))
print(f"\nTotal users analysés : {len(users)}\n")

to_set_true = []
to_set_false = []

for u in users:
    statut = u.get("statut", "") or ""
    target_actif = not bool(inactif_re.match(str(statut).strip()))
    current_actif = u.get("actif")
    # Considérer "missing" comme True par défaut côté UI
    current_norm = False if current_actif is False else True
    if current_norm != target_actif:
        if target_actif:
            to_set_true.append(u)
        else:
            to_set_false.append(u)

print(f"À passer  actif=True   : {len(to_set_true)}")
for u in to_set_true:
    print(f"   ↗ {u.get('email','?'):<40} statut={u.get('statut','?')} (actif {u.get('actif')!r} → True)")

print(f"\nÀ passer  actif=False  : {len(to_set_false)}")
for u in to_set_false:
    print(f"   ↘ {u.get('email','?'):<40} statut={u.get('statut','?')} (actif {u.get('actif')!r} → False)")

if not (to_set_true or to_set_false):
    print("\n✅ Tout est déjà cohérent. Rien à faire.")
    c.close()
    sys.exit(0)

if not APPLY:
    print("\n--- DRY-RUN : aucune modification écrite. Relancez avec --apply pour valider. ---")
    c.close()
    sys.exit(0)

# Apply
n_true = 0
for u in to_set_true:
    res = db.users.update_one({"_id": u["_id"]}, {"$set": {"actif": True}})
    n_true += res.modified_count
n_false = 0
for u in to_set_false:
    res = db.users.update_one({"_id": u["_id"]}, {"$set": {"actif": False}})
    n_false += res.modified_count

print(f"\n✅ Mises à jour appliquées : {n_true} → True, {n_false} → False")
c.close()
