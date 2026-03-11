"""
Routes IA pour l'Historique d'Achat
- Feature 1: Analyse IA des tendances d'achat
- Feature 2: Generation de rapport d'analyse achat
- Feature 3: Archives IA - CRUD
"""
from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_current_user
from datetime import datetime, timezone
import logging
import uuid
import json
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-purchase-history", tags=["IA Historique Achats"])

db = None
audit_service = None


def init_ai_purchase_history_routes(database, audit_svc):
    global db, audit_service
    db = database
    audit_service = audit_svc


def clean_json_response(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return t.strip()


FALLBACK_CHAIN = [
    ("gemini", "gemini-2.5-flash"),
    ("openai", "gpt-4o-mini"),
    ("anthropic", "claude-sonnet-4-5"),
]


async def _get_llm_key():
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        gk = await db.global_settings.find_one({"key": "EMERGENT_LLM_KEY"})
        if gk and gk.get("value"):
            key = gk["value"]
    if not key:
        raise HTTPException(status_code=500, detail="Cle LLM non configuree")
    return key


async def _get_user_ai_config(user_id: str):
    try:
        prefs = await db.user_preferences.find_one({"user_id": user_id}, {"_id": 0})
        if prefs:
            provider = prefs.get("ai_llm_provider")
            model = prefs.get("ai_llm_model")
            if provider and model:
                return provider, model
    except Exception:
        pass
    return "gemini", "gemini-2.5-flash"


async def _call_llm_with_fallback(api_key, session_id, system_message, user_text, preferred_provider, preferred_model):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import asyncio as _asyncio

    chain = [(preferred_provider, preferred_model)]
    for prov, mod in FALLBACK_CHAIN:
        if prov != preferred_provider:
            chain.append((prov, mod))

    last_error = None
    for provider, model in chain:
        try:
            logger.info(f"[IA Achat] Essai {provider}/{model}...")
            chat = LlmChat(
                api_key=api_key,
                session_id=f"{session_id}_{provider}",
                system_message=system_message
            ).with_model(provider, model)

            response = await _asyncio.wait_for(
                chat.send_message(UserMessage(text=user_text)),
                timeout=90
            )
            logger.info(f"[IA Achat] Succes avec {provider}/{model}")
            return response, provider, model

        except _asyncio.TimeoutError:
            last_error = f"Timeout avec {provider}/{model}"
            logger.warning(f"[IA Achat] {last_error}")
        except Exception as e:
            last_error = f"{provider}/{model}: {str(e)}"
            logger.warning(f"[IA Achat] Echec {last_error}")

    raise Exception(f"Tous les providers IA ont echoue. Derniere erreur: {last_error}")


async def _get_archived_purchase_ids(archive_type=None):
    query = {}
    if archive_type:
        query["type"] = archive_type
    archives = await db.ai_purchase_archives.find(query, {"_id": 0, "purchase_ids": 1}).to_list(length=10000)
    archived_ids = set()
    for a in archives:
        archived_ids.update(a.get("purchase_ids", []))
    return archived_ids


async def _get_unanalyzed_purchases(archive_type, max_count=500):
    archived_ids = await _get_archived_purchase_ids(archive_type)
    query = {}
    if archived_ids:
        query["id"] = {"$nin": list(archived_ids)}
    items = await db.purchase_history.find(query, {"_id": 0}).sort("dateCreation", -1).to_list(length=max_count)
    return items, len(archived_ids)


# ========================================================
# Feature 1: Analyse IA des tendances d'achat
# ========================================================

@router.post("/analyze-trends")
async def analyze_purchase_trends(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Analyse IA des tendances d'achat : fournisseurs, couts, categories, anomalies."""
    try:
        api_key = await _get_llm_key()
        pref_provider, pref_model = await _get_user_ai_config(current_user.get("id"))

        items, already_archived_count = await _get_unanalyzed_purchases("purchase_trend", 500)

        if len(items) < 2:
            if already_archived_count > 0:
                return {"success": False, "error": f"Toutes les lignes d'achat ont deja ete analysees. {already_archived_count} ligne(s) archivee(s). Consultez les archives."}
            return {"success": False, "error": "Pas assez de donnees pour une analyse (minimum 2 lignes d'achat)"}

        purchases_detail = []
        for it in items:
            purchases_detail.append(
                f"Fournisseur:{it.get('fournisseur','')} | N°Cmd:{it.get('numeroCommande','')} | "
                f"Date:{it.get('dateCreation','')} | Article:{it.get('article','')} | "
                f"Desc:{(it.get('description','') or '')[:80]} | Groupe:{it.get('groupeStatistique','')} | "
                f"Qte:{it.get('quantite',0)} | MontantHT:{it.get('montantLigneHT',0)} | "
                f"QteRetour:{it.get('quantiteRetournee',0)} | Site:{it.get('site','')}"
            )

        system_msg = """Tu es un expert en analyse d'achats et approvisionnement industriel (maintenance).
Analyse l'ensemble des lignes d'achat pour identifier les tendances, optimisations possibles,
anomalies de prix, fournisseurs strategiques et risques d'approvisionnement.

Reponds UNIQUEMENT avec un JSON valide, sans texte autour ni backticks.

Format:
{
  "summary": "string - resume en 2-3 phrases de la situation globale des achats",
  "tendance_globale": "HAUSSE|STABLE|BAISSE",
  "kpi": {
    "total_lignes": 0,
    "montant_total_ht": 0,
    "nombre_fournisseurs": 0,
    "nombre_commandes": 0,
    "panier_moyen": 0,
    "categories_principales": ["string"],
    "fournisseurs_principaux": ["string"]
  },
  "analyse_fournisseurs": [
    {
      "fournisseur": "string",
      "montant_total": 0,
      "nombre_commandes": 0,
      "categories": ["string"],
      "evaluation": "STRATEGIQUE|IMPORTANT|OCCASIONNEL",
      "risque": "string - risque de dependance ou autre"
    }
  ],
  "analyse_categories": [
    {
      "categorie": "string - groupe statistique",
      "montant_total": 0,
      "nombre_articles": 0,
      "tendance_prix": "HAUSSE|STABLE|BAISSE",
      "commentaire": "string"
    }
  ],
  "anomalies_detectees": [
    {
      "type": "PRIX_ANORMAL|QUANTITE_ELEVEE|RETOURS_FREQUENTS|DOUBLON_POTENTIEL",
      "description": "string",
      "impact_estime": "string",
      "recommendation": "string"
    }
  ],
  "optimisations_possibles": [
    {
      "action": "string",
      "economie_estimee": "string",
      "priorite": "HAUTE|MOYENNE|BASSE",
      "service_concerne": "string"
    }
  ],
  "recommandations_prioritaires": [
    {
      "action": "string",
      "priorite": "HAUTE|MOYENNE|BASSE",
      "impact_attendu": "string",
      "service_concerne": "string"
    }
  ]
}"""

        response, used_provider, used_model = await _call_llm_with_fallback(
            api_key=api_key,
            session_id=f"purchase_trends_{uuid.uuid4().hex[:8]}",
            system_message=system_msg,
            user_text=f"Analyse ces {len(items)} lignes d'achat et identifie les tendances:\n\n" +
                       "\n".join(purchases_detail),
            preferred_provider=pref_provider,
            preferred_model=pref_model
        )

        cleaned = clean_json_response(response)
        analysis = json.loads(cleaned)

        # Sauvegarder dans l'historique
        record = {
            "id": str(uuid.uuid4()),
            "type": "purchase_trend_analysis",
            "analyzed_by": current_user.get("id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_purchases": len(items),
            "analysis": analysis
        }
        await db.ai_analysis_history.insert_one(record)

        # Auto-archiver
        purchase_ids = [it.get("id") for it in items if it.get("id")]
        dates = [it.get("dateCreation", "") for it in items if it.get("dateCreation")]
        archive_record = {
            "id": str(uuid.uuid4()),
            "type": "purchase_trend",
            "generated_by": current_user.get("id"),
            "generated_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "purchase_ids": purchase_ids,
            "purchase_count": len(items),
            "date_range": {"from": min(dates) if dates else "", "to": max(dates) if dates else ""},
            "analysis": analysis,
            "provider_used": used_provider,
            "model_used": used_model
        }
        await db.ai_purchase_archives.insert_one(archive_record)

        return {
            "success": True,
            "data": analysis,
            "stats": {"total_purchases": len(items), "already_archived": already_archived_count},
            "archived": True
        }

    except json.JSONDecodeError:
        return {"success": False, "error": "L'IA a retourne un format invalide. Reessayez."}
    except Exception as e:
        logger.error(f"Erreur analyse tendances achat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================
# Feature 2: Rapport d'analyse achat
# ========================================================

@router.post("/generate-report")
async def generate_purchase_report(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Genere un rapport de synthese achat structure pour presentation en reunion."""
    try:
        api_key = await _get_llm_key()
        pref_provider, pref_model = await _get_user_ai_config(current_user.get("id"))

        items, already_archived_count = await _get_unanalyzed_purchases("purchase_report", 500)

        if not items:
            if already_archived_count > 0:
                return {"success": False, "error": f"Toutes les lignes ont deja ete analysees. {already_archived_count} ligne(s) archivee(s). Consultez les archives."}
            return {"success": False, "error": "Aucune donnee d'achat enregistree"}

        total = len(items)
        montant_total = sum(float(it.get("montantLigneHT", 0) or 0) for it in items)
        retours_total = sum(int(it.get("quantiteRetournee", 0) or 0) for it in items)
        fournisseurs = set(it.get("fournisseur", "") for it in items if it.get("fournisseur"))

        purchases_detail = []
        for it in items:
            purchases_detail.append(
                f"Fournisseur:{it.get('fournisseur','')} | N°Cmd:{it.get('numeroCommande','')} | "
                f"Date:{it.get('dateCreation','')} | Article:{it.get('article','')} | "
                f"Groupe:{it.get('groupeStatistique','')} | Qte:{it.get('quantite',0)} | "
                f"MontantHT:{it.get('montantLigneHT',0)} | Retour:{it.get('quantiteRetournee',0)}"
            )

        system_msg = """Tu es un expert en gestion des achats et approvisionnement industriel.
Genere un rapport de synthese structure et professionnel pour une reunion de direction.
Le rapport doit etre clair, factuel et oriente optimisation des couts.

Reponds UNIQUEMENT avec un JSON valide, sans texte autour ni backticks.

Format:
{
  "titre_rapport": "string - ex: Synthese Achats Maintenance - Mars 2026",
  "date_generation": "string",
  "resume_executif": "string - paragraphe de synthese pour le management (3-5 phrases)",
  "indicateurs_cles": {
    "total_lignes": 0,
    "montant_total_ht": 0,
    "nombre_fournisseurs": 0,
    "taux_retour_pct": 0,
    "panier_moyen": 0,
    "tendance": "HAUSSE|STABLE|BAISSE",
    "commentaire_tendance": "string"
  },
  "top_fournisseurs": [
    {
      "rang": 1,
      "fournisseur": "string",
      "montant_total": 0,
      "nombre_commandes": 0,
      "part_marche_pct": 0,
      "evaluation": "string"
    }
  ],
  "analyse_par_categorie": [
    {
      "categorie": "string",
      "montant": 0,
      "part_pct": 0,
      "evolution": "string"
    }
  ],
  "top_risques": [
    {
      "rang": 1,
      "risque": "string",
      "gravite": "CRITIQUE|IMPORTANT|MODERE|FAIBLE",
      "fournisseur_concerne": "string",
      "recommandation": "string"
    }
  ],
  "plan_action_propose": [
    {
      "action": "string",
      "priorite": "1|2|3",
      "responsable_suggere": "string",
      "echeance_suggeree": "string",
      "economie_estimee": "string"
    }
  ],
  "conclusion": "string",
  "points_de_vigilance": ["string"]
}"""

        user_text = f"""Genere le rapport de synthese achats pour {total} lignes d'achat.
Montant total HT: {montant_total:.2f} EUR | {len(fournisseurs)} fournisseurs | {retours_total} retours

DETAIL DES ACHATS:
{chr(10).join(purchases_detail)}"""

        response, used_provider, used_model = await _call_llm_with_fallback(
            api_key=api_key,
            session_id=f"purchase_report_{uuid.uuid4().hex[:8]}",
            system_message=system_msg,
            user_text=user_text,
            preferred_provider=pref_provider,
            preferred_model=pref_model
        )

        cleaned = clean_json_response(response)
        report = json.loads(cleaned)

        record = {
            "id": str(uuid.uuid4()),
            "type": "purchase_report",
            "generated_by": current_user.get("id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "report": report
        }
        await db.ai_analysis_history.insert_one(record)

        purchase_ids = [it.get("id") for it in items if it.get("id")]
        dates = [it.get("dateCreation", "") for it in items if it.get("dateCreation")]
        archive_record = {
            "id": str(uuid.uuid4()),
            "type": "purchase_report",
            "generated_by": current_user.get("id"),
            "generated_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "purchase_ids": purchase_ids,
            "purchase_count": len(items),
            "date_range": {"from": min(dates) if dates else "", "to": max(dates) if dates else ""},
            "analysis": report,
            "provider_used": used_provider,
            "model_used": used_model
        }
        await db.ai_purchase_archives.insert_one(archive_record)

        return {"success": True, "data": report, "archived": True}

    except json.JSONDecodeError:
        return {"success": False, "error": "L'IA a retourne un format invalide. Reessayez."}
    except Exception as e:
        logger.error(f"Erreur generation rapport achat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================
# Feature 3: Archives IA - CRUD
# ========================================================

@router.get("/archives")
async def list_purchase_archives(current_user: dict = Depends(get_current_user)):
    """Liste toutes les archives IA d'historique d'achat."""
    try:
        archives = await db.ai_purchase_archives.find({}, {"_id": 0}).sort("timestamp", -1).to_list(length=500)

        total_purchases_archived = set()
        for a in archives:
            total_purchases_archived.update(a.get("purchase_ids", []))

        total_purchases = await db.purchase_history.count_documents({})
        remaining = total_purchases - len(total_purchases_archived)

        return {
            "success": True,
            "data": archives,
            "stats": {
                "total_archives": len(archives),
                "total_purchases_archived": len(total_purchases_archived),
                "total_purchases": total_purchases,
                "remaining_to_analyze": max(0, remaining)
            }
        }
    except Exception as e:
        logger.error(f"Erreur listing archives achat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/archives/{archive_id}")
async def get_purchase_archive(archive_id: str, current_user: dict = Depends(get_current_user)):
    """Recupere une archive specifique."""
    try:
        archive = await db.ai_purchase_archives.find_one({"id": archive_id}, {"_id": 0})
        if not archive:
            raise HTTPException(status_code=404, detail="Archive non trouvee")
        return {"success": True, "data": archive}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur get archive achat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/archives/{archive_id}")
async def delete_purchase_archive(archive_id: str, current_user: dict = Depends(get_current_user)):
    """Supprime une archive (les achats pourront etre re-analyses)."""
    try:
        result = await db.ai_purchase_archives.delete_one({"id": archive_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Archive non trouvee")
        return {"success": True, "message": "Archive supprimee. Les achats pourront etre re-analyses."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur suppression archive achat: {e}")
        raise HTTPException(status_code=500, detail=str(e))
