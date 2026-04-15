#!/usr/bin/env python3
"""
Script de diagnostic — Vérification document 404
Exécuter sur le serveur de production : python3 diagnostic_document.py
"""

import asyncio
import os
import sys
from pathlib import Path

# === CONFIGURATION ===
# ID du document qui retourne 404
DOCUMENT_ID = "6ef06c29-aeee-4495-a803-12ad6988a063"
# Chemin de base des uploads (ajuster si nécessaire)
UPLOAD_BASE = "/app/backend"

async def main():
    try:
        import motor.motor_asyncio
        from bson import ObjectId
    except ImportError:
        print("ERREUR: motor ou bson non installé. Exécuter: pip install motor pymongo")
        sys.exit(1)

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "gmao_iris")

    print(f"\n{'='*60}")
    print(f"DIAGNOSTIC DOCUMENT — {DOCUMENT_ID}")
    print(f"MongoDB: {mongo_url}")
    print(f"DB: {db_name}")
    print(f"{'='*60}\n")

    client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # ── 1. Recherche par champ "id" (string UUID) ──
    print("1. Recherche par champ 'id' (UUID string)...")
    doc = await db.documents.find_one({"id": DOCUMENT_ID})
    if doc:
        print(f"   ✅ TROUVÉ par 'id'")
    else:
        print(f"   ❌ NON TROUVÉ par 'id'")

        # ── 2. Recherche par _id ObjectId ──
        print("\n2. Tentative par _id (ObjectId)...")
        try:
            doc = await db.documents.find_one({"_id": ObjectId(DOCUMENT_ID)})
            if doc:
                print(f"   ✅ TROUVÉ par '_id' ObjectId")
            else:
                print(f"   ❌ NON TROUVÉ par '_id' ObjectId")
        except Exception as e:
            print(f"   ⚠️  Impossible (n'est pas un ObjectId valide): {e}")

        # ── 3. Recherche par _id string ──
        print("\n3. Tentative par _id (string)...")
        doc2 = await db.documents.find_one({"_id": DOCUMENT_ID})
        if doc2:
            doc = doc2
            print(f"   ✅ TROUVÉ par '_id' string")
        else:
            print(f"   ❌ NON TROUVÉ par '_id' string")

    # ── 4. Chercher dans toute la collection ──
    if not doc:
        print("\n4. Recherche partielle dans tous les documents...")
        all_docs = await db.documents.find({}, {"_id": 1, "id": 1, "fichier_nom": 1, "fichier_type": 1, "fichier_url": 1}).to_list(length=None)
        print(f"   Total documents dans la collection: {len(all_docs)}")
        found_partial = [d for d in all_docs if DOCUMENT_ID in str(d.get("id","")) or DOCUMENT_ID in str(d.get("_id",""))]
        if found_partial:
            print(f"   ✅ Correspondance partielle: {found_partial}")
        else:
            print(f"   ❌ Aucune correspondance partielle trouvée")
            print("\n   5 derniers documents dans la collection:")
            recent = await db.documents.find({}, {"_id": 0, "id": 1, "fichier_nom": 1, "fichier_type": 1, "fichier_url": 1, "created_at": 1}).sort("created_at", -1).limit(5).to_list(length=None)
            for r in recent:
                print(f"      id={r.get('id')} | nom={r.get('fichier_nom')} | type={r.get('fichier_type')}")
        print("\n   CONCLUSION: Le document n'existe pas dans MongoDB.")
        print("   → Le document a peut-être été supprimé, ou uploadé dans une autre collection.")
        await _check_other_collections(db, DOCUMENT_ID)
        return

    # ── 5. Afficher les détails du document ──
    print(f"\n{'─'*50}")
    print(f"DÉTAILS DU DOCUMENT TROUVÉ:")
    for key, val in doc.items():
        if key != "_id":
            print(f"   {key}: {val}")
    print(f"{'─'*50}")

    # ── 6. Vérifier le fichier sur disque ──
    fichier_url = doc.get("fichier_url", "")
    if not fichier_url:
        print(f"\n❌ PROBLÈME: Le document n'a PAS de 'fichier_url' → upload incomplet?")
        return

    print(f"\n6. Vérification du fichier sur disque...")
    file_path = Path(f"{UPLOAD_BASE}{fichier_url}")
    print(f"   Chemin attendu: {file_path}")

    if file_path.exists():
        size = file_path.stat().st_size
        print(f"   ✅ FICHIER PRÉSENT — Taille: {size} octets ({size/1024:.1f} KB)")
    else:
        print(f"   ❌ FICHIER ABSENT du disque!")
        print(f"\n   Recherche du fichier ailleurs...")
        # Chercher le fichier par son nom
        nom = doc.get("fichier_nom", "")
        if nom:
            results = list(Path(UPLOAD_BASE).rglob(f"*{nom}*"))
            if results:
                print(f"   Fichier trouvé à: {results}")
            else:
                # Chercher par début de nom (uuid_filename)
                uid_prefix = DOCUMENT_ID.replace("-", "")[:8]
                results2 = list(Path(UPLOAD_BASE).rglob(f"{uid_prefix}*"))
                if results2:
                    print(f"   Fichier trouvé avec préfixe UUID: {results2}")
                else:
                    print(f"   ❌ Fichier introuvable sur le disque.")
                    print(f"   → Le fichier a peut-être été supprimé du disque")
                    print(f"   → OU il est dans un répertoire différent de '{UPLOAD_BASE}'")
        
        # Lister le contenu du dossier uploads/documents
        uploads_dir = Path(f"{UPLOAD_BASE}/uploads/documents")
        if uploads_dir.exists():
            files = sorted(uploads_dir.iterdir())
            print(f"\n   Contenu de {uploads_dir} ({len(files)} fichiers):")
            for f in files[:20]:
                print(f"      {f.name} ({f.stat().st_size} octets)")

async def _check_other_collections(db, doc_id):
    """Cherche le document dans d'autres collections possibles."""
    collections = ["work_order_attachments", "attachments", "files", "uploads"]
    for col in collections:
        try:
            found = await db[col].find_one({"id": doc_id})
            if found:
                print(f"   ✅ TROUVÉ dans la collection '{col}'!")
                return
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(main())
