#!/usr/bin/env python3
"""
Script de migration DB - GMAO FSAO Iris
========================================
Normalise les types de données en base :
  Phase 1 : Conversion champs dates (ISO string -> datetime MongoDB)
  Phase 2 : Normalisation IDs work_orders (ObjectId-string -> UUID)
  Phase 3 : Ajout champ `id` manquant dans les collections métier

Usage :
  python3 migrate_db.py             # Exécution réelle
  python3 migrate_db.py --dry-run   # Simulation sans modification

Configuration :
  Lit MONGO_URL et DB_NAME depuis le fichier .env courant (ou variables d'env)
  Pour la production, exporter MONGO_URL et DB_NAME avant de lancer le script.
"""

import os
import sys
import asyncio
import uuid
import re
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv('.env')

# ──────────────────────────────────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────────────────────────────────
MONGO_URL = os.environ['MONGO_URL']
DB_NAME   = os.environ.get('DB_NAME', 'gmao_iris')

UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)

# Champs timestamps à convertir (ISO string -> datetime)
DATE_FIELDS = [
    'created_at', 'updated_at', 'dateCreation', 'dateLimite', 'dateTermine',
    'statut_changed_at', 'validated_at', 'last_activity', 'last_check',
    'next_check', 'deletable_until', 'end_maintenance_email_sent_at',
    'derniereMaintenance', 'prochaineMaintenance',
]

# Collections à exclure (volumineuses doc-content ou techniques sans requêtes dates)
EXCLUDED_COLLECTIONS = {
    'system.profile', 'system.indexes', 'system.js',
    'audit_logs',          # dynamique + très volumineux
    'manual_chapters',     # contenu documentaire (1000+ docs)
    'manual_sections',     # contenu documentaire (3700+ docs)
    'mqtt_logs',           # logs bruts
    'chat_messages',       # messages, pas de filtres dates critiques
}

# Collections métier pour Phase 3 (ajout champ id manquant)
BUSINESS_COLLECTIONS = [
    'work_orders', 'intervention_requests', 'equipments', 'users',
    'locations', 'inventory', 'consignes', 'preventive_maintenances',
    'improvements', 'improvement_requests', 'vendors', 'contracts',
    'sensors', 'roles', 'loto_consignations', 'accident_analyses',
    'presqu_accident_items', 'demandes_arret', 'checklist_templates',
    'checklists', 'checklist_executions', 'bons_travail', 'purchase_requests',
]

# ──────────────────────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────────────────────

def parse_iso(val: str):
    """Parse une chaîne ISO 8601 en datetime UTC. Retourne None si invalide."""
    if not isinstance(val, str) or len(val) < 16:
        return None
    # Normaliser : supprimer Z, remplacer +00:00
    clean = val.strip().rstrip('Z').replace('+00:00', '').replace(' ', 'T')
    for fmt in (
        '%Y-%m-%dT%H:%M:%S.%f',
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M',
    ):
        try:
            return datetime.strptime(clean, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def log(msg: str):
    print(msg)


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 1 : Conversion dates
# ──────────────────────────────────────────────────────────────────────────────

async def phase1_convert_dates(db, dry_run: bool) -> int:
    log("\n" + "="*60)
    log("PHASE 1 : Conversion champs dates (ISO string -> datetime)")
    log("="*60)

    collections = await db.list_collection_names()
    total_docs_updated = 0

    for coll_name in sorted(collections):
        if coll_name in EXCLUDED_COLLECTIONS or coll_name.startswith('system.'):
            continue

        coll = db[coll_name]
        if await coll.count_documents({}) == 0:
            continue

        # Filtre global : au moins un champ DATE_FIELDS est une string
        # (on ne se base PAS sur un seul doc sample pour éviter les faux-négatifs)
        str_filter = {'$or': [{f: {'$type': 'string'}} for f in DATE_FIELDS]}
        count_to_update = await coll.count_documents(str_filter)
        if count_to_update == 0:
            continue

        # Détecter quels champs ont des strings dans cette collection
        fields_with_strings = []
        for f in DATE_FIELDS:
            if await coll.count_documents({f: {'$type': 'string'}}) > 0:
                fields_with_strings.append(f)

        updated = 0
        async for doc in coll.find(str_filter):
            patch = {}
            for f in DATE_FIELDS:
                val = doc.get(f)
                if isinstance(val, str) and val:
                    dt = parse_iso(val)
                    if dt:
                        patch[f] = dt
            if patch:
                if not dry_run:
                    await coll.update_one({'_id': doc['_id']}, {'$set': patch})
                updated += 1

        total_docs_updated += updated
        total_docs = await coll.count_documents({})
        log(f"  {coll_name}: {updated}/{total_docs} docs mis à jour  "
            f"[champs: {fields_with_strings}]")

    log(f"\n  -> Total Phase 1 : {total_docs_updated} documents mis à jour")
    return total_docs_updated


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 2 : Normalisation IDs work_orders -> UUID
# ──────────────────────────────────────────────────────────────────────────────

async def phase2_normalize_wo_ids(db, dry_run: bool) -> dict:
    log("\n" + "="*60)
    log("PHASE 2 : Normalisation IDs work_orders (ObjectId-string -> UUID)")
    log("="*60)

    all_wo = await db.work_orders.find(
        {}, {'_id': 1, 'id': 1, 'numero': 1}
    ).to_list(None)

    to_normalize = [
        (d['_id'], d.get('id'), d.get('numero'))
        for d in all_wo
        if d.get('id') and not UUID_RE.match(str(d.get('id', '')))
    ]

    log(f"  {len(to_normalize)} OT avec ObjectId-string id à normaliser "
        f"(sur {len(all_wo)} OT total)")

    if not to_normalize:
        log("  -> Aucun OT à normaliser")
        return {}

    id_mapping = {}  # ancien_id -> nouveau_uuid

    for _id, old_id, numero in to_normalize:
        new_id = str(uuid.uuid4())
        id_mapping[old_id] = new_id
        if not dry_run:
            await db.work_orders.update_one(
                {'_id': _id},
                {'$set': {'id': new_id}}
            )
        log(f"  OT #{str(numero):>6} : {old_id} -> {new_id}")

    # Mettre à jour les références croisées
    if not dry_run and id_mapping:
        log("\n  Mise à jour des références croisées...")

        # audit_logs.entity_id
        audit_count = 0
        for old_id, new_id in id_mapping.items():
            res = await db.audit_logs.update_many(
                {'entity_id': old_id}, {'$set': {'entity_id': new_id}}
            )
            audit_count += res.modified_count
        log(f"  audit_logs.entity_id : {audit_count} entrée(s) mise(s) à jour")

        # Si d'autres collections référencent work_order_id (sécurité)
        for coll_name in ['time_entries', 'notifications', 'intervention_requests']:
            try:
                coll = db[coll_name]
                cnt = 0
                for old_id, new_id in id_mapping.items():
                    res = await coll.update_many(
                        {'work_order_id': old_id}, {'$set': {'work_order_id': new_id}}
                    )
                    cnt += res.modified_count
                if cnt:
                    log(f"  {coll_name}.work_order_id : {cnt} entrée(s) mise(s) à jour")
            except Exception:
                pass

    log(f"\n  -> Total Phase 2 : {len(id_mapping)} OT normalisé(s)")
    return id_mapping


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 3 : Ajout champ id manquant
# ──────────────────────────────────────────────────────────────────────────────

async def phase3_add_missing_ids(db, dry_run: bool) -> int:
    log("\n" + "="*60)
    log("PHASE 3 : Ajout champ `id` manquant dans les collections métier")
    log("="*60)

    total_added = 0
    for coll_name in BUSINESS_COLLECTIONS:
        coll = db[coll_name]
        missing_count = await coll.count_documents({'id': {'$exists': False}})
        if missing_count == 0:
            continue

        if not dry_run:
            async for doc in coll.find({'id': {'$exists': False}}):
                await coll.update_one(
                    {'_id': doc['_id']},
                    {'$set': {'id': str(doc['_id'])}}
                )

        total_added += missing_count
        log(f"  {coll_name} : {missing_count} doc(s) sans id -> `str(_id)` ajouté")

    if total_added == 0:
        log("  Aucun document sans champ `id` trouvé dans les collections métier")

    log(f"\n  -> Total Phase 3 : {total_added} id(s) ajouté(s)")
    return total_added


# ──────────────────────────────────────────────────────────────────────────────
# VÉRIFICATION POST-MIGRATION
# ──────────────────────────────────────────────────────────────────────────────

async def verify(db):
    log("\n" + "="*60)
    log("VÉRIFICATION POST-MIGRATION")
    log("="*60)

    # 1. work_orders – IDs
    all_wo = await db.work_orders.find({}, {'_id': 0, 'id': 1}).to_list(None)
    uuid_count  = sum(1 for d in all_wo if UUID_RE.match(str(d.get('id', ''))))
    oid_remain  = sum(1 for d in all_wo if d.get('id') and
                      not UUID_RE.match(str(d.get('id', ''))))
    log(f"\n  work_orders : {uuid_count} UUID / {oid_remain} ObjectId-string restants "
        f"(total={len(all_wo)})")

    # 2. work_orders – types de dates
    wo_date_types = set()
    async for doc in db.work_orders.find({}, {'created_at': 1, 'dateCreation': 1}):
        for f in ('created_at', 'dateCreation'):
            v = doc.get(f)
            if v is not None:
                wo_date_types.add(type(v).__name__)
    log(f"  work_orders.created_at/dateCreation types : {wo_date_types}")

    # 3. Résumé
    if oid_remain == 0 and wo_date_types - {'NoneType'} == {'datetime'}:
        log("\n  RESULTAT : OK - Migration complète et vérifiée")
    elif oid_remain == 0:
        log(f"\n  RESULTAT : Partiel - IDs OK, mais dates contiennent encore : {wo_date_types}")
    else:
        log(f"\n  RESULTAT : Attention - {oid_remain} OT sans UUID restants")


# ──────────────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────────────

async def main(dry_run: bool):
    log("="*60)
    log("MIGRATION DB - GMAO FSAO Iris")
    log(f"Mode     : {'DRY RUN (aucune modification)' if dry_run else 'EXECUTION REELLE'}")
    log(f"Base     : {DB_NAME}")
    log(f"MongoDB  : {MONGO_URL[:40]}...")
    log("="*60)

    client = AsyncIOMotorClient(MONGO_URL)
    db_handle = client[DB_NAME]

    try:
        await phase1_convert_dates(db_handle, dry_run)
        await phase2_normalize_wo_ids(db_handle, dry_run)
        await phase3_add_missing_ids(db_handle, dry_run)

        if not dry_run:
            await verify(db_handle)

        log("\n" + "="*60)
        log(f"MIGRATION {'(DRY RUN) ' if dry_run else ''}TERMINEE")
        log("="*60)

    except Exception as e:
        log(f"\nERREUR FATALE : {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        client.close()


if __name__ == '__main__':
    dry = '--dry-run' in sys.argv
    asyncio.run(main(dry_run=dry))
