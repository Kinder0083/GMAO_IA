"""
Routes pour la configuration du fuseau horaire et serveur NTP.

Cette version est DST-aware : l'offset effectif est recalculé en temps réel
depuis le nom IANA du fuseau (ex: Europe/Paris), via la lib standard `zoneinfo`.
Plus aucune intervention manuelle au passage heure d'été/hiver.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
from typing import Optional
import ntplib
import socket
from models import TimezoneConfig, TimezoneConfigUpdate, NTPTestResult
from dependencies import get_current_admin_user
from timezone_helper import (
    resolve_iana_name,
    get_current_offset_hours,
    get_dst_info,
)

router = APIRouter(prefix="/timezone", tags=["Timezone"])

# Base de données - initialisée depuis server.py
db = None

def init_timezone_routes(database):
    """Initialiser les routes timezone avec la base de données"""
    global db
    db = database

# Liste des fuseaux horaires IANA populaires (groupés par grandes régions).
# `offset` reste fourni pour rétro-compat mais correspond à l'offset HIVERNAL standard.
# L'offset réel courant est calculé dynamiquement via timezone_helper.
POPULAR_TIMEZONES = [
    # Europe
    {"name": "Europe/London", "iana": "Europe/London", "cities": "Londres, Dublin, Lisbonne", "region": "Europe", "offset": 0},
    {"name": "Europe/Paris", "iana": "Europe/Paris", "cities": "Paris, Berlin, Madrid, Rome, Bruxelles", "region": "Europe", "offset": 1},
    {"name": "Europe/Athens", "iana": "Europe/Athens", "cities": "Athènes, Helsinki, Le Caire, Bucarest", "region": "Europe", "offset": 2},
    {"name": "Europe/Moscow", "iana": "Europe/Moscow", "cities": "Moscou, Istanbul, Ankara", "region": "Europe", "offset": 3},
    # Amériques
    {"name": "America/New_York", "iana": "America/New_York", "cities": "New York, Toronto, Montréal, Miami", "region": "Amériques", "offset": -5},
    {"name": "America/Chicago", "iana": "America/Chicago", "cities": "Chicago, Mexico, Houston", "region": "Amériques", "offset": -6},
    {"name": "America/Denver", "iana": "America/Denver", "cities": "Denver, Calgary", "region": "Amériques", "offset": -7},
    {"name": "America/Phoenix", "iana": "America/Phoenix", "cities": "Phoenix (sans DST)", "region": "Amériques", "offset": -7},
    {"name": "America/Los_Angeles", "iana": "America/Los_Angeles", "cities": "Los Angeles, Vancouver, Seattle", "region": "Amériques", "offset": -8},
    {"name": "America/Anchorage", "iana": "America/Anchorage", "cities": "Anchorage", "region": "Amériques", "offset": -9},
    {"name": "America/Halifax", "iana": "America/Halifax", "cities": "Halifax, Caracas", "region": "Amériques", "offset": -4},
    {"name": "America/Sao_Paulo", "iana": "America/Sao_Paulo", "cities": "São Paulo, Buenos Aires", "region": "Amériques", "offset": -3},
    # Afrique
    {"name": "Africa/Casablanca", "iana": "Africa/Casablanca", "cities": "Casablanca, Rabat", "region": "Afrique", "offset": 1},
    {"name": "Africa/Cairo", "iana": "Africa/Cairo", "cities": "Le Caire", "region": "Afrique", "offset": 2},
    {"name": "Africa/Johannesburg", "iana": "Africa/Johannesburg", "cities": "Johannesburg, Le Cap", "region": "Afrique", "offset": 2},
    {"name": "Africa/Nairobi", "iana": "Africa/Nairobi", "cities": "Nairobi, Addis-Abeba", "region": "Afrique", "offset": 3},
    # Asie
    {"name": "Asia/Dubai", "iana": "Asia/Dubai", "cities": "Dubaï, Abu Dhabi", "region": "Asie", "offset": 4},
    {"name": "Asia/Karachi", "iana": "Asia/Karachi", "cities": "Karachi, Tachkent", "region": "Asie", "offset": 5},
    {"name": "Asia/Kolkata", "iana": "Asia/Kolkata", "cities": "Mumbai, New Delhi, Calcutta", "region": "Asie", "offset": 5.5},
    {"name": "Asia/Bangkok", "iana": "Asia/Bangkok", "cities": "Bangkok, Hanoï, Jakarta", "region": "Asie", "offset": 7},
    {"name": "Asia/Shanghai", "iana": "Asia/Shanghai", "cities": "Pékin, Shanghai, Singapour", "region": "Asie", "offset": 8},
    {"name": "Asia/Hong_Kong", "iana": "Asia/Hong_Kong", "cities": "Hong Kong", "region": "Asie", "offset": 8},
    {"name": "Asia/Tokyo", "iana": "Asia/Tokyo", "cities": "Tokyo, Séoul, Osaka", "region": "Asie", "offset": 9},
    # Pacifique / Océanie
    {"name": "Australia/Adelaide", "iana": "Australia/Adelaide", "cities": "Adélaïde, Darwin", "region": "Pacifique", "offset": 9.5},
    {"name": "Australia/Sydney", "iana": "Australia/Sydney", "cities": "Sydney, Melbourne", "region": "Pacifique", "offset": 10},
    {"name": "Pacific/Noumea", "iana": "Pacific/Noumea", "cities": "Nouméa", "region": "Pacifique", "offset": 11},
    {"name": "Pacific/Auckland", "iana": "Pacific/Auckland", "cities": "Auckland, Wellington", "region": "Pacifique", "offset": 12},
    {"name": "Pacific/Honolulu", "iana": "Pacific/Honolulu", "cities": "Honolulu", "region": "Pacifique", "offset": -10},
]

# Liste des serveurs NTP populaires
POPULAR_NTP_SERVERS = [
    {"server": "pool.ntp.org", "description": "Pool NTP mondial (recommandé)"},
    {"server": "europe.pool.ntp.org", "description": "Pool NTP Europe"},
    {"server": "fr.pool.ntp.org", "description": "Pool NTP France"},
    {"server": "time.google.com", "description": "Google Time"},
    {"server": "time.cloudflare.com", "description": "Cloudflare Time"},
    {"server": "time.windows.com", "description": "Microsoft Time"},
    {"server": "time.apple.com", "description": "Apple Time"},
    {"server": "ntp.ubuntu.com", "description": "Ubuntu NTP"},
    {"server": "0.fr.pool.ntp.org", "description": "Pool NTP France #0"},
    {"server": "1.fr.pool.ntp.org", "description": "Pool NTP France #1"}
]


async def _get_settings_with_iana_name() -> dict:
    """Charge les settings et garantit la présence d'un timezone_name IANA valide.

    Migration automatique : si la BDD ne contient qu'un offset numérique sans nom IANA,
    on déduit le nom par défaut (ex: 1 → Europe/Paris) et on le persiste une fois.
    """
    settings = await db.system_settings.find_one({"_id": "default"}) or {}
    iana_name = resolve_iana_name(settings.get("timezone_name"), settings.get("timezone_offset"))

    # Persiste le nom si manquant ou invalide (one-shot migration)
    if settings.get("timezone_name") != iana_name:
        await db.system_settings.update_one(
            {"_id": "default"},
            {"$set": {"timezone_name": iana_name}},
            upsert=True,
        )
        settings["timezone_name"] = iana_name

    return settings


@router.get("/offset")
async def get_timezone_offset():
    """Récupérer l'offset effectif courant (DST inclus). Endpoint public pour les graphiques."""
    settings = await _get_settings_with_iana_name()
    iana = settings.get("timezone_name", "Europe/Paris")
    current_offset = get_current_offset_hours(iana)
    return {
        "timezone_offset": current_offset,
        "timezone_name": iana,
    }


@router.get("/config")
async def get_timezone_config(current_user: dict = Depends(get_current_admin_user)):
    """Récupérer la configuration du fuseau horaire (offset DST-aware)"""
    settings = await _get_settings_with_iana_name()
    iana = settings.get("timezone_name", "Europe/Paris")
    current_offset = get_current_offset_hours(iana)
    return TimezoneConfig(
        timezone_offset=current_offset,
        timezone_name=iana,
        ntp_server=settings.get("ntp_server", "pool.ntp.org"),
    )


@router.put("/config")
async def update_timezone_config(
    config: TimezoneConfigUpdate,
    current_user: dict = Depends(get_current_admin_user)
):
    """Mettre à jour la configuration du fuseau horaire.

    Source de vérité = `timezone_name` (IANA). L'offset n'est plus stocké comme valeur figée :
    s'il est fourni, on l'utilise uniquement pour déduire un nom IANA si `timezone_name`
    est absent (rétro-compat avec d'anciens clients).
    """
    update_data = {}

    iana_name = config.timezone_name
    if not iana_name and config.timezone_offset is not None:
        # Rétro-compat : un client ne fournit qu'un offset → on déduit un nom IANA
        iana_name = resolve_iana_name(None, config.timezone_offset)

    if iana_name is not None:
        # Validation du nom IANA via le helper (lève fallback Europe/Paris si invalide)
        validated = resolve_iana_name(iana_name, None)
        update_data["timezone_name"] = validated

    if config.ntp_server is not None:
        update_data["ntp_server"] = config.ntp_server

    if not update_data:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")

    settings = await db.system_settings.find_one({"_id": "default"})

    if settings:
        await db.system_settings.update_one(
            {"_id": "default"},
            {"$set": update_data}
        )
    else:
        default_settings = {
            "_id": "default",
            "inactivity_timeout_minutes": 15,
            "timezone_name": "Europe/Paris",
            "ntp_server": "pool.ntp.org",
        }
        default_settings.update(update_data)
        await db.system_settings.insert_one(default_settings)

    updated_settings = await db.system_settings.find_one({"_id": "default"})
    iana_final = updated_settings.get("timezone_name", "Europe/Paris")
    current_offset = get_current_offset_hours(iana_final)

    return {
        "success": True,
        "message": "Configuration du fuseau horaire mise à jour",
        "config": TimezoneConfig(
            timezone_offset=current_offset,
            timezone_name=iana_final,
            ntp_server=updated_settings.get("ntp_server", "pool.ntp.org"),
        ),
    }


@router.get("/timezones")
async def get_available_timezones():
    """Liste des fuseaux horaires IANA disponibles, enrichie de l'offset courant et infos DST.

    Le frontend peut ainsi afficher "GMT+2 actuellement (heure d'été)" sans calcul côté client.
    """
    enriched = []
    for tz in POPULAR_TIMEZONES:
        iana = tz["iana"]
        try:
            info = get_dst_info(iana)
            enriched.append({
                **tz,
                "current_offset": info["current_offset"],
                "standard_offset": info["standard_offset"],
                "is_dst": info["is_dst"],
            })
        except Exception:
            enriched.append({**tz, "current_offset": tz["offset"], "standard_offset": tz["offset"], "is_dst": False})
    return enriched


@router.get("/dst-info")
async def get_dst_info_endpoint(timezone_name: Optional[str] = None):
    """Retourne les infos DST courantes pour un fuseau IANA.

    Si `timezone_name` n'est pas fourni, on utilise la config sauvegardée.
    """
    if not timezone_name:
        settings = await _get_settings_with_iana_name()
        timezone_name = settings.get("timezone_name", "Europe/Paris")
    return get_dst_info(timezone_name)


@router.get("/ntp-servers")
async def get_ntp_servers():
    """Récupérer la liste des serveurs NTP populaires"""
    return POPULAR_NTP_SERVERS


@router.post("/test-ntp")
async def test_ntp_connection(
    server: str,
    current_user: dict = Depends(get_current_admin_user)
) -> NTPTestResult:
    """Tester la connexion à un serveur NTP"""
    if not server or not server.strip():
        raise HTTPException(status_code=400, detail="Adresse du serveur NTP requise")

    server = server.strip()

    try:
        ntp_client = ntplib.NTPClient()
        response = ntp_client.request(server, version=3, timeout=5)
        server_time = datetime.fromtimestamp(response.tx_time, tz=timezone.utc)
        local_time = datetime.now(timezone.utc)
        offset_ms = response.offset * 1000

        return NTPTestResult(
            success=True,
            server=server,
            server_time=server_time.isoformat(),
            local_time=local_time.isoformat(),
            offset_ms=round(offset_ms, 2),
            message=f"Connexion réussie. Décalage: {offset_ms:.2f}ms"
        )

    except ntplib.NTPException as e:
        return NTPTestResult(success=False, server=server, message=f"Erreur NTP: {str(e)}")
    except socket.timeout:
        return NTPTestResult(success=False, server=server, message=f"Timeout: Le serveur {server} ne répond pas (délai > 5s)")
    except socket.gaierror:
        return NTPTestResult(success=False, server=server, message=f"Erreur DNS: Impossible de résoudre {server}")
    except Exception as e:
        return NTPTestResult(success=False, server=server, message=f"Erreur: {str(e)}")


@router.get("/current-time")
async def get_current_server_time():
    """Heure courante du serveur dans le fuseau configuré (DST-aware)."""
    settings = await _get_settings_with_iana_name()
    iana = settings.get("timezone_name", "Europe/Paris")
    current_offset = get_current_offset_hours(iana)
    info = get_dst_info(iana)

    # Construit un tzinfo via offset courant pour la conversion d'affichage
    tz_display = timezone(timedelta(hours=current_offset))
    utc_now = datetime.now(timezone.utc)
    local_now = utc_now.astimezone(tz_display)

    return {
        "utc_time": utc_now.isoformat(),
        "local_time": local_now.isoformat(),
        "timezone_offset": current_offset,
        "timezone_name": iana,
        "is_dst": info.get("is_dst", False),
        "standard_offset": info.get("standard_offset", current_offset),
        "next_transition": info.get("next_transition"),
        "next_transition_offset": info.get("next_transition_offset"),
        "next_is_dst_after": info.get("next_is_dst_after"),
        "formatted_local": local_now.strftime("%d/%m/%Y %H:%M:%S"),
        "formatted_utc": utc_now.strftime("%d/%m/%Y %H:%M:%S"),
    }
