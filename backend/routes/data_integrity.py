"""
Routes de cohérence des données
================================
Expose un panneau admin capable de scanner les incohérences connues
dans la base et de les réparer (avec mode dry-run par défaut).

Checks actuels :
  - user_actif_statut_sync  : champ legacy `actif` désynchronisé de `statut`
  - service_responsables_duplicates : doublons dans service_responsables
  - time_entries_integrity  : time_entries (dans work_orders/improvements)
      - timestamp stocké en string au lieu de datetime (empêche le filtre
        $gte/$lte des rapports de les trouver)
      - user_id orphelin (utilisateur supprimé)
      - user_id dans un format non-canonique (différent de str(user["_id"]))
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from collections import defaultdict
from bson import ObjectId
import re
import logging

from dependencies import get_current_admin_user
from routes.shared import db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Administration"], prefix="/admin/data-integrity")

INACTIF_RE = re.compile(r"^inactif$", re.IGNORECASE)
DELETED_USER_LABEL = "[Utilisateur supprimé]"


# ──────────────────────────────────────────────────────────────────────────
#  CHECK 1 : sync actif <- statut
# ──────────────────────────────────────────────────────────────────────────
async def _check_user_actif_statut_sync():
    """Détecte les users dont `actif` ne correspond pas à `statut`."""
    issues = []
    async for u in db.users.find(
        {},
        {"_id": 1, "id": 1, "email": 1, "actif": 1, "statut": 1, "service": 1}
    ):
        statut = str(u.get("statut") or "").strip()
        target_actif = not bool(INACTIF_RE.match(statut))
        current = u.get("actif")
        current_norm = False if current is False else True
        if current_norm != target_actif:
            issues.append({
                "user_id": u.get("id") or str(u.get("_id")),
                "_id": str(u.get("_id")),
                "email": u.get("email", "?"),
                "service": u.get("service", "?"),
                "actif": current,
                "statut": statut or None,
                "target_actif": target_actif
            })
    return issues


async def _fix_user_actif_statut_sync(dry_run: bool):
    issues = await _check_user_actif_statut_sync()
    if dry_run:
        return {"modified_count": 0, "planned_count": len(issues), "details": issues}
    modified = 0
    for it in issues:
        try:
            oid = ObjectId(it["_id"])
        except Exception:
            continue
        res = await db.users.update_one(
            {"_id": oid},
            {"$set": {"actif": it["target_actif"]}}
        )
        modified += res.modified_count
    return {"modified_count": modified, "planned_count": len(issues), "details": issues}


# ──────────────────────────────────────────────────────────────────────────
#  CHECK 2 : doublons service_responsables
# ──────────────────────────────────────────────────────────────────────────
async def _check_service_responsables_duplicates():
    """Détecte les doublons (même service + même user_id)."""
    groups = defaultdict(list)
    async for d in db.service_responsables.find({}):
        key = (
            str(d.get("service") or "").lower().strip(),
            str(d.get("user_id") or "")
        )
        groups[key].append(d)

    duplicates = []
    for (service, user_id), docs in groups.items():
        if len(docs) > 1 and user_id:
            docs_sorted = sorted(docs, key=lambda x: str(x.get("_id")))
            duplicates.append({
                "service": service,
                "user_id": user_id,
                "user_name": docs_sorted[0].get("user_name", "?"),
                "total_found": len(docs),
                "keep_id": str(docs_sorted[0]["_id"]),
                "remove_ids": [str(d["_id"]) for d in docs_sorted[1:]],
            })
    return duplicates


async def _fix_service_responsables_duplicates(dry_run: bool):
    dups = await _check_service_responsables_duplicates()
    total_to_remove = sum(len(d["remove_ids"]) for d in dups)
    if dry_run:
        return {"modified_count": 0, "planned_count": total_to_remove, "details": dups}
    deleted = 0
    for d in dups:
        for rid in d["remove_ids"]:
            try:
                oid = ObjectId(rid)
            except Exception:
                continue
            res = await db.service_responsables.delete_one({"_id": oid})
            deleted += res.deleted_count
    return {"modified_count": deleted, "planned_count": total_to_remove, "details": dups}


# ──────────────────────────────────────────────────────────────────────────
#  CHECK 3 : intégrité des time_entries (work_orders + improvements)
# ──────────────────────────────────────────────────────────────────────────
def _parse_ts_str(s):
    """Tente de parser une string ISO en datetime naive. Retourne None si échec."""
    if not isinstance(s, str):
        return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00').replace('+00:00', ''))
    except Exception:
        try:
            return datetime.fromisoformat(s[:19])
        except Exception:
            return None


async def _build_user_canonical_map():
    """Construit un map {id_alt -> canonical_id} où canonical_id = str(user["_id"]).

    Les id_alt possibles pour un user :
      - str(user["_id"])      (canonique)
      - user.get("id")        (UUID legacy)
      - user.get("email")     (parfois utilisé comme id)
    Retourne aussi l'ensemble des canonical_ids et un map {canonical_id -> user_name}.
    """
    canonical_map = {}           # tous les id alternatifs → canonical
    canonical_ids = set()
    user_names = {}              # canonical_id → user_name
    async for u in db.users.find({}, {"_id": 1, "id": 1, "email": 1, "nom": 1, "prenom": 1}):
        cid = str(u["_id"])
        canonical_ids.add(cid)
        full_name = f"{u.get('prenom','')} {u.get('nom','')}".strip() or u.get("email", "?")
        user_names[cid] = full_name
        canonical_map[cid] = cid
        alt_id = u.get("id")
        if alt_id and alt_id != cid:
            canonical_map[str(alt_id)] = cid
        email = u.get("email")
        if email:
            canonical_map[email] = cid
    return canonical_map, canonical_ids, user_names


async def _scan_collection_time_entries(collection_name: str, canonical_map: dict, user_names: dict):
    """Scanne une collection pour détecter les time_entries problématiques.

    Retourne une liste d'issues :
      { collection, doc_id (str _id), doc_title, entry_id, issue_type, ... }
    """
    issues = []
    col = db[collection_name]
    cursor = col.find({"time_entries": {"$exists": True, "$ne": []}},
                      {"_id": 1, "titre": 1, "numero": 1, "time_entries": 1})
    async for doc in cursor:
        doc_id = str(doc["_id"])
        doc_title = doc.get("titre") or doc.get("numero") or "?"
        for entry in doc.get("time_entries", []):
            entry_id = entry.get("id")
            if not entry_id:
                continue
            # 1) timestamp en string
            ts = entry.get("timestamp")
            if isinstance(ts, str):
                parsed = _parse_ts_str(ts)
                issues.append({
                    "collection": collection_name,
                    "doc_id": doc_id,
                    "doc_title": doc_title,
                    "entry_id": entry_id,
                    "issue_type": "timestamp_string",
                    "current": ts,
                    "target": parsed.isoformat() if parsed else None,
                    "parseable": parsed is not None,
                    "user_name": entry.get("user_name", "?"),
                })
            # 2) user_id non-canonique
            uid = entry.get("user_id")
            if uid:
                uid_str = str(uid)
                if uid_str in canonical_map:
                    canonical = canonical_map[uid_str]
                    if canonical != uid_str:
                        issues.append({
                            "collection": collection_name,
                            "doc_id": doc_id,
                            "doc_title": doc_title,
                            "entry_id": entry_id,
                            "issue_type": "user_id_non_canonical",
                            "current": uid_str,
                            "target": canonical,
                            "user_name": entry.get("user_name", "?"),
                        })
                else:
                    # 3) user orphelin
                    if entry.get("user_name") != DELETED_USER_LABEL:
                        issues.append({
                            "collection": collection_name,
                            "doc_id": doc_id,
                            "doc_title": doc_title,
                            "entry_id": entry_id,
                            "issue_type": "user_orphan",
                            "current": uid_str,
                            "target": DELETED_USER_LABEL,
                            "user_name": entry.get("user_name", "?"),
                        })
    return issues


async def _check_time_entries_integrity():
    canonical_map, _, user_names = await _build_user_canonical_map()
    issues = []
    issues.extend(await _scan_collection_time_entries("work_orders", canonical_map, user_names))
    issues.extend(await _scan_collection_time_entries("improvements", canonical_map, user_names))
    return issues


async def _fix_time_entries_integrity(dry_run: bool):
    issues = await _check_time_entries_integrity()
    if dry_run:
        return {"modified_count": 0, "planned_count": len(issues), "details": issues[:50],
                "summary": _summarize_time_entries_issues(issues)}

    modified = 0
    skipped = 0
    for it in issues:
        col = db[it["collection"]]
        try:
            oid = ObjectId(it["doc_id"])
        except Exception:
            skipped += 1
            continue

        if it["issue_type"] == "timestamp_string":
            if not it.get("parseable"):
                skipped += 1
                continue
            new_ts = _parse_ts_str(it["current"])
            res = await col.update_one(
                {"_id": oid, "time_entries.id": it["entry_id"]},
                {"$set": {"time_entries.$.timestamp": new_ts}}
            )
            modified += res.modified_count
        elif it["issue_type"] == "user_id_non_canonical":
            res = await col.update_one(
                {"_id": oid, "time_entries.id": it["entry_id"]},
                {"$set": {"time_entries.$.user_id": it["target"]}}
            )
            modified += res.modified_count
        elif it["issue_type"] == "user_orphan":
            # On NE touche PAS user_id (conservation historique),
            # mais on marque user_name comme "[Utilisateur supprimé]".
            res = await col.update_one(
                {"_id": oid, "time_entries.id": it["entry_id"]},
                {"$set": {"time_entries.$.user_name": DELETED_USER_LABEL}}
            )
            modified += res.modified_count

    return {
        "modified_count": modified,
        "planned_count": len(issues),
        "skipped": skipped,
        "details": issues[:50],
        "summary": _summarize_time_entries_issues(issues),
    }


def _summarize_time_entries_issues(issues):
    summary = defaultdict(int)
    for it in issues:
        summary[it["issue_type"]] += 1
    return dict(summary)


# ──────────────────────────────────────────────────────────────────────────
#  CHECK 4 : pointages orphelins assignés à un utilisateur supprimé
#           (informational — pas de correction auto, navigation manuelle)
# ──────────────────────────────────────────────────────────────────────────
ORPHAN_COLLECTIONS = [
    # (collection, label, route_path, id_field_for_url)
    ("work_orders", "Ordre de travail", "/work-orders", "id"),
    ("improvements", "Amélioration", "/improvements", "id"),
    ("preventive_maintenances", "Maintenance préventive", "/preventive-maintenance", "id"),
]


async def _check_orphan_user_assignments():
    """Liste les documents (OT/améliorations/PM) qui contiennent au moins une
    time_entry assignée à un utilisateur supprimé (user_id orphelin OU
    user_name='[Utilisateur supprimé]'). Pas de correction auto : on retourne
    juste les numéros/IDs pour permettre à l'utilisateur de cliquer et de
    réassigner manuellement.
    """
    canonical_map, _, _ = await _build_user_canonical_map()
    issues = []
    for col_name, type_label, route_path, id_field in ORPHAN_COLLECTIONS:
        col = db[col_name]
        cursor = col.find(
            {"time_entries": {"$exists": True, "$ne": []}},
            {"_id": 1, "id": 1, "numero": 1, "titre": 1, "time_entries": 1, "categorie": 1, "statut": 1}
        )
        async for doc in cursor:
            orphan_entries = []
            for e in doc.get("time_entries", []):
                uid = str(e.get("user_id") or "")
                user_name = e.get("user_name", "")
                is_orphan_uid = bool(uid) and uid not in canonical_map
                is_marked_deleted = user_name == DELETED_USER_LABEL
                if is_orphan_uid or is_marked_deleted:
                    ts = e.get("timestamp")
                    if isinstance(ts, datetime):
                        ts_str = ts.isoformat()
                    elif isinstance(ts, str):
                        ts_str = ts
                    else:
                        ts_str = None
                    orphan_entries.append({
                        "entry_id": e.get("id"),
                        "user_id": uid,
                        "user_name": user_name,
                        "hours": e.get("hours", 0),
                        "timestamp": ts_str,
                    })
            if orphan_entries:
                doc_uuid = doc.get(id_field) or str(doc["_id"])
                issues.append({
                    "collection": col_name,
                    "type_label": type_label,
                    "doc_id": str(doc["_id"]),
                    "doc_uuid": doc_uuid,
                    "numero": doc.get("numero"),
                    "titre": doc.get("titre", "?"),
                    "statut": doc.get("statut"),
                    "open_url": f"{route_path}?open={doc_uuid}",
                    "orphan_count": len(orphan_entries),
                    "entries": orphan_entries,
                })
    # Trier par collection puis par numero
    issues.sort(key=lambda x: (x["collection"], x.get("numero") or x["titre"]))
    return issues


async def _fix_orphan_user_assignments(dry_run: bool):
    """Pas de réparation automatique — la décision est manuelle."""
    issues = await _check_orphan_user_assignments()
    return {
        "modified_count": 0,
        "planned_count": 0,
        "details": issues,
        "informational": True,
        "message": (
            "Ce check ne se répare pas automatiquement. Cliquez sur les liens "
            "ci-dessous pour ouvrir chaque document et réassigner manuellement "
            "le pointage à un utilisateur actif."
        ),
    }


# ──────────────────────────────────────────────────────────────────────────
#  CHECK 5 : doublons de numéro d'OT (numero dupliqué)
# ──────────────────────────────────────────────────────────────────────────
async def _check_work_orders_duplicate_numero():
    """Détecte les OT ayant le même `numero` (champ humain affiché en UI).

    Exemple vu en prod : 5 OT différents portaient tous #5879. Cause : le
    compteur atomique `db.counters.work_order_numero` a été desync (reset,
    import batch, migration).
    """
    # Aggregation : group by numero, count > 1, exclure "N/A" et vides
    pipeline = [
        {"$match": {
            "numero": {"$nin": [None, "", "N/A"]},
            "deleted_at": {"$in": [None, False]},
        }},
        {"$group": {
            "_id": "$numero",
            "count": {"$sum": 1},
            "docs": {"$push": {
                "_id": "$_id",
                "id": "$id",
                "titre": "$titre",
                "statut": "$statut",
                "dateCreation": "$dateCreation",
            }},
        }},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
    ]
    groups = await db.work_orders.aggregate(pipeline).to_list(None)

    issues = []
    for g in groups:
        # Trier par dateCreation (asc) pour garder le plus ancien
        docs = g["docs"]
        def _ts(d):
            dc = d.get("dateCreation")
            if isinstance(dc, datetime):
                return dc
            if isinstance(dc, str):
                try:
                    return datetime.fromisoformat(dc.replace('Z', '+00:00').replace('+00:00', ''))
                except Exception:
                    return datetime.min
            return datetime.min
        docs_sorted = sorted(docs, key=_ts)
        keep = docs_sorted[0]
        to_renumber = docs_sorted[1:]
        issues.append({
            "numero": g["_id"],
            "count": g["count"],
            "keep": {
                "_id": str(keep["_id"]),
                "id": keep.get("id"),
                "titre": keep.get("titre"),
                "statut": keep.get("statut"),
            },
            "to_renumber": [
                {
                    "_id": str(d["_id"]),
                    "id": d.get("id"),
                    "titre": d.get("titre"),
                    "statut": d.get("statut"),
                    "open_url": f"/work-orders?open={d.get('id') or d['_id']}",
                }
                for d in to_renumber
            ],
        })
    return issues


async def _fix_work_orders_duplicate_numero(dry_run: bool):
    """Réparation :
      1. Pour chaque groupe de doublons, garder le plus ancien (dateCreation)
      2. Renuméroter les autres en allouant de nouveaux numéros via le compteur
      3. S'assurer que le compteur est >= max numéro existant pour éviter
         toute nouvelle collision future.
    """
    issues = await _check_work_orders_duplicate_numero()
    total_to_renumber = sum(len(g["to_renumber"]) for g in issues)

    if dry_run:
        return {
            "modified_count": 0,
            "planned_count": total_to_renumber,
            "details": issues,
            "message": (
                f"{total_to_renumber} OT seront renumérotés. Chaque doublon "
                "récupère un nouveau numéro unique via le compteur atomique. "
                "Les OT originaux (les plus anciens) gardent leur numéro actuel."
            ),
        }

    # Étape A : resynchroniser le compteur sur le MAX actuel (numéros purement numériques)
    # Ceci protège les nouveaux OT créés après la réparation.
    max_numero_doc = await db.work_orders.find_one(
        {"numero": {"$regex": r"^\d+$"}},
        sort=[("numero", -1)],
        projection={"numero": 1}
    )
    max_numeric = 0
    if max_numero_doc and max_numero_doc.get("numero"):
        try:
            max_numeric = int(max_numero_doc["numero"])
        except (TypeError, ValueError):
            max_numeric = 0

    # Récupérer la valeur actuelle du compteur
    counter = await db.counters.find_one({"_id": "work_order_numero"}, {"seq": 1})
    current_seq = (counter or {}).get("seq", 0)
    if current_seq < max_numeric:
        await db.counters.update_one(
            {"_id": "work_order_numero"},
            {"$set": {"seq": max_numeric}},
            upsert=True,
        )
        logger.info(
            f"[DataIntegrity] Compteur work_order_numero resync : "
            f"{current_seq} -> {max_numeric}"
        )

    # Étape B : renuméroter les doublons
    modified = 0
    renumbering_log = []  # pour le retour détaillé
    for group in issues:
        for dup in group["to_renumber"]:
            # Allouer un nouveau numéro atomiquement
            res_counter = await db.counters.find_one_and_update(
                {"_id": "work_order_numero"},
                {"$inc": {"seq": 1}},
                upsert=True,
                return_document=True,
            )
            new_numero = str(res_counter["seq"])
            try:
                oid = ObjectId(dup["_id"])
            except Exception:
                continue
            res = await db.work_orders.update_one(
                {"_id": oid},
                {"$set": {"numero": new_numero}}
            )
            if res.modified_count:
                modified += 1
                renumbering_log.append({
                    "_id": dup["_id"],
                    "id": dup.get("id"),
                    "titre": dup.get("titre"),
                    "old_numero": group["numero"],
                    "new_numero": new_numero,
                })

    return {
        "modified_count": modified,
        "planned_count": total_to_renumber,
        "renumbering_log": renumbering_log[:50],  # cap pour ne pas saturer la réponse
        "counter_resynced_to": max_numeric if current_seq < max_numeric else None,
        "message": (
            f"{modified} OT renumérotés avec succès. Le compteur global est "
            f"maintenant synchronisé pour éviter toute future collision."
        ),
    }


# ──────────────────────────────────────────────────────────────────────────
#  Registry
# ──────────────────────────────────────────────────────────────────────────
CHECKS = {
    "user_actif_statut_sync": {
        "label": "Incohérence actif / statut utilisateurs",
        "description": (
            "Utilisateurs dont le champ legacy `actif` ne correspond pas à leur "
            "`statut` (source de vérité UI). Casse certains filtres backend "
            "(ex. widget Charge OT)."
        ),
        "severity": "warning",
        "scanner": _check_user_actif_statut_sync,
        "fixer": _fix_user_actif_statut_sync,
    },
    "service_responsables_duplicates": {
        "label": "Doublons — Responsables de service",
        "description": (
            "Entrées en double dans la collection service_responsables pour un "
            "même couple (service, user_id). Peut fausser les règles de routage "
            "et les exclusions du widget Charge OT."
        ),
        "severity": "warning",
        "scanner": _check_service_responsables_duplicates,
        "fixer": _fix_service_responsables_duplicates,
    },
    "time_entries_integrity": {
        "label": "Cohérence des pointages (time_entries)",
        "description": (
            "Pointages sur OT / améliorations ayant des problèmes : timestamp "
            "stocké en string (invisible aux rapports), user_id orphelin (user "
            "supprimé) ou non-canonique. Réparation : conversion timestamp en "
            "datetime, resync user_id canonique, marquage user_name "
            "'[Utilisateur supprimé]' pour les orphelins."
        ),
        "severity": "warning",
        "scanner": _check_time_entries_integrity,
        "fixer": _fix_time_entries_integrity,
    },
    "orphan_user_assignments": {
        "label": "Pointages assignés à un utilisateur supprimé",
        "description": (
            "Liste les ordres de travail, améliorations et maintenances "
            "préventives qui contiennent au moins un pointage assigné à un "
            "utilisateur supprimé. Cliquez sur un numéro pour ouvrir le "
            "document et réassigner manuellement le pointage à un utilisateur "
            "actif. Aucune réparation automatique."
        ),
        "severity": "info",
        "scanner": _check_orphan_user_assignments,
        "fixer": _fix_orphan_user_assignments,
        "informational": True,
    },
    "work_orders_duplicate_numero": {
        "label": "Doublons de numéro d'OT",
        "description": (
            "Ordres de travail différents partageant le même numéro (affiché "
            "#XXXX dans l'UI). Cause typique : désynchronisation du compteur "
            "atomique après un reset, un import batch ou une migration. "
            "Réparation automatique : l'OT le plus ancien garde son numéro, "
            "les autres sont renumérotés avec de nouveaux numéros uniques. "
            "Le compteur global est également resynchronisé pour éviter toute "
            "collision future."
        ),
        "severity": "warning",
        "scanner": _check_work_orders_duplicate_numero,
        "fixer": _fix_work_orders_duplicate_numero,
    },
}


# ──────────────────────────────────────────────────────────────────────────
#  Endpoints
# ──────────────────────────────────────────────────────────────────────────
async def _run_scan():
    """Logique du scan partagée entre l'endpoint et le cron."""
    checks_out = []
    total = 0
    actionable_total = 0  # exclut les checks informational du badge topbar
    for check_id, meta in CHECKS.items():
        issues = await meta["scanner"]()
        if check_id == "service_responsables_duplicates":
            count = sum(len(d["remove_ids"]) for d in issues)
        elif check_id == "work_orders_duplicate_numero":
            count = sum(len(g["to_renumber"]) for g in issues)
        else:
            count = len(issues)
        total += count
        is_informational = meta.get("informational", False)
        if not is_informational:
            actionable_total += count
        checks_out.append({
            "id": check_id,
            "label": meta["label"],
            "description": meta["description"],
            "severity": meta["severity"],
            "issues_count": count,
            "details": issues[:200] if check_id == "time_entries_integrity" else issues,
            "fixable": not is_informational,
            "informational": is_informational,
        })
    return {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "total_issues": total,
        "actionable_issues": actionable_total,
        "checks": checks_out,
    }


async def _persist_last_scan(result: dict):
    """Stocke le résumé du dernier scan (sans les détails complets) dans settings."""
    summary = {
        "scanned_at": result["scanned_at"],
        "total_issues": result["total_issues"],
        "actionable_issues": result.get("actionable_issues", result["total_issues"]),
        "per_check": {c["id"]: c["issues_count"] for c in result["checks"]},
    }
    await db.settings.update_one(
        {"key": "data_integrity_last_scan"},
        {"$set": {"key": "data_integrity_last_scan", "value": summary}},
        upsert=True,
    )


@router.get("/scan", summary="Scanner les incohérences de données")
async def scan_data_integrity(current_admin=Depends(get_current_admin_user)):
    result = await _run_scan()
    await _persist_last_scan(result)
    return result


@router.get("/last-scan", summary="Dernier scan (résumé)")
async def get_last_scan(current_admin=Depends(get_current_admin_user)):
    """Retourne le résumé du dernier scan sans relancer le scan complet.
    Utilisé par la page Santé système pour un aperçu rapide."""
    doc = await db.settings.find_one({"key": "data_integrity_last_scan"}, {"_id": 0, "value": 1})
    if not doc or not doc.get("value"):
        return {"has_data": False, "scanned_at": None, "total_issues": 0, "per_check": {}}
    v = doc["value"]
    return {"has_data": True, **v}


@router.post("/repair", summary="Réparer une ou toutes les incohérences")
async def repair_data_integrity(
    payload: dict,
    current_admin=Depends(get_current_admin_user),
):
    check_id = payload.get("check_id", "all")
    dry_run = bool(payload.get("dry_run", False))

    if check_id != "all" and check_id not in CHECKS:
        raise HTTPException(status_code=400, detail=f"check_id inconnu : {check_id}")

    results = {}
    targets = CHECKS.keys() if check_id == "all" else [check_id]
    for cid in targets:
        results[cid] = await CHECKS[cid]["fixer"](dry_run)

    if not dry_run:
        logger.info(
            f"[DataIntegrity] Réparation par {current_admin.get('email','?')} "
            f"check={check_id} results={ {k: v['modified_count'] for k, v in results.items()} }"
        )

    return {
        "dry_run": dry_run,
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "results": results,
    }
