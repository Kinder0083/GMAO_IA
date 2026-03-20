"""
Module partagé pour toutes les routes extraites de server.py.
Fournit l'accès au db, audit_service, realtime_manager et fonctions utilitaires.
"""
from bson import ObjectId
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Références globales initialisées par init_shared()
db = None
audit_service = None
realtime_manager = None


def init_shared(database, audit_svc, rt_manager=None):
    """Initialise les références partagées. Appelé une fois depuis server.py."""
    global db, audit_service, realtime_manager
    db = database
    audit_service = audit_svc
    realtime_manager = rt_manager


def serialize_doc(doc, _is_root=True):
    """Convert MongoDB document to JSON serializable format"""
    if doc is None:
        return None

    if "_id" in doc:
        if "id" not in doc or not doc["id"]:
            doc["id"] = str(doc["_id"])
        del doc["_id"]

    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)

    sensitive_fields = ["password", "hashed_password", "reset_token", "reset_token_created"]
    for field in sensitive_fields:
        if field in doc:
            del doc[field]

    for key, value in list(doc.items()):
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, (int, float)) and key in ["telephone", "phone", "numero"]:
            doc[key] = str(value)
        elif isinstance(value, list):
            doc[key] = [
                str(item) if isinstance(item, ObjectId)
                else serialize_doc(item, _is_root=False) if isinstance(item, dict)
                else str(item) if isinstance(item, (int, float)) and key in ["telephone", "phone", "numero"]
                else item
                for item in value
            ]
        elif isinstance(value, dict):
            doc[key] = serialize_doc(value, _is_root=False)

    if _is_root:
        if "dateCreation" not in doc:
            doc["dateCreation"] = datetime.utcnow()
        if "attachments" not in doc:
            doc["attachments"] = []

    return doc


async def find_user_flexible(user_id: str):
    """Trouve un utilisateur par _id (ObjectId) ou par champ id (UUID/string)."""
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user:
            return user
    except Exception:
        pass
    user = await db.users.find_one({"id": user_id})
    return user


async def find_work_order_flexible(wo_id: str):
    """Trouve un OT par champ id (UUID) ou par _id (ObjectId)."""
    wo = await db.work_orders.find_one({"id": wo_id})
    if wo:
        return wo
    try:
        wo = await db.work_orders.find_one({"_id": ObjectId(wo_id)})
    except Exception:
        pass
    return wo


async def get_user_by_id(user_id: str):
    """Get user details by ID"""
    try:
        user = await find_user_flexible(user_id)
        if user:
            return {
                "id": user.get("id", str(user["_id"])),
                "nom": user.get("nom"),
                "prenom": user.get("prenom"),
                "email": user.get("email"),
                "role": user.get("role")
            }
    except Exception:
        return None


async def get_location_by_id(location_id: str):
    """Get location details by ID"""
    try:
        location = await db.locations.find_one({"_id": ObjectId(location_id)})
        if location:
            return {
                "id": str(location["_id"]),
                "nom": location.get("nom")
            }
    except Exception:
        return None


def _get_realtime_manager():
    """Récupère le realtime_manager initialisé."""
    return realtime_manager


async def get_equipment_by_id(equipment_id: str):
    """Get equipment details by ID"""
    try:
        equipment = await db.equipments.find_one({"_id": ObjectId(equipment_id)})
        if equipment:
            return {
                "id": str(equipment["_id"]),
                "nom": equipment.get("nom")
            }
    except Exception:
        return None
