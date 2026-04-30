"""
Service d'alertes email pour la sante du systeme FSAO Iris.
Envoie des alertes par email lors de pannes, recuperations, et depassements de seuils.
Frequence : 1 envoi max par type par jour (24h).
"""
import logging
import os
import json
from datetime import datetime, timezone, timedelta
from email_service import send_email

logger = logging.getLogger(__name__)

ALERT_HISTORY_FILE = os.environ.get(
    "HEALTH_ALERT_HISTORY",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "health_alert_history.json")
)

# Types d'alertes
ALERT_TYPES = {
    "app_down": {
        "label": "Application en panne",
        "subject": "[ALERTE] FSAO Iris - Application en panne",
        "severity": "critical",
    },
    "recovery_success": {
        "label": "Recuperation automatique",
        "subject": "[INFO] FSAO Iris - Recuperation automatique reussie",
        "severity": "info",
    },
    "recovery_failed": {
        "label": "Recuperation echouee",
        "subject": "[CRITIQUE] FSAO Iris - Recuperation echouee",
        "severity": "critical",
    },
    "disk_warning": {
        "label": "Disque plein",
        "subject": "[ALERTE] FSAO Iris - Espace disque critique",
        "severity": "warning",
    },
    "memory_warning": {
        "label": "Memoire critique",
        "subject": "[ALERTE] FSAO Iris - Memoire RAM critique",
        "severity": "warning",
    },
    "maintenance_changed": {
        "label": "Maintenance activee/desactivee",
        "subject": "[INFO] FSAO Iris - Mode maintenance modifie",
        "severity": "info",
    },
    "data_integrity": {
        "label": "Incoherences de donnees detectees",
        "subject": "[ALERTE] FSAO Iris - Incoherences detectees en base",
        "severity": "warning",
    },
}

LEVEL_NAMES = {1: "SOFT", 2: "ROLLBACK", 3: "MEDIUM", 4: "HARD"}


def _load_alert_history():
    """Charge l'historique des alertes envoyees."""
    try:
        if os.path.exists(ALERT_HISTORY_FILE):
            with open(ALERT_HISTORY_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_alert_history(history):
    """Sauvegarde l'historique des alertes."""
    try:
        with open(ALERT_HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        logger.error(f"Erreur sauvegarde historique alertes: {e}")


def _can_send_alert(alert_type, cooldown_hours=24):
    """Verifie si on peut envoyer une alerte (respect du cooldown)."""
    history = _load_alert_history()
    last_sent = history.get(alert_type)
    if not last_sent:
        return True
    try:
        last_dt = datetime.fromisoformat(last_sent)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        return (now - last_dt) > timedelta(hours=cooldown_hours)
    except Exception:
        return True


def _mark_alert_sent(alert_type):
    """Marque une alerte comme envoyee."""
    history = _load_alert_history()
    history[alert_type] = datetime.now(timezone.utc).isoformat()
    _save_alert_history(history)


def _build_html_email(title, severity, details_html, footer=""):
    """Construit un email HTML professionnel."""
    colors = {
        "critical": ("#DC2626", "#FEF2F2", "#991B1B"),
        "warning": ("#D97706", "#FFFBEB", "#92400E"),
        "info": ("#2563EB", "#EFF6FF", "#1E40AF"),
    }
    accent, bg, dark = colors.get(severity, colors["info"])

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc;">
<div style="max-width: 560px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
  <div style="background: {accent}; padding: 20px 24px;">
    <h1 style="color: white; margin: 0; font-size: 18px; font-weight: 600;">{title}</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 12px;">FSAO Iris - Alerte Systeme</p>
  </div>
  <div style="padding: 24px;">
    {details_html}
  </div>
  <div style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
    <p style="margin: 0; font-size: 11px; color: #94a3b8;">
      {footer}
      Cet email a ete envoye automatiquement par le systeme de surveillance FSAO Iris.<br>
      Frequence : 1 alerte max par type par 24h.
    </p>
  </div>
</div>
</body>
</html>"""


def send_health_alert(alert_type, recipients, extra_data=None, cooldown_hours=24):
    """
    Envoie une alerte email si le cooldown est respecte.
    
    Args:
        alert_type: Type d'alerte (cle de ALERT_TYPES)
        recipients: Liste d'emails destinataires
        extra_data: Donnees supplementaires pour le contenu
        cooldown_hours: Heures min entre 2 alertes du meme type
    
    Returns:
        bool: True si au moins un email a ete envoye
    """
    if not recipients:
        logger.info(f"[Alert] Pas de destinataire pour {alert_type}, skip")
        return False

    if not _can_send_alert(alert_type, cooldown_hours):
        logger.info(f"[Alert] Cooldown actif pour {alert_type}, skip")
        return False

    config = ALERT_TYPES.get(alert_type)
    if not config:
        logger.warning(f"[Alert] Type inconnu: {alert_type}")
        return False

    extra = extra_data or {}
    now_str = datetime.now().strftime("%d/%m/%Y a %H:%M")

    # Construire le contenu selon le type
    if alert_type == "app_down":
        failures = extra.get("failures", 1)
        details = extra.get("details", [])
        details_html = f"""
        <div style="background: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; color: #991B1B; font-weight: 600;">L'application ne repond plus</p>
          <p style="margin: 4px 0 0; color: #B91C1C; font-size: 13px;">Echecs consecutifs : {failures}</p>
        </div>
        <p style="font-size: 14px; color: #334155; margin: 0 0 8px;">Details du diagnostic :</p>
        <ul style="font-size: 13px; color: #475569;">
          {''.join(f'<li>{d}</li>' for d in details)}
        </ul>
        <p style="font-size: 13px; color: #64748b; margin-top: 12px;">Le systeme de recuperation automatique est en cours d'execution.</p>
        """

    elif alert_type == "recovery_success":
        level = extra.get("level", 1)
        level_name = LEVEL_NAMES.get(level, f"Niveau {level}")
        details_html = f"""
        <div style="background: #F0FDF4; border-left: 4px solid #22C55E; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; color: #166534; font-weight: 600;">Application retablie avec succes</p>
          <p style="margin: 4px 0 0; color: #15803D; font-size: 13px;">Niveau de recuperation : {level_name}</p>
        </div>
        <p style="font-size: 14px; color: #334155;">Le systeme s'est auto-repare. Aucune intervention manuelle requise.</p>
        """

    elif alert_type == "recovery_failed":
        level = extra.get("level", 4)
        failures = extra.get("failures", 4)
        level_name = LEVEL_NAMES.get(level, f"Niveau {level}")
        details_html = f"""
        <div style="background: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; color: #991B1B; font-weight: 600;">La recuperation automatique a echoue</p>
          <p style="margin: 4px 0 0; color: #B91C1C; font-size: 13px;">Niveau tente : {level_name} | Echecs : {failures}</p>
        </div>
        <p style="font-size: 14px; color: #DC2626; font-weight: 600;">Une intervention manuelle est requise.</p>
        <p style="font-size: 13px; color: #475569;">Connectez-vous en SSH au conteneur LXC pour diagnostiquer le probleme.</p>
        """

    elif alert_type == "disk_warning":
        used_pct = extra.get("used_pct", 0)
        free_gb = extra.get("free_gb", 0)
        details_html = f"""
        <div style="background: #FFFBEB; border-left: 4px solid #D97706; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; color: #92400E; font-weight: 600;">Espace disque critique</p>
          <p style="margin: 4px 0 0; color: #A16207; font-size: 13px;">{used_pct}% utilise — {free_gb} Go libre</p>
        </div>
        <p style="font-size: 13px; color: #475569;">Pensez a liberer de l'espace ou etendre le disque pour eviter un dysfonctionnement.</p>
        """

    elif alert_type == "memory_warning":
        used_pct = extra.get("used_pct", 0)
        details_html = f"""
        <div style="background: #FFFBEB; border-left: 4px solid #D97706; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; color: #92400E; font-weight: 600;">Memoire RAM critique</p>
          <p style="margin: 4px 0 0; color: #A16207; font-size: 13px;">{used_pct}% utilisee</p>
        </div>
        <p style="font-size: 13px; color: #475569;">La memoire est presque pleine. L'application pourrait devenir instable.</p>
        """

    elif alert_type == "maintenance_changed":
        active = extra.get("active", False)
        by_user = extra.get("by_user", "systeme")
        status_text = "ACTIVEE" if active else "DESACTIVEE"
        color = "#DC2626" if active else "#22C55E"
        details_html = f"""
        <div style="background: {'#FEF2F2' if active else '#F0FDF4'}; border-left: 4px solid {color}; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; color: {'#991B1B' if active else '#166534'}; font-weight: 600;">Mode maintenance {status_text}</p>
          <p style="margin: 4px 0 0; font-size: 13px; color: #475569;">Par : {by_user}</p>
        </div>
        """

    elif alert_type == "data_integrity":
        total = extra.get("total_issues", 0)
        custom_html = extra.get("details_html", "")
        details_html = f"""
        <div style="background: #FFFBEB; border-left: 4px solid #D97706; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; color: #92400E; font-weight: 600;">Incoherences detectees en base</p>
          <p style="margin: 4px 0 0; color: #A16207; font-size: 13px;">{total} element(s) a verifier</p>
        </div>
        {custom_html}
        """
    else:
        details_html = f"<p>{json.dumps(extra, indent=2)}</p>"

    subject = config["subject"]
    html = _build_html_email(subject, config["severity"], details_html, f"Date : {now_str}<br>")

    sent_count = 0
    for email in recipients:
        try:
            ok = send_email(email.strip(), subject, html)
            if ok:
                sent_count += 1
                logger.info(f"[Alert] Email {alert_type} envoye a {email}")
            else:
                logger.warning(f"[Alert] Echec envoi {alert_type} a {email}")
        except Exception as e:
            logger.error(f"[Alert] Erreur envoi {alert_type} a {email}: {e}")

    if sent_count > 0:
        _mark_alert_sent(alert_type)

    return sent_count > 0
