"""
Module Analyse d'Accidents - Routes Backend
Arbre des causes, QQOQCP, 5 Pourquoi, Ishikawa, ALARM
avec questionnement IA et generation d'actions correctives
"""
from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_current_user
from datetime import datetime, timezone
from bson import ObjectId
import logging
import uuid
import json
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/accident-analysis", tags=["Analyse d'Accidents"])

db = None
audit_service = None

FALLBACK_CHAIN = [
    ("openai", "gpt-5.2"),
    ("gemini", "gemini-2.5-flash"),
    ("anthropic", "claude-sonnet-4-5-20250929"),
]


def init_accident_analysis_routes(database, audit_svc=None):
    global db, audit_service
    db = database
    audit_service = audit_svc


def clean_json(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return t.strip()


async def _get_llm_key():
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        gk = await db.global_settings.find_one({"key": "EMERGENT_LLM_KEY"})
        if gk and gk.get("value"):
            key = gk["value"]
    if not key:
        raise HTTPException(status_code=500, detail="Cle LLM non configuree")
    return key


async def _get_ai_config():
    """Recupere le modele IA configure pour les analyses d'accidents."""
    try:
        config = await db.global_settings.find_one({"key": "accident_analysis_ai_config"}, {"_id": 0})
        if config and config.get("value"):
            val = config["value"]
            return val.get("provider", "openai"), val.get("model", "gpt-5.2")
    except Exception:
        pass
    return "openai", "gpt-5.2"


async def _call_llm(session_id: str, system_message: str, user_text: str):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import asyncio

    api_key = await _get_llm_key()
    provider, model = await _get_ai_config()

    chain = [(provider, model)]
    for p, m in FALLBACK_CHAIN:
        if p != provider:
            chain.append((p, m))

    for prov, mod in chain:
        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"accident_{session_id}_{prov}",
                system_message=system_message
            ).with_model(prov, mod)

            response = await asyncio.wait_for(
                chat.send_message(UserMessage(text=user_text)),
                timeout=90
            )
            return response
        except Exception as e:
            logger.warning(f"[Accident IA] Echec {prov}/{mod}: {e}")

    raise HTTPException(status_code=500, detail="Tous les providers IA ont echoue")


def serialize_doc(doc):
    if doc and "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc


# =============================================
# CRUD Analyses
# =============================================

@router.get("")
async def list_analyses(current_user: dict = Depends(get_current_user)):
    cursor = db.accident_analyses.find(
        {"deleted": {"$ne": True}},
        {"_id": 1, "titre": 1, "date_accident": 1, "lieu": 1, "statut": 1,
         "created_at": 1, "created_by_name": 1, "gravite": 1, "phase_actuelle": 1}
    ).sort("created_at", -1)
    results = []
    async for doc in cursor:
        results.append(serialize_doc(doc))
    return results


@router.get("/{analysis_id}")
async def get_analysis(analysis_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id), "deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")
    return serialize_doc(doc)


@router.post("")
async def create_analysis(data: dict, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    analysis = {
        "titre": data.get("titre", ""),
        "date_accident": data.get("date_accident"),
        "lieu": data.get("lieu", ""),
        "description_initiale": data.get("description_initiale", ""),
        "gravite": data.get("gravite", "MOYENNE"),
        "personnes_impliquees": data.get("personnes_impliquees", []),
        "temoins": data.get("temoins", []),
        "statut": "EN_COURS",
        "phase_actuelle": "QQOQCP",
        # Phases
        "qqoqcp": {},
        "cinq_pourquoi": {"iterations": [], "cause_racine": ""},
        "ishikawa": {
            "main_oeuvre": [], "materiel": [], "methodes": [],
            "milieu": [], "matieres": []
        },
        "alarm": {
            "patient_facteurs": [], "taches_facteurs": [],
            "individus_facteurs": [], "equipe_facteurs": [],
            "environnement_facteurs": [], "organisation_facteurs": [],
            "contexte_facteurs": []
        },
        # Plan d'actions
        "actions_correctives": [],
        "ot_generes": [],
        "mp_generees": [],
        "checklists_generees": [],
        # Meta
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
        "deleted": False
    }
    result = await db.accident_analyses.insert_one(analysis)
    analysis["id"] = str(result.inserted_id)
    del analysis["_id"]
    return analysis


@router.put("/{analysis_id}")
async def update_analysis(analysis_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    data.pop("id", None)
    data.pop("_id", None)
    data["updated_at"] = datetime.now(timezone.utc)
    await db.accident_analyses.update_one(
        {"_id": ObjectId(analysis_id)},
        {"$set": data}
    )
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    return serialize_doc(doc)


@router.delete("/{analysis_id}")
async def delete_analysis(analysis_id: str, current_user: dict = Depends(get_current_user)):
    await db.accident_analyses.update_one(
        {"_id": ObjectId(analysis_id)},
        {"$set": {"deleted": True, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"status": "ok"}


# =============================================
# IA - Questionnement guide
# =============================================

SYSTEM_QQOQCP = """Tu es un expert en analyse d'accidents de maintenance industrielle.
Tu aides l'utilisateur a remplir la grille QQOQCP (Quoi, Qui, Ou, Quand, Comment, Pourquoi).
Pose des questions precises et concretes pour chaque categorie.
Reponds TOUJOURS en JSON avec ce format:
{"questions": [{"categorie": "QUOI|QUI|OU|QUAND|COMMENT|POURQUOI", "question": "...", "aide": "..."}], "synthese": "..."}"""

SYSTEM_5POURQUOI = """Tu es un expert en analyse de causes racines par la methode des 5 Pourquoi.
A chaque etape, tu analyses la reponse de l'utilisateur et tu poses le prochain "Pourquoi ?" pour remonter a la cause racine.
Tu dois identifier si la cause racine est atteinte (quand on ne peut plus remonter plus loin).
Reponds TOUJOURS en JSON:
{"pourquoi_suivant": "...", "est_cause_racine": false, "analyse": "...", "cause_racine_identifiee": null, "suggestions_pistes": ["..."]}
Si la cause racine est atteinte: {"est_cause_racine": true, "cause_racine_identifiee": "...", "analyse": "...", "recommandations": ["..."]}"""

SYSTEM_ISHIKAWA = """Tu es un expert en diagramme d'Ishikawa (5M) applique a la maintenance industrielle.
A partir de la description de l'accident et des informations collectees, identifie les causes potentielles dans chaque categorie des 5M:
- Main d'oeuvre (competences, formation, fatigue, experience)
- Materiel (etat, vetuste, conformite, disponibilite)
- Methodes (procedures, modes operatoires, consignation, habilitations)
- Milieu (conditions de travail, eclairage, bruit, temperature, proprete)
- Matieres (pieces detachees, produits utilises, qualite, disponibilite)
Reponds TOUJOURS en JSON:
{"main_oeuvre": [{"cause": "...", "detail": "..."}], "materiel": [...], "methodes": [...], "milieu": [...], "matieres": [...], "synthese": "..."}"""

SYSTEM_ALARM = """Tu es un expert en methode ALARM pour l'analyse approfondie des accidents.
Analyse les 7 facteurs contributifs de la grille ALARM:
1. Facteurs lies au patient/victime
2. Facteurs lies aux taches a accomplir
3. Facteurs lies aux individus (professionnels)
4. Facteurs lies a l'equipe
5. Facteurs lies a l'environnement de travail
6. Facteurs lies a l'organisation et au management
7. Facteurs lies au contexte institutionnel
Reponds TOUJOURS en JSON:
{"facteurs": [{"categorie": "...", "facteurs_identifies": [{"facteur": "...", "present": true/false, "commentaire": "..."}]}], "synthese": "...", "facteurs_critiques": ["..."]}"""

SYSTEM_ACTIONS = """Tu es un expert en maintenance industrielle et en prevention des accidents.
A partir de l'analyse complete d'un accident (QQOQCP, 5 Pourquoi, Ishikawa, ALARM), genere un plan d'actions correctives et preventives.
Chaque action doit etre concrete, assignable et mesurable.
Reponds TOUJOURS en JSON:
{"actions": [{"type": "OT_CORRECTIF|MAINTENANCE_PREVENTIVE|CHECKLIST", "titre": "...", "description": "...", "priorite": "URGENTE|HAUTE|MOYENNE|BASSE", "categorie_5m": "...", "delai_jours": 7}], "synthese": "..."}"""


@router.post("/{analysis_id}/ai/qqoqcp")
async def ai_qqoqcp(analysis_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    context = f"""Accident: {doc.get('titre', '')}
Description: {doc.get('description_initiale', '')}
Lieu: {doc.get('lieu', '')}
Date: {doc.get('date_accident', '')}
Informations supplementaires de l'utilisateur: {data.get('user_input', '')}"""

    response = await _call_llm(str(analysis_id), SYSTEM_QQOQCP, context)
    try:
        result = json.loads(clean_json(response))
    except json.JSONDecodeError:
        result = {"questions": [], "synthese": response}
    return result


@router.post("/{analysis_id}/ai/5pourquoi")
async def ai_5pourquoi(analysis_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    iterations = data.get("iterations", [])
    context = f"""Accident: {doc.get('titre', '')}
Description: {doc.get('description_initiale', '')}
QQOQCP: {json.dumps(doc.get('qqoqcp', {}), ensure_ascii=False)}

Historique des iterations:
"""
    for i, it in enumerate(iterations):
        context += f"Pourquoi {i+1}: {it.get('question', '')}\nReponse: {it.get('reponse', '')}\n"

    context += f"\nDerniere reponse de l'utilisateur: {data.get('derniere_reponse', '')}"

    response = await _call_llm(f"{analysis_id}_5p", SYSTEM_5POURQUOI, context)
    try:
        result = json.loads(clean_json(response))
    except json.JSONDecodeError:
        result = {"pourquoi_suivant": response, "est_cause_racine": False, "analyse": ""}
    return result


@router.post("/{analysis_id}/ai/ishikawa")
async def ai_ishikawa(analysis_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    context = f"""Accident: {doc.get('titre', '')}
Description: {doc.get('description_initiale', '')}
QQOQCP: {json.dumps(doc.get('qqoqcp', {}), ensure_ascii=False)}
Cause racine (5 Pourquoi): {doc.get('cinq_pourquoi', {}).get('cause_racine', '')}
Informations supplementaires: {data.get('user_input', '')}"""

    response = await _call_llm(f"{analysis_id}_ishi", SYSTEM_ISHIKAWA, context)
    try:
        result = json.loads(clean_json(response))
    except json.JSONDecodeError:
        result = {"main_oeuvre": [], "materiel": [], "methodes": [], "milieu": [], "matieres": [], "synthese": response}
    return result


@router.post("/{analysis_id}/ai/alarm")
async def ai_alarm(analysis_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    context = f"""Accident: {doc.get('titre', '')}
Description: {doc.get('description_initiale', '')}
QQOQCP: {json.dumps(doc.get('qqoqcp', {}), ensure_ascii=False)}
Cause racine: {doc.get('cinq_pourquoi', {}).get('cause_racine', '')}
Ishikawa: {json.dumps(doc.get('ishikawa', {}), ensure_ascii=False)}
Informations supplementaires: {data.get('user_input', '')}"""

    response = await _call_llm(f"{analysis_id}_alarm", SYSTEM_ALARM, context)
    try:
        result = json.loads(clean_json(response))
    except json.JSONDecodeError:
        result = {"facteurs": [], "synthese": response}
    return result


@router.post("/{analysis_id}/ai/generate-actions")
async def ai_generate_actions(analysis_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    context = f"""Analyse complete de l'accident:
Titre: {doc.get('titre', '')}
Description: {doc.get('description_initiale', '')}
Lieu: {doc.get('lieu', '')}
Gravite: {doc.get('gravite', '')}

QQOQCP: {json.dumps(doc.get('qqoqcp', {}), ensure_ascii=False)}
Cause racine (5 Pourquoi): {doc.get('cinq_pourquoi', {}).get('cause_racine', '')}
Iterations 5P: {json.dumps(doc.get('cinq_pourquoi', {}).get('iterations', []), ensure_ascii=False)}
Ishikawa (5M): {json.dumps(doc.get('ishikawa', {}), ensure_ascii=False)}
ALARM: {json.dumps(doc.get('alarm', {}), ensure_ascii=False)}

Genere des actions correctives et preventives concretes (OT correctifs, maintenances preventives, checklists)."""

    response = await _call_llm(f"{analysis_id}_actions", SYSTEM_ACTIONS, context)
    try:
        result = json.loads(clean_json(response))
    except json.JSONDecodeError:
        result = {"actions": [], "synthese": response}
    return result


# =============================================
# Generation d'OT / MP / Checklists
# =============================================

@router.post("/{analysis_id}/create-work-order")
async def create_work_order_from_analysis(analysis_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Cree un OT correctif a partir d'une action identifiee."""
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    now = datetime.now(timezone.utc)
    last_wo = await db.work_orders.find_one(sort=[("numero", -1)])
    next_num = (last_wo.get("numero", 5000) if last_wo else 5000) + 1

    wo = {
        "numero": next_num,
        "titre": data.get("titre", f"Correctif - {doc.get('titre', '')}"),
        "description": data.get("description", ""),
        "categorie": "TRAVAUX_CURATIF",
        "priorite": data.get("priorite", "HAUTE"),
        "statut": "OUVERT",
        "origine": "ANALYSE_ACCIDENT",
        "analyse_accident_id": analysis_id,
        "created_at": now,
        "updated_at": now,
        "createdBy": current_user.get("id"),
        "createdByName": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
        "attachments": [],
        "time_entries": [],
        "commentaires": [{"auteur": "Systeme", "texte": f"OT genere depuis l'analyse d'accident: {doc.get('titre', '')}", "date": now.isoformat()}]
    }
    result = await db.work_orders.insert_one(wo)
    wo_id = str(result.inserted_id)

    await db.accident_analyses.update_one(
        {"_id": ObjectId(analysis_id)},
        {"$push": {"ot_generes": {"ot_id": wo_id, "numero": next_num, "titre": wo["titre"], "created_at": now.isoformat()}}}
    )
    return {"id": wo_id, "numero": next_num, "titre": wo["titre"]}


@router.post("/{analysis_id}/create-preventive")
async def create_preventive_from_analysis(analysis_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Cree une maintenance preventive a partir d'une action identifiee."""
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    now = datetime.now(timezone.utc)
    mp = {
        "titre": data.get("titre", f"Prevention - {doc.get('titre', '')}"),
        "description": data.get("description", ""),
        "type_maintenance": "PREVENTIVE",
        "frequence": data.get("frequence", "MENSUELLE"),
        "priorite": data.get("priorite", "HAUTE"),
        "statut": "ACTIVE",
        "origine": "ANALYSE_ACCIDENT",
        "analyse_accident_id": analysis_id,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
    }
    result = await db.preventive_maintenance.insert_one(mp)
    mp_id = str(result.inserted_id)

    await db.accident_analyses.update_one(
        {"_id": ObjectId(analysis_id)},
        {"$push": {"mp_generees": {"mp_id": mp_id, "titre": mp["titre"], "created_at": now.isoformat()}}}
    )
    return {"id": mp_id, "titre": mp["titre"]}


@router.post("/{analysis_id}/create-checklist")
async def create_checklist_from_analysis(analysis_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Cree une checklist de prevention a partir d'une action identifiee."""
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    now = datetime.now(timezone.utc)
    checklist = {
        "titre": data.get("titre", f"Checklist prevention - {doc.get('titre', '')}"),
        "description": data.get("description", ""),
        "items": data.get("items", []),
        "type": "PREVENTION_ACCIDENT",
        "origine": "ANALYSE_ACCIDENT",
        "analyse_accident_id": analysis_id,
        "statut": "ACTIVE",
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
    }
    result = await db.checklists.insert_one(checklist)
    cl_id = str(result.inserted_id)

    await db.accident_analyses.update_one(
        {"_id": ObjectId(analysis_id)},
        {"$push": {"checklists_generees": {"checklist_id": cl_id, "titre": checklist["titre"], "created_at": now.isoformat()}}}
    )
    return {"id": cl_id, "titre": checklist["titre"]}


# =============================================
# Config IA pour ce module
# =============================================

@router.get("/settings/ai-config")
async def get_ai_config(current_user: dict = Depends(get_current_user)):
    config = await db.global_settings.find_one({"key": "accident_analysis_ai_config"}, {"_id": 0})
    if config and config.get("value"):
        return config["value"]
    return {"provider": "openai", "model": "gpt-5.2"}


@router.put("/settings/ai-config")
async def update_ai_config(data: dict, current_user: dict = Depends(get_current_user)):
    await db.global_settings.update_one(
        {"key": "accident_analysis_ai_config"},
        {"$set": {"key": "accident_analysis_ai_config", "value": {"provider": data.get("provider", "openai"), "model": data.get("model", "gpt-5.2")}}},
        upsert=True
    )
    return {"status": "ok", "provider": data.get("provider"), "model": data.get("model")}
