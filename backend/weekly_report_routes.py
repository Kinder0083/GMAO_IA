"""
Routes API pour la gestion des rapports hebdomadaires/mensuels/annuels
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from datetime import datetime, timezone
from bson import ObjectId
import uuid
import logging
import os

from models import (
    WeeklyReportTemplate, WeeklyReportTemplateCreate, WeeklyReportTemplateUpdate,
    WeeklyReportHistory, WeeklyReportHistoryCreate,
    WeeklyReportSettings, WeeklyReportSettingsUpdate,
    ReportFrequency, ReportSendStatus,
    MessageResponse
)
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weekly-reports", tags=["Weekly Reports"])

# Variable globale pour la base de données (initialisée depuis server.py)
db = None

def set_database(database):
    """Initialise la connexion à la base de données"""
    global db
    db = database


def serialize_doc(doc):
    """Convert MongoDB document to JSON serializable format"""
    if doc is None:
        return None
    if "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc


async def check_report_access(current_user: dict, service: str = None, template_id: str = None):
    """
    Vérifie si l'utilisateur a accès aux rapports.
    - Admin: accès complet
    - Responsable de service: accès uniquement à son service
    """
    user_role = current_user.get("role")
    user_id = current_user.get("id")
    
    # Admin a accès à tout
    if user_role == "ADMIN":
        return True
    
    # Vérifier si l'utilisateur est responsable de service
    responsable = await db.service_responsables.find_one({"user_id": user_id})
    if not responsable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous devez être administrateur ou responsable de service pour accéder aux rapports"
        )
    
    user_service = responsable.get("service")
    
    # Si on vérifie un template spécifique
    if template_id:
        # Les rapports IA sont accessibles à tous les utilisateurs authentifiés ayant accès aux rapports
        if template_id == "ai_generated":
            return user_service
        template = await db.weekly_report_templates.find_one({"id": template_id})
        if not template:
            raise HTTPException(status_code=404, detail="Modèle de rapport non trouvé")
        
        if template.get("service") != user_service:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous ne pouvez accéder qu'aux rapports de votre service"
            )
    
    # Si on vérifie un service spécifique
    if service and service != user_service:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous ne pouvez créer/modifier que les rapports de votre service"
        )
    
    return user_service


async def get_user_accessible_services(current_user: dict) -> List[str]:
    """Retourne la liste des services accessibles par l'utilisateur"""
    user_role = current_user.get("role")
    user_id = current_user.get("id")
    
    if user_role == "ADMIN":
        # Admin peut voir tous les services
        services = await db.users.distinct("service", {"service": {"$ne": None, "$ne": ""}})
        return services
    
    # Responsable de service ne voit que son service
    responsable = await db.service_responsables.find_one({"user_id": user_id})
    if responsable:
        return [responsable.get("service")]
    
    return []


# ==================== TEMPLATES CRUD ====================

@router.get("/templates", response_model=List[WeeklyReportTemplate])
async def get_templates(
    service: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Liste tous les modèles de rapports accessibles par l'utilisateur"""
    accessible_services = await get_user_accessible_services(current_user)
    
    if not accessible_services:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas accès aux rapports"
        )
    
    # Construire le filtre
    query = {"service": {"$in": accessible_services}}
    if service and service in accessible_services:
        query = {"service": service}
    
    templates = await db.weekly_report_templates.find(query).sort("created_at", -1).to_list(100)
    
    return [WeeklyReportTemplate(**serialize_doc(t)) for t in templates]


@router.post("/templates", response_model=WeeklyReportTemplate)
async def create_template(
    template_create: WeeklyReportTemplateCreate,
    current_user: dict = Depends(get_current_user)
):
    """Créer un nouveau modèle de rapport"""
    # Vérifier l'accès
    await check_report_access(current_user, service=template_create.service)
    
    # Créer le template
    template_dict = template_create.model_dump()
    template_dict["id"] = str(uuid.uuid4())
    template_dict["created_by"] = current_user.get("id")
    template_dict["created_by_name"] = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
    template_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    template_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    template_dict["last_sent_at"] = None
    template_dict["send_count"] = 0
    
    await db.weekly_report_templates.insert_one(template_dict)
    
    logger.info(f"📊 Nouveau modèle de rapport créé: {template_dict['name']} par {template_dict['created_by_name']}")
    
    return WeeklyReportTemplate(**serialize_doc(template_dict))


@router.get("/templates/{template_id}", response_model=WeeklyReportTemplate)
async def get_template(
    template_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer un modèle de rapport par son ID"""
    await check_report_access(current_user, template_id=template_id)
    
    template = await db.weekly_report_templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Modèle de rapport non trouvé")
    
    return WeeklyReportTemplate(**serialize_doc(template))


@router.put("/templates/{template_id}", response_model=WeeklyReportTemplate)
async def update_template(
    template_id: str,
    template_update: WeeklyReportTemplateUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Modifier un modèle de rapport"""
    await check_report_access(current_user, template_id=template_id)
    
    # Si on change le service, vérifier l'accès au nouveau service
    if template_update.service:
        await check_report_access(current_user, service=template_update.service)
    
    # Préparer les données de mise à jour
    update_data = {k: v for k, v in template_update.model_dump().items() if v is not None}
    
    # Convertir les sous-modèles Pydantic en dict
    for key in ['schedule', 'recipients', 'sections']:
        if key in update_data and hasattr(update_data[key], 'model_dump'):
            update_data[key] = update_data[key].model_dump()
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.weekly_report_templates.update_one(
        {"id": template_id},
        {"$set": update_data}
    )
    
    template = await db.weekly_report_templates.find_one({"id": template_id})
    
    logger.info(f"📊 Modèle de rapport modifié: {template['name']}")
    
    return WeeklyReportTemplate(**serialize_doc(template))


@router.delete("/templates/{template_id}", response_model=MessageResponse)
async def delete_template(
    template_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Supprimer un modèle de rapport"""
    await check_report_access(current_user, template_id=template_id)
    
    template = await db.weekly_report_templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Modèle de rapport non trouvé")
    
    await db.weekly_report_templates.delete_one({"id": template_id})
    
    logger.info(f"📊 Modèle de rapport supprimé: {template['name']}")
    
    return {"message": "Modèle supprimé avec succès"}


@router.post("/templates/{template_id}/duplicate", response_model=WeeklyReportTemplate)
async def duplicate_template(
    template_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Dupliquer un modèle de rapport"""
    await check_report_access(current_user, template_id=template_id)
    
    original = await db.weekly_report_templates.find_one({"id": template_id})
    if not original:
        raise HTTPException(status_code=404, detail="Modèle de rapport non trouvé")
    
    # Créer la copie
    new_template = dict(original)
    del new_template["_id"]
    new_template["id"] = str(uuid.uuid4())
    new_template["name"] = f"{original['name']} (copie)"
    new_template["created_by"] = current_user.get("id")
    new_template["created_by_name"] = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
    new_template["created_at"] = datetime.now(timezone.utc).isoformat()
    new_template["updated_at"] = datetime.now(timezone.utc).isoformat()
    new_template["last_sent_at"] = None
    new_template["send_count"] = 0
    
    await db.weekly_report_templates.insert_one(new_template)
    
    logger.info(f"📊 Modèle de rapport dupliqué: {new_template['name']}")
    
    return WeeklyReportTemplate(**serialize_doc(new_template))


@router.post("/templates/{template_id}/test")
async def test_template(
    template_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Envoyer un rapport de test basé sur un modèle"""
    await check_report_access(current_user, template_id=template_id)
    
    template = await db.weekly_report_templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Modèle de rapport non trouvé")
    
    # Importer le service de génération
    from weekly_report_service import generate_and_send_report
    
    try:
        result = await generate_and_send_report(
            template=template,
            db=db,
            is_test=True,
            test_recipient=current_user.get("email")
        )
        
        return {
            "success": True,
            "message": f"Rapport de test envoyé à {current_user.get('email')}",
            "details": result
        }
    except Exception as e:
        logger.error(f"Erreur lors de l'envoi du rapport de test: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'envoi du rapport: {str(e)}"
        )


# ==================== HISTORY ====================

@router.get("/history", response_model=List[WeeklyReportHistory])
async def get_history(
    template_id: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer l'historique des envois de rapports"""
    accessible_services = await get_user_accessible_services(current_user)
    
    if not accessible_services:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas accès à l'historique des rapports"
        )
    
    # Récupérer les IDs des templates accessibles
    accessible_templates = await db.weekly_report_templates.find(
        {"service": {"$in": accessible_services}},
        {"id": 1}
    ).to_list(1000)
    
    accessible_template_ids = [t["id"] for t in accessible_templates]
    # Inclure les rapports generés par IA (sans template associé)
    accessible_template_ids.append("ai_generated")
    
    # Construire le filtre
    query = {"template_id": {"$in": accessible_template_ids}}
    if template_id:
        if template_id in accessible_template_ids:
            query = {"template_id": template_id}
        else:
            raise HTTPException(status_code=403, detail="Accès non autorisé à ce rapport")
    
    history = await db.weekly_report_history.find(query, {"_id": 0}).sort("sent_at", -1).limit(limit).to_list(limit)
    
    return [WeeklyReportHistory(**h) for h in history]


@router.get("/history/{history_id}/pdf")
async def download_history_pdf(
    history_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Télécharger le PDF d'un rapport archivé. Génère le PDF à la volée si nécessaire."""
    from fastapi.responses import FileResponse
    import os
    
    # Récupérer l'entrée d'historique
    history = await db.weekly_report_history.find_one({"id": history_id}, {"_id": 0})
    if not history:
        raise HTTPException(status_code=404, detail="Rapport non trouvé dans l'historique")
    
    # Vérifier l'accès via le template
    await check_report_access(current_user, template_id=history.get("template_id"))
    
    pdf_path = history.get("pdf_path")
    
    # Si pas de PDF existant, le générer à la volée (rapports IA)
    if not pdf_path or not os.path.exists(pdf_path):
        report_content = history.get("report_content")
        if report_content:
            from weekly_report_service import generate_pdf_report, PDF_STORAGE_DIR
            html = _generate_html_from_ai_content(report_content, history)
            pdf_path = generate_pdf_report(
                {"template_name": history.get("template_name", "Rapport IA"),
                 "service": "",
                 "period": {"start": history.get("period_start", "")[:10], "end": history.get("period_end", "")[:10]}},
                html
            )
            if pdf_path:
                await db.weekly_report_history.update_one(
                    {"id": history_id},
                    {"$set": {"pdf_path": pdf_path}}
                )
        
        if not pdf_path or not os.path.exists(pdf_path):
            raise HTTPException(status_code=404, detail="Impossible de générer le PDF")
    
    return FileResponse(
        path=pdf_path,
        filename=f"rapport_{history.get('template_name', 'export')}_{history.get('sent_at', 'date')[:10]}.pdf",
        media_type="application/pdf"
    )


@router.get("/history/{history_id}/content")
async def get_history_content(
    history_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer le contenu d'un rapport de l'historique pour visualisation"""
    history = await db.weekly_report_history.find_one({"id": history_id}, {"_id": 0})
    if not history:
        raise HTTPException(status_code=404, detail="Rapport non trouvé dans l'historique")
    
    await check_report_access(current_user, template_id=history.get("template_id"))
    
    result = {
        "id": history.get("id"),
        "template_name": history.get("template_name"),
        "period_start": history.get("period_start"),
        "period_end": history.get("period_end"),
        "status": history.get("status"),
        "sent_at": history.get("sent_at"),
        "recipients": history.get("recipients", []),
        "email_count": history.get("email_count", 0),
        "report_content": history.get("report_content"),
        "has_pdf": bool(history.get("pdf_path"))
    }
    
    return result


@router.post("/history/{history_id}/send-email")
async def send_history_report_email(
    history_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Envoyer un rapport de l'historique par email"""
    history = await db.weekly_report_history.find_one({"id": history_id}, {"_id": 0})
    if not history:
        raise HTTPException(status_code=404, detail="Rapport non trouvé dans l'historique")
    
    await check_report_access(current_user, template_id=history.get("template_id"))
    
    recipients = data.get("recipients", [])
    if not recipients:
        raise HTTPException(status_code=400, detail="Aucun destinataire spécifié")
    
    # Générer le HTML du rapport
    report_content = history.get("report_content")
    if report_content:
        html_content = _generate_html_from_ai_content(report_content, history)
    else:
        html_content = f"<h1>{history.get('template_name', 'Rapport')}</h1><p>Rapport généré le {history.get('sent_at', '')[:10]}</p>"
    
    # Générer/récupérer le PDF
    pdf_path = history.get("pdf_path")
    if not pdf_path or not os.path.exists(pdf_path):
        from weekly_report_service import generate_pdf_report
        pdf_path = generate_pdf_report(
            {"template_name": history.get("template_name", "Rapport"),
             "service": "",
             "period": {"start": history.get("period_start", "")[:10], "end": history.get("period_end", "")[:10]}},
            html_content
        )
    
    # Envoyer
    from weekly_report_service import send_report_email
    period_start = history.get("period_start", "")[:10]
    period_end = history.get("period_end", "")[:10]
    subject = f"📊 {history.get('template_name', 'Rapport')} - {period_start} au {period_end}"
    
    send_result = await send_report_email(recipients, subject, html_content, pdf_path)
    
    # Mettre à jour l'historique
    await db.weekly_report_history.update_one(
        {"id": history_id},
        {"$set": {
            "pdf_path": pdf_path,
            "recipients": list(set(history.get("recipients", []) + recipients)),
            "email_count": history.get("email_count", 0) + send_result.get("sent_count", 0)
        }}
    )
    
    return {
        "success": send_result.get("sent_count", 0) > 0,
        "sent_count": send_result.get("sent_count", 0),
        "errors": send_result.get("errors", [])
    }


@router.get("/history/{history_id}/html")
async def get_history_html(
    history_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer le HTML d'un rapport pour impression"""
    history = await db.weekly_report_history.find_one({"id": history_id}, {"_id": 0})
    if not history:
        raise HTTPException(status_code=404, detail="Rapport non trouvé dans l'historique")
    
    await check_report_access(current_user, template_id=history.get("template_id"))
    
    report_content = history.get("report_content")
    if report_content:
        html = _generate_html_from_ai_content(report_content, history)
    else:
        html = f"<html><body><h1>{history.get('template_name', 'Rapport')}</h1></body></html>"
    
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)


def _generate_html_from_ai_content(report_content: dict, history: dict) -> str:
    """Génère le HTML à partir du contenu IA pour visualisation/impression/email"""
    r = report_content
    period_start = history.get("period_start", "")[:10] if history.get("period_start") else ""
    period_end = history.get("period_end", "")[:10] if history.get("period_end") else ""
    
    sections_html = ""
    for section in r.get("sections", []):
        indicators_html = ""
        if section.get("indicateurs"):
            indicators_html = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">'
            for ind in section["indicateurs"]:
                trend_color = "#16a34a" if ind.get("tendance") == "hausse" else "#dc2626" if ind.get("tendance") == "baisse" else "#64748b"
                trend_arrow = "↑" if ind.get("tendance") == "hausse" else "↓" if ind.get("tendance") == "baisse" else "→"
                indicators_html += f'<span style="background:#f8fafc;border:1px solid #e2e8f0;padding:4px 10px;border-radius:16px;font-size:13px;">{ind.get("nom","")}: <strong>{ind.get("valeur","")}</strong> <span style="color:{trend_color}">{trend_arrow}</span></span>'
            indicators_html += "</div>"
        
        sections_html += f"""
        <div style="margin-bottom:24px;padding-left:16px;border-left:3px solid #7c3aed;">
            <h3 style="color:#1e293b;font-size:16px;margin:0 0 8px 0;">{section.get("titre","")}</h3>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">{section.get("contenu","")}</p>
            {indicators_html}
        </div>"""
    
    attention_html = ""
    if r.get("points_attention"):
        items = "".join(f"<li style='margin-bottom:4px;'>{p}</li>" for p in r["points_attention"])
        attention_html = f"""
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px;">
            <h3 style="color:#92400e;font-size:14px;margin:0 0 8px 0;">⚠ Points d'attention</h3>
            <ul style="margin:0;padding-left:20px;color:#78350f;font-size:14px;">{items}</ul>
        </div>"""
    
    actions_html = ""
    if r.get("actions_prioritaires"):
        items = "".join(f"<li style='margin-bottom:4px;'>{a}</li>" for a in r["actions_prioritaires"])
        actions_html = f"""
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:24px;">
            <h3 style="color:#1e40af;font-size:14px;margin:0 0 8px 0;">🎯 Actions prioritaires</h3>
            <ul style="margin:0;padding-left:20px;color:#1e3a5f;font-size:14px;">{items}</ul>
        </div>"""
    
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>@media print {{ body {{ margin: 0; }} }}</style></head>
<body style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#1e293b;max-width:800px;margin:0 auto;padding:20px;background:#fff;">
    <div style="background:linear-gradient(135deg,#1e40af 0%,#7c3aed 100%);color:white;padding:30px;border-radius:12px;margin-bottom:30px;">
        <h1 style="margin:0 0 8px 0;font-size:24px;">{r.get("titre", history.get("template_name", "Rapport"))}</h1>
        <p style="margin:0;opacity:0.9;font-size:14px;">Période : {period_start} → {period_end}</p>
    </div>
    {f'<div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:24px;"><p style="font-size:14px;color:#475569;margin:0;line-height:1.6;">{r.get("resume_executif","")}</p></div>' if r.get("resume_executif") else ""}
    {sections_html}
    {attention_html}
    {actions_html}
    <div style="margin-top:40px;padding:16px;background:#f1f5f9;border-radius:8px;text-align:center;color:#64748b;font-size:12px;">
        <p style="margin:0;">Rapport généré par FSAO Iris</p>
    </div>
</body></html>"""


# ==================== SETTINGS ====================

@router.get("/settings", response_model=WeeklyReportSettings)
async def get_settings(current_user: dict = Depends(get_current_user)):
    """Récupérer les paramètres globaux des rapports"""
    # Seuls les admins peuvent voir les paramètres globaux
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    settings = await db.weekly_report_settings.find_one({})
    
    if not settings:
        # Créer les paramètres par défaut
        default_settings = WeeklyReportSettings().model_dump()
        await db.weekly_report_settings.insert_one(default_settings)
        return WeeklyReportSettings(**default_settings)
    
    return WeeklyReportSettings(**serialize_doc(settings))


@router.put("/settings", response_model=WeeklyReportSettings)
async def update_settings(
    settings_update: WeeklyReportSettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Modifier les paramètres globaux des rapports"""
    # Seuls les admins peuvent modifier les paramètres
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    update_data = {k: v for k, v in settings_update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    settings = await db.weekly_report_settings.find_one({})
    
    if not settings:
        # Créer avec les valeurs par défaut + mises à jour
        new_settings = WeeklyReportSettings(**update_data).model_dump()
        await db.weekly_report_settings.insert_one(new_settings)
        return WeeklyReportSettings(**new_settings)
    
    await db.weekly_report_settings.update_one({}, {"$set": update_data})
    
    updated_settings = await db.weekly_report_settings.find_one({})
    
    logger.info(f"📊 Paramètres des rapports modifiés par {current_user.get('email')}")
    
    return WeeklyReportSettings(**serialize_doc(updated_settings))


# ==================== UTILS ====================

@router.get("/services")
async def get_available_services(current_user: dict = Depends(get_current_user)):
    """Récupérer les services disponibles pour les rapports"""
    accessible_services = await get_user_accessible_services(current_user)
    
    return {
        "services": accessible_services,
        "is_admin": current_user.get("role") == "ADMIN"
    }


@router.get("/stats")
async def get_reports_stats(current_user: dict = Depends(get_current_user)):
    """Statistiques des rapports"""
    accessible_services = await get_user_accessible_services(current_user)
    
    if not accessible_services:
        return {
            "total_templates": 0,
            "active_templates": 0,
            "total_sent": 0,
            "last_sent": None
        }
    
    query = {"service": {"$in": accessible_services}}
    
    total_templates = await db.weekly_report_templates.count_documents(query)
    active_templates = await db.weekly_report_templates.count_documents({**query, "is_active": True})
    
    # Stats d'historique
    accessible_templates = await db.weekly_report_templates.find(query, {"id": 1}).to_list(1000)
    accessible_template_ids = [t["id"] for t in accessible_templates]
    accessible_template_ids.append("ai_generated")
    
    total_sent = await db.weekly_report_history.count_documents({"template_id": {"$in": accessible_template_ids}})
    
    last_history = await db.weekly_report_history.find_one(
        {"template_id": {"$in": accessible_template_ids}},
        sort=[("sent_at", -1)]
    )
    
    return {
        "total_templates": total_templates,
        "active_templates": active_templates,
        "total_sent": total_sent,
        "last_sent": last_history.get("sent_at") if last_history else None
    }


# ==================== DEFAULT TEMPLATES ====================

@router.get("/default-templates")
async def get_default_templates_info(current_user: dict = Depends(get_current_user)):
    """
    Récupérer les informations sur les templates par défaut disponibles.
    """
    from default_report_templates import get_available_default_templates, DEFAULT_REPORT_TEMPLATES, DEFAULT_GENERIC_TEMPLATE
    
    available_services = get_available_default_templates()
    
    templates_info = []
    for service in available_services:
        template = DEFAULT_REPORT_TEMPLATES.get(service, {})
        templates_info.append({
            "service": service,
            "name": template.get("name", f"Rapport Hebdo {service}"),
            "description": template.get("description", ""),
            "frequency": template.get("schedule", {}).get("frequency", "weekly"),
            "sections_enabled": sum(1 for s in template.get("sections", {}).values() if s.get("enabled", False))
        })
    
    return {
        "available_templates": templates_info,
        "generic_template": {
            "name": DEFAULT_GENERIC_TEMPLATE["name"],
            "description": DEFAULT_GENERIC_TEMPLATE["description"],
            "frequency": DEFAULT_GENERIC_TEMPLATE["schedule"]["frequency"]
        }
    }


@router.post("/init-default-templates")
async def initialize_default_templates(current_user: dict = Depends(get_current_user)):
    """
    Initialiser les templates par défaut pour tous les services existants.
    Seuls les services sans template existant recevront un nouveau template.
    Admin uniquement.
    """
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    from default_report_templates import create_default_templates_for_all_services
    
    created_templates = await create_default_templates_for_all_services(
        db=db,
        created_by=current_user.get("id")
    )
    
    return {
        "success": True,
        "message": f"{len(created_templates)} template(s) créé(s)",
        "templates": [
            {"service": t["service"], "name": t["name"]}
            for t in created_templates
        ]
    }


@router.post("/create-default-template/{service}")
async def create_default_template_for_single_service(
    service: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Créer le template par défaut pour un service spécifique.
    """
    # Vérifier l'accès
    await check_report_access(current_user, service=service)
    
    from default_report_templates import create_default_template_for_service
    
    template = await create_default_template_for_service(
        db=db,
        service=service,
        created_by=current_user.get("id"),
        created_by_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
    )
    
    if not template:
        raise HTTPException(
            status_code=400,
            detail=f"Un template existe déjà pour le service {service}"
        )
    
    return {
        "success": True,
        "message": f"Template créé pour {service}",
        "template": template
    }

