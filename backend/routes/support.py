"""
Routes de Support / Aide - Contacts
"""
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import logging

from models import ActionType, EntityType, MessageResponse
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Support"])


# Stockage en mémoire des demandes d'aide par utilisateur (anti-spam)
help_request_tracker = {}


class SimpleSupportRequest(BaseModel):
    """Modèle pour une demande d'aide simple depuis la page Paramètres"""
    subject: Optional[str] = "Demande d'assistance"
    message: str


@router.post("/support/request",
    summary="Soumettre une demande de support", response_model=SuccessResponse, tags=["Support"])
async def submit_support_request(
    request: SimpleSupportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Envoyer une demande d'aide simple aux administrateurs (depuis la page Paramètres)
    """
    try:
        user_id = current_user.get("id")
        user_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
        user_email = current_user.get('email', '')
        user_service = current_user.get('service', 'Non défini')
        user_role = current_user.get('role', 'N/A')
        
        # Anti-spam : Vérifier le nombre de demandes dans la dernière heure
        now = datetime.now(timezone.utc)
        one_hour_ago = now - timedelta(hours=1)
        
        if user_id in help_request_tracker:
            help_request_tracker[user_id] = [
                req_time for req_time in help_request_tracker[user_id] 
                if req_time > one_hour_ago
            ]
            if len(help_request_tracker[user_id]) >= 10:
                raise HTTPException(
                    status_code=429, 
                    detail="Limite de demandes atteinte. Veuillez réessayer dans 1 heure."
                )
        else:
            help_request_tracker[user_id] = []
        
        help_request_tracker[user_id].append(now)
        
        # Récupérer les emails des administrateurs
        admins = await db.users.find({"role": "ADMIN", "statut": "actif"}).to_list(100)
        admin_emails = [admin['email'] for admin in admins if admin.get('email')]
        
        if not admin_emails:
            raise HTTPException(
                status_code=500,
                detail="Aucun administrateur disponible pour recevoir la demande"
            )
        
        # Préparer les valeurs
        subject_display = request.subject or "Demande d'assistance"
        user_display = user_name or user_email
        date_display = now.strftime('%d/%m/%Y à %H:%M')
        
        # Créer l'email
        email_html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <!-- En-tête -->
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 22px;">Demande d'assistance</h1>
                </div>
                
                <!-- Corps -->
                <div style="background: white; padding: 25px; border: 1px solid #e0e0e0; border-top: none;">
                    <p style="margin: 0 0 20px 0;">Un utilisateur a envoyé une demande d'assistance via le Centre d'aide.</p>
                    
                    <!-- Informations utilisateur -->
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0; color: #1e40af; font-size: 14px;">Informations de l'utilisateur</h3>
                        <table style="width: 100%; font-size: 14px;">
                            <tr>
                                <td style="padding: 5px 0; color: #64748b; width: 100px;">Nom</td>
                                <td style="padding: 5px 0; font-weight: 500;">{user_display}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; color: #64748b;">Email</td>
                                <td style="padding: 5px 0;">{user_email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; color: #64748b;">Service</td>
                                <td style="padding: 5px 0;">{user_service}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; color: #64748b;">Rôle</td>
                                <td style="padding: 5px 0;">{user_role}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <!-- Sujet -->
                    <div style="margin-bottom: 15px;">
                        <h3 style="margin: 0 0 5px 0; color: #1e40af; font-size: 14px;">Sujet</h3>
                        <p style="margin: 0; padding: 10px; background: #eff6ff; border-radius: 5px; font-weight: 500;">
                            {subject_display}
                        </p>
                    </div>
                    
                    <!-- Message -->
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin: 0 0 5px 0; color: #1e40af; font-size: 14px;">Message</h3>
                        <div style="padding: 15px; background: #fefce8; border-left: 4px solid #eab308; border-radius: 0 5px 5px 0;">
                            <p style="margin: 0; white-space: pre-wrap;">{request.message}</p>
                        </div>
                    </div>
                    
                    <!-- Action -->
                    <div style="text-align: center; padding: 15px; background: #f0fdf4; border-radius: 8px;">
                        <p style="margin: 0 0 10px 0; color: #166534;">
                            Veuillez répondre directement à cet utilisateur par email.
                        </p>
                        <a href="mailto:{user_email}?subject=Re: {subject_display}" 
                           style="display: inline-block; padding: 10px 25px; background-color: #22c55e; 
                                  color: white; text-decoration: none; border-radius: 5px; font-weight: 500;">
                            Répondre à {user_display}
                        </a>
                    </div>
                </div>
                
                <!-- Pied de page -->
                <div style="background: #f5f5f5; padding: 15px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none;">
                    <p style="color: #aaa; font-size: 10px; margin: 0; text-align: center;">
                        Demande envoyée le {date_display} depuis FSAO Iris - Centre d'aide
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Envoyer l'email à tous les admins
        subject = f"[FSAO Support] {request.subject} - {user_name or user_email}"
        
        for admin_email in admin_emails:
            try:
                email_service.send_email(
                    to_email=admin_email,
                    subject=subject,
                    html_content=email_html
                )
            except Exception as e:
                logger.warning(f"Erreur envoi email support à {admin_email}: {e}")
        
        # Sauvegarder la demande en base de données
        support_request_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "user_service": user_service,
            "subject": request.subject,
            "message": request.message,
            "status": "pending",
            "created_at": now.isoformat(),
            "notified_admins": admin_emails
        }
        
        await db.support_requests.insert_one(support_request_data)
        
        logger.info(f"📬 Demande de support reçue de {user_email}: {request.subject}")
        
        return {
            "success": True,
            "message": "Votre demande a été envoyée aux administrateurs"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur envoi demande support: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/support/request-help", response_model=HelpRequestResponse, tags=["Support"])
async def request_help(
    help_request: HelpRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Envoyer une demande d'aide aux administrateurs
    Limitation : 15 demandes par heure par utilisateur
    """
    try:
        user_id = current_user.get("id")
        user_name = f"{current_user['prenom']} {current_user['nom']}"
        user_email = current_user['email']
        
        # Anti-spam : Vérifier le nombre de demandes dans la dernière heure
        now = datetime.now(timezone.utc)
        one_hour_ago = now - timedelta(hours=1)
        
        if user_id in help_request_tracker:
            # Nettoyer les anciennes requêtes
            help_request_tracker[user_id] = [
                req_time for req_time in help_request_tracker[user_id] 
                if req_time > one_hour_ago
            ]
            
            # Vérifier la limite
            if len(help_request_tracker[user_id]) >= 15:
                raise HTTPException(
                    status_code=429, 
                    detail="Limite de demandes d'aide atteinte. Veuillez réessayer dans 1 heure."
                )
        else:
            help_request_tracker[user_id] = []
        
        # Enregistrer cette demande
        help_request_tracker[user_id].append(now)
        
        # Générer un ID unique pour cette demande
        request_id = str(uuid.uuid4())
        
        # Récupérer tous les administrateurs
        admins = await db.users.find({"role": "ADMIN"}).to_list(100)
        admin_emails = [admin['email'] for admin in admins if admin.get('email')]
        
        if not admin_emails:
            raise HTTPException(
                status_code=500,
                detail="Aucun administrateur trouvé pour recevoir la demande"
            )
        
        # Préparer les données du screenshot (décoder base64 si nécessaire)
        screenshot_data = help_request.screenshot
        if screenshot_data.startswith('data:image'):
            # Extraire seulement les données base64
            screenshot_data = screenshot_data.split(',')[1]
        
        # Créer le contenu HTML de l'email
        email_html = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 800px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
                .content {{ background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }}
                .info-section {{ background-color: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #2563eb; }}
                .label {{ font-weight: bold; color: #1f2937; }}
                .value {{ color: #4b5563; margin-left: 10px; }}
                .message-box {{ background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 15px 0; }}
                .logs-box {{ background-color: #fee2e2; padding: 15px; border-left: 4px solid #dc2626; margin: 15px 0; font-family: monospace; font-size: 12px; }}
                .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
                img {{ max-width: 100%; height: auto; border: 2px solid #e5e7eb; border-radius: 8px; margin-top: 15px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🆘 Demande d'Aide - FSAO Iris</h1>
                    <p style="margin: 5px 0;">ID: {request_id}</p>
                </div>
                
                <div class="content">
                    <div class="info-section">
                        <p><span class="label">👤 Utilisateur:</span><span class="value">{user_name} ({user_email})</span></p>
                        <p><span class="label">📄 Page:</span><span class="value">{help_request.page_url}</span></p>
                        <p><span class="label">🌐 Navigateur:</span><span class="value">{help_request.browser_info}</span></p>
                        <p><span class="label">🕐 Date/Heure:</span><span class="value">{now.strftime('%d/%m/%Y %H:%M:%S')} UTC</span></p>
                    </div>
                    
                    {f'''
                    <div class="message-box">
                        <h3 style="margin-top: 0;">💬 Message de l'utilisateur:</h3>
                        <p>{help_request.user_message}</p>
                    </div>
                    ''' if help_request.user_message else ''}
                    
                    {f'''
                    <div class="logs-box">
                        <h3 style="margin-top: 0; color: #dc2626;">⚠️ Logs Console (Erreurs):</h3>
                        {"<br>".join(help_request.console_logs[:10])}
                    </div>
                    ''' if help_request.console_logs else ''}
                    
                    <h3>📸 Capture d'écran:</h3>
                    <p style="color: #6b7280;">Voir la pièce jointe : screenshot.png</p>
                </div>
                
                <div class="footer">
                    <p>Cette demande d'aide a été générée automatiquement par FSAO Iris</p>
                    <p>Pour répondre à l'utilisateur, envoyez un email à: {user_email}</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Envoyer l'email à tous les administrateurs avec la capture d'écran en pièce jointe
        try:
            subject = f"🆘 Demande d'Aide - {user_name} - {help_request.page_url}"
            
            # Décoder le screenshot base64 en bytes
            import base64
            screenshot_bytes = base64.b64decode(screenshot_data)
            screenshot_filename = f'screenshot_{request_id[:8]}.png'
            
            for admin_email in admin_emails:
                email_service.send_email_with_attachment(
                    to_email=admin_email,
                    subject=subject,
                    html_content=email_html,
                    attachment_data=screenshot_bytes,
                    attachment_filename=screenshot_filename
                )
            
            # Journaliser l'action
            await audit_service.log_action(
                user_id=user_id,
                user_name=user_name,
                user_email=user_email,
                action=ActionType.CREATE,
                entity_type=EntityType.SETTINGS,  # Utiliser SETTINGS comme type générique
                entity_id=request_id,
                entity_name="Demande d'aide",
                details=f"Demande d'aide envoyée depuis {help_request.page_url} à {len(admin_emails)} administrateur(s)"
            )
            
            logger.info(f"✅ Demande d'aide {request_id} envoyée à {len(admin_emails)} administrateur(s)")
            
            return HelpRequestResponse(
                success=True,
                message=f"Demande d'aide envoyée avec succès à {len(admin_emails)} administrateur(s)",
                request_id=request_id
            )
            
        except Exception as email_error:
            logger.error(f"❌ Erreur lors de l'envoi de l'email d'aide: {str(email_error)}")
            raise HTTPException(
                status_code=500,
                detail=f"Erreur lors de l'envoi de l'email: {str(email_error)}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur lors du traitement de la demande d'aide: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


