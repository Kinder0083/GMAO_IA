from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, UploadFile, File, Response, Request
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import aiofiles
import uuid
import mimetypes
import pandas as pd
import io
import secrets
import string
import asyncio
from pathlib import Path
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from openapi_config import API_DESCRIPTION, OPENAPI_TAGS, STANDARD_ERRORS, CRUD_ERRORS, AUTH_ERRORS

# Import our models and dependencies
from models import *
# Rename pour éviter conflits avec realtime_events
EntityType_Audit = EntityType
from auth import get_password_hash, verify_password, create_access_token, decode_access_token
import dependencies
from dependencies import get_current_user, get_current_admin_user, check_permission, require_permission
import email_service
from audit_service import AuditService
from category_mapping import get_category_from_article_dm6

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


def _auto_configure_vapid():
    """Auto-génère et persiste les clés VAPID si elles sont absentes du .env.
    
    Appelé au démarrage — aucune intervention manuelle requise.
    Les clés sont sauvegardées dans le .env ET dans MongoDB pour survivre
    aux mises à jour qui écrasent le fichier .env.
    """
    pub = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
    priv = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    if pub and priv:
        return  # Déjà configurées, rien à faire

    # Essayer de récupérer depuis MongoDB (en cas de .env écrasé par une mise à jour)
    # Cette partie est asynchrone, on ne peut pas l'appeler ici directement.
    # Elle sera exécutée au startup FastAPI dans _ensure_vapid_keys_in_db()
    pass


def _generate_vapid_keys():
    """Génère une nouvelle paire de clés VAPID (EC P-256)."""
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
    from base64 import urlsafe_b64encode

    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    pub_bytes = public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    vapid_pub = urlsafe_b64encode(pub_bytes).rstrip(b'=').decode()

    priv_val = private_key.private_numbers().private_value
    vapid_priv = urlsafe_b64encode(priv_val.to_bytes(32, 'big')).rstrip(b'=').decode()

    return vapid_pub, vapid_priv


def _write_vapid_to_env(pub: str, priv: str, subject: str):
    """Écrit/met à jour les clés VAPID dans le fichier .env."""
    env_path = ROOT_DIR / '.env'
    try:
        content = env_path.read_text() if env_path.exists() else ""
        lines = [l for l in content.splitlines()
                 if not l.startswith('VAPID_PUBLIC_KEY=')
                 and not l.startswith('VAPID_PRIVATE_KEY=')
                 and not l.startswith('VAPID_SUBJECT=')]
        lines += [f'VAPID_PUBLIC_KEY={pub}', f'VAPID_PRIVATE_KEY={priv}', f'VAPID_SUBJECT={subject}']
        env_path.write_text('\n'.join(lines) + '\n')
        logging.info(f"[VAPID] Clés sauvegardées dans .env")
    except Exception as e:
        logging.warning(f"[VAPID] Impossible d'écrire dans .env: {e}")


_auto_configure_vapid()

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'gmao_iris')]

# Initialize dependencies with database
dependencies.set_database(db)

# Initialize audit service
audit_service = AuditService(db)

# Initialiser le module partagé pour les routes extraites
from realtime_manager import realtime_manager
from routes.shared import init_shared, NOT_DELETED
init_shared(db, audit_service, realtime_manager)

# Create the main app (docs desactivees par defaut, servies manuellement avec auth)
app = FastAPI(
    title="FSAO Atlas API",
    description=API_DESCRIPTION,
    version="2.2.0",
    openapi_tags=OPENAPI_TAGS,
    docs_url=None,
    redoc_url=None,
    openapi_url="/api/openapi.json",
    contact={
        "name": "FSAO Atlas Support",
        "email": "support@gmao-atlas.fr"
    },
    license_info={
        "name": "Proprietary",
    }
)

# --- Protection docs Swagger par HTTP Basic Auth ---
docs_security = HTTPBasic()

def verify_docs_credentials(credentials: HTTPBasicCredentials = Depends(docs_security)):
    """Verifie les identifiants pour acceder a la documentation API"""
    correct_user = secrets.compare_digest(credentials.username, os.environ.get("DOCS_USER", "admin"))
    correct_pass = secrets.compare_digest(credentials.password, os.environ.get("DOCS_PASS", "atlas2024"))
    if not (correct_user and correct_pass):
        raise HTTPException(
            status_code=401,
            detail="Identifiants incorrects",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials

@app.get("/api/docs", include_in_schema=False)
async def custom_swagger_ui(credentials: HTTPBasicCredentials = Depends(verify_docs_credentials)):
    return get_swagger_ui_html(
        openapi_url="/api/openapi.json",
        title="FSAO Atlas - Documentation API",
        swagger_favicon_url="https://fastapi.tiangolo.com/img/favicon.png"
    )

@app.get("/api/redoc", include_in_schema=False)
async def custom_redoc(credentials: HTTPBasicCredentials = Depends(verify_docs_credentials)):
    return get_redoc_html(
        openapi_url="/api/openapi.json",
        title="FSAO Atlas - Documentation API (ReDoc)",
        redoc_favicon_url="https://fastapi.tiangolo.com/img/favicon.png"
    )

# Gestionnaire d'erreur pour les erreurs de validation Pydantic
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Capturer et logger les erreurs de validation Pydantic"""
    logger.error("=" * 80)
    logger.error("❌ ERREUR DE VALIDATION PYDANTIC 422")
    logger.error(f"📍 URL: {request.method} {request.url.path}")
    logger.error(f"📦 Body reçu: {await request.body()}")
    logger.error(f"🔍 Erreurs de validation: {exc.errors()}")
    logger.error("=" * 80)
    
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(await request.body())}
    )

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Initialiser le scheduler pour les tâches automatiques
scheduler = AsyncIOScheduler()


# ==================== CRON JOB: GESTION DES MAINTENANCES PLANIFIÉES ====================

async def manage_planned_maintenance_status():
    """
    Cron job quotidien pour gérer les transitions de statut des maintenances planifiées.
    - Démarre les maintenances qui commencent aujourd'hui (statut → EN_MAINTENANCE)
    - Déclenche les emails de fin pour les maintenances qui se terminent aujourd'hui
    """
    try:
        from demande_arret_emails import send_end_maintenance_email
        
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        logger.info(f"🔄 [CRON] Gestion des maintenances planifiées pour le {today}...")
        
        started_count = 0
        ending_count = 0
        
        # 1. Trouver les maintenances qui DÉMARRENT aujourd'hui
        maintenances_starting = await db.planning_equipement.find({
            "date_debut": today,
            "maintenance_started": {"$ne": True}  # Pas encore démarrée
        }).to_list(length=None)
        
        for entry in maintenances_starting:
            eq_id = entry.get("equipement_id")
            
            # Mettre à jour le statut de l'équipement
            now = datetime.now(timezone.utc)
            rounded_hour = now.replace(minute=0, second=0, microsecond=0)
            
            await db.equipments.update_one(
                {"_id": ObjectId(eq_id)},
                {"$set": {
                    "statut": "EN_MAINTENANCE",
                    "statut_changed_at": rounded_hour,
                    "updated_at": now.isoformat()
                }}
            )
            
            # Enregistrer dans l'historique
            history_entry = {
                "equipment_id": eq_id,
                "statut": "EN_MAINTENANCE",
                "changed_at": rounded_hour,
                "changed_by": "cron_maintenance",
                "changed_by_name": "Maintenance planifiée (automatique)",
                "demande_arret_id": entry.get("demande_arret_id"),
                "is_start_of_maintenance": True
            }
            await db.equipment_status_history.update_one(
                {"equipment_id": eq_id, "changed_at": rounded_hour},
                {"$set": history_entry},
                upsert=True
            )
            
            # Marquer comme démarrée
            await db.planning_equipement.update_one(
                {"_id": entry["_id"]},
                {"$set": {"maintenance_started": True}}
            )
            
            started_count += 1
            logger.info(f"✅ [CRON] Maintenance démarrée pour équipement {eq_id}")
        
        # 2. Trouver les maintenances qui SE TERMINENT aujourd'hui
        maintenances_ending = await db.planning_equipement.find({
            "date_fin": today,
            "end_maintenance_email_sent": {"$ne": True}  # Email pas encore envoyé
        }).to_list(length=None)
        
        for entry in maintenances_ending:
            demande_id = entry.get("demande_arret_id")
            if not demande_id:
                continue
                
            # Récupérer la demande associée
            demande = await db.demandes_arret.find_one({"id": demande_id})
            if not demande:
                continue
            
            # Ne pas envoyer si déjà terminée ou email déjà envoyé
            if demande.get("statut") == "TERMINEE" or demande.get("end_maintenance_email_sent"):
                continue
            
            # Envoyer l'email de fin de maintenance
            equipement_noms = demande.get("equipement_noms", [])
            success = await send_end_maintenance_email(demande, equipement_noms)
            
            if success:
                # Marquer l'email comme envoyé
                await db.demandes_arret.update_one(
                    {"id": demande_id},
                    {"$set": {
                        "end_maintenance_email_sent": True,
                        "end_maintenance_email_sent_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                await db.planning_equipement.update_one(
                    {"_id": entry["_id"]},
                    {"$set": {"end_maintenance_email_sent": True}}
                )
                ending_count += 1
                logger.info(f"✅ [CRON] Email de fin de maintenance envoyé pour demande {demande_id}")
        
        logger.info(f"✅ [CRON] Terminé: {started_count} maintenance(s) démarrée(s), {ending_count} email(s) de fin envoyé(s)")
        
    except Exception as e:
        logger.error(f"❌ [CRON] Erreur gestion maintenances planifiées: {str(e)}")


# Fonction pour vérifier et créer automatiquement les bons de travail pour les maintenances échues
async def auto_check_preventive_maintenance():
    """Fonction exécutée automatiquement chaque jour pour vérifier les maintenances échues"""
    try:
        logger.info("🔄 Vérification automatique des maintenances préventives échues...")
        
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Trouver toutes les maintenances actives dont la date est aujourd'hui ou passée
        pm_list = await db.preventive_maintenances.find({
            "statut": "ACTIF",
            "prochaineMaintenance": {"$lte": today + timedelta(days=1)}
        }).to_list(length=None)
        
        created_count = 0
        updated_count = 0
        errors = []
        
        for pm in pm_list:
            try:
                # Récupérer l'équipement
                equipement = await db.equipments.find_one({"_id": ObjectId(pm["equipement_id"])})
                
                # Créer le bon de travail
                wo_id = str(uuid.uuid4())
                work_order = {
                    "_id": ObjectId(),
                    "id": wo_id,
                    "numero": f"PM-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}",
                    "titre": f"Maintenance préventive: {pm['titre']}",
                    "description": f"Maintenance automatique générée depuis la planification préventive '{pm['titre']}'",
                    "type": "PREVENTIF",
                    "priorite": "NORMALE",
                    "statut": "OUVERT",
                    "equipement_id": pm["equipement_id"],
                    "emplacement_id": equipement.get("emplacement_id") if equipement else None,
                    "assigne_a_id": pm.get("assigne_a_id"),
                    "tempsEstime": pm.get("duree"),
                    "dateLimite": datetime.utcnow() + timedelta(days=7),
                    "dateCreation": datetime.utcnow(),
                    "createdBy": "system-auto",
                    "comments": [],
                    "attachments": [],
                    "historique": []
                }
                
                await db.work_orders.insert_one(work_order)
                created_count += 1
                logger.info(f"✅ Bon de travail créé: {work_order['numero']} pour PM '{pm['titre']}'")
                
                # Calculer la prochaine date de maintenance
                next_date = calculate_next_maintenance_date(pm["prochaineMaintenance"], pm["frequence"])
                
                # Mettre à jour la maintenance préventive
                await db.preventive_maintenances.update_one(
                    {"_id": pm["_id"]},
                    {
                        "$set": {
                            "prochaineMaintenance": next_date,
                            "derniereMaintenance": datetime.utcnow()
                        }
                    }
                )
                updated_count += 1
                logger.info(f"✅ Prochaine maintenance mise à jour: {next_date.strftime('%Y-%m-%d')} (fréquence: {pm['frequence']})")
                
            except Exception as e:
                error_msg = f"Erreur pour PM '{pm.get('titre', 'Unknown')}': {str(e)}"
                errors.append(error_msg)
                logger.error(f"❌ {error_msg}")
        
        logger.info(f"✅ Vérification terminée: {created_count} bons créés, {updated_count} maintenances mises à jour, {len(errors)} erreurs")
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la vérification automatique des maintenances: {str(e)}")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Helper functions
def serialize_doc(doc, _is_root=True):
    """Convert MongoDB document to JSON serializable format"""
    if doc is None:
        return None
    
    # Convertir le _id principal - préserver id existant s'il est présent
    if "_id" in doc:
        if "id" not in doc or not doc["id"]:
            doc["id"] = str(doc["_id"])
        del doc["_id"]
    
    # Convertir tous les ObjectId en string (protection globale pour données restaurées)
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
    
    # Supprimer les champs sensibles si présents
    sensitive_fields = ["password", "hashed_password", "reset_token", "reset_token_created"]
    for field in sensitive_fields:
        if field in doc:
            del doc[field]
    
    # Convertir récursivement tous les ObjectId et types non sérialisables
    for key, value in list(doc.items()):
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, (int, float)) and key in ["telephone", "phone", "numero"]:
            # Convertir les numéros de téléphone et numéros en strings
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
    
    # Ajouter dateCreation et attachments uniquement au niveau racine du document
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
    # Fallback: chercher par le champ id (UUID ou string)
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
    except:
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
    except:
        return None

async def get_equipment_by_id(equipment_id: str):
    """Get equipment details by ID"""
    try:
        equipment = await db.equipments.find_one({"_id": ObjectId(equipment_id)})
        if equipment:
            return {
                "id": str(equipment["_id"]),
                "nom": equipment.get("nom")
            }
    except:
        return None


# ==================== SYSTEM ROUTES ====================
@api_router.get("/version", response_model=VersionResponse, tags=["Systeme"],
    summary="Version de l'application",
    description="Retourne la version actuelle, le nom de version et la date de publication.",
    responses={200: {"description": "Version retournee avec succes", "content": {"application/json": {"example": {"version": "2.2.0", "versionName": "Documentation Enrichie", "releaseDate": "2025-01-18"}}}}}
)
async def get_version():
    """Obtenir la version actuelle de l'application (endpoint public).
    Lit la version depuis updates/version.json (source unique de vérité)."""
    try:
        version_file = os.path.join(os.path.dirname(__file__), "updates", "version.json")
        if not os.path.exists(version_file):
            version_file = os.path.join(os.path.dirname(__file__), "..", "updates", "version.json")
        if os.path.exists(version_file):
            import json as json_mod
            with open(version_file, 'r') as f:
                data = json_mod.load(f)
            return {
                "version": data.get("version", "1.0.0"),
                "versionName": data.get("versionName", ""),
                "releaseDate": data.get("releaseDate", "")
            }
    except Exception:
        pass
    return {
        "version": "1.0.0",
        "versionName": "",
        "releaseDate": ""
    }


@api_router.get("/bell-counts", tags=["Systeme"],
    summary="Compteurs pour l'icône cloche du header",
    description="Retourne les compteurs d'OT en attente, améliorations en attente et maintenances préventives échues."
)
async def get_bell_counts(current_user: dict = Depends(get_current_user)):
    """Compteurs pour les badges de la cloche du header."""
    now = datetime.utcnow()

    # 1. OT en attente matériel
    wo_att_materiel = await db.work_orders.count_documents({
        "statut": {"$in": ["ATT_MATERIEL", "EN_ATTENTE"]},
        **NOT_DELETED
    })

    # 2. OT en attente décision
    wo_att_decision = await db.work_orders.count_documents({
        "statut": "ATT_DECISION",
        **NOT_DELETED
    })

    # 3. Améliorations en attente (statut EN_ATTENTE uniquement)
    imp_count = await db.improvements.count_documents({
        "statut": "EN_ATTENTE"
    })

    # 4. Maintenances préventives planifiées mais pas encore réalisées (date dépassée)
    pm_count = await db.preventive_maintenances.count_documents({
        "statut": "ACTIF",
        "prochaineMaintenance": {"$lte": now}
    })

    return {
        "work_orders": wo_att_materiel + wo_att_decision,
        "att_materiel": wo_att_materiel,
        "att_decision": wo_att_decision,
        "improvements": imp_count,
        "preventive": pm_count
    }


async def _compute_time_widgets(database, now):
    """Calcule les données pour les widgets ecart temps et charge maintenance."""
    import re
    from datetime import timedelta

    result = {
        "time_deviation_month": None,
        "time_deviation_year": None,
        "time_deviation_month_count": 0,
        "time_deviation_year_count": 0,
        "time_total_estime_month": 0,
        "time_total_reel_month": 0,
        "time_total_estime_year": 0,
        "time_total_reel_year": 0,
        "estimated_hours_open": 0,
        "estimated_hours_open_count": 0,
        "maintenance_techs_count": 0,
    }

    # --- Widget 1: Ecart temps estimé/réel (OT terminés) ---
    # Robustesse : dateTermine peut être stocké comme string ISO ou comme datetime BSON
    # On normalise avec $addFields + $toDate pour couvrir les deux cas
    for label, days in [("month", 30), ("year", 365)]:
        cutoff = now - timedelta(days=days)
        pipeline = [
            # Étape 1 : normaliser dateTermine (string ISO → Date BSON)
            {"$addFields": {
                "_dateTermine_norm": {
                    "$cond": {
                        "if": {"$eq": [{"$type": "$dateTermine"}, "string"]},
                        "then": {"$toDate": "$dateTermine"},
                        "else": {
                            "$cond": {
                                "if": {"$eq": [{"$type": "$dateTermine"}, "date"]},
                                "then": "$dateTermine",
                                "else": None
                            }
                        }
                    }
                },
                # Normaliser aussi tempsEstime : prendre tempsEstime (camelCase) OU
                # temps_estime (snake_case, héritage templates), en ignorant les strings non numériques
                "_tempsEstime_norm": {
                    "$cond": {
                        "if": {"$and": [{"$gt": ["$tempsEstime", 0]}, {"$isNumber": "$tempsEstime"}]},
                        "then": "$tempsEstime",
                        "else": {
                            "$cond": {
                                "if": {"$and": [{"$gt": ["$temps_estime", 0]}, {"$isNumber": "$temps_estime"}]},
                                "then": "$temps_estime",
                                "else": None
                            }
                        }
                    }
                }
            }},
            # Étape 2 : filtrer OT terminés dans la fenêtre temporelle avec temps valides
            {"$match": {
                "statut": "TERMINE",
                **NOT_DELETED,
                "_tempsEstime_norm": {"$gt": 0},
                "tempsReel": {"$gt": 0},
                "_dateTermine_norm": {"$gte": cutoff}
            }},
            {"$group": {
                "_id": None,
                "total_estime": {"$sum": "$_tempsEstime_norm"},
                "total_reel": {"$sum": "$tempsReel"},
                "count": {"$sum": 1}
            }}
        ]
        try:
            agg = await database.work_orders.aggregate(pipeline).to_list(1)
        except Exception as e:
            logger.warning(f"Erreur aggregate ecart_temps ({label}): {e}")
            agg = []
        if agg and agg[0]["total_estime"] > 0:
            estime = agg[0]["total_estime"]
            reel = agg[0]["total_reel"]
            deviation = round(((reel - estime) / estime) * 100, 1)
            result[f"time_deviation_{label}"] = deviation
            result[f"time_deviation_{label}_count"] = agg[0]["count"]
            result[f"time_total_estime_{label}"] = round(estime, 1)
            result[f"time_total_reel_{label}"] = round(reel, 1)

    # --- Top 3 OT avec le plus grand dépassement absolu (30j uniquement) ---
    _norm_stage = {
        "$addFields": {
            "_dateTermine_norm": {
                "$cond": {
                    "if": {"$eq": [{"$type": "$dateTermine"}, "string"]},
                    "then": {"$toDate": "$dateTermine"},
                    "else": {
                        "$cond": {
                            "if": {"$eq": [{"$type": "$dateTermine"}, "date"]},
                            "then": "$dateTermine",
                            "else": None
                        }
                    }
                }
            },
            "_tempsEstime_norm": {
                "$cond": {
                    "if": {"$and": [{"$gt": ["$tempsEstime", 0]}, {"$isNumber": "$tempsEstime"}]},
                    "then": "$tempsEstime",
                    "else": {
                        "$cond": {
                            "if": {"$and": [{"$gt": ["$temps_estime", 0]}, {"$isNumber": "$temps_estime"}]},
                            "then": "$temps_estime",
                            "else": None
                        }
                    }
                }
            }
        }
    }
    cutoff_30 = now - timedelta(days=30)
    try:
        top3_raw = await database.work_orders.aggregate([
            _norm_stage,
            {"$match": {
                "statut": "TERMINE",
                **NOT_DELETED,
                "_tempsEstime_norm": {"$gt": 0},
                "tempsReel": {"$gt": 0},
                "_dateTermine_norm": {"$gte": cutoff_30}
            }},
            {"$addFields": {
                "_deviation_h": {"$subtract": ["$tempsReel", "$_tempsEstime_norm"]}
            }},
            {"$match": {"_deviation_h": {"$gt": 0}}},
            {"$sort": {"_deviation_h": -1}},
            {"$limit": 3},
            {"$project": {
                "_id": 0,
                "numero": 1,
                "titre": 1,
                "tempsEstime": "$_tempsEstime_norm",
                "tempsReel": 1,
            }}
        ]).to_list(3)
        result["top_deviations_month"] = [
            {
                "numero": w.get("numero"),
                "titre": (w.get("titre") or "")[:40],
                "tempsEstime": round(float(w.get("tempsEstime") or 0), 2),
                "tempsReel": round(float(w.get("tempsReel") or 0), 2),
                "ecart_pct": round(((w["tempsReel"] - w["tempsEstime"]) / w["tempsEstime"]) * 100)
                    if (w.get("tempsEstime") or 0) > 0 else 0
            }
            for w in top3_raw
            if (w.get("tempsEstime") or 0) > 0
        ]
    except Exception as e:
        logger.warning(f"Erreur top3 ecart_temps: {e}")
        result["top_deviations_month"] = []

    # --- Widget 2: Heures estimées restantes (OT non terminés) ---
    pipeline_open = [
        {"$addFields": {
            "_tempsEstime_norm": {
                "$cond": {
                    "if": {"$and": [{"$gt": ["$tempsEstime", 0]}, {"$isNumber": "$tempsEstime"}]},
                    "then": "$tempsEstime",
                    "else": {
                        "$cond": {
                            "if": {"$and": [{"$gt": ["$temps_estime", 0]}, {"$isNumber": "$temps_estime"}]},
                            "then": "$temps_estime",
                            "else": None
                        }
                    }
                }
            }
        }},
        {"$match": {
            "statut": {"$nin": ["TERMINE", "ANNULE"]},
            **NOT_DELETED,
            "_tempsEstime_norm": {"$gt": 0}
        }},
        {"$group": {
            "_id": None,
            "total_hours": {"$sum": "$_tempsEstime_norm"},
            "count": {"$sum": 1}
        }}
    ]
    agg_open = await database.work_orders.aggregate(pipeline_open).to_list(1)
    if agg_open:
        result["estimated_hours_open"] = round(agg_open[0]["total_hours"], 1)
        result["estimated_hours_open_count"] = agg_open[0]["count"]

    # Techniciens maintenance (hors responsables de service)
    maint_regex = re.compile(r"^maintenance$", re.IGNORECASE)
    maint_responsables = await database.service_responsables.find(
        {"service": maint_regex}, {"_id": 0, "user_id": 1}
    ).to_list(50)
    # resp_ids = set des user_id responsables, normalisés en string
    resp_ids = {str(r.get("user_id")) for r in maint_responsables if r.get("user_id")}

    # NOTE : on filtre UNIQUEMENT sur `statut` (source de vérité gérée par l'UI).
    # Le champ legacy `actif` n'est plus fiable (souvent à False alors que statut=ACTIF
    # côté UI). Voir diagnose_charge_ot_widget.py pour le détail.
    all_maint_users = await database.users.find(
        {
            "service": maint_regex,
            "statut": {"$not": {"$regex": "^inactif$", "$options": "i"}},
            **NOT_DELETED
        },
        {"id": 1, "_id": 1}
    ).to_list(500)
    # Gérer à la fois les users avec `id` (UUID) et ceux avec `_id` uniquement (ObjectId)
    tech_ids = set()
    for u in all_maint_users:
        uid = u.get("id") or str(u.get("_id", ""))
        if uid and uid not in resp_ids:
            tech_ids.add(uid)
    result["maintenance_techs_count"] = len(tech_ids)

    return result


@api_router.get("/dashboard/widget-data", tags=["Dashboard"])
async def get_dashboard_widget_data(current_user: dict = Depends(get_current_user)):
    """Retourne les donnees pour les widgets du dashboard principal."""
    from datetime import timedelta
    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    seven_days_ago = now - timedelta(days=7)

    try:
        # Stock bas
        inventory = await db.inventory.find({}, {"_id": 0, "quantite": 1, "quantiteMin": 1, "seuil_alerte": 1, "stock_monitoring_enabled": 1}).to_list(5000)
        low_stock = 0
        out_of_stock = 0
        for item in inventory:
            if not item.get("stock_monitoring_enabled", True):
                continue
            qty = item.get("quantite", 0) or 0
            qty_min = item.get("quantiteMin", item.get("seuil_alerte", 0)) or 0
            if qty <= 0:
                out_of_stock += 1
            elif qty_min > 0 and qty <= qty_min:
                low_stock += 1

        # Incidents recents (presqu'accidents 30 derniers jours)
        thirty_days_str = thirty_days_ago.strftime("%Y-%m-%d")
        recent_incidents = await db.presqu_accident_items.count_documents({
            "date_incident": {"$gte": thirty_days_str}
        })
        # Total presqu'accidents
        total_incidents = await db.presqu_accident_items.count_documents({})

        # Maintenances a venir (7 prochains jours)
        seven_days_later = now + timedelta(days=7)
        upcoming_maintenance = await db.preventive_maintenances.count_documents({
            "statut": "ACTIF",
            "prochaineMaintenance": {"$gte": now, "$lte": seven_days_later}
        })
        # M.Prev en retard
        overdue_mprev = await db.preventive_maintenances.count_documents({
            "statut": "ACTIF",
            "prochaineMaintenance": {"$lte": now}
        })

        # Changements de statut recents (7 derniers jours)
        recent_changes = await db.equipment_status_history.count_documents({
            "changed_at": {"$gte": seven_days_ago.isoformat()}
        }) if await db.list_collection_names() else 0
        try:
            recent_changes = await db.equipment_status_history.count_documents({
                "changed_at": {"$gte": seven_days_ago.isoformat()}
            })
        except Exception:
            recent_changes = 0

        return {
            "low_stock": low_stock,
            "out_of_stock": out_of_stock,
            "recent_incidents_30d": recent_incidents,
            "total_incidents": total_incidents,
            "upcoming_maintenance_7d": upcoming_maintenance,
            "overdue_mprev": overdue_mprev,
            "recent_status_changes_7d": recent_changes,
            **(await _compute_time_widgets(db, now))
        }
    except Exception as e:
        logger.error(f"Erreur dashboard widget-data: {e}")
        raise HTTPException(status_code=500, detail=str(e))





# Routes extraites de server.py
from routes.work_orders import router as work_orders_router
from routes.equipments import router as equipments_router
from routes.intervention_requests import router as intervention_requests_router
from routes.reports import router as reports_router
from routes.users import router as users_router
from routes.notifications import router as notifications_router, check_pm_notifications
from routes.settings import router as settings_router
from routes.vendors import router as vendors_router
from routes.improvements import router as improvements_router
from routes.auth import router as auth_router
from routes.service_manager import router as service_manager_router
from routes.availability import router as availability_router
from routes.maintenance_assignments import router as maintenance_assignments_router
from routes.locations import router as locations_router
from routes.inventory import router as inventory_router
from routes.preventive_maintenance import router as preventive_maintenance_router
from routes.support import router as support_router
from routes.update_routes import router as update_routes_router
from routes.audit import router as audit_router
from routes.meters import router as meters_router
from routes.update_management import router as update_management_router
from routes.update_management import update_service
from routes.notification_health import router as notification_health_router
from routes.admin import router as admin_router
from routes.data_integrity import router as data_integrity_router

api_router.include_router(work_orders_router)
api_router.include_router(equipments_router)
api_router.include_router(intervention_requests_router)
api_router.include_router(reports_router)
api_router.include_router(users_router)
api_router.include_router(notifications_router)
api_router.include_router(settings_router)
api_router.include_router(vendors_router)
api_router.include_router(improvements_router)
api_router.include_router(auth_router)
api_router.include_router(service_manager_router)
api_router.include_router(availability_router)
api_router.include_router(maintenance_assignments_router)
api_router.include_router(locations_router)
api_router.include_router(inventory_router)
api_router.include_router(preventive_maintenance_router)
api_router.include_router(support_router)
api_router.include_router(update_routes_router)
api_router.include_router(audit_router)
api_router.include_router(meters_router)
api_router.include_router(update_management_router)
api_router.include_router(notification_health_router)
api_router.include_router(admin_router)
api_router.include_router(data_integrity_router)

# ==================== MODULES EXTERNES ====================

# Surveillance routes
from surveillance_routes import router as surveillance_router, init_surveillance_routes
init_surveillance_routes(db, audit_service, realtime_manager)
api_router.include_router(surveillance_router)

# AI maintenance routes
from ai_maintenance_routes import router as ai_maintenance_router, init_ai_maintenance_routes
init_ai_maintenance_routes(db, audit_service)
api_router.include_router(ai_maintenance_router)

# AI routes
from ai_presqu_accident_routes import router as ai_pa_router, init_ai_pa_routes
init_ai_pa_routes(db, audit_service)
api_router.include_router(ai_pa_router)

from ai_work_order_routes import router as ai_wo_router, init_ai_wo_routes
init_ai_wo_routes(db, audit_service)
api_router.include_router(ai_wo_router)

from ai_weekly_report_routes import router as ai_report_router, init_ai_report_routes
init_ai_report_routes(db)
api_router.include_router(ai_report_router)

from ai_sensor_routes import router as ai_sensor_router, init_ai_sensor_routes
init_ai_sensor_routes(db)
api_router.include_router(ai_sensor_router)

from ai_purchase_history_routes import router as ai_purchase_history_router, init_ai_purchase_history_routes
init_ai_purchase_history_routes(db, audit_service)
api_router.include_router(ai_purchase_history_router)

from automation_routes import router as automation_router, init_automation_routes
init_automation_routes(db)
api_router.include_router(automation_router)

# Presqu'accident routes
from presqu_accident_routes import router as presqu_accident_router, init_presqu_accident_routes
init_presqu_accident_routes(db, audit_service, realtime_manager)
api_router.include_router(presqu_accident_router)

# Documentations, SSH, preferences, surveillance history, tailscale, autorisations
from documentations_routes import router as documentations_router, init_documentations_routes
from ssh_routes import router as ssh_router
from user_preferences_routes import router as user_preferences_router
from surveillance_history_routes import router as surveillance_history_router
from tailscale_routes import router as tailscale_router
from autorisation_routes import router as autorisation_router
init_documentations_routes(db, audit_service, realtime_manager)
api_router.include_router(documentations_router)
api_router.include_router(ssh_router)
api_router.include_router(user_preferences_router)
api_router.include_router(surveillance_history_router)
api_router.include_router(tailscale_router)
api_router.include_router(autorisation_router)

# Demandes d'arret pour maintenance
from demande_arret_routes import router as demande_arret_router
from demande_arret_reports_routes import router as demande_arret_reports_router
from demande_arret_attachments_routes import router as demande_arret_attachments_router
api_router.include_router(demande_arret_reports_router)
api_router.include_router(demande_arret_attachments_router)
api_router.include_router(demande_arret_router)

# Import/Export routes
from import_export_routes import router as import_export_router, init_db as init_import_export_db
init_import_export_db(db)
api_router.include_router(import_export_router)

# Backup routes
from backup_routes import router as backup_router, init_db as init_backup_db, set_scheduler as set_backup_scheduler
from backup_service import init_db as init_backup_service_db
init_backup_db(db)
init_backup_service_db(db)
api_router.include_router(backup_router)

# Chat Live
from chat_routes import router as chat_router, init_chat_routes
init_chat_routes(db)
api_router.include_router(chat_router)

# Chat Cleanup Service
from chat_cleanup_service import init_chat_cleanup_service
chat_cleanup_service = init_chat_cleanup_service(db)

# Manuel utilisateur
from manual_routes import router as manual_router
api_router.include_router(manual_router)

# Changelog
from changelog_routes import router as releases_router
api_router.include_router(releases_router)

# QR Codes
from qr_routes import router as qr_router
api_router.include_router(qr_router)
from qr_inventory_routes import router as qr_inventory_router
api_router.include_router(qr_inventory_router)

# Purchase Request routes
from purchase_request_routes import router as purchase_request_router
api_router.include_router(purchase_request_router)

# MQTT routes
from mqtt_routes import router as mqtt_router, init_mqtt_routes
init_mqtt_routes(db)
api_router.include_router(mqtt_router)
from mqtt_manager import mqtt_manager

# MQTT Collectors
from mqtt_meter_collector import mqtt_meter_collector
from mqtt_sensor_collector import mqtt_sensor_collector

# Sensor routes
from sensor_routes import router as sensor_router, init_sensor_routes
init_sensor_routes(db, realtime_manager)
api_router.include_router(sensor_router)

# Alert routes and service
from alert_routes import router as alert_router, init_alert_routes
init_alert_routes(db)
api_router.include_router(alert_router)
from alert_service import alert_service

# MQTT Logger
from mqtt_logger import init_mqtt_logger
mqtt_logger = init_mqtt_logger(db)
from mqtt_logs_routes import router as mqtt_logs_router, init_mqtt_logs_routes
init_mqtt_logs_routes(db, mqtt_logger)
api_router.include_router(mqtt_logs_router)

# M.E.S routes
from mes_routes import router as mes_router, init_mes_routes, mes_service as _mes_svc_ref
init_mes_routes(db, mqtt_manager)
api_router.include_router(mes_router)

from mes_report_scheduler import init_mes_report_scheduler
import email_service as email_service_module

# AI Chatbot routes
from ai_chat_routes import router as ai_router, init_ai_routes
init_ai_routes(db)
api_router.include_router(ai_router)

# Roles Management routes
from roles_routes import router as roles_router, init_system_roles, init_roles_routes
init_roles_routes(db)
api_router.include_router(roles_router)

# Timezone Configuration routes
from timezone_routes import router as timezone_router, init_timezone_routes
init_timezone_routes(db)
api_router.include_router(timezone_router)

# Consignes routes
from consignes_routes import router as consignes_router, init_consignes_routes, consignes_websocket_endpoint
init_consignes_routes(db, get_current_user, mqtt_manager, audit_service)
api_router.include_router(consignes_router)

# Work Order Templates routes
from work_order_templates_routes import router as wo_templates_router
api_router.include_router(wo_templates_router)

# Custom Widgets routes
from custom_widgets_routes import router as custom_widgets_router, init_custom_widgets_routes
init_custom_widgets_routes(db, audit_service)
api_router.include_router(custom_widgets_router)
from ai_widget_routes import router as ai_widget_router, init_ai_widget_routes
init_ai_widget_routes(db)
api_router.include_router(ai_widget_router)

# Service de filtrage par service
from service_filter import init_service_filter
init_service_filter(db)

# Service d'email pour les demandes d'amelioration
from improvement_request_email_service import init_improvement_request_email_service
init_improvement_request_email_service(db)

# Whiteboard routes
from whiteboard_routes import router as whiteboard_router, init_whiteboards, init_whiteboard_audit
from whiteboard_object_routes import router as whiteboard_object_router
from whiteboard_manager import whiteboard_manager, handle_whiteboard_message
init_whiteboard_audit(audit_service)
api_router.include_router(whiteboard_router)
api_router.include_router(whiteboard_object_router)

# Weekly/Team reports and time tracking
from weekly_report_routes import router as weekly_report_router, set_database as set_weekly_report_db
set_weekly_report_db(db)
api_router.include_router(weekly_report_router)
from team_management_routes import router as team_router, set_database as set_team_db
set_team_db(db)
api_router.include_router(team_router)
from time_tracking_routes import router as time_tracking_router, set_database as set_time_tracking_db
set_time_tracking_db(db)
api_router.include_router(time_tracking_router)

# Camera routes (Frigate AVANT camera_router)
from frigate_routes import router as frigate_router, set_database as set_frigate_db, init_frigate_from_db
set_frigate_db(db)
api_router.include_router(frigate_router, prefix="/cameras")
from camera_routes import router as camera_router, set_database as set_camera_db
from camera_snapshot_scheduler import set_database as set_camera_scheduler_db, start_snapshot_scheduler
set_camera_db(db)
set_camera_scheduler_db(db)
api_router.include_router(camera_router)

# Analytics Checklists
from analytics_routes import router as analytics_router, set_database as set_analytics_db
set_analytics_db(db)
api_router.include_router(analytics_router)

# Contrats
from contract_routes import router as contract_router, init_db as init_contract_db
init_contract_db(db, audit_service)
api_router.include_router(contract_router)

# LOTO (Lockout/Tagout)
from loto_routes import router as loto_router, init_loto_routes
init_loto_routes(db, audit_service)
api_router.include_router(loto_router)

# Push Notifications
from notifications import router as push_notifications_router, set_db as set_notifications_db, check_push_receipts
set_notifications_db(db)
api_router.include_router(push_notifications_router)

# Formation (Training)
from training_routes import router as training_router, init_training_routes
init_training_routes(db)
api_router.include_router(training_router)

# Analyse d'Accidents (Arbre des Causes)
from accident_analysis_routes import router as accident_analysis_router, init_accident_analysis_routes
init_accident_analysis_routes(db, audit_service)
api_router.include_router(accident_analysis_router)

# Sauvegardes MongoDB natives (mongodump)
from routes.mongodb_backup import router as mongodb_backup_router
api_router.include_router(mongodb_backup_router)

# check_notification_health_cron pour le scheduler
from routes.notification_health import check_notification_health_cron


# WebSocket pour le tableau d'affichage
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/api/ws/whiteboard/{board_id}")
async def whiteboard_websocket(websocket: WebSocket, board_id: str):
    """WebSocket pour la synchronisation temps réel du tableau d'affichage"""
    # Récupérer les paramètres de l'utilisateur depuis la query string
    user_id = websocket.query_params.get("user_id", "anonymous")
    user_name = websocket.query_params.get("user_name", "Anonyme")
    
    await whiteboard_manager.connect(websocket, board_id, user_id, user_name)
    
    try:
        # Envoyer l'état initial du tableau
        board = await db.whiteboards.find_one({"board_id": board_id}, {"_id": 0})
        if board:
            await websocket.send_json({
                "type": "sync_response",
                "board": board
            })
        
        # Écouter les messages
        while True:
            data = await websocket.receive_json()
            await handle_whiteboard_message(websocket, board_id, user_id, user_name, data, db)
            
    except WebSocketDisconnect:
        await whiteboard_manager.disconnect(board_id, user_id)
    except Exception as e:
        logger.error(f"Erreur WebSocket whiteboard: {e}")
        await whiteboard_manager.disconnect(board_id, user_id)

# WebSocket Centralisé pour toutes les entités temps réel
from realtime_events import EntityType as RealtimeEntityType

@app.websocket("/api/ws/realtime/{entity_type}")
async def realtime_websocket(websocket: WebSocket, entity_type: str, user_id: str = None):
    """
    WebSocket centralisé pour la synchronisation temps réel de toutes les entités
    
    Args:
        entity_type: Type d'entité (work_orders, equipments, etc.)
        user_id: ID de l'utilisateur connecté
    """
    try:
        logger.info(f"[Realtime] Nouvelle connexion WebSocket demandée: entity_type={entity_type}, user_id={user_id}")
        
        # Valider le type d'entité
        valid_types = [e.value for e in RealtimeEntityType]
        if entity_type not in valid_types:
            logger.warning(f"[Realtime] Type d'entité invalide: {entity_type}. Types valides: {valid_types}")
            await websocket.close(code=1008, reason=f"Invalid entity type: {entity_type}")
            return
        
        # Valider user_id
        if not user_id:
            logger.warning(f"[Realtime] user_id manquant pour {entity_type}")
            await websocket.close(code=1008, reason="user_id is required")
            return
        
        # Accepter la connexion WebSocket
        await websocket.accept()
        logger.info(f"[Realtime] WebSocket accepté: {entity_type}/{user_id}")
        
        # Connecter l'utilisateur au manager (connexion déjà acceptée)
        await realtime_manager.connect(entity_type, user_id, websocket, already_accepted=True)
        logger.info(f"[Realtime] Utilisateur {user_id} connecté au room {entity_type}. Total: {realtime_manager.get_connection_count(entity_type)}")
        
        # Garder la connexion ouverte
        while True:
            # Recevoir les messages du client (pour ping/pong ou autres commandes)
            data = await websocket.receive_json()
            
            # Gérer les commandes spéciales si nécessaire
            if data.get("type") == "ping":
                await realtime_manager.send_to_user(entity_type, user_id, {"type": "pong"})
            
    except WebSocketDisconnect:
        realtime_manager.disconnect(entity_type, user_id)
        logger.info(f"[Realtime] WebSocket déconnecté: {entity_type}/{user_id}")
    except Exception as e:
        logger.error(f"[Realtime] Erreur WebSocket {entity_type}/{user_id}: {e}")
        realtime_manager.disconnect(entity_type, user_id)

# WebSocket pour le Chat Live
from websocket_manager import manager as chat_manager

@app.websocket("/api/ws/chat")
async def chat_live_websocket(websocket: WebSocket, token: str = None, user_id: str = None):
    """WebSocket pour le chat en temps réel"""
    ws_user_id = None
    user_name = "Unknown"
    
    try:
        # Support: user_id direct (préféré pour la compatibilité proxy) ou token JWT
        if user_id:
            ws_user_id = user_id
            user_data = await db.users.find_one({"_id": ObjectId(ws_user_id)})
            if not user_data:
                await websocket.close(code=1008, reason="User not found")
                return
            user_name = f"{user_data.get('prenom', '')} {user_data.get('nom', '')}".strip()
        elif token:
            payload = decode_access_token(token)
            if not payload:
                await websocket.close(code=1008, reason="Invalid token")
                return
            ws_user_id = payload.get("sub")
            if not ws_user_id:
                await websocket.close(code=1008, reason="Invalid token - no user_id")
                return
            user_data = await db.users.find_one({"_id": ObjectId(ws_user_id)})
            if not user_data:
                await websocket.close(code=1008, reason="User not found")
                return
            user_name = f"{user_data.get('prenom', '')} {user_data.get('nom', '')}".strip()
        else:
            await websocket.close(code=1008, reason="user_id or token required")
            return
        
        # Connecter l'utilisateur
        await chat_manager.connect(websocket, ws_user_id, user_name)
        
        # Marquer l'utilisateur comme en ligne
        await db.user_chat_activity.update_one(
            {"user_id": ws_user_id},
            {
                "$set": {
                    "user_id": ws_user_id,
                    "is_online": True,
                    "last_activity": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
        
        try:
            while True:
                # Recevoir les messages du client
                data = await websocket.receive_json()
                message_type = data.get("type")
                
                if message_type == "heartbeat":
                    await db.user_chat_activity.update_one(
                        {"user_id": ws_user_id},
                        {"$set": {"last_activity": datetime.now(timezone.utc).isoformat()}}
                    )
                    await websocket.send_json({"type": "heartbeat_ack"})
                
                elif message_type == "message":
                    message_content = data.get("message", "")
                    recipient_ids = data.get("recipient_ids", [])
                    reply_to_id = data.get("reply_to_id")
                    
                    chat_message = {
                        "id": str(uuid.uuid4()),
                        "user_id": ws_user_id,
                        "user_name": user_name,
                        "user_role": user_data.get("role", ""),
                        "message": message_content,
                        "recipient_ids": recipient_ids,
                        "recipient_names": [],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "is_deleted": False,
                        "deleted_at": None,
                        "reply_to_id": reply_to_id,
                        "reply_to_preview": None,
                        "reactions": [],
                        "attachments": [],
                        "deletable_until": (datetime.now(timezone.utc) + timedelta(seconds=10)).isoformat(),
                        "is_private": len(recipient_ids) > 0
                    }
                    
                    if reply_to_id:
                        original_msg = await db.chat_messages.find_one({"id": reply_to_id})
                        if original_msg:
                            chat_message["reply_to_preview"] = original_msg.get("message", "")[:100]
                    
                    if recipient_ids:
                        recipient_object_ids = [ObjectId(rid) for rid in recipient_ids if ObjectId.is_valid(rid)]
                        recipients = await db.users.find({"_id": {"$in": recipient_object_ids}}).to_list(length=None)
                        chat_message["recipient_names"] = [
                            f"{r.get('prenom', '')} {r.get('nom', '')}".strip()
                            for r in recipients
                        ]
                    
                    await db.chat_messages.insert_one(chat_message)
                    
                    broadcast_data = {
                        "type": "new_message",
                        "message": {k: v for k, v in chat_message.items() if k != "_id"}
                    }
                    
                    if recipient_ids:
                        await chat_manager.send_to_users(broadcast_data, recipient_ids + [ws_user_id])
                    else:
                        await chat_manager.broadcast(broadcast_data)
                
                elif message_type == "typing":
                    await chat_manager.broadcast({
                        "type": "user_typing",
                        "user_id": ws_user_id,
                        "user_name": user_name
                    }, exclude_user_id=ws_user_id)
        
        except WebSocketDisconnect:
            logger.info(f"Chat WebSocket déconnecté: {user_name}")
    
    except Exception as e:
        logger.error(f"Erreur Chat WebSocket: {e}")
    
    finally:
        if ws_user_id:
            chat_manager.disconnect(ws_user_id, user_name, websocket=websocket)
            # Vérifier s'il reste des connexions pour cet utilisateur
            if not chat_manager.is_user_online(ws_user_id):
                await db.user_chat_activity.update_one(
                    {"user_id": ws_user_id},
                    {"$set": {"is_online": False, "last_activity": datetime.now(timezone.utc).isoformat()}}
                )
                await chat_manager.broadcast_user_status(ws_user_id, user_name, "offline")

# WebSocket pour les consignes (notifications temps réel)
@app.websocket("/api/ws/consignes")
async def consignes_websocket(websocket: WebSocket, token: str = None, user_id: str = None):
    """WebSocket pour recevoir les consignes en temps réel"""
    if user_id:
        # Connexion par user_id (compatible proxy)
        try:
            user_data = await db.users.find_one({"_id": ObjectId(user_id)})
            if not user_data:
                await websocket.close(code=1008, reason="User not found")
                return
            await websocket.accept()
            try:
                while True:
                    data = await websocket.receive_text()
            except WebSocketDisconnect:
                pass
        except Exception as e:
            logger.error(f"Erreur consignes WS: {e}")
    elif token:
        await consignes_websocket_endpoint(websocket, token)
    else:
        await websocket.close(code=1008, reason="user_id or token required")


# ADMIN RESET ROUTES ==: Extrait

app.include_router(api_router)

# Fonction de vérification des versions LLM (appelée par le scheduler)
async def check_llm_versions_job():
    """Vérifie les nouvelles versions des modèles LLM et notifie les admins"""
    try:
        from datetime import datetime, timezone, timedelta
        from ai_chat_routes import KNOWN_LLM_VERSIONS, AVAILABLE_AI_MODELS
        logger.info("Vérification automatique des versions LLM...")
        
        # Mettre à jour la date de dernière vérification + synchroniser les modèles
        now = datetime.now(timezone.utc)
        next_monday = now + timedelta(days=7)
        
        await db.llm_versions.update_one(
            {"id": "current"},
            {"$set": {
                "versions": KNOWN_LLM_VERSIONS,
                "available_models": AVAILABLE_AI_MODELS,
                "last_check": now.isoformat(),
                "next_check": next_monday.isoformat(),
                "checked_by": "scheduler"
            }},
            upsert=True
        )
        
        logger.info("Vérification des versions LLM terminée")
        
    except Exception as e:
        logger.error(f"Erreur vérification versions LLM: {e}")


@app.on_event("startup")
async def auto_configure_vapid_keys():
    """Auto-génère les clés VAPID si absentes — aucune intervention manuelle requise.
    
    Stratégie de récupération:
    1. Si .env a les clés → ok, rien à faire
    2. Si MongoDB a les clés (survivent aux mises à jour qui écrasent .env) → les recharger
    3. Si aucune source → générer + sauvegarder dans .env ET MongoDB
    """
    pub = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
    priv = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    subject = os.environ.get("VAPID_SUBJECT", "mailto:admin@fsao-iris.fr").strip()

    if pub and priv:
        # Clés déjà chargées depuis .env → s'assurer qu'elles sont aussi en DB
        await db.app_config.update_one(
            {"key": "vapid_keys"},
            {"$set": {"key": "vapid_keys", "public": pub, "private": priv, "subject": subject}},
            upsert=True
        )
        logger.info(f"[VAPID] Clés chargées depuis .env → synchronisées en DB")
        return

    # Essayer de récupérer depuis MongoDB (cas: .env écrasé par une mise à jour)
    stored = await db.app_config.find_one({"key": "vapid_keys"})
    if stored and stored.get("public") and stored.get("private"):
        pub = stored["public"]
        priv = stored["private"]
        subject = stored.get("subject", subject)
        os.environ["VAPID_PUBLIC_KEY"] = pub
        os.environ["VAPID_PRIVATE_KEY"] = priv
        os.environ["VAPID_SUBJECT"] = subject
        _write_vapid_to_env(pub, priv, subject)
        logger.info(f"[VAPID] Clés récupérées depuis MongoDB → restaurées dans .env")
        return

    # Aucune source → générer de nouvelles clés
    pub, priv = _generate_vapid_keys()
    os.environ["VAPID_PUBLIC_KEY"] = pub
    os.environ["VAPID_PRIVATE_KEY"] = priv
    os.environ["VAPID_SUBJECT"] = subject

    # Sauvegarder dans .env ET MongoDB
    _write_vapid_to_env(pub, priv, subject)
    await db.app_config.update_one(
        {"key": "vapid_keys"},
        {"$set": {"key": "vapid_keys", "public": pub, "private": priv, "subject": subject}},
        upsert=True
    )
    logger.info(f"[VAPID] Nouvelles clés auto-générées et persistées (.env + DB)")

    # IMPORTANT: Les anciens abonnements sont liés aux anciennes clés VAPID.
    # Les invalider immédiatement pour éviter les faux "Actif" dans la Santé système.
    try:
        now_dt = datetime.now(timezone.utc)
        result = await db.web_push_subscriptions.update_many(
            {"is_active": True},
            {"$set": {
                "is_active": False,
                "deactivated_at": now_dt,
                "deactivation_reason": "vapid_key_changed"
            }}
        )
        if result.modified_count > 0:
            logger.info(f"[VAPID] {result.modified_count} abonnement(s) push invalidé(s) (nouvelles clés VAPID)")
    except Exception as e:
        logger.warning(f"[VAPID] Impossible d'invalider les abonnements push: {e}")


@app.on_event("startup")
async def migrate_en_attente_status():
    """Migrer les anciens statuts EN_ATTENTE vers ATT_MATERIEL"""
    try:
        result = await db.work_orders.update_many(
            {"statut": "EN_ATTENTE"},
            {"$set": {"statut": "ATT_MATERIEL"}}
        )
        if result.modified_count > 0:
            logger.info(f"Migration: {result.modified_count} OT EN_ATTENTE -> ATT_MATERIEL")
    except Exception as e:
        logger.warning(f"Erreur migration statuts: {e}")

@app.on_event("startup")
async def init_work_order_counter():
    """Initialise le compteur atomique de numéros d'OT avec le max existant."""
    try:
        pipeline = [
            {"$addFields": {"numero_int": {"$toInt": "$numero"}}},
            {"$group": {"_id": None, "max_numero": {"$max": "$numero_int"}}}
        ]
        result = await db.work_orders.aggregate(pipeline).to_list(1)
        max_numero = result[0]["max_numero"] if result and result[0].get("max_numero") else 5800
        await db.counters.update_one(
            {"_id": "work_order_numero"},
            {"$max": {"seq": max_numero}},
            upsert=True
        )
        logger.info(f"Compteur OT initialisé: dernier numéro = {max_numero}")
    except Exception as e:
        logger.warning(f"Erreur initialisation compteur OT: {e}")

@app.on_event("startup")
async def start_mes_report_scheduler():
    try:
        await init_mes_report_scheduler(db, _mes_svc_ref, email_service_module)
        logger.info("Scheduler rapports M.E.S. demarre")
    except Exception as e:
        logger.warning(f"Erreur demarrage scheduler rapports M.E.S.: {e}")

@app.on_event("startup")
async def init_frigate():
    await init_frigate_from_db()

@app.on_event("startup")
async def fix_surveillance_ecart_data():
    """Correction de données : reset ecart_jours pour les items non réalisés."""
    try:
        result = await db.surveillance_items.update_many(
            {"status": {"$in": ["PLANIFIER", "PLANIFIE"]}, "ecart_jours": {"$ne": None}},
            {"$set": {"ecart_jours": None}}
        )
        if result.modified_count > 0:
            logger.info(f"🔧 Correction données: ecart_jours réinitialisé pour {result.modified_count} item(s) non réalisé(s)")
    except Exception as e:
        logger.warning(f"Correction ecart_jours ignorée: {e}")


@app.on_event("startup")
async def create_notification_indexes():
    """Create MongoDB indexes for push notifications collections."""
    try:
        # Supprimer l'ancien index unique s'il existe (cause des erreurs 500)
        try:
            await db.device_tokens.drop_index("push_token_1")
        except Exception:
            pass
        await db.device_tokens.create_index([("user_id", 1), ("is_active", 1)])
        await db.device_tokens.create_index([("push_token", 1)])
        await db.push_receipts.create_index([("checked", 1), ("created_at", 1)])
        await db.push_receipts.create_index([("ticket_id", 1)])
        logger.info("Indexes device_tokens et push_receipts crees avec succes")

        # Reactiver les abonnements web push desactives a tort par HTTP 400
        reactivated = await db.web_push_subscriptions.update_many(
            {"is_active": False, "deactivation_reason": "HTTP 400"},
            {"$set": {"is_active": True}, "$unset": {"deactivated_at": "", "deactivation_reason": ""}}
        )
        if reactivated.modified_count > 0:
            logger.info(f"[WEB PUSH] {reactivated.modified_count} abonnement(s) reactives (etaient desactives par HTTP 400)")
    except Exception as e:
        logger.warning(f"Erreur creation indexes: {e}")



@app.on_event("startup")
async def create_unique_id_indexes():
    """Crée des index uniques sur le champ 'id' pour toutes les collections métier afin d'éviter les doublons."""
    collections = [
        "work_orders",
        "intervention_requests",
        "improvements",
        "improvement_requests",
        "preventive_maintenance",
        "preventive_maintenances",
        "equipments",
        "locations",
        "users",
        "checklist_templates",
        "checklist_executions",
        "checklists",
        "inventory",
        "inventory_services",
        "purchase_requests",
        "contracts",
        "sensors",
        "vendors",
        "accident_analyses",
        "bons_travail",
        "loto_consignations",
        "consignes",
        "roles",
        "notifications",
        "demandes_arret",
    ]
    created = 0
    for coll_name in collections:
        try:
            coll = db[coll_name]
            await coll.create_index("id", unique=True, sparse=True)
            created += 1
        except Exception as e:
            logger.warning(f"Index unique 'id' pour {coll_name}: {e}")
    logger.info(f"✅ Index uniques 'id' créés/vérifiés pour {created}/{len(collections)} collections")




@app.on_event("startup")
async def start_trash_purge_scheduler():
    """Demarre le cron job de purge de la corbeille toutes les 12h"""
    try:
        from trash_routes import purge_expired_trash
        scheduler.add_job(purge_expired_trash, CronTrigger(hour="0,12"), id="trash_purge", replace_existing=True)
        logger.info("Cron job purge corbeille demarre (toutes les 12h)")
    except Exception as e:
        logger.warning(f"Erreur demarrage cron purge corbeille: {e}")



@app.on_event("startup")
async def check_update_results_on_startup():
    """Vérifie s'il existe des résultats de mise à jour non traités au démarrage."""
    try:
        await update_service.check_and_save_update_result()
    except Exception as e:
        logger.error(f"[MAJ] Erreur vérification résultats MAJ au démarrage: {e}")


@app.on_event("startup")
async def migrate_inventory_services():
    """Migration: créer le service 'Non classé' et assigner les articles existants sans service_id."""
    try:
        # Créer 'Non classé' s'il n'existe pas
        non_classe = await db.inventory_services.find_one({"name": "Non classé"})
        if not non_classe:
            nc_doc = {
                "id": str(uuid.uuid4()),
                "name": "Non classé",
                "created_by": "system",
                "created_by_name": "Système",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.inventory_services.insert_one(nc_doc)
            nc_id = nc_doc["id"]
            logger.info("[Inventaire] Service 'Non classé' créé")
        else:
            nc_id = non_classe["id"]
        
        # Migrer les articles sans service_id
        result = await db.inventory.update_many(
            {"$or": [{"service_id": None}, {"service_id": {"$exists": False}}]},
            {"$set": {"service_id": nc_id, "shared_service_ids": []}}
        )
        if result.modified_count > 0:
            logger.info(f"[Inventaire] {result.modified_count} articles migrés vers 'Non classé'")
    except Exception as e:
        logger.error(f"[Inventaire] Erreur migration services: {e}")



@app.on_event("startup")
async def startup_scheduler():
    """Démarre le scheduler au démarrage de l'application"""
    try:
        # Configurer le scheduler pour s'exécuter chaque jour à minuit (heure locale)
        scheduler.add_job(
            auto_check_preventive_maintenance,
            CronTrigger(hour=0, minute=0),  # Tous les jours à minuit
            id='check_preventive_maintenance',
            name='Vérification automatique maintenances préventives',
            replace_existing=True
        )
        
        # Configurer la vérification automatique des mises à jour à 1h00 du matin
        scheduler.add_job(
            update_service.check_for_updates,
            CronTrigger(hour=1, minute=0),  # Tous les jours à 1h00
            id='check_updates',
            name='Vérification automatique des mises à jour',
            replace_existing=True
        )
        
        # Configurer la vérification des demandes d'arrêt expirées à 2h00 du matin
        from demande_arret_routes import check_expired_demandes_cron
        scheduler.add_job(
            check_expired_demandes_cron,
            CronTrigger(hour=2, minute=0),  # Tous les jours à 2h00
            id='check_expired_demandes',
            name='Vérification demandes arrêt expirées (7 jours)',
            replace_existing=True
        )
        
        # Configurer la gestion des maintenances planifiées à 0h05 et 12h00
        scheduler.add_job(
            manage_planned_maintenance_status,
            CronTrigger(hour=0, minute=5),  # Tous les jours à 0h05
            id='manage_planned_maintenance_morning',
            name='Gestion maintenances planifiées (matin)',
            replace_existing=True
        )
        scheduler.add_job(
            manage_planned_maintenance_status,
            CronTrigger(hour=12, minute=0),  # Tous les jours à 12h00
            id='manage_planned_maintenance_noon',
            name='Gestion maintenances planifiées (midi)',
            replace_existing=True
        )
        
        # Configurer le nettoyage automatique des messages du chat à 3h00 du matin
        scheduler.add_job(
            chat_cleanup_service.cleanup_old_messages,
            CronTrigger(hour=3, minute=0),  # Tous les jours à 3h00
            id='chat_cleanup',
            name='Nettoyage messages chat > 60 jours',
            replace_existing=True
        )
        
        # Configurer la vérification des versions LLM chaque lundi à 3h00 GMT
        scheduler.add_job(
            check_llm_versions_job,
            CronTrigger(day_of_week='mon', hour=3, minute=0),  # Chaque lundi à 3h00
            id='llm_version_check',
            name='Vérification versions LLM',
            replace_existing=True
        )
        
        # Configurer la vérification des notifications PM tous les jours à 7h00 GMT
        scheduler.add_job(
            check_pm_notifications,
            CronTrigger(hour=7, minute=0),  # Tous les jours à 7h00
            id='pm_notifications_check',
            name='Vérification notifications PM',
            replace_existing=True
        )
        
        # Configurer la vérification des rappels de surveillance tous les jours à 7h30 GMT
        from surveillance_routes import check_surveillance_reminders
        scheduler.add_job(
            check_surveillance_reminders,
            CronTrigger(hour=7, minute=30),  # Tous les jours à 7h30
            id='surveillance_reminders_check',
            name='Rappels surveillance',
            replace_existing=True
        )
        
        # Configurer la vérification des alertes de contrats tous les jours à 8h00 GMT
        from contract_routes import check_contract_alerts
        scheduler.add_job(
            check_contract_alerts,
            CronTrigger(hour=8, minute=0),  # Tous les jours à 8h00
            id='contract_alerts_check',
            name='Alertes contrats',
            replace_existing=True
        )
        
        # Configurer le nettoyage des push tokens invalides toutes les 20 minutes
        scheduler.add_job(
            check_push_receipts,
            CronTrigger(minute='*/20'),  # Toutes les 20 minutes
            id='push_receipts_check',
            name='Verification recus push et nettoyage tokens invalides',
            replace_existing=True
        )
        
        # Configurer la verification de sante des notifications toutes les 30 minutes
        scheduler.add_job(
            check_notification_health_cron,
            CronTrigger(minute='*/30'),  # Toutes les 30 minutes
            id='notification_health_check',
            name='Verification sante systeme de notification',
            replace_existing=True
        )

        # Scan quotidien de cohérence des données à 02h30
        from data_integrity_cron import run_data_integrity_check_and_alert
        scheduler.add_job(
            run_data_integrity_check_and_alert,
            CronTrigger(hour=2, minute=30),  # Tous les jours à 02h30
            id='data_integrity_daily_scan',
            name='Scan cohérence des données (quotidien)',
            replace_existing=True
        )
        
        scheduler.start()
        logger.info("✅ Scheduler démarré:")
        logger.info("   - Vérification maintenances préventives: tous les jours à 00h00")
        logger.info("   - Gestion maintenances planifiées: tous les jours à 00h05 et 12h00")
        logger.info("   - Vérification mises à jour: tous les jours à 01h00")
        logger.info("   - Vérification demandes expirées: tous les jours à 02h00")
        logger.info("   - Nettoyage messages chat (60j): tous les jours à 03h00")
        logger.info("   - Vérification versions LLM: chaque lundi à 03h00")
        logger.info("   - Notifications PM: tous les jours à 07h00")
        logger.info("   - Rappels surveillance: tous les jours à 07h30")
        logger.info("   - Alertes contrats: tous les jours à 08h00")
        logger.info("   - Nettoyage push tokens invalides: toutes les 20 min")
        logger.info("   - Verification sante notifications: toutes les 30 min")
        logger.info("   - Scan coherence des donnees: tous les jours a 02h30")

        # Charger les planifications de backup automatique
        try:
            set_backup_scheduler(scheduler)
            from backup_routes import _reload_scheduler as reload_backup_jobs
            await reload_backup_jobs()
            logger.info("   - Sauvegardes automatiques: planifications chargées")
        except Exception as e:
            logger.warning(f"   - Sauvegardes automatiques: erreur chargement ({e})")
        
        # M.E.S - Calcul cadence chaque minute (abonnement MQTT sera fait APRÈS connexion)
        from mes_routes import mes_service as _mes_ref
        if _mes_ref:
            # Création des index M.E.S. (critique pour les performances avec des
            # millions de pulses)
            try:
                await _mes_ref.ensure_indexes()
            except Exception as e:
                logger.warning(f"   - M.E.S index: erreur création ({e})")
            from apscheduler.triggers.interval import IntervalTrigger
            scheduler.add_job(
                _mes_ref.calculate_minute_cadence,
                IntervalTrigger(minutes=1),
                id='mes_cadence_calc',
                name='M.E.S - Calcul cadence par minute',
                replace_existing=True
            )
            scheduler.add_job(
                _mes_ref.cleanup_old_data,
                CronTrigger(hour=4, minute=0),
                id='mes_cleanup',
                name='M.E.S - Nettoyage données > rétention',
                replace_existing=True
            )
            scheduler.add_job(
                _mes_ref.aggregate_daily_summary,
                CronTrigger(hour=0, minute=5),
                id='mes_daily_summary',
                name='M.E.S - Agrégation journalière (jour précédent)',
                replace_existing=True
            )
            logger.info("   - M.E.S cadence: chaque minute, daily summary: 00:05, cleanup: 04:00")
        
        # Auto-connexion MQTT si configuré (DOIT être fait AVANT les abonnements M.E.S.)
        mqtt_connected = False
        try:
            mqtt_config = await db.mqtt_config.find_one({"id": "default"})
            if mqtt_config and mqtt_config.get("host"):
                logger.info(f"🔌 Configuration MQTT trouvée: {mqtt_config.get('host')}:{mqtt_config.get('port', 1883)}")
                mqtt_manager.set_database(db)
                mqtt_manager.configure(
                    host=mqtt_config["host"],
                    port=mqtt_config.get("port", 1883),
                    username=mqtt_config.get("username"),
                    password=mqtt_config.get("password"),
                    use_ssl=mqtt_config.get("use_ssl", False),
                    client_id=mqtt_config.get("client_id", "gmao_iris")
                )
                success = mqtt_manager.connect()
                if success:
                    # Attendre que la connexion soit vraiment établie
                    import time
                    max_wait = 5  # secondes
                    waited = 0
                    while not mqtt_manager.is_connected and waited < max_wait:
                        await asyncio.sleep(0.1)
                        waited += 0.1
                    mqtt_connected = mqtt_manager.is_connected
                    if mqtt_connected:
                        logger.info("✅ Connexion MQTT automatique établie")
                    else:
                        logger.warning("⚠️ Connexion MQTT initiée mais pas encore établie")
                else:
                    logger.warning("⚠️ Échec de la connexion MQTT automatique")
            else:
                logger.info("ℹ️ Aucune configuration MQTT trouvée, connexion manuelle requise")
        except Exception as mqtt_err:
            logger.error(f"❌ Erreur lors de l'auto-connexion MQTT: {mqtt_err}")
        
        # M.E.S - Abonnement MQTT (APRÈS connexion MQTT)
        if _mes_ref:
            await _mes_ref.subscribe_all()
            if mqtt_connected:
                logger.info("✅ M.E.S. abonné aux topics MQTT")
            else:
                logger.info("ℹ️ M.E.S. topics en attente (MQTT non connecté)")
        
        # Initialiser et démarrer les collecteurs MQTT
        await mqtt_meter_collector.initialize(db)
        await mqtt_meter_collector.start()
        logger.info("✅ Collecteur MQTT compteurs démarré")
        
        await mqtt_sensor_collector.initialize(db)
        await mqtt_sensor_collector.start()
        logger.info("✅ Collecteur MQTT capteurs démarré")
        
        # Initialiser le service d'alertes
        await alert_service.initialize(db)
        logger.info("✅ Service d'alertes initialisé")
        
        # Initialiser les rôles système
        await init_system_roles()
        logger.info("✅ Rôles système initialisés")
        
        # Migrer les permissions des rôles (ajouter les modules manquants)
        try:
            from roles_routes import get_default_permissions_by_role
            NEW_PERMISSION_KEYS = ["mes", "mesReports", "serviceDashboard", "weeklyReports", "demandesArret", "consignes", "autorisationsParticulieres", "timeTracking", "cameras", "analyticsChecklists"]
            roles = await db.roles.find({}).to_list(length=None)
            perm_updated = 0
            for role in roles:
                perms = role.get("permissions", {})
                if not isinstance(perms, dict):
                    perms = {}
                needs_update = False
                for key in NEW_PERMISSION_KEYS:
                    if key not in perms:
                        needs_update = True
                        default_perms = get_default_permissions_by_role(role.get("code", ""))
                        default_dict = default_perms.model_dump()
                        perms[key] = default_dict.get(key, {"view": False, "edit": False, "delete": False})
                if needs_update:
                    await db.roles.update_one({"id": role["id"]}, {"$set": {"permissions": perms}})
                    perm_updated += 1
            if perm_updated > 0:
                logger.info(f"✅ Permissions migrées pour {perm_updated} rôle(s)")
        except Exception as role_mig_err:
            import traceback
            logger.error(f"❌ Erreur migration permissions rôles: {role_mig_err}\n{traceback.format_exc()}")
        
        # Migrer les permissions de TOUS les utilisateurs existants
        try:
            all_users = await db.users.find({}).to_list(length=None)
            users_perm_updated = 0
            for u in all_users:
                user_role = u.get("role", "VISUALISEUR")
                current_perms = u.get("permissions", {})
                if not isinstance(current_perms, dict):
                    current_perms = {}
                default_perms = get_default_permissions_by_role(user_role).model_dump()
                needs_update = False
                valid_module_keys = set(default_perms.keys())
                keys_to_remove = [k for k in current_perms if k not in valid_module_keys]
                if keys_to_remove:
                    for k in keys_to_remove:
                        del current_perms[k]
                    needs_update = True
                for module_key, module_val in default_perms.items():
                    if module_key not in current_perms:
                        current_perms[module_key] = module_val
                        needs_update = True
                    elif not isinstance(current_perms[module_key], dict):
                        current_perms[module_key] = module_val
                        needs_update = True
                    else:
                        valid_keys = {"view", "edit", "delete"}
                        existing = current_perms[module_key]
                        has_extra = any(k not in valid_keys for k in existing.keys())
                        if has_extra:
                            current_perms[module_key] = {
                                "view": existing.get("view", module_val.get("view", False)),
                                "edit": existing.get("edit", module_val.get("edit", False)),
                                "delete": existing.get("delete", module_val.get("delete", False))
                            }
                            needs_update = True
                if needs_update:
                    await db.users.update_one({"_id": u["_id"]}, {"$set": {"permissions": current_perms}})
                    users_perm_updated += 1
            if users_perm_updated > 0:
                logger.info(f"✅ Permissions utilisateurs migrées pour {users_perm_updated} utilisateur(s)")
        except Exception as user_mig_err:
            import traceback
            logger.error(f"❌ Erreur migration permissions utilisateurs: {user_mig_err}\n{traceback.format_exc()}")
        
        # Migrer le manuel utilisateur (ajouter chapitres manquants)
        import json as json_lib
        manual_json_path = os.path.join(os.path.dirname(__file__), "manual_default_content.json")
        if os.path.exists(manual_json_path):
            with open(manual_json_path, "r", encoding="utf-8") as f:
                manual_data = json_lib.load(f)
            now_utc = datetime.now(timezone.utc)
            manual_ch_added = 0
            manual_sec_added = 0
            for chapter in manual_data.get("chapters", []):
                if "id" not in chapter:
                    continue
                existing = await db.manual_chapters.find_one({"id": chapter["id"]})
                if not existing:
                    chapter.setdefault("created_at", now_utc.isoformat())
                    chapter.setdefault("updated_at", now_utc.isoformat())
                    await db.manual_chapters.insert_one(chapter)
                    manual_ch_added += 1
                else:
                    json_sections = chapter.get("sections", [])
                    db_sections = existing.get("sections", [])
                    new_secs = [s for s in json_sections if s not in db_sections]
                    if new_secs:
                        await db.manual_chapters.update_one(
                            {"id": chapter["id"]},
                            {"$addToSet": {"sections": {"$each": new_secs}}}
                        )
                        manual_ch_added += 1
            for section in manual_data.get("sections", []):
                if "id" not in section:
                    continue
                existing = await db.manual_sections.find_one({"id": section["id"]})
                if not existing:
                    section.setdefault("created_at", now_utc.isoformat())
                    section.setdefault("updated_at", now_utc.isoformat())
                    await db.manual_sections.insert_one(section)
                    manual_sec_added += 1
            if manual_ch_added > 0 or manual_sec_added > 0:
                existing_version = await db.manual_versions.find_one({"is_current": True})
                if not existing_version:
                    await db.manual_versions.insert_one({
                        "id": f"init-{now_utc.strftime('%Y%m%d%H%M%S')}",
                        "version": "2.3",
                        "release_date": now_utc.isoformat(),
                        "changes": ["Initialisation complete du manuel utilisateur"],
                        "author_id": "system",
                        "author_name": "Initialisation systeme",
                        "is_current": True
                    })
                logger.info(f"✅ Manuel utilisateur: {manual_ch_added} chapitre(s) et {manual_sec_added} section(s) ajouté(s)")
        
        # Migrer les menus utilisateurs (ajouter menus manquants)
        complete_menu_ref = {
            "dashboard": {"label": "Tableau de bord", "path": "/dashboard", "icon": "LayoutDashboard", "module": "dashboard"},
            "service-dashboard": {"label": "Dashboard Service", "path": "/service-dashboard", "icon": "Presentation", "module": "serviceDashboard"},
            "chat-live": {"label": "Chat Live", "path": "/chat-live", "icon": "Mail", "module": "chatLive"},
            "intervention-requests": {"label": "Demandes d'inter.", "path": "/intervention-requests", "icon": "MessageSquare", "module": "interventionRequests"},
            "work-orders": {"label": "Ordres de travail", "path": "/work-orders", "icon": "ClipboardList", "module": "workOrders"},
            "improvement-requests": {"label": "Demandes d'amél.", "path": "/improvement-requests", "icon": "Lightbulb", "module": "improvementRequests"},
            "improvements": {"label": "Améliorations", "path": "/improvements", "icon": "Sparkles", "module": "improvements"},
            "preventive-maintenance": {"label": "Maintenance prev.", "path": "/preventive-maintenance", "icon": "Calendar", "module": "preventiveMaintenance"},
            "planning-mprev": {"label": "Planning M.Prev.", "path": "/planning-mprev", "icon": "Calendar", "module": "planningMprev"},
            "assets": {"label": "Équipements", "path": "/assets", "icon": "Wrench", "module": "assets"},
            "inventory": {"label": "Inventaire", "path": "/inventory", "icon": "Package", "module": "inventory"},
            "purchase-requests": {"label": "Demandes d'Achat", "path": "/purchase-requests", "icon": "ShoppingCart", "module": "purchaseRequests"},
            "locations": {"label": "Zones", "path": "/locations", "icon": "MapPin", "module": "locations"},
            "meters": {"label": "Compteurs", "path": "/meters", "icon": "Gauge", "module": "meters"},
            "surveillance-plan": {"label": "Plan de Surveillance", "path": "/surveillance-plan", "icon": "Eye", "module": "surveillance"},
            "surveillance-rapport": {"label": "Rapport Surveillance", "path": "/surveillance-rapport", "icon": "FileText", "module": "surveillanceRapport"},
            "weekly-reports": {"label": "Rapports Hebdo.", "path": "/weekly-reports", "icon": "FileText", "module": "weeklyReports"},
            "presqu-accident": {"label": "Presqu'accident", "path": "/presqu-accident", "icon": "AlertTriangle", "module": "presquaccident"},
            "presqu-accident-rapport": {"label": "Rapport P.accident", "path": "/presqu-accident-rapport", "icon": "FileText", "module": "presquaccidentRapport"},
            "documentations": {"label": "Documentations", "path": "/documentations", "icon": "FolderOpen", "module": "documentations"},
            "reports": {"label": "Rapports", "path": "/reports", "icon": "BarChart3", "module": "reports"},
            "team-management": {"label": "Gestion d'équipe", "path": "/team-management", "icon": "UserCog", "module": "timeTracking"},
            "cameras": {"label": "Caméras", "path": "/cameras", "icon": "Camera", "module": "cameras"},
            "mes": {"label": "M.E.S.", "path": "/mes", "icon": "Zap", "module": "mes"},
            "mes-reports": {"label": "Rapports M.E.S.", "path": "/mes-reports", "icon": "FileBarChart", "module": "mesReports"},
            "analytics-checklists": {"label": "Analytics Checklists", "path": "/analytics/checklists", "icon": "BarChart3", "module": "analyticsChecklists"},
            "people": {"label": "Utilisateurs", "path": "/people", "icon": "Users", "module": "people"},
            "planning": {"label": "Planning", "path": "/planning", "icon": "Calendar", "module": "planning"},
            "vendors": {"label": "Fournisseurs", "path": "/vendors", "icon": "ShoppingCart", "module": "vendors"},
            "contrats": {"label": "Contrats", "path": "/contrats", "icon": "FileSignature", "module": "contrats"},
            "purchase-history": {"label": "Historique Achat", "path": "/purchase-history", "icon": "ShoppingBag", "module": "purchaseHistory"},
            "import-export": {"label": "Import / Export", "path": "/import-export", "icon": "Database", "module": "importExport"},
            "sensors": {"label": "Capteurs MQTT", "path": "/sensors", "icon": "Activity", "module": "sensors"},
            "iot-dashboard": {"label": "Dashboard IoT", "path": "/iot-dashboard", "icon": "BarChart3", "module": "iotDashboard"},
            "mqtt-logs": {"label": "Logs MQTT", "path": "/mqtt-logs", "icon": "Terminal", "module": "mqttLogs"},
            "whiteboard": {"label": "Tableau d'affichage", "path": "/whiteboard", "icon": "Presentation", "module": "whiteboard"},
            "accident-analysis": {"label": "Arbre des Causes", "path": "/accident-analysis", "icon": "GitBranch", "module": "accidentAnalysis"},
        }
        user_prefs = await db.user_preferences.find({}).to_list(length=None)
        menus_migrated = 0
        for pref in user_prefs:
            menu_items = pref.get("menu_items", [])
            # Filtrer les entrées non-dict (corruption de données)
            menu_items = [item for item in menu_items if isinstance(item, dict)]
            existing_ids = {item.get("id") for item in menu_items}
            needs_update = False
            # Fix existing items that are missing required fields
            for item in menu_items:
                ref = complete_menu_ref.get(item.get("id"))
                if ref:
                    for field in ["label", "path", "icon", "module"]:
                        if field not in item or not item[field]:
                            item[field] = ref[field]
                            needs_update = True
            # Add missing menu items
            max_order = max((item.get("order", 0) for item in menu_items), default=0)
            for i, (mid, ref) in enumerate(complete_menu_ref.items()):
                if mid not in existing_ids:
                    menu_items.append({"id": mid, "label": ref["label"], "path": ref["path"], "icon": ref["icon"], "module": ref["module"], "visible": True, "favorite": False, "order": max_order + 1 + i, "category_id": None})
                    needs_update = True
            if needs_update:
                await db.user_preferences.update_one({"_id": pref["_id"]}, {"$set": {"menu_items": menu_items}})
                menus_migrated += 1
        if menus_migrated > 0:
            logger.info(f"✅ Menus migrés pour {menus_migrated} utilisateur(s)")
        
        # Migrer les permissions : ajouter accidentAnalysis aux utilisateurs existants
        perms_migrated = 0
        all_users = await db.users.find({"permissions": {"$exists": True}}).to_list(length=None)
        for u in all_users:
            perms = u.get("permissions", {})
            aa = perms.get("accidentAnalysis")
            if aa is None or (aa.get("view") == False and aa.get("edit") == False and aa.get("delete") == False):
                user_role = u.get("role", "VISUALISEUR")
                default_perms = get_default_permissions_by_role(user_role).model_dump()
                aa_perm = default_perms.get("accidentAnalysis", {"view": False, "edit": False, "delete": False})
                await db.users.update_one({"_id": u["_id"]}, {"$set": {"permissions.accidentAnalysis": aa_perm}})
                perms_migrated += 1
        if perms_migrated > 0:
            logger.info(f"✅ Permission accidentAnalysis migrée pour {perms_migrated} utilisateur(s)")
        
        # Initialiser le scheduler des rapports hebdomadaires
        from weekly_report_scheduler import init_report_scheduler, load_all_report_schedules
        init_report_scheduler(scheduler, db)
        scheduled_count = await load_all_report_schedules(db)
        logger.info(f"✅ Scheduler rapports initialisé ({scheduled_count} rapport(s) planifié(s))")
        
        # Initialiser le service d'alertes caméras
        from camera_alert_service import set_database as set_camera_alert_db, start_camera_alert_scheduler
        set_camera_alert_db(db)
        asyncio.create_task(start_camera_alert_scheduler(interval_seconds=60))
        logger.info("✅ Service d'alertes caméras démarré (vérification toutes les 60s)")
        
    except Exception as e:
        import traceback
        logger.error(f"❌ Erreur lors du démarrage du scheduler: {str(e)}\n{traceback.format_exc()}")

@app.on_event("shutdown")
async def shutdown_services():
    """Arrête les services lors de l'arrêt de l'application"""
    try:
        scheduler.shutdown()
        logger.info("✅ Scheduler arrêté")
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'arrêt du scheduler: {str(e)}")
    
