"""
Cron data-integrity
===================
Job quotidien qui scanne les incohérences et envoie un email d'alerte
si issues détectées.

Fréquence configurée dans server.py (02h30 UTC par défaut, hors des autres
crons lourds de 01h-02h).

L'envoi email suit la même logique que les autres alertes :
  - type d'alerte : "data_integrity"
  - destinataires : settings.health_alerts_config.recipients
  - cooldown : 24h (1 email max par jour) via health_alert_service
"""
import logging
from routes.data_integrity import _run_scan, _persist_last_scan
from routes.shared import db
from health_alert_service import send_health_alert

logger = logging.getLogger(__name__)


async def run_data_integrity_check_and_alert():
    """Job APScheduler : scan + persist + email si issues."""
    try:
        logger.info("[DataIntegrity] Scan quotidien démarré…")
        result = await _run_scan()
        await _persist_last_scan(result)
        total = result["total_issues"]
        logger.info(f"[DataIntegrity] Scan quotidien terminé : {total} issue(s).")

        if total == 0:
            return

        # Récupérer config alertes
        cfg_doc = await db.settings.find_one(
            {"key": "health_alerts_config"}, {"_id": 0, "value": 1}
        )
        cfg = (cfg_doc or {}).get("value", {}) or {}
        if not cfg.get("enabled", False):
            logger.info("[DataIntegrity] Alertes email désactivées — pas d'envoi.")
            return
        alert_conf = (cfg.get("alerts") or {}).get("data_integrity") or {}
        if alert_conf.get("enabled", True) is False:
            logger.info("[DataIntegrity] Type 'data_integrity' désactivé — pas d'envoi.")
            return
        recipients = cfg.get("recipients") or []
        if not recipients:
            logger.warning("[DataIntegrity] Aucun destinataire configuré — pas d'envoi.")
            return

        # Construire le récap HTML
        per_check_lines = []
        for c in result["checks"]:
            if c["issues_count"] > 0:
                per_check_lines.append(
                    f'<li><b>{c["label"]}</b> : {c["issues_count"]} incohérence(s)</li>'
                )
        details_html = (
            f"<p>Le scan quotidien a détecté <b>{total} incohérence(s)</b> "
            f"dans la base :</p><ul>{''.join(per_check_lines)}</ul>"
            f"<p>Ouvrez <b>Paramètres spéciaux → Cohérence des données</b> "
            f"pour les consulter et les réparer.</p>"
        )

        ok = send_health_alert(
            alert_type="data_integrity",
            recipients=recipients,
            extra_data={"details_html": details_html, "total_issues": total},
            cooldown_hours=24,
        )
        if ok:
            logger.info(f"[DataIntegrity] Email d'alerte envoyé à {len(recipients)} destinataire(s).")
        else:
            logger.info("[DataIntegrity] Email non envoyé (cooldown ou échec SMTP).")
    except Exception as e:
        logger.error(f"[DataIntegrity] Erreur cron scan : {e}", exc_info=True)
