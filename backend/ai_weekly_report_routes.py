"""
Route IA pour la génération automatique du contenu des rapports hebdomadaires.
Compile les données de la période et génère un rapport structuré.
"""
from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_current_user
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import logging
import json
import os
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-weekly-reports", tags=["IA Rapports"])

db = None


def init_ai_report_routes(database):
    global db
    db = database


def clean_json_response(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return t.strip()


async def _get_llm():
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        global_key = await db.global_settings.find_one({"key": "EMERGENT_LLM_KEY"})
        if global_key and global_key.get("value"):
            key = global_key["value"]
    if not key:
        raise HTTPException(status_code=500, detail="Cle LLM non configuree")
    return LlmChat, UserMessage, key


@router.post("/generate")
async def generate_report_content(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Génère automatiquement le contenu d'un rapport à partir des données de la période.
    """
    try:
        service = data.get("service", "")
        period_days = data.get("period_days", 7)
        report_type = data.get("report_type", "hebdomadaire")

        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=period_days)

        # Collecter les données de la période
        # --- OT ---
        wo_filter = {"dateCreation": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}}
        all_wos = await db.work_orders.find(wo_filter, {"_id": 0, "titre": 1, "statut": 1, "priorite": 1, "categorie": 1, "tempsReel": 1, "equipement": 1, "dateCreation": 1}).to_list(500)
        
        # Fallback: si dateCreation est datetime
        if not all_wos:
            wo_filter2 = {"dateCreation": {"$gte": start_date, "$lte": end_date}}
            all_wos = await db.work_orders.find(wo_filter2, {"_id": 0, "titre": 1, "statut": 1, "priorite": 1, "categorie": 1, "tempsReel": 1, "equipement": 1, "dateCreation": 1}).to_list(500)

        wo_stats = {
            "total": len(all_wos),
            "termines": sum(1 for w in all_wos if w.get("statut") in ["TERMINE", "termine", "Termine"]),
            "en_cours": sum(1 for w in all_wos if w.get("statut") in ["en_cours", "En cours", "EN_COURS"]),
            "urgents": sum(1 for w in all_wos if w.get("priorite") in ["haute", "urgente", "Haute", "Urgente", "critical"]),
            "temps_total": sum(w.get("tempsReel", 0) or 0 for w in all_wos),
        }
        wo_list = "\n".join([f"  - {w.get('titre','')} | {w.get('statut','')} | {w.get('priorite','')}" for w in all_wos[:15]])

        # --- Non-conformités ---
        nc_count = 0
        try:
            nc_count = await db.nonconformities.count_documents({
                "createdAt": {"$gte": start_date}
            })
        except Exception:
            pass

        # --- Demandes d'intervention ---
        di_count = 0
        try:
            di_count = await db.intervention_requests.count_documents({
                "created_at": {"$gte": start_date}
            })
        except Exception:
            pass

        # --- Alertes capteurs ---
        alert_count = 0
        try:
            alert_count = await db.alerts.count_documents({
                "created_at": {"$gte": start_date}
            })
        except Exception:
            pass

        # --- Presqu'accidents ---
        pa_count = 0
        try:
            pa_count = await db.presquaccidents.count_documents({
                "date_incident": {"$gte": start_date.isoformat()[:10]}
            })
        except Exception:
            pass

        # --- Surveillance ---
        surv_count = 0
        surv_realise = 0
        try:
            surv_items = await db.surveillance_items.find(
                {"annee": end_date.year}, {"_id": 0, "status": 1}
            ).to_list(500)
            surv_count = len(surv_items)
            surv_realise = sum(1 for s in surv_items if s.get("status") == "REALISE")
        except Exception:
            pass

        period_label = f"du {start_date.strftime('%d/%m/%Y')} au {end_date.strftime('%d/%m/%Y')}"

        prompt = f"""Tu es un responsable QHSE/Maintenance. Genere un rapport {report_type} structure a partir des donnees suivantes.

PERIODE : {period_label}
SERVICE : {service or 'Tous services'}

ORDRES DE TRAVAIL :
  Total: {wo_stats['total']} | Termines: {wo_stats['termines']} | En cours: {wo_stats['en_cours']} | Urgents: {wo_stats['urgents']}
  Temps total: {wo_stats['temps_total']:.1f}h
{wo_list or '  Aucun OT sur la periode'}

NON-CONFORMITES : {nc_count} signalees
DEMANDES D'INTERVENTION : {di_count}
ALERTES CAPTEURS : {alert_count}
PRESQU'ACCIDENTS : {pa_count}
SURVEILLANCE : {surv_realise}/{surv_count} controles realises

Genere en JSON :
{{
  "titre": "Rapport {report_type} - {period_label}",
  "resume_executif": "3-4 phrases resumant la periode",
  "sections": [
    {{
      "titre": "Maintenance",
      "contenu": "Analyse detaillee...",
      "indicateurs": [{{"nom": "Taux de resolution", "valeur": "85%", "tendance": "hausse"}}]
    }},
    {{
      "titre": "Securite & Qualite",
      "contenu": "..."
    }},
    {{
      "titre": "Surveillance reglementaire",
      "contenu": "..."
    }}
  ],
  "points_attention": ["Point 1", "Point 2"],
  "actions_prioritaires": ["Action 1 avec echeance", "Action 2"]
}}"""

        LlmChat, UserMessage, key = await _get_llm()
        chat = LlmChat(api_key=key, session_id=f"ai_report_{end_date.strftime('%Y%m%d')}", system_message="Tu es un expert FSAO/QHSE. Reponds UNIQUEMENT en JSON valide.")
        chat.with_model("gemini", "gemini-2.5-flash")
        response = await chat.send_message(UserMessage(text=prompt))
        result = json.loads(clean_json_response(response))

        # Sauvegarder dans l'historique
        history_entry = {
            "id": str(uuid.uuid4()),
            "template_id": "ai_generated",
            "template_name": result.get("titre", f"Rapport IA {report_type}"),
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
            "recipients": [],
            "status": "generated",
            "pdf_path": None,
            "email_count": 0,
            "errors": [],
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "sent_by": current_user.get("id"),
            "sent_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
            "report_content": result
        }
        await db.weekly_report_history.insert_one(history_entry)
        logger.info(f"Rapport IA sauvegarde dans l'historique: {history_entry['id']}")

        return {
            "success": True,
            "report": result,
            "raw_stats": {
                "work_orders": wo_stats,
                "non_conformities": nc_count,
                "intervention_requests": di_count,
                "alerts": alert_count,
                "near_misses": pa_count,
                "surveillance": {"total": surv_count, "realized": surv_realise}
            },
            "period": period_label
        }

    except json.JSONDecodeError:
        return {"success": True, "report": {"resume_executif": response}, "period": period_label}
    except Exception as e:
        logger.error(f"Erreur generation rapport IA: {e}")
        raise HTTPException(status_code=500, detail=str(e))
