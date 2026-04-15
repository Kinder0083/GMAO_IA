#!/usr/bin/env python3
"""
Script de diagnostic — Vérification document 404
Exécuter sur le serveur de production :
  cd /opt/gmao-iris/backend
  source venv/bin/activate
  export $(cat .env | grep -v '^#' | xargs)
  python3 /tmp/diagnostic_document.py
"""

import asyncio
import os
import sys
from pathlib import Path

# === CONFIGURATION PRODUCTION ===
DOCUMENT_ID = "6ef06c29-aeee-4495-a803-12ad6988a063"
BACKEND_DIR_OVERRIDE = "/opt/gmao-iris/backend"

async def main():
    try:
        import motor.motor_asyncio
    except ImportError:
        print("ERREUR: motor non installé. Exécuter: pip install motor pymongo")
        sys.exit(1)

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name   = os.environ.get("DB_NAME", "gmao_iris")
    backend   = Path(BACKEND_DIR_OVERRIDE)

    print(f"\n{'='*65}")
    print(f"DIAGNOSTIC — {DOCUMENT_ID}")
    print(f"MongoDB  : {mongo_url}  |  DB : {db_name}")
    print(f"Backend  : {backend}")
    print(f"{'='*65}\n")

    client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # ── 1. Recherche dans MongoDB ──
    print("1. Recherche dans MongoDB par 'id' (UUID)...")
    doc = await db.documents.find_one({"id": DOCUMENT_ID})
    if doc:
        print(f"   OK TROUVE")
    else:
        print(f"   NON TROUVE par 'id'")
        doc = await db.documents.find_one({"_id": DOCUMENT_ID})
        if doc:
            print(f"   OK TROUVE par '_id' string")
        else:
            total = await db.documents.count_documents({})
            print(f"   Total documents dans MongoDB : {total}")
            print("   -> Le document n'existe pas dans la base de donnees.")
            return

    # ── 2. Champs du document ──
    print(f"\n2. Champs du document :")
    fichier_url  = doc.get("fichier_url", "")
    fichier_nom  = doc.get("fichier_nom", "")
    fichier_type = doc.get("fichier_type", "")
    print(f"   fichier_url  : {fichier_url}")
    print(f"   fichier_nom  : {fichier_nom}")
    print(f"   fichier_type : {fichier_type}")

    if not fichier_url:
        print("   PROBLEME : 'fichier_url' est vide -> l'upload est peut-etre incomplet")
        return

    # ── 3. Vérification sur le disque ──
    print(f"\n3. Verification du fichier sur le disque...")
    path_old = Path(f"/app/backend{fichier_url}")
    path_new = backend / fichier_url.lstrip('/')

    print(f"   Chemin ancien (code en dur) : {path_old}")
    print(f"   -> {'EXISTE' if path_old.exists() else 'ABSENT'}")
    print(f"   Chemin corrige (dynamique)  : {path_new}")
    print(f"   -> {'EXISTE' if path_new.exists() else 'ABSENT'}")

    if path_new.exists() and not path_old.exists():
        size = path_new.stat().st_size
        print(f"\n   FICHIER PRESENT a l'emplacement corrige — {size} octets ({size/1024:.1f} KB)")
        print(f"\n   CAUSE DE LA 404 CONFIRME :")
        print(f"   Le backend cherchait dans : {path_old}  (inexistant)")
        print(f"   Le fichier est bien dans  : {path_new}")
        print(f"\n   SOLUTION : Deployer la correction 'BACKEND_DIR' dans documentations_routes.py")
        print(f"   (git pull + redemarrer le service)")
    elif path_new.exists():
        size = path_new.stat().st_size
        print(f"\n   Fichier OK — {size} octets")
        print(f"   -> Le backend devrait fonctionner apres deploiement de la correction")
    elif path_old.exists():
        size = path_old.exists() and path_old.stat().st_size
        print(f"\n   Fichier trouve a l'ANCIEN chemin (/app/backend)")
        print(f"   -> Votre serveur utilise peut-etre /app comme base d'installation ?")
    else:
        print(f"\n   FICHIER ABSENT des deux chemins !")

    # ── 4. Contenu du dossier uploads ──
    uploads_dir = backend / "uploads" / "documents"
    print(f"\n4. Contenu de {uploads_dir} :")
    if uploads_dir.exists():
        files = sorted(uploads_dir.iterdir())
        print(f"   {len(files)} fichier(s) :")
        for f in files:
            match = " <-- NOTRE DOCUMENT" if DOCUMENT_ID[:8] in f.name else ""
            print(f"   {f.name}  ({f.stat().st_size} o){match}")
    else:
        print(f"   Dossier introuvable : {uploads_dir}")

if __name__ == "__main__":
    asyncio.run(main())
