"""
Routes de cohérence des données
================================
Expose un panneau admin capable de scanner les incohérences connues
dans la base et de les réparer (avec mode dry-run par défaut).

Checks actuels :
  - user_actif_statut_sync  : champ legacy `actif` désynchronisé de `statut`
  - service_responsables_duplicates : doublons dans service_responsables
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from collections import defaultdict
import re
import logging

from dependencies import get_current_admin_user
from routes.shared import db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Administration"], prefix="/admin/data-integrity")

INACTIF_RE = re.compile(r"^inactif$", re.IGNORECASE)


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
        from bson import ObjectId
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
    from bson import ObjectId
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
}


# ──────────────────────────────────────────────────────────────────────────
#  Endpoints
# ──────────────────────────────────────────────────────────────────────────
@router.get("/scan", summary="Scanner les incohérences de données")
async def scan_data_integrity(current_admin=Depends(get_current_admin_user)):
    checks_out = []
    total = 0
    for check_id, meta in CHECKS.items():
        issues = await meta["scanner"]()
        # pour les duplicates, compter les suppressions nécessaires (pas les groupes)
        if check_id == "service_responsables_duplicates":
            count = sum(len(d["remove_ids"]) for d in issues)
        else:
            count = len(issues)
        total += count
        checks_out.append({
            "id": check_id,
            "label": meta["label"],
            "description": meta["description"],
            "severity": meta["severity"],
            "issues_count": count,
            "details": issues,
            "fixable": True,
        })
    return {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "total_issues": total,
        "checks": checks_out,
    }


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
