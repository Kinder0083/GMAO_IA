#!/usr/bin/env python3
"""
check_ecart_temps.py
====================
Diagnostic du widget "Écart Temps Est./Réel" du tableau de bord.

Ce script analyse la base de données pour expliquer la valeur affichée
dans le widget et détecter les problèmes courants :
  - OT terminés sans tempsEstime ou tempsReel → exclus du calcul
  - dateTermine stockée en string ISO au lieu de datetime → exclus du calcul
  - Mélange de champs tempsEstime (camelCase) vs temps_estime (snake_case)

Usage (dans le container gmao-iris) :
    cd /opt/gmao-iris/backend
    source ../venv/bin/activate
    python3 scripts/check_ecart_temps.py
"""

import os
import sys
from datetime import datetime, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

# ─── Chargement configuration ────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME   = os.environ.get("DB_NAME", "gmao")

if not MONGO_URL:
    print("[ERREUR] Variable MONGO_URL manquante dans le .env")
    sys.exit(1)

client = MongoClient(MONGO_URL)
db     = client[DB_NAME]

SEP  = "=" * 60
SEP2 = "-" * 60

# ─── Fonctions utilitaires ────────────────────────────────────────────────────
def parse_date(val):
    """Normalise une date (string ou datetime) en datetime naïf UTC."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.replace(tzinfo=None) if val.tzinfo else val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, AttributeError):
            return None
    return None


def fmt_h(val):
    if val is None:
        return "—"
    h = int(val)
    m = round((val - h) * 60)
    return f"{h}h{m:02d}" if m else f"{h}h"


# ─── Récupération des OT terminés ────────────────────────────────────────────
now        = datetime.utcnow()
cutoff_30  = now - timedelta(days=30)
cutoff_365 = now - timedelta(days=365)

print(SEP)
print("  DIAGNOSTIC — Écart Temps Est./Réel")
print(f"  Base de données : {DB_NAME}  |  Date : {now.strftime('%d/%m/%Y %H:%M')}")
print(SEP)

all_wos   = list(db.work_orders.find({"statut": "TERMINE", "deleted_at": {"$exists": False}}))
total     = len(all_wos)

# ─── 1. Analyse des champs manquants ─────────────────────────────────────────
print("\n=== 1. INVENTAIRE DES OT TERMINÉS ===")
print(f"Total OT terminés                  : {total}")

no_estime    = [w for w in all_wos if not w.get("tempsEstime") and not w.get("temps_estime")]
no_reel      = [w for w in all_wos if not w.get("tempsReel")]
no_date      = [w for w in all_wos if not w.get("dateTermine")]
with_both    = [w for w in all_wos if (w.get("tempsEstime") or w.get("temps_estime")) and w.get("tempsReel")]

print(f"  Sans temps estimé (tempsEstime)  : {len(no_estime)}"
      + (" ← sera exclu du calcul" if no_estime else ""))
print(f"  Sans temps réel (tempsReel)      : {len(no_reel)}"
      + (" ← sera exclu du calcul" if no_reel else ""))
print(f"  Sans dateTermine                 : {len(no_date)}"
      + (" ← sera exclu du calcul" if no_date else ""))
print(f"  Avec Est. + Réel + Date          : {len(with_both)}")

# ─── 2. Types de dateTermine ─────────────────────────────────────────────────
print("\n=== 2. TYPES DU CHAMP dateTermine ===")
dt_types = {}
for w in all_wos:
    t = type(w.get("dateTermine")).__name__
    dt_types[t] = dt_types.get(t, 0) + 1

for typ, cnt in sorted(dt_types.items(), key=lambda x: -x[1]):
    warning = ""
    if typ == "str":
        warning = " [ATTENTION] Strings → comparaison date échoue sans $toDate"
    elif typ == "NoneType":
        warning = " [ATTENTION] None → OT sans date de clôture"
    print(f"  {typ:<20} : {cnt} OT{warning}")

string_dates = [w for w in all_wos if isinstance(w.get("dateTermine"), str)]
if string_dates:
    print(f"\n  Exemple de dateTermine string : {string_dates[0].get('dateTermine')}")
    print(f"  → Ces {len(string_dates)} OT sont désormais pris en compte grâce au correctif $toDate")

# ─── 3. Champs tempsEstime vs temps_estime ────────────────────────────────────
print("\n=== 3. CHAMPS tempsEstime / temps_estime ===")
only_camel   = [w for w in all_wos if w.get("tempsEstime") and not w.get("temps_estime")]
only_snake   = [w for w in all_wos if w.get("temps_estime") and not w.get("tempsEstime")]
both_fields  = [w for w in all_wos if w.get("tempsEstime") and w.get("temps_estime")]

print(f"  tempsEstime uniquement     : {len(only_camel)} OT (formulaire standard)")
print(f"  temps_estime uniquement    : {len(only_snake)} OT (templates / IA)")
print(f"  Les deux champs            : {len(both_fields)} OT")

if only_snake:
    sample = only_snake[0]
    print(f"\n  Exemple OT template : temps_estime={sample.get('temps_estime')} "
          f"(type: {type(sample.get('temps_estime')).__name__})")
    print("  → Ces OT sont désormais inclus grâce au correctif _tempsEstime_norm")

# ─── 4. Calcul réel (logique corrigée) ───────────────────────────────────────
print("\n=== 4. CALCUL ÉCART (logique corrigée) ===")

def compute_ecart(wos, cutoff, label):
    total_est = total_reel = count = 0
    excluded_date = excluded_type = excluded_val = 0

    for w in wos:
        # Récupérer tempsEstime (camelCase ou snake_case)
        est = w.get("tempsEstime") or w.get("temps_estime")
        reel = w.get("tempsReel")

        # Vérifier que ce sont des nombres > 0
        if not isinstance(est, (int, float)) or est <= 0:
            excluded_type += 1
            continue
        if not isinstance(reel, (int, float)) or reel <= 0:
            excluded_val += 1
            continue

        # Normaliser la date
        dt = parse_date(w.get("dateTermine"))
        if dt is None or dt < cutoff:
            excluded_date += 1
            continue

        total_est += est
        total_reel += reel
        count += 1

    print(f"\n  Fenêtre {label} :")
    print(f"    OT inclus dans le calcul   : {count}")
    print(f"    OT exclus (date hors plage): {excluded_date}")
    print(f"    OT exclus (pas de tempsRéel): {excluded_val}")
    print(f"    OT exclus (tempsEst. non num.): {excluded_type}")

    if count > 0 and total_est > 0:
        dev = round(((total_reel - total_est) / total_est) * 100, 1)
        print(f"\n    Résultat : {dev:+.1f}%")
        print(f"    Détail   : {fmt_h(total_est)} estimées → {fmt_h(total_reel)} réelles")
        print(f"    Interprétation : {'Dépassement (travail plus long qu\'estimé)' if dev > 0 else 'Gain (travail plus rapide qu\'estimé)'}")
    else:
        print("\n    Résultat : Aucune donnée disponible pour cette période")

compute_ecart(all_wos, cutoff_30, "30 jours (mois glissant)")
compute_ecart(all_wos, cutoff_365, "365 jours (année glissante)")

# ─── 5. Détail des OT inclus dans le calcul annuel ──────────────────────────
print("\n=== 5. DÉTAIL DES OT INCLUS (ANNÉE) ===")
eligible = []
for w in all_wos:
    est  = w.get("tempsEstime") or w.get("temps_estime")
    reel = w.get("tempsReel")
    if not isinstance(est, (int, float)) or est <= 0:
        continue
    if not isinstance(reel, (int, float)) or reel <= 0:
        continue
    dt = parse_date(w.get("dateTermine"))
    if dt is None or dt < cutoff_365:
        continue
    dev = round(((reel - est) / est) * 100, 1)
    eligible.append({
        "numero": w.get("numero", "?"),
        "titre":  (w.get("titre") or "")[:45],
        "est":    est,
        "reel":   reel,
        "dev":    dev,
        "date":   dt.strftime("%d/%m/%Y") if dt else "?"
    })

if not eligible:
    print("  Aucun OT éligible pour l'année glissante.")
else:
    print(f"  {'N°':<6} {'Est.':<8} {'Réel':<8} {'Écart':>8}  {'Date':>12}  Titre")
    print("  " + SEP2)
    for e in sorted(eligible, key=lambda x: x["dev"], reverse=True):
        flag = " ⚠" if abs(e["dev"]) > 200 else ""
        print(f"  {str(e['numero']):<6} {fmt_h(e['est']):<8} {fmt_h(e['reel']):<8} "
              f"{e['dev']:>+7.1f}%  {e['date']:>12}  {e['titre']}{flag}")

print(f"\n{SEP}")
print("  DIAGNOSTIC TERMINÉ")
print(SEP)
client.close()
