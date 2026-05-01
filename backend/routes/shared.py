"""
Module partagé pour toutes les routes extraites de server.py.
Fournit l'accès au db, audit_service, realtime_manager et fonctions utilitaires.
"""
from bson import ObjectId
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

# Références globales initialisées par init_shared()
db = None
audit_service = None
realtime_manager = None

# Filtre MongoDB robuste pour les documents non supprimés.
# Couvre tous les cas legacy : champ absent, null, "", false, 0
NOT_DELETED = {"deleted_at": {"$in": [None, "", False, 0]}}


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


async def get_next_work_order_numero():
    """Génère le prochain numéro d'OT via un compteur atomique MongoDB.
    Utilise findOneAndUpdate avec $inc pour garantir l'unicité même en cas de requêtes simultanées.

    SÉCURITÉ ANTI-COLLISION : si le compteur est mal synchronisé (cas après reset,
    import batch ou migration) et tombe sur un numéro déjà utilisé, on incrémente
    jusqu'à trouver un libre. Le check `work_orders_duplicate_numero` du panneau
    Cohérence des données reste recommandé pour nettoyer les doublons existants.
    """
    return await _get_next_atomic_numero(
        counter_id="work_order_numero",
        format_func=lambda seq: str(seq),
        collection_name="work_orders",
        scope_query={},
    )


async def _get_next_atomic_numero(counter_id, format_func, collection_name, scope_query=None):
    """Helper générique : génère un numéro séquentiel unique avec retry-on-conflict.

    Args:
        counter_id: ID du compteur dans db.counters (ex: "improvement_numero")
        format_func: callable(seq:int) -> str (ex: lambda s: f"DA-2026-{s:03d}")
        collection_name: collection à scanner pour vérifier l'unicité
        scope_query: query MongoDB additionnelle (pour limiter le scope, ex. année courante)

    Returns:
        Le prochain numéro libre formaté.
    """
    MAX_ATTEMPTS = 100
    scope_query = scope_query or {}
    col = db[collection_name]
    for _ in range(MAX_ATTEMPTS):
        result = await db.counters.find_one_and_update(
            {"_id": counter_id},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=True,
        )
        candidate = format_func(result["seq"])
        existing = await col.find_one(
            {**scope_query, "numero": candidate, "deleted_at": {"$in": [None, False]}},
            {"_id": 1},
        )
        if not existing:
            return candidate
    # Fallback : grand saut pour débloquer
    big_jump = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1000}},
        upsert=True,
        return_document=True,
    )
    return format_func(big_jump["seq"])


async def _ensure_counter_at_least(counter_id, min_value):
    """S'assure que le compteur est au moins à `min_value`.

    Utilisé pour migrer les générateurs basés sur `count_documents` ou
    `max(seq)` vers le compteur atomique sans casser la continuité.
    """
    counter = await db.counters.find_one({"_id": counter_id})
    current = (counter or {}).get("seq", 0) or 0
    if current < min_value:
        await db.counters.update_one(
            {"_id": counter_id},
            {"$set": {"seq": min_value}},
            upsert=True,
        )


async def get_next_improvement_numero():
    """Génère le prochain numéro d'amélioration (séquentiel à partir de 7001).

    Migration : initialise le compteur au max actuel s'il n'existe pas encore
    (ancien générateur basé sur count_documents). Anti-collision intégré.
    """
    counter = await db.counters.find_one({"_id": "improvement_numero"})
    if not counter:
        # Initialiser depuis le max actuel des numéros numériques
        max_doc = await db.improvements.find_one(
            {"numero": {"$regex": r"^\d+$"}},
            sort=[("numero", -1)],
            projection={"numero": 1},
        )
        max_existing = 0
        if max_doc and max_doc.get("numero"):
            try:
                max_existing = int(max_doc["numero"])
            except (TypeError, ValueError):
                max_existing = 0
        # Le compteur démarre au max existant (le prochain $inc donnera max+1)
        # Ou à 7000 si aucun existant (compatibilité ascendante avec l'offset historique)
        start = max(max_existing, 7000)
        await _ensure_counter_at_least("improvement_numero", start)
    return await _get_next_atomic_numero(
        counter_id="improvement_numero",
        format_func=lambda seq: str(seq),
        collection_name="improvements",
    )


async def get_next_purchase_request_numero(year=None):
    """Génère le prochain numéro de demande d'achat au format DA-YYYY-XXX.

    Le compteur est annuel (un compteur par année). Anti-collision intégré.
    """
    if year is None:
        year = datetime.now(timezone.utc).year
    counter_id = f"purchase_request_numero_{year}"
    counter = await db.counters.find_one({"_id": counter_id})
    if not counter:
        # Migration : initialiser au max actuel pour cette année
        regex = f"^DA-{year}-(\\d+)$"
        max_existing = 0
        async for doc in db.purchase_requests.find(
            {"numero": {"$regex": regex}}, {"numero": 1}
        ):
            try:
                num = int(doc["numero"].split("-")[-1])
                if num > max_existing:
                    max_existing = num
            except (ValueError, IndexError):
                continue
        await _ensure_counter_at_least(counter_id, max_existing)
    return await _get_next_atomic_numero(
        counter_id=counter_id,
        format_func=lambda seq: f"DA-{year}-{seq:05d}",
        collection_name="purchase_requests",
    )


async def get_next_loto_numero():
    """Génère le prochain numéro de consignation LOTO au format LOTO-XXXX.

    Retourne un tuple (numero_str, seq_int) pour compat avec l'ancien code
    qui stockait `numero_seq` dans chaque document. Anti-collision intégré.
    """
    counter = await db.counters.find_one({"_id": "loto_numero"})
    if not counter:
        # Migration : initialiser depuis le max numero_seq existant
        max_doc = await db.loto_consignations.find_one(
            sort=[("numero_seq", -1)],
            projection={"numero_seq": 1},
        )
        max_existing = (max_doc or {}).get("numero_seq", 0) or 0
        await _ensure_counter_at_least("loto_numero", max_existing)
    # On veut un numéro libre ET un seq int pour le doc
    MAX_ATTEMPTS = 100
    for _ in range(MAX_ATTEMPTS):
        result = await db.counters.find_one_and_update(
            {"_id": "loto_numero"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=True,
        )
        seq = result["seq"]
        candidate = f"LOTO-{seq:04d}"
        existing = await db.loto_consignations.find_one(
            {"$or": [{"numero": candidate}, {"numero_seq": seq}]},
            {"_id": 1},
        )
        if not existing:
            return candidate, seq
    # Fallback
    big_jump = await db.counters.find_one_and_update(
        {"_id": "loto_numero"},
        {"$inc": {"seq": 1000}},
        upsert=True,
        return_document=True,
    )
    return f"LOTO-{big_jump['seq']:04d}", big_jump["seq"]


async def get_equipment_by_id(equipment_id: str):
    """Get equipment details by ID"""
    try:
        equipment = await db.equipments.find_one({"_id": ObjectId(equipment_id)})
        if equipment:
            result = {
                "id": str(equipment["_id"]),
                "nom": equipment.get("nom")
            }
            if equipment.get("parent_id"):
                result["parent_id"] = str(equipment["parent_id"]) if not isinstance(equipment["parent_id"], str) else equipment["parent_id"]
            return result
    except Exception:
        return None
