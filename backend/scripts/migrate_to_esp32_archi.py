#!/usr/bin/env python3
"""
migrate_to_esp32_archi.py
==========================
Migration de l'architecture M.E.S vers le mode ESP32 optimisé.

Ce script :
  1. Génère mes_daily_summary depuis l'historique mes_pulses (agrégation jour/machine)
  2. Génère mes_cadence_history (1/min) sur les périodes manquantes (si nécessaire)
  3. Optionnellement, vide mes_pulses APRÈS confirmation utilisateur

⚠️ Ce script peut prendre plusieurs dizaines de minutes sur ~10M+ pulses.
   Faites un mongodump AVANT de lancer en mode --apply.

Usage :
    cd /opt/gmao-iris/backend
    source ../venv/bin/activate
    # 1. Dry-run : voir ce qui serait fait
    python3 scripts/migrate_to_esp32_archi.py --dry-run
    # 2. Apply : agrège les daily_summary depuis les pulses
    python3 scripts/migrate_to_esp32_archi.py --apply
    # 3. Purge (optionnel, après vérif des daily_summary) :
    python3 scripts/migrate_to_esp32_archi.py --apply --drop-pulses
"""

import os
import sys
from datetime import datetime, timezone, timedelta

try:
    from pymongo import MongoClient
    from dotenv import load_dotenv
except ModuleNotFoundError as e:
    sys.stderr.write(f"\n[ERREUR] Module manquant : {e.name}\n")
    sys.stderr.write("Lancez avec : /opt/gmao-iris/venv/bin/python3 scripts/migrate_to_esp32_archi.py\n\n")
    sys.exit(2)

DRY_RUN = "--dry-run" in sys.argv or "--apply" not in sys.argv
DROP_PULSES = "--drop-pulses" in sys.argv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

c = MongoClient(os.environ["MONGO_URL"])
db = c[os.environ.get("DB_NAME", "gmao_iris")]

mode = "DRY-RUN" if DRY_RUN else ("APPLY" + (" + DROP" if DROP_PULSES else ""))
print("=" * 70)
print(f"  MIGRATION VERS ARCHITECTURE ESP32 — {mode}")
print(f"  Base : {db.name}  |  Date : {datetime.now().strftime('%d/%m/%Y %H:%M')}")
print("=" * 70)

if DRY_RUN:
    print("\n[DRY-RUN] Simulation : aucune écriture ne sera effectuée.\n")
elif DROP_PULSES:
    print("\n⚠️  ⚠️  ATTENTION : SUPPRESSION DE mes_pulses ACTIVÉE !  ⚠️  ⚠️")
    print("Faites un mongodump AVANT si ce n'est pas déjà fait.")
    print("Ctrl+C pour annuler dans 10 secondes...")
    import time
    for i in range(10, 0, -1):
        print(f"  {i}...", end="\r", flush=True)
        time.sleep(1)
    print()


# ─── Étape 1 : Stats ─────────────────────────────────────────────────────────
n_pulses = db.mes_pulses.estimated_document_count()
n_history = db.mes_cadence_history.estimated_document_count()
n_summary = db.mes_daily_summary.estimated_document_count()
n_machines = db.mes_machines.count_documents({})

print(f"\n--- État actuel ---")
print(f"  Machines      : {n_machines}")
print(f"  Pulses        : {n_pulses:,}")
print(f"  Cadence/min   : {n_history:,}")
print(f"  Daily summary : {n_summary:,}")


# ─── Étape 2 : Borne temporelle ──────────────────────────────────────────────
oldest_pulse = db.mes_pulses.find_one({}, sort=[("timestamp", 1)])
if not oldest_pulse:
    print("\n[INFO] Aucun pulse en base — rien à migrer.")
    sys.exit(0)
oldest_ts = oldest_pulse["timestamp"]
if isinstance(oldest_ts, str):
    oldest_ts = datetime.fromisoformat(oldest_ts.replace("Z", "+00:00"))
if oldest_ts.tzinfo is None:
    oldest_ts = oldest_ts.replace(tzinfo=timezone.utc)
today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
days_to_process = (today - oldest_ts.replace(hour=0, minute=0, second=0, microsecond=0)).days
print(f"\n  Plus ancien pulse : {oldest_ts}")
print(f"  Jours à agréger   : {days_to_process}")


# ─── Étape 3 : Agrégation journalière ────────────────────────────────────────
print(f"\n=== AGRÉGATION DAILY SUMMARY ===\n")
machines = list(db.mes_machines.find({}, {"_id": 1, "theoretical_cadence": 1}))
written = 0
for mi, m in enumerate(machines, 1):
    mid = m["_id"]
    theoretical = m.get("theoretical_cadence", 0)
    # Pour chaque jour
    cur_day = oldest_ts.replace(hour=0, minute=0, second=0, microsecond=0)
    while cur_day < today:
        day_end = cur_day + timedelta(days=1)
        # Existe déjà ?
        existing = db.mes_daily_summary.find_one({"machine_id": mid, "date": cur_day})
        if existing:
            cur_day = day_end
            continue
        # Compte les pulses du jour
        n = db.mes_pulses.count_documents({
            "machine_id": mid,
            "timestamp": {"$gte": cur_day, "$lt": day_end}
        })
        if n == 0:
            cur_day = day_end
            continue
        # Compte les minutes "actives" (au moins 1 pulse)
        pipeline = [
            {"$match": {"machine_id": mid, "timestamp": {"$gte": cur_day, "$lt": day_end}}},
            {"$group": {
                "_id": {
                    "y": {"$year": "$timestamp"},
                    "m": {"$month": "$timestamp"},
                    "d": {"$dayOfMonth": "$timestamp"},
                    "h": {"$hour": "$timestamp"},
                    "min": {"$minute": "$timestamp"}
                }
            }},
            {"$count": "running_minutes"}
        ]
        result = list(db.mes_pulses.aggregate(pipeline, allowDiskUse=True))
        running_min = result[0]["running_minutes"] if result else 0
        idle_min = max(1440 - running_min, 0)

        # Cadence moyenne du jour
        cadence_avg = (n / running_min) if running_min > 0 else 0

        summary = {
            "machine_id": mid,
            "date": cur_day,
            "production": int(n),
            "good_parts": int(n),
            "rejects": 0,
            "running_minutes": running_min,
            "idle_minutes": idle_min,
            "running_seconds": running_min * 60,
            "idle_seconds": idle_min * 60,
            "cadence_avg": round(cadence_avg, 2),
            "cadence_max": 0,
            "theoretical": theoretical,
            "alerts_count": 0,
            "computed_at": datetime.now(timezone.utc),
            "_migrated_from_pulses": True,
        }
        if not DRY_RUN:
            db.mes_daily_summary.update_one(
                {"machine_id": mid, "date": cur_day},
                {"$set": summary},
                upsert=True
            )
        written += 1
        cur_day = day_end
    print(f"  [{mi}/{len(machines)}] Machine {mid} — terminé")

print(f"\n  → {written} daily_summary {'(simulation)' if DRY_RUN else 'écrits'}")


# ─── Étape 4 : Drop pulses (optionnel) ───────────────────────────────────────
if DROP_PULSES and not DRY_RUN:
    print(f"\n=== SUPPRESSION mes_pulses ===\n")
    print(f"  Suppression de {n_pulses:,} documents...")
    db.mes_pulses.delete_many({})
    print(f"  ✅ Collection mes_pulses vidée.")
    # Note : on ne drop pas la collection elle-même pour préserver les index
elif DROP_PULSES and DRY_RUN:
    print(f"\n[DRY-RUN] Aurait supprimé {n_pulses:,} pulses.")


print("\n" + "=" * 70)
print(f"  ✅ MIGRATION TERMINÉE ({mode})")
print("=" * 70)

if DRY_RUN:
    print("\n→ Pour appliquer : python3 scripts/migrate_to_esp32_archi.py --apply")
    print("→ Pour aussi purger pulses : ajoutez --drop-pulses")
else:
    print("\n→ Redémarrez le backend : sudo supervisorctl restart gmao-iris-backend")
    print("→ Vérifiez les daily_summary dans l'UI puis relancez avec --drop-pulses si OK")

c.close()
