#!/usr/bin/env python3
"""
normalize_user_ids.py
=====================
Migration minimaliste : ajoute un champ `id = str(_id)` aux utilisateurs
(et autres collections sensibles) qui n'en ont pas.

⚠️  Ce script est CONÇU POUR ÊTRE SAFE :
    - Ne supprime aucun champ
    - Ne modifie aucun `id` existant
    - Ne touche qu'aux documents où `id` est absent, null ou vide
    - Propose un mode `--dry-run` par défaut recommandé

Collections traitées :
    - users
    - service_responsables (champ `user_id`)
    - Optionnel : autres collections si --all

Usage :
    cd /opt/gmao-iris/backend
    source ../venv/bin/activate     # ou /opt/gmao-iris/venv/bin/activate
    python3 scripts/normalize_user_ids.py --dry-run
    # Après vérification :
    python3 scripts/normalize_user_ids.py
"""

import os
import sys
from datetime import datetime

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
    sys.stderr.write("     source ../venv/bin/activate\n")
    sys.stderr.write("     python3 scripts/normalize_user_ids.py --dry-run\n\n")
    sys.stderr.write("  2) Utiliser directement le python du venv :\n")
    sys.stderr.write("     /opt/gmao-iris/venv/bin/python3 /opt/gmao-iris/backend/scripts/normalize_user_ids.py --dry-run\n\n")
    sys.exit(2)

DRY_RUN = "--dry-run" in sys.argv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME   = os.environ.get("DB_NAME", "gmao_iris")

if not MONGO_URL:
    print("[ERREUR] Variable MONGO_URL manquante dans le .env")
    sys.exit(1)

client = MongoClient(MONGO_URL)
db     = client[DB_NAME]

SEP = "=" * 60
mode = "DRY-RUN (simulation)" if DRY_RUN else "ÉCRITURE RÉELLE"

print(SEP)
print(f"  NORMALISATION IDs UTILISATEURS — {mode}")
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


# ─── 1. Collection `users` ───────────────────────────────────────────────────
print("=== 1. COLLECTION users ===\n")
users_coll = db["users"]

# Filtre : documents où `id` est absent, null ou chaîne vide
missing_id_filter = {
    "$or": [
        {"id": {"$exists": False}},
        {"id": None},
        {"id": ""}
    ]
}

users_missing = list(users_coll.find(missing_id_filter, {"_id": 1, "email": 1, "id": 1}))

if not users_missing:
    print("  ✓ Tous les utilisateurs ont déjà un `id` valide. Rien à faire.\n")
else:
    print(f"  {len(users_missing)} utilisateur(s) sans `id` trouvé(s) :\n")
    for u in users_missing:
        email = u.get("email", "(sans email)")
        oid = str(u["_id"])
        current_id = u.get("id", "∅ absent")
        print(f"    • {email:<40} _id={oid}  id={current_id}")

    print()
    if not DRY_RUN:
        updated = 0
        for u in users_missing:
            new_id = str(u["_id"])
            result = users_coll.update_one(
                {"_id": u["_id"]},
                {"$set": {"id": new_id}}
            )
            if result.modified_count == 1:
                updated += 1
        print(f"  → {updated} utilisateur(s) mis à jour avec id = str(_id)\n")
    else:
        print(f"  → {len(users_missing)} utilisateur(s) SERAIENT mis à jour (id = str(_id))\n")


# ─── 2. Collection service_responsables (user_id) ────────────────────────────
print("=== 2. COLLECTION service_responsables (cohérence user_id) ===\n")
resp_coll = db["service_responsables"]

# Chaque user_id doit correspondre soit à un `id` d'user, soit à un `_id` d'user.
# On vérifie juste l'intégrité — on ne modifie rien ici car le fix Python côté
# backend gère déjà les deux formats.
all_users = list(users_coll.find({}, {"_id": 1, "id": 1, "email": 1}))
known_ids = set()
for u in all_users:
    known_ids.add(str(u["_id"]))
    if u.get("id"):
        known_ids.add(str(u["id"]))

responsables = list(resp_coll.find({}, {"_id": 1, "user_id": 1, "user_name": 1, "service": 1}))
orphans = []
for r in responsables:
    uid = r.get("user_id")
    if uid and str(uid) not in known_ids:
        orphans.append(r)

if orphans:
    print(f"  ⚠️  {len(orphans)} responsable(s) référencent un user_id inconnu :")
    for o in orphans:
        print(f"    • service={o.get('service')}  user_name={o.get('user_name', '?')}  user_id={o.get('user_id')}")
    print("  (Aucune action automatique — à vérifier manuellement si nécessaire)\n")
else:
    print(f"  ✓ Les {len(responsables)} responsable(s) référencent tous un utilisateur existant.\n")


# ─── 3. Rapport final ────────────────────────────────────────────────────────
print(SEP)
print(f"  NORMALISATION TERMINÉE — mode : {mode}")
print(f"  Utilisateurs normalisés : {len(users_missing)}")
print(f"  Orphelins détectés      : {len(orphans)}")
if DRY_RUN and users_missing:
    print("\n  → Relancez sans --dry-run pour appliquer les modifications.")
elif not DRY_RUN and users_missing:
    print("\n  → Redémarrez le backend : sudo supervisorctl restart gmao-iris-backend")
print(SEP)

client.close()
