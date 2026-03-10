"""
Service de génération et d'envoi des rapports périodiques
Génère les données, le HTML et le PDF pour les rapports hebdomadaires/mensuels/annuels
"""
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

# Répertoire de stockage des PDFs
PDF_STORAGE_DIR = Path("/app/backend/uploads/reports")
PDF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def get_period_dates(period: str, reference_date: datetime = None) -> tuple:
    """
    Calcule les dates de début et fin selon la période configurée
    Retourne (start_date, end_date) en datetime UTC
    """
    if reference_date is None:
        reference_date = datetime.now(timezone.utc)
    
    # Trouver le lundi de la semaine courante
    today = reference_date.replace(hour=0, minute=0, second=0, microsecond=0)
    monday_this_week = today - timedelta(days=today.weekday())
    
    if period == "previous_week":
        start = monday_this_week - timedelta(days=7)
        end = monday_this_week - timedelta(seconds=1)
    elif period == "current_week":
        start = monday_this_week
        end = monday_this_week + timedelta(days=7) - timedelta(seconds=1)
    elif period == "last_7_days":
        start = today - timedelta(days=7)
        end = today - timedelta(seconds=1)
    elif period == "previous_month":
        first_this_month = today.replace(day=1)
        end = first_this_month - timedelta(seconds=1)
        start = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "current_month":
        start = today.replace(day=1)
        # Dernier jour du mois
        if today.month == 12:
            next_month = today.replace(year=today.year + 1, month=1, day=1)
        else:
            next_month = today.replace(month=today.month + 1, day=1)
        end = next_month - timedelta(seconds=1)
    elif period == "last_30_days":
        start = today - timedelta(days=30)
        end = today - timedelta(seconds=1)
    elif period == "previous_year":
        start = today.replace(year=today.year - 1, month=1, day=1)
        end = today.replace(month=1, day=1) - timedelta(seconds=1)
    elif period == "last_365_days":
        start = today - timedelta(days=365)
        end = today - timedelta(seconds=1)
    else:
        # Par défaut: semaine précédente
        start = monday_this_week - timedelta(days=7)
        end = monday_this_week - timedelta(seconds=1)
    
    return start, end


async def collect_work_orders_data(db, service: str, start_date: datetime, end_date: datetime, config: dict) -> Dict[str, Any]:
    """Collecte les données des ordres de travail"""
    data = {}
    
    # Filtrer par service si spécifié
    base_query = {}
    if service and service != "ALL":
        base_query["service"] = service
    
    if config.get("include_created", True):
        created_query = {
            **base_query,
            "dateCreation": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        data["created_count"] = await db.work_orders.count_documents(created_query)
        
        # Liste des OT créés
        created_list = await db.work_orders.find(created_query).sort("dateCreation", -1).limit(20).to_list(20)
        data["created_list"] = [
            {
                "numero": wo.get("numero", "N/A"),
                "titre": wo.get("titre", ""),
                "priorite": wo.get("priorite", ""),
                "statut": wo.get("statut", ""),
                "date": wo.get("dateCreation", "")[:10] if wo.get("dateCreation") else ""
            }
            for wo in created_list
        ]
    
    if config.get("include_completed", True):
        completed_query = {
            **base_query,
            "statut": {"$in": ["TERMINE", "CLOTURE"]},
            "dateTermine": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        data["completed_count"] = await db.work_orders.count_documents(completed_query)
    
    if config.get("include_overdue", True):
        overdue_query = {
            **base_query,
            "statut": {"$nin": ["TERMINE", "CLOTURE"]},
            "dateLimite": {"$lt": datetime.now(timezone.utc).isoformat()}
        }
        data["overdue_count"] = await db.work_orders.count_documents(overdue_query)
        
        # Liste des OT en retard
        overdue_list = await db.work_orders.find(overdue_query).sort("dateLimite", 1).limit(10).to_list(10)
        data["overdue_list"] = [
            {
                "numero": wo.get("numero", "N/A"),
                "titre": wo.get("titre", ""),
                "priorite": wo.get("priorite", ""),
                "dateLimite": wo.get("dateLimite", "")[:10] if wo.get("dateLimite") else ""
            }
            for wo in overdue_list
        ]
    
    if config.get("include_in_progress", True):
        in_progress_query = {
            **base_query,
            "statut": "EN_COURS"
        }
        data["in_progress_count"] = await db.work_orders.count_documents(in_progress_query)
    
    if config.get("include_completion_rate", True):
        total_period = await db.work_orders.count_documents({
            **base_query,
            "dateCreation": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        })
        completed = data.get("completed_count", 0)
        data["completion_rate"] = round((completed / total_period * 100) if total_period > 0 else 0, 1)
    
    return data


async def collect_equipment_data(db, service: str, start_date: datetime, end_date: datetime, config: dict) -> Dict[str, Any]:
    """Collecte les données des équipements"""
    data = {}
    
    base_query = {}
    if service and service != "ALL":
        base_query["service"] = service
    
    # Total équipements
    total_equipment = await db.equipments.count_documents(base_query)
    data["total"] = total_equipment
    
    if config.get("include_broken", True):
        broken_query = {**base_query, "statut": "EN_PANNE"}
        data["broken_count"] = await db.equipments.count_documents(broken_query)
        
        # Liste des équipements en panne
        broken_list = await db.equipments.find(broken_query).limit(10).to_list(10)
        data["broken_list"] = [
            {
                "nom": eq.get("nom", ""),
                "emplacement": eq.get("emplacement_nom", eq.get("emplacement", ""))
            }
            for eq in broken_list
        ]
    
    if config.get("include_maintenance", True):
        maintenance_query = {**base_query, "statut": "EN_MAINTENANCE"}
        data["maintenance_count"] = await db.equipments.count_documents(maintenance_query)
    
    if config.get("include_availability", True):
        operational_query = {**base_query, "statut": "EN_SERVICE"}
        operational_count = await db.equipments.count_documents(operational_query)
        data["availability_rate"] = round((operational_count / total_equipment * 100) if total_equipment > 0 else 100, 1)
    
    if config.get("include_alerts", True):
        # Alertes actives (via capteurs)
        active_alerts = await db.sensor_alerts.count_documents({"status": "active"})
        data["active_alerts"] = active_alerts
    
    return data


async def collect_pending_requests_data(db, service: str, config: dict) -> Dict[str, Any]:
    """Collecte les données des demandes en attente"""
    data = {}
    
    base_query = {}
    if service and service != "ALL":
        base_query["service"] = service
    
    if config.get("include_improvements", True):
        improvements_query = {**base_query, "status": {"$in": ["SOUMISE", "EN_ATTENTE"]}}
        data["improvements_count"] = await db.improvement_requests.count_documents(improvements_query)
        
        # Liste des demandes d'amélioration
        improvements_list = await db.improvement_requests.find(improvements_query).sort("created_at", -1).limit(5).to_list(5)
        data["improvements_list"] = [
            {
                "titre": ir.get("titre", ir.get("title", "")),
                "priorite": ir.get("priorite", ir.get("priority", "")),
                "date": ir.get("created_at", "")[:10] if ir.get("created_at") else ""
            }
            for ir in improvements_list
        ]
    
    if config.get("include_purchases", True):
        purchases_query = {**base_query, "statut": {"$in": ["EN_ATTENTE", "SOUMISE"]}}
        data["purchases_count"] = await db.purchase_requests.count_documents(purchases_query)
    
    if config.get("include_interventions", True):
        interventions_query = {**base_query, "statut": {"$in": ["EN_ATTENTE", "NOUVELLE"]}}
        data["interventions_count"] = await db.intervention_requests.count_documents(interventions_query)
    
    return data


async def collect_team_performance_data(db, service: str, start_date: datetime, end_date: datetime, config: dict) -> Dict[str, Any]:
    """Collecte les données de performance de l'équipe"""
    data = {}
    
    base_query = {}
    if service and service != "ALL":
        base_query["service"] = service
    
    if config.get("include_time_spent", True):
        # Calculer le temps total passé sur les OT de la période
        pipeline = [
            {
                "$match": {
                    **base_query,
                    "dateCreation": {
                        "$gte": start_date.isoformat(),
                        "$lte": end_date.isoformat()
                    }
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_time": {"$sum": {"$ifNull": ["$tempsReel", 0]}}
                }
            }
        ]
        result = await db.work_orders.aggregate(pipeline).to_list(1)
        data["total_time_hours"] = round(result[0]["total_time"], 1) if result else 0
    
    if config.get("include_by_technician", True):
        # Temps par technicien
        pipeline = [
            {
                "$match": {
                    **base_query,
                    "assigne_a_id": {"$ne": None},
                    "tempsReel": {"$gt": 0},
                    "dateCreation": {
                        "$gte": start_date.isoformat(),
                        "$lte": end_date.isoformat()
                    }
                }
            },
            {
                "$group": {
                    "_id": "$assigne_a_id",
                    "total_time": {"$sum": "$tempsReel"},
                    "completed_count": {
                        "$sum": {
                            "$cond": [{"$in": ["$statut", ["TERMINE", "CLOTURE"]]}, 1, 0]
                        }
                    }
                }
            },
            {"$sort": {"total_time": -1}},
            {"$limit": 10}
        ]
        tech_stats = await db.work_orders.aggregate(pipeline).to_list(10)
        
        # Enrichir avec les noms des techniciens
        technicians = []
        for ts in tech_stats:
            user = await db.users.find_one({"id": ts["_id"]})
            if not user:
                try:
                    from bson import ObjectId
                    user = await db.users.find_one({"_id": ObjectId(ts["_id"])})
                except:
                    pass
            
            technicians.append({
                "name": f"{user.get('prenom', '')} {user.get('nom', '')}".strip() if user else "Inconnu",
                "total_hours": round(ts["total_time"], 1),
                "completed": ts["completed_count"]
            })
        
        data["technicians"] = technicians
    
    return data


async def collect_report_data(db, template: dict) -> Dict[str, Any]:
    """Collecte toutes les données pour un rapport selon sa configuration"""
    service = template.get("service", "")
    period = template.get("period", "previous_week")
    sections_config = template.get("sections", {})
    
    start_date, end_date = get_period_dates(period)
    
    report_data = {
        "template_name": template.get("name", "Rapport"),
        "service": service,
        "period": {
            "start": start_date.strftime("%d/%m/%Y"),
            "end": end_date.strftime("%d/%m/%Y"),
            "label": period
        },
        "generated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y à %H:%M"),
        "sections": {}
    }
    
    # Collecter les données de chaque section activée
    wo_config = sections_config.get("work_orders", {})
    if wo_config.get("enabled", True):
        report_data["sections"]["work_orders"] = await collect_work_orders_data(
            db, service, start_date, end_date, wo_config
        )
    
    eq_config = sections_config.get("equipment", {})
    if eq_config.get("enabled", True):
        report_data["sections"]["equipment"] = await collect_equipment_data(
            db, service, start_date, end_date, eq_config
        )
    
    pr_config = sections_config.get("pending_requests", {})
    if pr_config.get("enabled", True):
        report_data["sections"]["pending_requests"] = await collect_pending_requests_data(
            db, service, pr_config
        )
    
    tp_config = sections_config.get("team_performance", {})
    if tp_config.get("enabled", True):
        report_data["sections"]["team_performance"] = await collect_team_performance_data(
            db, service, start_date, end_date, tp_config
        )
    
    return report_data


def generate_html_report(report_data: Dict[str, Any]) -> str:
    """Génère le HTML du rapport pour l'email"""
    
    sections = report_data.get("sections", {})
    
    # Construction des sections HTML
    wo_section = ""
    if "work_orders" in sections:
        wo = sections["work_orders"]
        overdue_list_html = ""
        if wo.get("overdue_list"):
            overdue_list_html = "<ul style='margin: 10px 0; padding-left: 20px;'>"
            for item in wo["overdue_list"][:5]:
                overdue_list_html += f"<li style='color: #dc2626;'>#{item['numero']} - {item['titre'][:50]} (Échéance: {item['dateLimite']})</li>"
            overdue_list_html += "</ul>"
        
        wo_section = f"""
        <div style="margin-bottom: 30px;">
            <h2 style="color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; margin-bottom: 20px;">
                📋 Ordres de Travail
            </h2>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #1e40af;">{wo.get('created_count', 0)}</div>
                    <div style="color: #64748b;">Créés</div>
                </div>
                <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #16a34a;">{wo.get('completed_count', 0)}</div>
                    <div style="color: #64748b;">Terminés</div>
                </div>
                <div style="background: #fef2f2; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #dc2626;">{wo.get('overdue_count', 0)}</div>
                    <div style="color: #64748b;">En retard</div>
                </div>
                <div style="background: #fffbeb; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #d97706;">{wo.get('in_progress_count', 0)}</div>
                    <div style="color: #64748b;">En cours</div>
                </div>
            </div>
            <div style="margin-top: 15px; padding: 15px; background: #f8fafc; border-radius: 8px;">
                <strong>Taux de réalisation:</strong> <span style="color: #16a34a; font-weight: bold;">{wo.get('completion_rate', 0)}%</span>
            </div>
            {f'<div style="margin-top: 15px;"><strong style="color: #dc2626;">⚠️ OT en retard:</strong>{overdue_list_html}</div>' if overdue_list_html else ''}
        </div>
        """
    
    eq_section = ""
    if "equipment" in sections:
        eq = sections["equipment"]
        broken_list_html = ""
        if eq.get("broken_list"):
            broken_list_html = "<ul style='margin: 10px 0; padding-left: 20px;'>"
            for item in eq["broken_list"][:5]:
                broken_list_html += f"<li style='color: #dc2626;'>{item['nom']} ({item.get('emplacement', 'N/A')})</li>"
            broken_list_html += "</ul>"
        
        eq_section = f"""
        <div style="margin-bottom: 30px;">
            <h2 style="color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 10px; margin-bottom: 20px;">
                🔧 Équipements
            </h2>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                <div style="background: #faf5ff; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #7c3aed;">{eq.get('total', 0)}</div>
                    <div style="color: #64748b;">Total</div>
                </div>
                <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #16a34a;">{eq.get('availability_rate', 0)}%</div>
                    <div style="color: #64748b;">Disponibilité</div>
                </div>
                <div style="background: #fef2f2; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #dc2626;">{eq.get('broken_count', 0)}</div>
                    <div style="color: #64748b;">En panne</div>
                </div>
                <div style="background: #fffbeb; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #d97706;">{eq.get('maintenance_count', 0)}</div>
                    <div style="color: #64748b;">En maintenance</div>
                </div>
            </div>
            {f'<div style="margin-top: 15px;"><strong style="color: #dc2626;">⚠️ Équipements en panne:</strong>{broken_list_html}</div>' if broken_list_html else ''}
        </div>
        """
    
    pr_section = ""
    if "pending_requests" in sections:
        pr = sections["pending_requests"]
        pr_section = f"""
        <div style="margin-bottom: 30px;">
            <h2 style="color: #ea580c; border-bottom: 2px solid #ea580c; padding-bottom: 10px; margin-bottom: 20px;">
                📝 Demandes en attente
            </h2>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                <div style="background: #fff7ed; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #ea580c;">{pr.get('improvements_count', 0)}</div>
                    <div style="color: #64748b;">Améliorations</div>
                </div>
                <div style="background: #fefce8; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #ca8a04;">{pr.get('purchases_count', 0)}</div>
                    <div style="color: #64748b;">Achats</div>
                </div>
                <div style="background: #ecfeff; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #0891b2;">{pr.get('interventions_count', 0)}</div>
                    <div style="color: #64748b;">Interventions</div>
                </div>
            </div>
        </div>
        """
    
    tp_section = ""
    if "team_performance" in sections:
        tp = sections["team_performance"]
        tech_rows = ""
        if tp.get("technicians"):
            for tech in tp["technicians"]:
                tech_rows += f"""
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{tech['name']}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">{tech['total_hours']}h</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">{tech['completed']}</td>
                </tr>
                """
        
        tp_section = f"""
        <div style="margin-bottom: 30px;">
            <h2 style="color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 10px; margin-bottom: 20px;">
                👥 Performance équipe
            </h2>
            <div style="background: #f0fdfa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <strong>Temps total passé:</strong> 
                <span style="font-size: 24px; font-weight: bold; color: #0d9488;">{tp.get('total_time_hours', 0)}h</span>
            </div>
            {f'''
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
                <thead>
                    <tr style="background: #0d9488; color: white;">
                        <th style="padding: 12px; text-align: left;">Technicien</th>
                        <th style="padding: 12px; text-align: center;">Temps</th>
                        <th style="padding: 12px; text-align: center;">OT terminés</th>
                    </tr>
                </thead>
                <tbody>
                    {tech_rows}
                </tbody>
            </table>
            ''' if tech_rows else '<p style="color: #64748b;">Aucune donnée de performance disponible</p>'}
        </div>
        """
    
    # Assemblage du HTML complet
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px;">
            <h1 style="margin: 0 0 10px 0; font-size: 28px;">📊 {report_data.get('template_name', 'Rapport')}</h1>
            <p style="margin: 0; opacity: 0.9;">Service: <strong>{report_data.get('service', 'Tous')}</strong></p>
            <p style="margin: 10px 0 0 0; opacity: 0.8; font-size: 14px;">
                Période: {report_data['period']['start']} - {report_data['period']['end']}
            </p>
        </div>
        
        <!-- Sections -->
        {wo_section}
        {eq_section}
        {pr_section}
        {tp_section}
        
        <!-- Footer -->
        <div style="margin-top: 40px; padding: 20px; background: #f1f5f9; border-radius: 8px; text-align: center; color: #64748b; font-size: 12px;">
            <p style="margin: 0;">Rapport généré automatiquement par FSAO Iris</p>
            <p style="margin: 5px 0 0 0;">{report_data.get('generated_at', '')}</p>
        </div>
        
    </body>
    </html>
    """
    
    return html


def generate_pdf_report(report_data: Dict[str, Any], html_content: str) -> str:
    """
    Génère le PDF du rapport et retourne le chemin du fichier
    Utilise weasyprint ou reportlab selon disponibilité
    """
    
    # Créer un nom de fichier unique
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    service_slug = report_data.get("service", "all").replace(" ", "_").lower()
    filename = f"rapport_{service_slug}_{timestamp}.pdf"
    pdf_path = PDF_STORAGE_DIR / filename
    
    try:
        # Essayer avec weasyprint (meilleur rendu)
        from weasyprint import HTML
        HTML(string=html_content).write_pdf(str(pdf_path))
        logger.info(f"📄 PDF généré avec weasyprint: {pdf_path}")
        return str(pdf_path)
    except ImportError:
        logger.warning("weasyprint non disponible, utilisation de reportlab")
    except Exception as e:
        logger.error(f"Erreur weasyprint: {e}")
    
    try:
        # Fallback avec reportlab (plus basique mais toujours disponible)
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib import colors
        
        doc = SimpleDocTemplate(str(pdf_path), pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        story = []
        
        # Titre
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, textColor=colors.HexColor('#1e40af'))
        story.append(Paragraph(report_data.get('template_name', 'Rapport'), title_style))
        story.append(Spacer(1, 12))
        
        # Info période
        story.append(Paragraph(f"<b>Service:</b> {report_data.get('service', 'Tous')}", styles['Normal']))
        story.append(Paragraph(f"<b>Période:</b> {report_data['period']['start']} - {report_data['period']['end']}", styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Sections
        sections = report_data.get("sections", {})
        
        if "work_orders" in sections:
            wo = sections["work_orders"]
            story.append(Paragraph("Ordres de Travail", styles['Heading2']))
            data = [
                ["Créés", "Terminés", "En retard", "En cours"],
                [str(wo.get('created_count', 0)), str(wo.get('completed_count', 0)), 
                 str(wo.get('overdue_count', 0)), str(wo.get('in_progress_count', 0))]
            ]
            t = Table(data, colWidths=[3*cm, 3*cm, 3*cm, 3*cm])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
            ]))
            story.append(t)
            story.append(Spacer(1, 20))
        
        if "equipment" in sections:
            eq = sections["equipment"]
            story.append(Paragraph("Équipements", styles['Heading2']))
            data = [
                ["Total", "Disponibilité", "En panne", "En maintenance"],
                [str(eq.get('total', 0)), f"{eq.get('availability_rate', 0)}%",
                 str(eq.get('broken_count', 0)), str(eq.get('maintenance_count', 0))]
            ]
            t = Table(data, colWidths=[3*cm, 3*cm, 3*cm, 3*cm])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7c3aed')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ]))
            story.append(t)
            story.append(Spacer(1, 20))
        
        # Footer
        story.append(Spacer(1, 30))
        story.append(Paragraph(f"Généré le {report_data.get('generated_at', '')}", styles['Normal']))
        
        doc.build(story)
        logger.info(f"📄 PDF généré avec reportlab: {pdf_path}")
        return str(pdf_path)
        
    except Exception as e:
        logger.error(f"Erreur génération PDF: {e}")
        return None


async def send_report_email(
    recipients: List[str],
    subject: str,
    html_content: str,
    pdf_path: Optional[str] = None
) -> dict:
    """Envoie le rapport par email avec le PDF en pièce jointe"""
    import email_service
    
    sent_count = 0
    errors = []
    
    for recipient in recipients:
        try:
            # Utiliser le service email existant
            success = email_service.send_weekly_report_email(
                to_email=recipient,
                subject=subject,
                html_content=html_content,
                pdf_path=pdf_path
            )
            
            if success:
                sent_count += 1
                logger.info(f"📧 Rapport envoyé à {recipient}")
            else:
                errors.append(f"Échec d'envoi à {recipient}")
        except Exception as e:
            errors.append(f"Erreur pour {recipient}: {str(e)}")
            logger.error(f"Erreur envoi rapport à {recipient}: {e}")
    
    return {
        "sent_count": sent_count,
        "total": len(recipients),
        "errors": errors
    }


async def generate_and_send_report(
    template: dict,
    db,
    is_test: bool = False,
    test_recipient: str = None
) -> dict:
    """
    Génère et envoie un rapport complet basé sur un template
    """
    logger.info(f"📊 Génération du rapport: {template.get('name')}")
    
    # 1. Collecter les données
    report_data = await collect_report_data(db, template)
    
    # 2. Générer le HTML
    html_content = generate_html_report(report_data)
    
    # 3. Générer le PDF
    pdf_path = generate_pdf_report(report_data, html_content)
    
    # 4. Déterminer les destinataires
    recipients_config = template.get("recipients", {})
    recipients = list(recipients_config.get("emails", []))
    
    if recipients_config.get("include_service_managers", False):
        # Ajouter les responsables du service
        service = template.get("service")
        if service:
            responsables = await db.service_responsables.find({"service": service}).to_list(10)
            for resp in responsables:
                user = await db.users.find_one({"id": resp.get("user_id")})
                if user and user.get("email") and user["email"] not in recipients:
                    recipients.append(user["email"])
    
    # Pour les tests, envoyer uniquement à l'utilisateur qui teste
    if is_test and test_recipient:
        recipients = [test_recipient]
    
    if not recipients:
        return {
            "success": False,
            "error": "Aucun destinataire configuré"
        }
    
    # 5. Envoyer les emails
    period = report_data.get("period", {})
    subject = f"📊 {template.get('name')} - {period.get('start', '')} au {period.get('end', '')}"
    if is_test:
        subject = f"[TEST] {subject}"
    
    send_result = await send_report_email(recipients, subject, html_content, pdf_path)
    
    # 6. Enregistrer dans l'historique (tests et envois normaux)
    start_date, end_date = get_period_dates(template.get("period", "previous_week"))
    
    history_entry = {
        "id": str(uuid.uuid4()),
        "template_id": template.get("id"),
        "template_name": f"[TEST] {template.get('name')}" if is_test else template.get("name"),
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "recipients": recipients,
        "status": "sent" if send_result["sent_count"] == len(recipients) else ("partial" if send_result["sent_count"] > 0 else "failed"),
        "pdf_path": pdf_path,
        "email_count": send_result["sent_count"],
        "errors": send_result["errors"],
        "sent_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.weekly_report_history.insert_one(history_entry)
    
    # Mettre à jour le template (sauf pour les tests)
    if not is_test:
        await db.weekly_report_templates.update_one(
            {"id": template.get("id")},
            {
                "$set": {"last_sent_at": datetime.now(timezone.utc).isoformat()},
                "$inc": {"send_count": 1}
            }
        )
    
    return {
        "success": send_result["sent_count"] > 0,
        "sent_count": send_result["sent_count"],
        "total_recipients": len(recipients),
        "pdf_path": pdf_path,
        "errors": send_result["errors"]
    }
