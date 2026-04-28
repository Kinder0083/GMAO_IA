"""
Helper centralisé pour la gestion DST-aware du fuseau horaire.

Utilise la base IANA via zoneinfo (lib standard Python 3.9+) afin de calculer
l'offset effectif en temps réel selon la date courante. Permet ainsi le
basculement automatique heure d'été ↔ heure d'hiver sans intervention humaine.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import logging

logger = logging.getLogger(__name__)

# Mapping inverse pour rétro-compatibilité : un offset hivernal → un nom IANA par défaut.
# Sert uniquement quand une vieille config ne contient que `timezone_offset` sans nom.
OFFSET_TO_DEFAULT_IANA = {
    -12: "Etc/GMT+12",
    -11: "Pacific/Pago_Pago",
    -10: "Pacific/Honolulu",
    -9: "America/Anchorage",
    -8: "America/Los_Angeles",
    -7: "America/Denver",
    -6: "America/Chicago",
    -5: "America/New_York",
    -4: "America/Halifax",
    -3: "America/Sao_Paulo",
    -2: "Atlantic/South_Georgia",
    -1: "Atlantic/Azores",
    0: "Europe/London",
    1: "Europe/Paris",
    2: "Europe/Athens",
    3: "Europe/Moscow",
    4: "Asia/Dubai",
    5: "Asia/Karachi",
    5.5: "Asia/Kolkata",
    6: "Asia/Dhaka",
    7: "Asia/Bangkok",
    8: "Asia/Shanghai",
    9: "Asia/Tokyo",
    9.5: "Australia/Adelaide",
    10: "Australia/Sydney",
    11: "Pacific/Noumea",
    12: "Pacific/Auckland",
    13: "Pacific/Tongatapu",
    14: "Pacific/Kiritimati",
}


def resolve_iana_name(timezone_name: Optional[str], timezone_offset: Optional[float]) -> str:
    """Retourne un nom IANA valide. Préfère le nom existant; à défaut, mappe l'offset.

    Sert à la migration automatique des configurations stockant seulement un offset.
    """
    if timezone_name:
        try:
            ZoneInfo(timezone_name)
            return timezone_name
        except ZoneInfoNotFoundError:
            logger.warning(f"[TZ] Nom IANA invalide '{timezone_name}', repli sur l'offset")
    # Repli : utiliser l'offset numérique
    off = timezone_offset if timezone_offset is not None else 1
    return OFFSET_TO_DEFAULT_IANA.get(off, "Europe/Paris")


def get_current_offset_hours(timezone_name: str, at: Optional[datetime] = None) -> float:
    """Offset effectif (en heures, DST inclus) pour le fuseau IANA à l'instant `at`.

    Si `at` est None, utilise l'instant courant. Retourne un float (peut valoir 5.5 pour
    l'Inde, etc.).
    """
    try:
        tz = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        logger.warning(f"[TZ] Nom IANA invalide '{timezone_name}', fallback Europe/Paris")
        tz = ZoneInfo("Europe/Paris")

    moment = at or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    local = moment.astimezone(tz)
    off = local.utcoffset() or timedelta(0)
    return round(off.total_seconds() / 3600, 2)


def get_dst_info(timezone_name: str) -> dict:
    """Retourne les infos DST courantes pour un fuseau IANA.

    {
      "is_dst": bool,
      "current_offset": float (heures),
      "standard_offset": float (heures, hors DST),
      "next_transition": ISO string | None,
      "next_transition_offset": float | None,
      "next_is_dst_after": bool | None,
    }
    """
    try:
        tz = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("Europe/Paris")
        timezone_name = "Europe/Paris"

    now_utc = datetime.now(timezone.utc)
    local = now_utc.astimezone(tz)

    current_offset = (local.utcoffset() or timedelta(0)).total_seconds() / 3600
    is_dst = bool(local.dst()) and (local.dst() or timedelta(0)).total_seconds() != 0

    # Calcul de l'offset standard (hivernal) : on cherche un instant en janvier
    jan = datetime(local.year, 1, 15, 12, 0, tzinfo=timezone.utc).astimezone(tz)
    jul = datetime(local.year, 7, 15, 12, 0, tzinfo=timezone.utc).astimezone(tz)
    jan_off = (jan.utcoffset() or timedelta(0)).total_seconds() / 3600
    jul_off = (jul.utcoffset() or timedelta(0)).total_seconds() / 3600
    # L'offset standard est généralement le plus petit des deux (pour l'hémisphère N
    # où DST = +1) ; en hémisphère S c'est l'inverse mais on prend la valeur sans DST.
    if (jan.dst() or timedelta(0)).total_seconds() == 0:
        standard_offset = jan_off
    else:
        standard_offset = jul_off

    # Recherche de la prochaine transition DST par scan binaire mensuel sur 1 an
    next_transition, next_offset, next_is_dst = _find_next_transition(tz, now_utc)

    return {
        "timezone_name": timezone_name,
        "is_dst": is_dst,
        "current_offset": round(current_offset, 2),
        "standard_offset": round(standard_offset, 2),
        "next_transition": next_transition.isoformat() if next_transition else None,
        "next_transition_offset": round(next_offset, 2) if next_offset is not None else None,
        "next_is_dst_after": next_is_dst,
    }


def _find_next_transition(tz: ZoneInfo, start_utc: datetime, max_days: int = 400) -> Tuple[Optional[datetime], Optional[float], Optional[bool]]:
    """Trouve la prochaine transition DST par recherche dichotomique.

    Stratégie : on échantillonne par tranche de 7 jours pour repérer un changement
    d'offset, puis on raffine par dichotomie à la minute près.
    """
    if start_utc.tzinfo is None:
        start_utc = start_utc.replace(tzinfo=timezone.utc)

    current_off = (start_utc.astimezone(tz).utcoffset() or timedelta(0)).total_seconds()

    # Scan grossier semaine par semaine
    coarse_step = timedelta(days=7)
    t = start_utc
    end_window = start_utc + timedelta(days=max_days)
    while t < end_window:
        t_next = t + coarse_step
        off_next = (t_next.astimezone(tz).utcoffset() or timedelta(0)).total_seconds()
        if off_next != current_off:
            # Transition entre t et t_next : raffinage dichotomique
            lo, hi = t, t_next
            while (hi - lo) > timedelta(minutes=1):
                mid = lo + (hi - lo) / 2
                off_mid = (mid.astimezone(tz).utcoffset() or timedelta(0)).total_seconds()
                if off_mid == current_off:
                    lo = mid
                else:
                    hi = mid
            new_off = (hi.astimezone(tz).utcoffset() or timedelta(0)).total_seconds()
            new_is_dst = bool((hi.astimezone(tz).dst() or timedelta(0)).total_seconds())
            return hi, new_off / 3600, new_is_dst
        t = t_next

    return None, None, None
