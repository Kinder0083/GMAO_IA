#!/usr/bin/env python3
"""
diagnose_charge_ot_widget.py
=============================
Diagnostic complet du widget "Charge OT restante" du Dashboard.

Reproduit fidèlement la logique côté backend (server.py / _compute_time_widgets)
et affiche en détail :
  1. Tous les users avec service "maintenance" (variantes incluses)
  2. Application un par un de chaque filtre (actif, statut, deleted_at)
  3. Liste des responsables service maintenance
  4. Décision finale par user (compté ou exclu)
  5. OT en cours (non terminés / non annulés / non supprimés)
  6. Calcul des heures estimées restantes
  7. Charge moyenne par technicien

Usage :
    cd /opt/gmao-iris/backend
    source ../venv/bin/activate
    python3 scripts/diagnose_charge_ot_widget.py
"""

import os
import re
import sys

try:
    from pymongo import MongoClient
    from dotenv import load_dotenv
except ModuleNotFoundError as e:
    sys.stderr.write(f"\n[ERREUR] Module manquant : {e.name}\n")
    sys.stderr.write("Lancez avec : /opt/gmao-iris/venv/bin/python3 scripts/diagnose_charge_ot_widget.py\n\n")
    sys.exit(2)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

c = MongoClient(os.environ["MONGO_URL"])
db = c[os.environ.get("DB_NAME", "gmao_iris")]

SEP = "=" * 75

print(SEP)
print("  DIAGNOSTIC COMPLET — WIDGET 'Charge OT restante'")
print(f"  Base : {db.name}")
print(SEP)

# ─── Étape 1 : Variantes orthographiques de 'maintenance' ────────────────────
print("\n[1] DÉTECTION DES VARIANTES DE SERVICE 'maintenance'")
print("-" * 75)

distinct_services = db.users.distinct("service")
print(f"Services distincts en base : {distinct_services}")

maint_strict = re.compile(r"^maintenance$", re.IGNORECASE)
maint_loose = re.compile(r".*maint.*", re.IGNORECASE)

strict_match = [s for s in distinct_services if s and maint_strict.search(str(s))]
loose_match = [s for s in distinct_services if s and maint_loose.search(str(s)) and s not in strict_match]

print(f"\nServices correspondant EXACTEMENT à 'maintenance' (insensible à la casse) :")
for s in strict_match:
    n = db.users.count_documents({"service": s})
    print(f"   '{s}'  →  {n} user(s)")

if loose_match:
    print(f"\n⚠️  Services contenant 'maint' mais NON correspondants au filtre du widget :")
    for s in loose_match:
        n = db.users.count_documents({"service": s})
        print(f"   '{s}'  →  {n} user(s) — CES USERS NE SONT PAS COMPTÉS")
    print("   → Si ces users devraient compter, alignez leur service à 'Maintenance' exactement.")
else:
    print(f"\n✓ Aucune variante de 'maintenance' problématique détectée.")


# ─── Étape 2 : Tous les users du service maintenance (avant filtres) ─────────
print(f"\n[2] TOUS LES USERS service 'maintenance' (avant filtrage)")
print("-" * 75)

users_brut = list(db.users.find(
    {"service": maint_strict},
    {"_id": 1, "id": 1, "email": 1, "nom": 1, "prenom": 1,
     "role": 1, "service": 1, "actif": 1, "statut": 1, "deleted_at": 1}
))
print(f"Total brut : {len(users_brut)}\n")
print(f"  {'EMAIL':<35} {'ROLE':<14} {'ACTIF':<6} {'STATUT':<10} {'DELETED_AT':<14} {'A id?'}")
for u in users_brut:
    deleted = u.get("deleted_at", "-")
    if deleted is None:
        deleted = "None"
    elif deleted in ("", False, 0):
        deleted = str(deleted)
    has_id = "✓" if u.get("id") else "✗ (use _id)"
    print(f"  {u.get('email','?'):<35} {str(u.get('role','?')):<14} "
          f"{str(u.get('actif','?')):<6} {str(u.get('statut','?')):<10} "
          f"{str(deleted):<14} {has_id}")


# ─── Étape 3 : Application un par un des filtres du widget ───────────────────
print(f"\n[3] APPLICATION DES FILTRES (un par un)")
print("-" * 75)

# Filtre 1 : service
n1 = db.users.count_documents({"service": maint_strict})
print(f"  [F1] service = 'maintenance'                  → {n1} user(s)")

# Filtre 2 : + actif != false
n2 = db.users.count_documents({"service": maint_strict, "actif": {"$ne": False}})
print(f"  [F2] + actif != false                         → {n2} user(s)")

# Filtre 3 : + statut != 'inactif'
n3 = db.users.count_documents({
    "service": maint_strict,
    "actif": {"$ne": False},
    "statut": {"$not": {"$regex": "^inactif$", "$options": "i"}}
})
print(f"  [F3] + statut != 'inactif'                    → {n3} user(s)")

# Filtre 4 : + deleted_at vide
NOT_DELETED = {"deleted_at": {"$in": [None, "", False, 0]}}
n4 = db.users.count_documents({
    "service": maint_strict,
    "actif": {"$ne": False},
    "statut": {"$not": {"$regex": "^inactif$", "$options": "i"}},
    **NOT_DELETED
})
print(f"  [F4] + deleted_at vide (NOT_DELETED)          → {n4} user(s)")

# Lister ceux qui SONT exclus à chaque étape
print(f"\n  Détail des EXCLUSIONS :")
all_users = users_brut
for u in all_users:
    reasons = []
    if u.get("actif") is False:
        reasons.append("actif=false")
    statut = u.get("statut", "")
    if statut and re.match(r"^inactif$", str(statut), re.IGNORECASE):
        reasons.append(f"statut='{statut}'")
    deleted = u.get("deleted_at")
    if deleted not in (None, "", False, 0):
        reasons.append(f"deleted_at='{deleted}'")
    if reasons:
        print(f"   ❌ {u.get('email','?')} : {', '.join(reasons)}")


# ─── Étape 4 : Responsables maintenance ──────────────────────────────────────
print(f"\n[4] RESPONSABLES service 'maintenance'")
print("-" * 75)
responsables = list(db.service_responsables.find(
    {"service": maint_strict},
    {"_id": 0, "user_id": 1, "user_name": 1, "service": 1}
))
print(f"Total : {len(responsables)}\n")
for r in responsables:
    uid = r.get("user_id")
    user_match = db.users.find_one(
        {"$or": [{"id": uid}, {"_id": uid}]},
        {"email": 1, "_id": 0}
    )
    label = user_match.get("email") if user_match else "? (ORPHELIN)"
    print(f"   user_id={uid}  user_name={r.get('user_name','?')}  →  {label}")


# ─── Étape 5 : DÉCISION FINALE par user (logique exacte du widget) ───────────
print(f"\n[5] CALCUL FINAL — logique exacte du widget _compute_time_widgets()")
print("-" * 75)

resp_ids = {str(r.get("user_id")) for r in responsables if r.get("user_id")}
print(f"IDs responsables (à exclure) : {len(resp_ids)}")
for rid in resp_ids:
    user_match = db.users.find_one(
        {"$or": [{"id": rid}, {"_id": rid}]},
        {"email": 1, "_id": 0}
    )
    print(f"   {rid}  →  {user_match.get('email') if user_match else '?'}")

passing_users = list(db.users.find(
    {
        "service": maint_strict,
        "actif": {"$ne": False},
        "statut": {"$not": {"$regex": "^inactif$", "$options": "i"}},
        **NOT_DELETED
    },
    {"id": 1, "_id": 1, "email": 1}
))

print(f"\nDécision pour chaque user qui passe les filtres :")
techs = []
for u in passing_users:
    uid = u.get("id") or str(u.get("_id", ""))
    if uid and uid not in resp_ids:
        techs.append(u.get("email"))
        print(f"   ✅ COMPTÉ      {u.get('email','?'):<35} (uid={uid})")
    else:
        why = "responsable" if uid in resp_ids else "uid manquant"
        print(f"   ⛔ EXCLU [{why}]  {u.get('email','?'):<35} (uid={uid})")


# ─── Étape 6 : OT en cours ───────────────────────────────────────────────────
print(f"\n[6] OT EN COURS (non terminés, non annulés, non supprimés)")
print("-" * 75)

pipeline_open = [
    {"$addFields": {
        "_tempsEstime_norm": {
            "$cond": {
                "if": {"$and": [{"$gt": ["$tempsEstime", 0]}, {"$isNumber": "$tempsEstime"}]},
                "then": "$tempsEstime",
                "else": {
                    "$cond": {
                        "if": {"$and": [{"$gt": ["$temps_estime", 0]}, {"$isNumber": "$temps_estime"}]},
                        "then": "$temps_estime",
                        "else": None
                    }
                }
            }
        }
    }},
    {"$match": {
        "statut": {"$nin": ["TERMINE", "ANNULE"]},
        "deleted_at": {"$in": [None, "", False, 0]},
        "_tempsEstime_norm": {"$gt": 0}
    }},
    {"$group": {
        "_id": None,
        "total_hours": {"$sum": "$_tempsEstime_norm"},
        "count": {"$sum": 1}
    }}
]
agg = list(db.work_orders.aggregate(pipeline_open))
total_hours = round(agg[0]["total_hours"], 1) if agg else 0
ot_count = agg[0]["count"] if agg else 0
print(f"Nombre d'OT en cours avec tempsEstime > 0 : {ot_count}")
print(f"Heures estimées restantes (somme)        : {total_hours}h")

# Détail des OT en cours
print(f"\nDétail des OT comptés :")
ots = list(db.work_orders.aggregate([
    {"$addFields": {
        "_tempsEstime_norm": {
            "$cond": {
                "if": {"$and": [{"$gt": ["$tempsEstime", 0]}, {"$isNumber": "$tempsEstime"}]},
                "then": "$tempsEstime",
                "else": {
                    "$cond": {
                        "if": {"$and": [{"$gt": ["$temps_estime", 0]}, {"$isNumber": "$temps_estime"}]},
                        "then": "$temps_estime",
                        "else": None
                    }
                }
            }
        }
    }},
    {"$match": {
        "statut": {"$nin": ["TERMINE", "ANNULE"]},
        "deleted_at": {"$in": [None, "", False, 0]},
        "_tempsEstime_norm": {"$gt": 0}
    }},
    {"$project": {"_id": 0, "id": 1, "titre": 1, "statut": 1, "_tempsEstime_norm": 1}},
    {"$sort": {"_tempsEstime_norm": -1}},
    {"$limit": 15}
]))
for ot in ots:
    print(f"   - [{ot.get('statut','?'):<10}] {ot.get('titre','?')[:55]:<55} → {ot['_tempsEstime_norm']}h")
if ot_count > 15:
    print(f"   ... et {ot_count - 15} autres")


# ─── Étape 7 : Résumé final ──────────────────────────────────────────────────
print(f"\n{SEP}")
print(f"  RÉSULTAT FINAL DU WIDGET")
print(SEP)
print(f"  • Heures estimées restantes total : {total_hours}h sur {ot_count} OT")
print(f"  • Techniciens maintenance comptés : {len(techs)}")
for t in techs:
    print(f"      - {t}")
charge = round(total_hours / len(techs), 2) if techs else 0
print(f"  • Charge moyenne par technicien   : {charge}h")
print(SEP)

if len(techs) <= 1:
    print()
    print("⚠️  ANALYSE DU PROBLÈME — Un seul (ou zéro) technicien compté.")
    print()
    print(f"   Total users service maintenance       : {len(users_brut)}")
    print(f"   - Exclus par filtres (actif/statut)   : {len(users_brut) - len(passing_users)}")
    print(f"   - Exclus comme responsables service   : {len(passing_users) - len(techs)}")
    print(f"   ─────────────────────────────────────────────────")
    print(f"   = Techniciens comptés                 : {len(techs)}")
    print()
    if len(passing_users) - len(techs) >= len(passing_users) - 1:
        print("   👉 CAUSE : Trop d'utilisateurs sont déclarés 'responsables service'")
        print("              dans la collection service_responsables.")
        print("              Le widget exclut TOUS les responsables de service.")
        print()
        print("   SOLUTIONS possibles :")
        print("   1. Retirer certains users de la collection service_responsables.")
        print("   2. Modifier la logique du widget pour ne pas exclure les responsables.")
        print("   3. Si un responsable est aussi technicien, créer 2 entrées distinctes.")

c.close()
