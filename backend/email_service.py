"""
Service d'envoi d'emails pour FSAO Iris
Support SMTP externe avec authentification (Gmail, SendGrid, etc.)
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from email.mime.base import MIMEBase
from email import encoders
import os
from typing import Optional, List, Dict
import logging
from datetime import datetime
import base64
import pathlib

logger = logging.getLogger(__name__)

# Charger manuellement le fichier .env (compatible avec ou sans python-dotenv)
env_path = pathlib.Path(__file__).parent / '.env'
if env_path.exists():
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key not in os.environ:
                        os.environ[key] = value
    except Exception as e:
        logger.warning(f"Impossible de charger .env: {e}")

# Configuration depuis .env - COMPATIBLE avec les deux formats de noms de variables
# Format 1: SMTP_SERVER, SMTP_USERNAME, etc. (email_service.py original)
# Format 2: SMTP_HOST, SMTP_USER, etc. (setup-email.sh)
SMTP_SERVER = os.environ.get('SMTP_SERVER') or os.environ.get('SMTP_HOST', 'localhost')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '25'))
SMTP_USERNAME = os.environ.get('SMTP_USERNAME') or os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_SENDER_EMAIL = os.environ.get('SMTP_SENDER_EMAIL') or os.environ.get('SMTP_FROM', 'noreply@gmao-iris.com')
SMTP_FROM_NAME = os.environ.get('SMTP_FROM_NAME', 'FSAO Iris')
SMTP_USE_TLS = (os.environ.get('SMTP_USE_TLS') or os.environ.get('SMTP_TLS', 'false')).lower() == 'true'
APP_URL = os.environ.get('APP_URL', 'http://localhost')

# Log de la configuration au démarrage
logger.info(f"📧 Configuration SMTP : {SMTP_SERVER}:{SMTP_PORT}")
logger.info(f"📨 Sender: {SMTP_SENDER_EMAIL}")
logger.info(f"🔒 TLS: {SMTP_USE_TLS}")


def send_email(to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
    """
    Envoie un email via SMTP (local ou externe)
    
    Args:
        to_email: Email du destinataire
        subject: Sujet de l'email
        html_content: Contenu HTML de l'email
        text_content: Contenu texte alternatif (optionnel)
    
    Returns:
        bool: True si envoi réussi, False sinon
    """
    try:
        # Créer le message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{SMTP_FROM_NAME} <{SMTP_SENDER_EMAIL}>"
        msg['To'] = to_email
        
        # Ajouter version texte si fournie
        if text_content:
            part_text = MIMEText(text_content, 'plain', 'utf-8')
            msg.attach(part_text)
        
        # Ajouter version HTML
        part_html = MIMEText(html_content, 'html', 'utf-8')
        msg.attach(part_html)
        
        # Déterminer le mode de connexion
        is_local = SMTP_SERVER in ['localhost', '127.0.0.1']
        needs_auth = bool(SMTP_USERNAME and SMTP_PASSWORD)
        
        logger.info(f"📧 Envoi email via {SMTP_SERVER}:{SMTP_PORT} (Local: {is_local}, Auth: {needs_auth})")
        
        # Connexion SMTP
        if is_local:
            # Postfix local : connexion simple sans TLS ni authentification
            logger.info("📧 Mode local activé (pas d'authentification)")
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
            logger.info(f"📤 Envoi email à {to_email}...")
            server.send_message(msg)
            server.quit()
        elif SMTP_USE_TLS:
            # SMTP externe avec TLS (port 587)
            logger.info("🔐 Mode TLS activé")
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
            server.set_debuglevel(1)  # Active debug SMTP
            server.ehlo()
            logger.info("🔒 Démarrage STARTTLS...")
            server.starttls()
            server.ehlo()
            if needs_auth:
                logger.info(f"🔐 Authentification avec {SMTP_USERNAME}...")
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                logger.info("✅ Authentification réussie")
            logger.info(f"📤 Envoi email à {to_email}...")
            server.send_message(msg)
            server.quit()
        else:
            # SMTP externe avec SSL (port 465)
            logger.info("🔐 Mode SSL activé")
            server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=10)
            if needs_auth:
                logger.info(f"🔐 Authentification avec {SMTP_USERNAME}...")
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                logger.info("✅ Authentification réussie")
            logger.info(f"📤 Envoi email à {to_email}...")
            server.send_message(msg)
            server.quit()
        
        logger.info(f"✅ Email envoyé avec succès à {to_email}")
        return True
        
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"❌ Erreur d'authentification SMTP: {e}")
        return False
    except smtplib.SMTPException as e:
        logger.error(f"❌ Erreur SMTP lors de l'envoi à {to_email}: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Erreur inattendue lors de l'envoi à {to_email}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def send_email_with_attachment(
    to_email: str, 
    subject: str, 
    html_content: str, 
    attachment_data: bytes = None,
    attachment_filename: str = None,
    text_content: Optional[str] = None
) -> bool:
    """
    Envoie un email avec pièce jointe
    
    Args:
        to_email: Email du destinataire
        subject: Sujet de l'email
        html_content: Contenu HTML de l'email
        attachment_data: Données binaires de la pièce jointe
        attachment_filename: Nom du fichier joint
        text_content: Contenu texte alternatif (optionnel)
    
    Returns:
        bool: True si envoi réussi, False sinon
    """
    try:
        # Créer le message
        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        msg['From'] = f"{SMTP_FROM_NAME} <{SMTP_SENDER_EMAIL}>"
        msg['To'] = to_email
        
        # Alternative part pour texte et HTML
        msg_alternative = MIMEMultipart('alternative')
        msg.attach(msg_alternative)
        
        # Ajouter version texte si fournie
        if text_content:
            part_text = MIMEText(text_content, 'plain', 'utf-8')
            msg_alternative.attach(part_text)
        
        # Ajouter version HTML
        part_html = MIMEText(html_content, 'html', 'utf-8')
        msg_alternative.attach(part_html)
        
        # Ajouter la pièce jointe si fournie
        if attachment_data and attachment_filename:
            attachment = MIMEBase('application', 'octet-stream')
            attachment.set_payload(attachment_data)
            encoders.encode_base64(attachment)
            # Utiliser RFC 2231 pour les noms avec caractères spéciaux
            from email.utils import encode_rfc2231
            attachment.add_header(
                'Content-Disposition',
                'attachment',
                filename=attachment_filename
            )
            msg.attach(attachment)
        
        # Déterminer le mode de connexion
        is_local = SMTP_SERVER in ['localhost', '127.0.0.1']
        needs_auth = bool(SMTP_USERNAME and SMTP_PASSWORD)
        
        logger.info(f"📧 Envoi email avec PJ via {SMTP_SERVER}:{SMTP_PORT}")
        
        # Connexion SMTP
        if is_local:
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
            server.send_message(msg)
            server.quit()
        elif SMTP_USE_TLS:
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
            server.ehlo()
            server.starttls()
            server.ehlo()
            if needs_auth:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
            server.quit()
        else:
            server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=10)
            if needs_auth:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
            server.quit()
        
        logger.info(f"✅ Email avec PJ envoyé à {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email avec PJ: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False



def send_invitation_email(to_email: str, token: str, role: str) -> bool:
    """
    Envoie un email d'invitation à rejoindre FSAO Iris
    
    Args:
        to_email: Email du destinataire
        token: Token d'invitation JWT
        role: Rôle attribué (ADMIN, TECHNICIEN, VISUALISEUR)
    
    Returns:
        bool: True si envoi réussi
    """
    invitation_link = f"{APP_URL}/inscription?token={token}"
    
    role_labels = {
        "ADMIN": "Administrateur",
        "TECHNICIEN": "Technicien",
        "VISUALISEUR": "Visualiseur"
    }
    role_label = role_labels.get(role, role)
    
    subject = "Invitation à rejoindre FSAO Iris"
    
    # Version HTML
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background-color: #2563eb;
                color: white;
                padding: 20px;
                text-align: center;
                border-radius: 8px 8px 0 0;
            }}
            .content {{
                background-color: #f9fafb;
                padding: 30px;
                border-radius: 0 0 8px 8px;
            }}
            .button {{
                display: inline-block;
                padding: 12px 30px;
                background-color: #2563eb;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                margin: 20px 0;
            }}
            .footer {{
                margin-top: 20px;
                text-align: center;
                font-size: 12px;
                color: #666;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔧 FSAO Iris</h1>
            </div>
            <div class="content">
                <h2>Bonjour,</h2>
                <p>Vous avez été invité(e) à rejoindre <strong>FSAO Iris</strong> en tant que <strong>{role_label}</strong>.</p>
                
                <p>Pour compléter votre inscription, cliquez sur le bouton ci-dessous :</p>
                
                <div style="text-align: center;">
                    <a href="{invitation_link}" class="button">Compléter mon inscription</a>
                </div>
                
                <p style="font-size: 12px; color: #666;">
                    Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :<br>
                    <a href="{invitation_link}">{invitation_link}</a>
                </p>
                
                <p><strong>⚠️ Important :</strong> Ce lien expire dans 7 jours.</p>
                
                <p>Cordialement,<br>L'équipe FSAO Iris</p>
            </div>
            <div class="footer">
                <p>Ceci est un email automatique, merci de ne pas y répondre.</p>
                <p>© 2025 FSAO Iris - Tous droits réservés</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    # Version texte
    text_content = f"""
Bonjour,

Vous avez été invité(e) à rejoindre FSAO Iris en tant que {role_label}.

Pour compléter votre inscription, cliquez sur le lien ci-dessous :
{invitation_link}

Ce lien expire dans 7 jours.

Cordialement,
L'équipe FSAO Iris

---
Ceci est un email automatique, merci de ne pas y répondre.
© 2025 FSAO Iris - Tous droits réservés
    """
    
    return send_email(to_email, subject, html_content, text_content)


def send_password_reset_email(to_email: str, prenom: str, reset_url: str) -> bool:
    """
    Envoyer un email de réinitialisation de mot de passe
    
    Args:
        to_email: Email du destinataire
        prenom: Prénom de l'utilisateur
        reset_url: URL de réinitialisation avec token
    
    Returns:
        bool: True si envoi réussi, False sinon
    """
    subject = "Réinitialisation de votre mot de passe - FSAO Iris"
    
    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
        .content {{ background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }}
        .button {{ display: inline-block; padding: 15px 30px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }}
        .warning {{ background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }}
        .footer {{ text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Réinitialisation de mot de passe</h1>
        </div>
        <div class="content">
            <p>Bonjour {prenom},</p>
            
            <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte FSAO Iris.</p>
            
            <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
            
            <div style="text-align: center;">
                <a href="{reset_url}" class="button">Réinitialiser mon mot de passe</a>
            </div>
            
            <div class="warning">
                <strong>⚠️ Important :</strong>
                <ul style="margin: 10px 0;">
                    <li>Ce lien est valide pendant <strong>1 heure</strong></li>
                    <li>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email</li>
                    <li>Ne partagez jamais ce lien avec personne</li>
                </ul>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 20px;">
                Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :<br>
                <a href="{reset_url}" style="color: #4F46E5; word-break: break-all;">{reset_url}</a>
            </p>
            
            <p>Cordialement,<br>L'équipe FSAO Iris</p>
        </div>
        <div class="footer">
            <p>Ceci est un email automatique, merci de ne pas y répondre.</p>
            <p>© 2025 FSAO Iris - Tous droits réservés</p>
        </div>
    </div>
</body>
</html>
    """
    
    text_content = f"""
Bonjour {prenom},

Vous avez demandé la réinitialisation de votre mot de passe pour votre compte FSAO Iris.

Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :
{reset_url}

⚠️ Important :
- Ce lien est valide pendant 1 heure
- Si vous n'avez pas demandé cette réinitialisation, ignorez cet email
- Ne partagez jamais ce lien avec personne

Cordialement,
L'équipe FSAO Iris

---
Ceci est un email automatique, merci de ne pas y répondre.
© 2025 FSAO Iris - Tous droits réservés
    """
    
    return send_email(to_email, subject, html_content, text_content)


def send_account_created_email(to_email: str, temp_password: str, prenom: str) -> bool:
    """
    Envoie un email avec les identifiants temporaires
    
    Args:
        to_email: Email du destinataire
        temp_password: Mot de passe temporaire
        prenom: Prénom de l'utilisateur
    
    Returns:
        bool: True si envoi réussi
    """
    subject = "Votre compte FSAO Iris a été créé"
    
    # Version HTML
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .header {{
                background-color: #2563eb;
                color: white;
                padding: 20px;
                text-align: center;
                border-radius: 8px 8px 0 0;
            }}
            .content {{
                background-color: #f9fafb;
                padding: 30px;
                border-radius: 0 0 8px 8px;
            }}
            .credentials {{
                background-color: white;
                padding: 15px;
                border-left: 4px solid #2563eb;
                margin: 20px 0;
            }}
            .button {{
                display: inline-block;
                padding: 12px 30px;
                background-color: #2563eb;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                margin: 20px 0;
            }}
            .footer {{
                margin-top: 20px;
                text-align: center;
                font-size: 12px;
                color: #666;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔧 FSAO Iris</h1>
            </div>
            <div class="content">
                <h2>Bonjour {prenom},</h2>
                <p>Votre compte FSAO Iris a été créé avec succès !</p>
                
                <div class="credentials">
                    <p><strong>Vos identifiants de connexion :</strong></p>
                    <p>Email : <strong>{to_email}</strong></p>
                    <p>Mot de passe temporaire : <strong>{temp_password}</strong></p>
                </div>
                
                <p><strong>⚠️ Important :</strong> Vous devrez changer votre mot de passe lors de votre première connexion.</p>
                
                <div style="text-align: center;">
                    <a href="{APP_URL}" class="button">Se connecter</a>
                </div>
                
                <p>Cordialement,<br>L'équipe FSAO Iris</p>
            </div>
            <div class="footer">
                <p>Ceci est un email automatique, merci de ne pas y répondre.</p>
                <p>© 2025 FSAO Iris - Tous droits réservés</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    # Version texte
    text_content = f"""
Bonjour {prenom},

Votre compte FSAO Iris a été créé avec succès !

Vos identifiants de connexion :
Email : {to_email}
Mot de passe temporaire : {temp_password}

⚠️ Important : Vous devrez changer votre mot de passe lors de votre première connexion.

Connectez-vous sur : {APP_URL}

Cordialement,
L'équipe FSAO Iris

---
Ceci est un email automatique, merci de ne pas y répondre.
© 2025 FSAO Iris - Tous droits réservés
    """
    
    return send_email(to_email, subject, html_content, text_content)


def init_email_service():
    """
    Réinitialise le service email avec les nouvelles variables d'environnement
    Utilisé après une mise à jour de la configuration SMTP
    """
    global SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_SENDER_EMAIL, SMTP_FROM_NAME, SMTP_USE_TLS
    
    # Recharger les variables d'environnement
    SMTP_SERVER = os.environ.get('SMTP_HOST', os.environ.get('SMTP_SERVER', 'localhost'))
    SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
    SMTP_USERNAME = os.environ.get('SMTP_USER', os.environ.get('SMTP_USERNAME', ''))
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
    SMTP_SENDER_EMAIL = os.environ.get('SMTP_FROM_EMAIL', os.environ.get('SMTP_SENDER_EMAIL', 'noreply@gmao-iris.com'))
    SMTP_FROM_NAME = os.environ.get('SMTP_FROM_NAME', 'FSAO Iris')
    SMTP_USE_TLS = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
    
    logger.info(f"📧 Service email réinitialisé : {SMTP_SERVER}:{SMTP_PORT}")
    logger.info(f"👤 Username: {SMTP_USERNAME}")
    logger.info(f"🔐 Password: {'*' * len(SMTP_PASSWORD) if SMTP_PASSWORD else 'NOT SET'}")


def send_test_email(to_email: str) -> bool:
    """
    Envoie un email de test pour vérifier la configuration SMTP
    
    Args:
        to_email: Email du destinataire pour le test
    
    Returns:
        bool: True si envoi réussi, False sinon
    """
    subject = "🧪 Test de configuration SMTP - FSAO Iris"
    
    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
        }}
        .content {{
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 10px 10px;
        }}
        .success-box {{
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }}
        .info {{
            background: #fff;
            padding: 15px;
            border-left: 4px solid #667eea;
            margin: 20px 0;
        }}
        .footer {{
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #777;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Test SMTP Réussi !</h1>
    </div>
    <div class="content">
        <div class="success-box">
            <strong>✅ Félicitations !</strong><br>
            Si vous recevez cet email, cela signifie que votre configuration SMTP fonctionne correctement.
        </div>
        
        <div class="info">
            <h3>📧 Informations de test</h3>
            <p><strong>Destinataire :</strong> {to_email}</p>
            <p><strong>Date d'envoi :</strong> {datetime.now().strftime("%d/%m/%Y à %H:%M")}</p>
        </div>
        
        <p>Vous pouvez maintenant utiliser les fonctionnalités d'envoi d'email de FSAO Iris en toute confiance :</p>
        <ul>
            <li>Notifications de demandes d'intervention</li>
            <li>Alertes de maintenance préventive</li>
            <li>Rappels de tâches</li>
            <li>Réinitialisation de mots de passe</li>
        </ul>
    </div>
    <div class="footer">
        Ceci est un email de test automatique envoyé depuis FSAO Iris.<br>
        © 2025 FSAO Iris - Tous droits réservés
    </div>
</body>
</html>
    """
    
    text_content = f"""
🧪 Test SMTP - FSAO Iris

✅ Félicitations !
Si vous recevez cet email, cela signifie que votre configuration SMTP fonctionne correctement.

📧 Informations de test
Destinataire : {to_email}
Date d'envoi : {datetime.now().strftime("%d/%m/%Y à %H:%M")}

Vous pouvez maintenant utiliser les fonctionnalités d'envoi d'email de FSAO Iris.

---
Ceci est un email de test automatique envoyé depuis FSAO Iris.
© 2025 FSAO Iris - Tous droits réservés
    """
    
    return send_email(to_email, subject, html_content, text_content)





def send_critical_nc_alert_email(
    to_email: str,
    responsable_name: str,
    service_name: str,
    analysis_summary: str,
    critical_patterns: list,
    equipements_a_risque: list,
    work_orders_suggested: list,
    stats: dict
) -> bool:
    """
    Envoie un email d'alerte pour les non-conformités critiques détectées par l'IA.
    """
    subject = f"ALERTE NC Critique - {service_name} - FSAO Iris"

    patterns_html = ""
    for p in critical_patterns:
        patterns_html += f"""
        <tr>
            <td style="padding:10px;border-bottom:1px solid #eee;">{p.get('pattern','')}</td>
            <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">
                <span style="background:#dc2626;color:#fff;padding:3px 8px;border-radius:4px;font-size:12px;">{p.get('severity','')}</span>
            </td>
            <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">{p.get('occurrences',0)}</td>
            <td style="padding:10px;border-bottom:1px solid #eee;">{p.get('cause_probable','N/A')}</td>
        </tr>"""

    equipements_html = ""
    for eq in equipements_a_risque:
        urgence_color = "#dc2626" if eq.get("urgence") == "HAUTE" else "#f59e0b" if eq.get("urgence") == "MOYENNE" else "#22c55e"
        equipements_html += f"""
        <tr>
            <td style="padding:10px;border-bottom:1px solid #eee;">{eq.get('equipement','')}</td>
            <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">
                <span style="background:{urgence_color};color:#fff;padding:3px 8px;border-radius:4px;font-size:12px;">{eq.get('urgence','')}</span>
            </td>
            <td style="padding:10px;border-bottom:1px solid #eee;">{', '.join(eq.get('problemes_principaux',[]))}</td>
        </tr>"""

    wo_html = ""
    for wo in work_orders_suggested[:5]:
        wo_html += f"<li><strong>{wo.get('titre','')}</strong> - {wo.get('equipement','')} (Priorite: {wo.get('priorite','')})</li>"

    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 700px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #dc2626; color: white; padding: 25px; text-align: center; border-radius: 10px 10px 0 0; }}
        .content {{ background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }}
        .stats-grid {{ display: flex; gap: 15px; margin: 20px 0; }}
        .stat-box {{ background: #fff; padding: 15px; border-radius: 8px; flex: 1; text-align: center; border: 1px solid #e5e7eb; }}
        .stat-value {{ font-size: 24px; font-weight: bold; color: #1f2937; }}
        .stat-label {{ font-size: 12px; color: #6b7280; margin-top: 4px; }}
        table {{ width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; }}
        th {{ background: #374151; color: white; padding: 12px; text-align: left; font-size: 13px; }}
        .section-title {{ color: #1f2937; margin-top: 25px; margin-bottom: 10px; font-size: 16px; border-bottom: 2px solid #dc2626; padding-bottom: 5px; }}
        .footer {{ text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; }}
        .alert-box {{ background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin:0;">ALERTE Non-Conformites Critiques</h1>
            <p style="margin:5px 0 0;opacity:0.9;">Analyse IA - FSAO Iris</p>
        </div>
        <div class="content">
            <p>Bonjour <strong>{responsable_name}</strong>,</p>

            <div class="alert-box">
                <strong>L'analyse IA des checklists a detecte des non-conformites critiques concernant votre service ({service_name}).</strong>
                <p style="margin:8px 0 0;font-size:14px;">{analysis_summary}</p>
            </div>

            <div style="display:flex;gap:15px;margin:20px 0;">
                <div style="background:#fff;padding:15px;border-radius:8px;flex:1;text-align:center;border:1px solid #e5e7eb;">
                    <div style="font-size:24px;font-weight:bold;color:#1f2937;">{stats.get('total_executions',0)}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px;">Executions analysees</div>
                </div>
                <div style="background:#fff;padding:15px;border-radius:8px;flex:1;text-align:center;border:1px solid #e5e7eb;">
                    <div style="font-size:24px;font-weight:bold;color:#dc2626;">{stats.get('total_non_conformities',0)}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px;">Non-conformites</div>
                </div>
                <div style="background:#fff;padding:15px;border-radius:8px;flex:1;text-align:center;border:1px solid #e5e7eb;">
                    <div style="font-size:24px;font-weight:bold;color:#f59e0b;">{len(critical_patterns)}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px;">Patterns critiques</div>
                </div>
            </div>

            <h3 class="section-title">Patterns critiques detectes</h3>
            <table>
                <thead>
                    <tr>
                        <th>Pattern</th>
                        <th>Severite</th>
                        <th>Occurrences</th>
                        <th>Cause probable</th>
                    </tr>
                </thead>
                <tbody>{patterns_html}</tbody>
            </table>

            {"<h3 class='section-title'>Equipements a risque</h3><table><thead><tr><th>Equipement</th><th>Urgence</th><th>Problemes</th></tr></thead><tbody>" + equipements_html + "</tbody></table>" if equipements_html else ""}

            {"<h3 class='section-title'>Actions correctives suggerees par l'IA</h3><ul style='background:#fff;padding:20px 20px 20px 35px;border-radius:8px;border:1px solid #e5e7eb;'>" + wo_html + "</ul>" if wo_html else ""}

            <p style="margin-top:25px;">Connectez-vous a FSAO Iris pour consulter le rapport complet et creer les ordres de travail curatifs.</p>

            <div style="text-align:center;margin:25px 0;">
                <a href="{APP_URL}" style="display:inline-block;padding:12px 30px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">Voir le rapport complet</a>
            </div>

            <p>Cordialement,<br>FSAO Iris - Systeme d'Alertes Automatiques</p>
        </div>
        <div class="footer">
            <p>Ceci est un email automatique genere par l'analyse IA de FSAO Iris.</p>
            <p>&copy; 2025 FSAO Iris - Tous droits reserves</p>
        </div>
    </div>
</body>
</html>
    """

    text_content = f"""
ALERTE Non-Conformites Critiques - FSAO Iris

Bonjour {responsable_name},

L'analyse IA des checklists a detecte des non-conformites critiques concernant votre service ({service_name}).

{analysis_summary}

Statistiques:
- Executions analysees: {stats.get('total_executions',0)}
- Non-conformites: {stats.get('total_non_conformities',0)}
- Patterns critiques: {len(critical_patterns)}

Connectez-vous a FSAO Iris pour consulter le rapport complet.

Cordialement,
FSAO Iris
    """

    return send_email(to_email, subject, html_content, text_content)


def send_weekly_report_email(
    to_email: str,
    subject: str,
    html_content: str,
    pdf_path: str = None
) -> bool:
    """
    Envoie un rapport périodique (hebdomadaire/mensuel/annuel) avec PDF en pièce jointe
    
    Args:
        to_email: Email du destinataire
        subject: Sujet de l'email
        html_content: Contenu HTML du rapport
        pdf_path: Chemin vers le fichier PDF à joindre (optionnel)
    
    Returns:
        bool: True si envoi réussi, False sinon
    """
    try:
        attachment_data = None
        attachment_filename = None
        
        # Lire le PDF si fourni
        if pdf_path:
            import os
            if os.path.exists(pdf_path):
                with open(pdf_path, 'rb') as f:
                    attachment_data = f.read()
                attachment_filename = os.path.basename(pdf_path)
                logger.info(f"📎 PDF joint: {attachment_filename} ({len(attachment_data)} bytes)")
            else:
                logger.warning(f"⚠️ Fichier PDF non trouvé: {pdf_path}")
        
        # Utiliser la fonction existante d'envoi avec pièce jointe
        return send_email_with_attachment(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            attachment_data=attachment_data,
            attachment_filename=attachment_filename
        )
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi rapport hebdomadaire à {to_email}: {e}")
        return False

