#!/usr/bin/env python3
"""
fix_mes_tzinfo.py
=================
Correctif pour l'erreur MES en boucle :
    AttributeError: 'str' object has no attribute 'tzinfo'

Ce script patche directement le fichier mes_service.py sur le serveur.
Il corrige deux fonctions où dateTermine/timestamp sont comparés sans
vérification préalable que ce ne sont pas des strings.

Usage (dans le container gmao-iris) :
    cd /opt/gmao-iris/backend
    python3 scripts/fix_mes_tzinfo.py

Le script fait une sauvegarde automatique avant de modifier le fichier.
"""

import os
import sys
import shutil
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET   = os.path.join(BASE_DIR, "mes_service.py")

if not os.path.exists(TARGET):
    print(f"[ERREUR] Fichier introuvable : {TARGET}")
    sys.exit(1)

# ─── Sauvegarde ──────────────────────────────────────────────────────────────
backup = TARGET + f".bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
shutil.copy2(TARGET, backup)
print(f"[OK] Sauvegarde créée : {backup}")

with open(TARGET, "r") as f:
    content = f.read()

applied = 0

# ─── Patch 1 : get_machine_metrics() ─────────────────────────────────────────
OLD1 = """        if last_pulse:
            if last_pulse.tzinfo is None:
                last_pulse = last_pulse.replace(tzinfo=timezone.utc)
            expected_interval = 60.0 / theoretical if theoretical > 0 else 10"""

NEW1 = """        if last_pulse:
            # Correctif : last_pulse_at peut être une chaîne ISO en base
            if isinstance(last_pulse, str):
                try:
                    last_pulse = datetime.fromisoformat(last_pulse.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    last_pulse = None
            if last_pulse and last_pulse.tzinfo is None:
                last_pulse = last_pulse.replace(tzinfo=timezone.utc)
            expected_interval = 60.0 / theoretical if theoretical > 0 else 10"""

if OLD1 in content:
    content = content.replace(OLD1, NEW1)
    applied += 1
    print("[OK] Patch 1 appliqué : get_machine_metrics() — last_pulse_at")
else:
    print("[INFO] Patch 1 : déjà appliqué ou code différent")

# ─── Patch 2 : _calc_downtime() ──────────────────────────────────────────────
OLD2 = """        for p in pulses:
            ts = p["timestamp"]
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            gap = (ts - prev_time).total_seconds()"""

NEW2 = """        for p in pulses:
            ts = p["timestamp"]
            # Correctif : timestamp peut être une chaîne ISO en base
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            gap = (ts - prev_time).total_seconds()"""

if OLD2 in content:
    content = content.replace(OLD2, NEW2)
    applied += 1
    print("[OK] Patch 2 appliqué : _calc_downtime() — timestamp")
else:
    print("[INFO] Patch 2 : déjà appliqué ou code différent")

# ─── Écriture ─────────────────────────────────────────────────────────────────
if applied > 0:
    with open(TARGET, "w") as f:
        f.write(content)
    print(f"\n[OK] {applied} patch(s) appliqué(s). Fichier mis à jour.")
    print("     → Redémarrez le backend : supervisorctl restart gmao-iris-backend")
else:
    print("\n[INFO] Aucune modification nécessaire — patches déjà présents.")
