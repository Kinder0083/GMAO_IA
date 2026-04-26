#!/usr/bin/env python3
"""
check_ecart_temps.py — Diagnostic widget "Écart Temps Est./Réel"
================================================================
Ce script s'exécute directement, même sans activer le venv manuellement.
Il réactive automatiquement l'environnement Python de l'application.

Usage :
    python3 /root/check_ecart_temps.py
    python3 /opt/gmao-iris/backend/scripts/check_ecart_temps.py
"""

# ─── Auto-activation du virtualenv ───────────────────────────────────────────
import sys
import os

VENV_PYTHON = "/opt/gmao-iris/venv/bin/python3"
if os.path.exists(VENV_PYTHON) and os.path.realpath(sys.executable) != os.path.realpath(VENV_PYTHON):
    # Re-exécuter ce script avec le Python du venv
    os.execv(VENV_PYTHON, [VENV_PYTHON] + sys.argv)

# ─── Imports (disponibles après activation du venv) ──────────────────────────
from datetime import datetime, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

# ─── Chargement configuration .env ───────────────────────────────────────────
for _env_path in [
    "/opt/gmao-iris/backend/.env",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
    os.path.join(os.getcwd(), ".env"),
]:
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
        break

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME   = os.environ.get("DB_NAME", "gmao")

if not MONGO_URL:
    print("[ERREUR] Variable MONGO_URL introuvable.")
    print("         Vérifiez que /opt/gmao-iris/backend/.env contient MONGO_URL.")
    sys.exit(1)

client = MongoClient(MONGO_URL)
db     = client[DB_NAME]

# ─── Constantes ──────────────────────────────────────────────────────────────
SEP  = "=" * 65
SEP2 = "-" * 65
now         = datetime.utcnow()
cutoff_30   = now - timedelta(days=30)
cutoff_365  = now - timedelta(days=365)


# ─── Utilitaires ─────────────────────────────────────────────────────────────
def parse_date(val):
    """Normalise string ISO ou datetime en datetime naïf UTC."""
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
    """Formatte un float d'heures en 'XhYY'."""
    if val is None:
        return "—"
    h = int(val)
    m = round((val - h) * 60)
    if m == 60:
        h += 1
        m = 0
    return f"{h}h{m:02d}" if m else f"{h}h"


def ecart_pct(est, reel):
    """Calcule le pourcentage d'écart."""
    if not est or est <= 0:
        return None
    return round(((reel - est) / est) * 100, 1)


# ─── Récupération des OT terminés ────────────────────────────────────────────
all_wos = list(db.work_orders.find(
    {"statut": "TERMINE", "deleted_at": {"$exists": False}}
))
total = len(all_wos)

# ─── Affichage ───────────────────────────────────────────────────────────────
print()
print(SEP)
print("  DIAGNOSTIC — Widget « Écart Temps Est./Réel »")
print(f"  Base : {DB_NAME}   |   {now.strftime('%d/%m/%Y à %H:%M UTC')}")
print(SEP)

# ── 1. Inventaire ─────────────────────────────────────────────────────────────
print("\n── 1. INVENTAIRE DES OT TERMINÉS " + "─" * 32)
print(f"  Total OT terminés                  : {total}")

no_estime = [w for w in all_wos if not w.get("tempsEstime") and not w.get("temps_estime")]
no_reel   = [w for w in all_wos if not w.get("tempsReel")]
no_date   = [w for w in all_wos if not w.get("dateTermine")]
with_both = [w for w in all_wos if (w.get("tempsEstime") or w.get("temps_estime")) and w.get("tempsReel")]

def warn(lst, msg=""):
    return f"  ← {msg}" if lst else ""

print(f"  Sans tempsEstime                   : {len(no_estime)}{warn(no_estime, 'exclus du calcul')}")
print(f"  Sans tempsReel                     : {len(no_reel)}{warn(no_reel, 'exclus du calcul')}")
print(f"  Sans dateTermine                   : {len(no_date)}{warn(no_date, 'exclus du calcul')}")
print(f"  Éligibles (Est. + Réel + Date)     : {len(with_both)}")

# ── 2. Types du champ dateTermine ─────────────────────────────────────────────
print("\n── 2. TYPES DU CHAMP dateTermine " + "─" * 33)
dt_types = {}
for w in all_wos:
    t = type(w.get("dateTermine")).__name__
    dt_types[t] = dt_types.get(t, 0) + 1

for typ, cnt in sorted(dt_types.items(), key=lambda x: -x[1]):
    note = ""
    if typ == "str":
        note = "  [ATTENTION] strings → exclus sans correctif $toDate"
    elif typ == "NoneType":
        note = "  [ATTENTION] None → OT sans date de clôture"
    print(f"  {typ:<20} : {cnt} OT{note}")

# ── 3. Champs tempsEstime ─────────────────────────────────────────────────────
print("\n── 3. CHAMP tempsEstime " + "─" * 42)
only_camel = [w for w in all_wos if w.get("tempsEstime") and not w.get("temps_estime")]
only_snake = [w for w in all_wos if w.get("temps_estime") and not w.get("tempsEstime")]
both_f     = [w for w in all_wos if w.get("tempsEstime") and w.get("temps_estime")]
print(f"  tempsEstime (formulaire standard)  : {len(only_camel)} OT")
print(f"  temps_estime (templates / IA)      : {len(only_snake)} OT")
print(f"  Les deux champs présents           : {len(both_f)} OT")

# ── 4. Calcul complet ─────────────────────────────────────────────────────────
print("\n── 4. CALCUL ÉCART (résultats réels) " + "─" * 28)

def compute_window(label, cutoff):
    total_est = total_reel = count = 0
    excl_date = excl_type = excl_val = 0
    details = []

    for w in all_wos:
        est  = w.get("tempsEstime") or w.get("temps_estime")
        reel = w.get("tempsReel")

        if not isinstance(est, (int, float)) or est <= 0:
            excl_type += 1
            continue
        if not isinstance(reel, (int, float)) or reel <= 0:
            excl_val += 1
            continue

        dt = parse_date(w.get("dateTermine"))
        if dt is None or dt < cutoff:
            excl_date += 1
            continue

        total_est += est
        total_reel += reel
        count += 1
        dev = ecart_pct(est, reel)
        details.append({
            "numero": w.get("numero", "?"),
            "titre":  (w.get("titre") or "")[:50],
            "est": est, "reel": reel, "dev": dev,
            "date": dt.strftime("%d/%m/%Y") if dt else "?"
        })

    print(f"\n  ┌─ Fenêtre {label}")
    print(  "  │  OT inclus          : " + str(count))
    print(  "  │  Exclus hors plage  : " + str(excl_date))
    print(  "  │  Exclus sans temps  : " + str(excl_type + excl_val))

    if count > 0 and total_est > 0:
        dev_global = ecart_pct(total_est, total_reel)
        sign = "+" if dev_global > 0 else ""
        interpretation = "Dépassement (travail plus long qu'estimé)" if dev_global > 0 else "Gain (travail plus rapide qu'estimé)"
        print("  │")
        print(f"  │  Résultat          : {sign}{dev_global}%")
        print(f"  │  Détail            : {fmt_h(total_est)} estimées → {fmt_h(total_reel)} réelles")
        print(f"  └─ Interprétation   : {interpretation}")
    else:
        print("  └─ Résultat         : Aucune donnée disponible pour cette période")

    return details

details_30  = compute_window("30 jours  (mois glissant)", cutoff_30)
details_365 = compute_window("365 jours (année glissante)", cutoff_365)

# ── 5. Top 3 dépassements (30j) ───────────────────────────────────────────────
print("\n── 5. TOP DÉPASSEMENTS — 30 JOURS " + "─" * 31)
top_30 = sorted([d for d in details_30 if (d["dev"] or 0) > 0], key=lambda x: -(x["reel"] - x["est"]))[:3]
if not top_30:
    print("  Aucun dépassement sur les 30 derniers jours.")
else:
    print("  Ces OT expliquent l'essentiel du dépassement du widget :\n")
    for i, e in enumerate(top_30, 1):
        delta = e["reel"] - e["est"]
        print(f"  {i}. OT {e['numero']} — {e['titre']}")
        print(f"     {fmt_h(e['est'])} estimées → {fmt_h(e['reel'])} réelles  |  +{fmt_h(delta)} de dépassement  |  +{e['dev']}%")

# ── 6. Détail complet annuel ──────────────────────────────────────────────────
print("\n── 6. DÉTAIL COMPLET — ANNÉE GLISSANTE " + "─" * 26)
if not details_365:
    print("  Aucun OT éligible sur l'année.")
else:
    print(f"  {'N°':<6} {'Est.':<8} {'Réel':<8} {'Écart':>8}  {'Date':>12}  Titre")
    print("  " + SEP2)
    for e in sorted(details_365, key=lambda x: -(x["dev"] or 0)):
        flag = " ⚠" if abs(e["dev"] or 0) > 200 else ""
        sign = "+" if (e["dev"] or 0) > 0 else ""
        print(f"  {str(e['numero']):<6} {fmt_h(e['est']):<8} {fmt_h(e['reel']):<8} "
              f"{sign}{e['dev']:>6.1f}%  {e['date']:>12}  {e['titre']}{flag}")

print()
print(SEP)
print("  DIAGNOSTIC TERMINÉ")
print(SEP)
print()

client.close()
