#!/usr/bin/env python3
"""
diagnose_maintenance_techs.py
==============================
Diagnostic du widget "Charge OT restante" : compte les techniciens du service
maintenance avec la même logique que le backend, en affichant le détail.

Usage :
    cd /opt/gmao-iris/backend
    source ../venv/bin/activate
    python3 scripts/diagnose_maintenance_techs.py
"""

import os
import re
import sys

try:
    from pymongo import MongoClient
    from dotenv import load_dotenv
except ModuleNotFoundError as e:
    sys.stderr.write(f"\n[ERREUR] Module manquant : {e.name}\n")
    sys.stderr.write("Lancez avec : /opt/gmao-iris/venv/bin/python3 scripts/diagnose_maintenance_techs.py\n\n")
    sys.exit(2)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

c = MongoClient(os.environ["MONGO_URL"])
db = c[os.environ.get("DB_NAME", "gmao_iris")]

maint_regex = re.compile(r"^maintenance$", re.IGNORECASE)

print("=" * 70)
print("1. USERS du service 'maintenance'")
print("=" * 70)
users = list(db.users.find(
    {"service": maint_regex},
    {"_id": 1, "id": 1, "email": 1, "actif": 1, "statut": 1, "role": 1, "deleted_at": 1, "service": 1}
))
print(f"Total brut : {len(users)}\n")
for u in users:
    print(f"  email={u.get('email','?'):<40} role={u.get('role','?'):<12} "
          f"service='{u.get('service','?')}' actif={u.get('actif')} "
          f"statut='{u.get('statut','?')}' deleted_at={u.get('deleted_at','-')}")

print()
print("=" * 70)
print("2. RESPONSABLES service 'maintenance'")
print("=" * 70)
resps = list(db.service_responsables.find({"service": maint_regex}, {"_id": 0}))
print(f"Total : {len(resps)}\n")
for r in resps:
    uid = r.get("user_id")
    user_match = db.users.find_one(
        {"$or": [{"id": uid}, {"_id": uid}]},
        {"email": 1, "_id": 0}
    )
    label = user_match.get("email") if user_match else "? (ORPHELIN)"
    print(f"  user_id={uid}  user_name={r.get('user_name','?')}  -> {label}")

print()
print("=" * 70)
print("3. CALCUL FINAL — logique exacte du widget")
print("=" * 70)
NOT_DELETED = {"deleted_at": {"$in": [None, "", False, 0]}}
all_users = list(db.users.find(
    {
        "service": maint_regex,
        "actif": {"$ne": False},
        "statut": {"$not": {"$regex": "^inactif$", "$options": "i"}},
        **NOT_DELETED
    },
    {"id": 1, "_id": 1, "email": 1}
))
print(f"Users 'maintenance' actifs et non-supprimés : {len(all_users)}")
for u in all_users:
    print(f"  - {u.get('email','?')}")

resp_ids = {str(r.get("user_id")) for r in resps if r.get("user_id")}
print(f"\nIDs responsables (à exclure) : {len(resp_ids)}")
for rid in resp_ids:
    print(f"  - {rid}")

techs = []
print(f"\nDécision pour chaque user :")
for u in all_users:
    uid = u.get("id") or str(u.get("_id", ""))
    if uid and uid not in resp_ids:
        techs.append(u.get("email"))
        print(f"  [OK]  {u.get('email','?'):<40} (uid={uid})")
    else:
        print(f"  [EXCLU - responsable]  {u.get('email','?'):<40} (uid={uid})")

print()
print("=" * 70)
print(f"  RESULTAT FINAL : {len(techs)} technicien(s) compte(s)")
print("=" * 70)
for t in techs:
    print(f"  - {t}")

# 4. Bonus : variantes orthographiques de "maintenance" trouvees
print()
print("=" * 70)
print("4. VARIANTES de service contenant 'maint' (au cas ou)")
print("=" * 70)
loose_regex = re.compile(r".*maint.*", re.IGNORECASE)
distinct_services = db.users.distinct("service")
matching = [s for s in distinct_services if s and loose_regex.search(str(s))]
print(f"Services distincts avec 'maint' dans le nom : {matching}")
for s in matching:
    count = db.users.count_documents({"service": s})
    print(f"  '{s}' : {count} user(s)")

c.close()
