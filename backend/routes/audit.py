"""
Routes du Journal d'Audit
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from bson import ObjectId
from datetime import datetime, timezone
from typing import List, Optional
import logging
import io
import pandas as pd
import pytz

from models import ActionType, EntityType
from dependencies import get_current_user, get_current_admin_user, require_permission
from routes.shared import db, audit_service, serialize_doc

EntityType_Audit = EntityType
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Journal Audit"])

@router.get("/audit-logs",
    summary="Journal d'audit", tags=["Audit"])
async def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Récupère les logs d'audit (admin uniquement)
    Supporte les filtres: user_id, action, entity_type, start_date, end_date
    """
    try:
        # Convertir les strings en enums si fournis
        action_enum = None
        entity_type_enum = None
        try:
            action_enum = ActionType(action) if action else None
        except ValueError:
            pass
        try:
            entity_type_enum = EntityType(entity_type) if entity_type else None
        except ValueError:
            pass
        
        # Convertir les dates si fournies
        start_dt = None
        end_dt = None
        try:
            start_dt = datetime.fromisoformat(start_date) if start_date else None
            end_dt = datetime.fromisoformat(end_date) if end_date else None
        except (ValueError, TypeError):
            pass
        
        logs, total = await audit_service.get_logs(
            skip=skip,
            limit=limit,
            user_id=user_id,
            action=action_enum,
            entity_type=entity_type_enum,
            start_date=start_dt,
            end_date=end_dt
        )
        
        return {
            "logs": logs,
            "total": total,
            "skip": skip,
            "limit": limit
        }
        
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des logs d'audit: {e}")
        # Retourner une réponse vide au lieu d'une erreur 500
        return {
            "logs": [],
            "total": 0,
            "skip": skip,
            "limit": limit
        }

@router.get("/audit-logs/entity/{entity_type}/{entity_id}", tags=["Audit"])
async def get_entity_audit_history(
    entity_type: str,
    entity_id: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Récupère l'historique complet d'une entité spécifique (admin uniquement)
    """
    try:
        entity_type_enum = EntityType(entity_type)
        logs = await audit_service.get_entity_history(entity_type_enum, entity_id)
        
        return {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "history": logs
        }
        
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Type d'entité invalide: {entity_type}"
        )
    except Exception as e:
        logger.error(f"Erreur lors de la récupération de l'historique: {e}")
        raise HTTPException(
            status_code=500,
            detail="Erreur lors de la récupération de l'historique"
        )

@router.get("/audit-logs/export",
    summary="Exporter le journal d'audit", tags=["Audit"])
async def export_audit_logs(
    format: str = "csv",
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Exporte les logs d'audit en CSV ou Excel (admin uniquement)
    """
    try:
        # Récupérer tous les logs avec filtres
        action_enum = ActionType(action) if action else None
        entity_type_enum = EntityType(entity_type) if entity_type else None
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None
        
        logs, _ = await audit_service.get_logs(
            skip=0,
            limit=10000,  # Limite haute pour export
            user_id=user_id,
            action=action_enum,
            entity_type=entity_type_enum,
            start_date=start_dt,
            end_date=end_dt
        )
        
        # Préparer les données pour l'export
        paris_tz = pytz.timezone('Europe/Paris')
        export_data = []
        for log in logs:
            # Convertir UTC vers Europe/Paris
            timestamp_utc = log["timestamp"]
            if timestamp_utc.tzinfo is None:
                timestamp_utc = pytz.utc.localize(timestamp_utc)
            timestamp_paris = timestamp_utc.astimezone(paris_tz)
            
            export_data.append({
                "Date/Heure": timestamp_paris.strftime("%d/%m/%Y %H:%M:%S"),
                "Utilisateur": log["user_name"],
                "Email": log["user_email"],
                "Action": log["action"],
                "Type": log["entity_type"],
                "Entité": log.get("entity_name", ""),
                "Détails": log.get("details", "")
            })
        
        df = pd.DataFrame(export_data)
        
        # Créer le fichier selon le format demandé
        if format.lower() == "csv":
            output = io.StringIO()
            df.to_csv(output, index=False, encoding='utf-8-sig')
            output.seek(0)
            
            return Response(
                content=output.getvalue(),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename=audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                }
            )
        else:  # Excel
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Audit Logs')
            output.seek(0)
            
            return Response(
                content=output.getvalue(),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename=audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                }
            )
        
    except Exception as e:
        logger.error(f"Erreur lors de l'export des logs: {e}")
        raise HTTPException(
            status_code=500,
            detail="Erreur lors de l'export des logs"
        )


