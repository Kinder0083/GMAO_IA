"""
Helper de synchronisation bidirectionnelle entre availabilities (Rythme)
et maintenance_assignments de type CONGE (Activite Maintenance).

Regles :
- Quand on SET disponible=False sur un user MAINTENANCE et qu'aucun CONGE
  n'existe ce jour-la, on cree un assignment CONGE (full day = 8h).
- Quand on SET disponible=True/None et que le user est MAINTENANCE et qu'un
  assignment CONGE auto-genere existe ce jour-la, on le supprime.
"""
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import uuid
import logging

from routes.shared import db

logger = logging.getLogger(__name__)


def _date_str(d) -> str:
    """Normalise un datetime ou string en YYYY-MM-DD."""
    if d is None:
        return ""
    if hasattr(d, "date"):
        return d.date().isoformat()
    s = str(d)
    return s[:10]


async def sync_availability_to_conge(avail_doc: dict, current_user: dict):
    """A appeler apres CREATE/UPDATE d'une availability. Synchronise vers
    maintenance_assignments si l'utilisateur cible est dans le service MAINTENANCE."""
    try:
        user_id = avail_doc.get("user_id")
        if not user_id:
            return

        # Verifier que l'utilisateur cible est en MAINTENANCE
        target_user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "service": 1, "nom": 1, "prenom": 1})
        if not target_user or (target_user.get("service") or "").upper() != "MAINTENANCE":
            return

        date_str = _date_str(avail_doc.get("date"))
        if not date_str:
            return

        # Existe-t-il deja un assignment CONGE auto-genere pour ce jour ?
        existing = await db.maintenance_assignments.find_one({
            "user_id": user_id,
            "date": date_str,
            "type": "CONGE",
            "linked_availability_id": str(avail_doc.get("_id")) if avail_doc.get("_id") else None,
        })

        is_unavailable = avail_doc.get("disponible") is False
        # Pour les regimes 2*8 / 3*8 : indispo = aucune des parties dispo
        if not is_unavailable and (
            avail_doc.get("disponible_matin") is not None or
            avail_doc.get("disponible_aprem") is not None or
            avail_doc.get("disponible_nuit") is not None
        ):
            parts = [
                avail_doc.get("disponible_matin"),
                avail_doc.get("disponible_aprem"),
                avail_doc.get("disponible_nuit"),
            ]
            present = [p for p in parts if p is not None]
            if present and all(p is False for p in present):
                is_unavailable = True

        if is_unavailable:
            if existing:
                return  # rien a faire, deja synchro
            # Creer le CONGE
            now_iso = datetime.now(timezone.utc).isoformat()
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "date": date_str,
                "type": "CONGE",
                "title": avail_doc.get("motif") or "Indisponibilite",
                "description": "Synchronise depuis Rythme (Planning)",
                "duration_hours": 8.0,
                "start_hour": None,
                "color": "#9ca3af",
                "reference_id": None,
                "reference_numero": None,
                "category": None,
                "created_by": current_user.get("id") if current_user else None,
                "created_by_name": (
                    f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
                    if current_user else "Sync"
                ),
                "created_at": now_iso,
                "linked_availability_id": str(avail_doc.get("_id")) if avail_doc.get("_id") else None,
                "auto_generated": True,
            }
            await db.maintenance_assignments.insert_one(doc)
            logger.info(f"[CONGE SYNC] Cree assignment CONGE auto pour user={user_id} date={date_str}")
        else:
            # User redevient disponible -> supprimer l'auto CONGE s'il existe
            avail_id = str(avail_doc.get("_id")) if avail_doc.get("_id") else None
            if avail_id:
                await db.maintenance_assignments.delete_many({
                    "user_id": user_id,
                    "date": date_str,
                    "type": "CONGE",
                    "linked_availability_id": avail_id,
                    "auto_generated": True,
                })
                logger.info(f"[CONGE SYNC] Supprime CONGE auto pour user={user_id} date={date_str}")
    except Exception as e:
        logger.warning(f"sync_availability_to_conge erreur: {e}")


async def cleanup_conge_for_availability(avail_doc: dict):
    """A appeler avant DELETE d'une availability."""
    try:
        avail_id = str(avail_doc.get("_id")) if avail_doc.get("_id") else None
        if not avail_id:
            return
        await db.maintenance_assignments.delete_many({
            "linked_availability_id": avail_id,
            "auto_generated": True,
        })
    except Exception as e:
        logger.warning(f"cleanup_conge_for_availability erreur: {e}")
