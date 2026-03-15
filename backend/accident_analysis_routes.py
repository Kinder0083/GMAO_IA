"""
Module Analyse d'Accidents - Routes Backend
Arbre des causes, QQOQCP, 5 Pourquoi, Ishikawa, ALARM
avec questionnement IA et generation d'actions correctives
"""
from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_current_user, get_current_user_optional
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
# Config IA pour ce module (AVANT les routes /{analysis_id})
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


# =============================================
# Config Admin - Methodes & ALARM
# =============================================

@router.get("/settings/methods-config")
async def get_methods_config(current_user: dict = Depends(get_current_user)):
    """Recuperer la config des methodes actives et de la grille ALARM"""
    config = await db.global_settings.find_one({"key": "accident_methods_config"}, {"_id": 0})
    if config and config.get("value"):
        return config["value"]
    # Defaults: toutes les methodes actives
    return {
        "methods": {
            "QQOQCP": True,
            "5POURQUOI": True,
            "ISHIKAWA": True,
            "ALARM": True
        },
        "alarm_custom_items": None  # null = utiliser les items par defaut du frontend
    }


@router.put("/settings/methods-config")
async def update_methods_config(data: dict, current_user: dict = Depends(get_current_user)):
    """Mettre a jour la config (admin uniquement)"""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Acces reserve aux administrateurs")
    
    await db.global_settings.update_one(
        {"key": "accident_methods_config"},
        {"$set": {"key": "accident_methods_config", "value": data}},
        upsert=True
    )
    return {"status": "ok"}


@router.get("/settings/alarm-items")
async def get_alarm_items(current_user: dict = Depends(get_current_user)):
    """Recuperer la config personnalisee des items ALARM"""
    config = await db.global_settings.find_one({"key": "accident_alarm_items"}, {"_id": 0})
    if config and config.get("value"):
        return config["value"]
    return None  # null = utiliser les items par defaut


@router.put("/settings/alarm-items")
async def update_alarm_items(data: dict, current_user: dict = Depends(get_current_user)):
    """Sauvegarder la config personnalisee des items ALARM (admin uniquement)"""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Acces reserve aux administrateurs")
    
    await db.global_settings.update_one(
        {"key": "accident_alarm_items"},
        {"$set": {"key": "accident_alarm_items", "value": data}},
        upsert=True
    )
    return {"status": "ok"}


@router.post("/settings/alarm-extract-document")
async def extract_alarm_from_document(current_user: dict = Depends(get_current_user)):
    """Extraire des items ALARM depuis un document uploade via IA"""
    from fastapi import Request
    import base64
    
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Acces reserve aux administrateurs")
    
    # On attend le body brut (fichier en base64 + metadata)
    return {"status": "endpoint_ready"}


from fastapi import UploadFile, File, Form

@router.post("/settings/alarm-import-document")
async def import_alarm_document(
    file: UploadFile = File(...),
    phase_id: str = Form(""),
    service_id: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Importer un document, l'analyser par IA et proposer des items ALARM"""
    if current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Acces reserve aux administrateurs")
    
    content = await file.read()
    
    # Decode text from common formats
    text_content = ""
    filename = file.filename.lower()
    
    if filename.endswith('.txt') or filename.endswith('.csv') or filename.endswith('.md'):
        text_content = content.decode('utf-8', errors='replace')
    elif filename.endswith('.pdf'):
        try:
            import PyPDF2
            import io
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in reader.pages:
                text_content += page.extract_text() + "\n"
        except Exception as e:
            logger.error(f"Erreur lecture PDF: {e}")
            text_content = f"[Erreur lecture PDF: {e}]"
    elif filename.endswith('.docx'):
        try:
            import docx
            import io
            doc = docx.Document(io.BytesIO(content))
            for para in doc.paragraphs:
                text_content += para.text + "\n"
        except Exception as e:
            logger.error(f"Erreur lecture DOCX: {e}")
            text_content = f"[Erreur lecture DOCX: {e}]"
    else:
        text_content = content.decode('utf-8', errors='replace')
    
    if not text_content.strip():
        raise HTTPException(status_code=400, detail="Impossible d'extraire du texte du document")
    
    # Truncate if too long
    if len(text_content) > 15000:
        text_content = text_content[:15000] + "\n...[tronque]"
    
    phase_context = f" pour la phase '{phase_id}'" if phase_id else ""
    service_context = f" et le service '{service_id}'" if service_id else ""
    
    system = """Tu es un expert en analyse ALARM (Association of Litigation And Risk Management) pour l'industrie.
A partir du document fourni, tu dois extraire des items pertinents pour la grille ALARM.
Chaque item doit avoir:
- id: identifiant unique (snake_case, sans accents)
- label: texte court affiché (max 30 caractères)
- tooltip: description explicative (1-2 phrases)
- active: true

Reponds UNIQUEMENT en JSON valide, format:
{"items": [{"id": "xxx", "label": "Xxx", "tooltip": "Description", "active": true}, ...]}"""
    
    user_msg = f"Extrais les items ALARM{phase_context}{service_context} depuis ce document:\n\n{text_content}"
    
    try:
        response = await _call_llm(f"alarm_import_{uuid.uuid4().hex[:8]}", system, user_msg)
        parsed = json.loads(clean_json(response))
        items = parsed.get("items", [])
        return {"items": items, "source_file": file.filename}
    except json.JSONDecodeError:
        return {"items": [], "raw_response": response, "source_file": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur IA: {str(e)}")


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

    # Construire les donnees ALARM depuis le nouveau format (grille) ou l'ancien
    alarm_data = doc.get('alarm_grille', {})
    if not alarm_data:
        alarm_data = doc.get('alarm', {})
    
    # Transformer alarm_grille en texte lisible pour l'IA
    alarm_text = ""
    if alarm_data and isinstance(alarm_data, dict):
        for phase_id, services in alarm_data.items():
            if isinstance(services, dict):
                for service_id, sdata in services.items():
                    if isinstance(sdata, dict):
                        checked = sdata.get('checked', [])
                        obs = sdata.get('observations', '')
                        if checked or obs:
                            alarm_text += f"\n  {phase_id}/{service_id}: {', '.join(checked)}"
                            if obs:
                                alarm_text += f" (Observations: {obs})"
    if not alarm_text:
        alarm_text = json.dumps(alarm_data, ensure_ascii=False)

    context = f"""Analyse complete de l'accident:
Titre: {doc.get('titre', '')}
Description: {doc.get('description_initiale', '')}
Lieu: {doc.get('lieu', '')}
Gravite: {doc.get('gravite', '')}

QQOQCP: {json.dumps(doc.get('qqoqcp', {}), ensure_ascii=False)}
Cause racine (5 Pourquoi): {doc.get('cinq_pourquoi', {}).get('cause_racine', '')}
Iterations 5P: {json.dumps(doc.get('cinq_pourquoi', {}).get('iterations', []), ensure_ascii=False)}
Ishikawa (5M): {json.dumps(doc.get('ishikawa', {}), ensure_ascii=False)}
ALARM (facteurs identifies): {alarm_text}

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
    # Handle both string and int numero fields for backward compatibility
    last_num = last_wo.get("numero", 5000) if last_wo else 5000
    if isinstance(last_num, str):
        try:
            last_num = int(last_num)
        except ValueError:
            last_num = 5000
    next_num = last_num + 1

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
    from dateutil.relativedelta import relativedelta
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    now = datetime.now(timezone.utc)
    freq = data.get("frequence", "MENSUEL")
    freq_map = {"HEBDOMADAIRE": relativedelta(weeks=1), "MENSUEL": relativedelta(months=1),
                "TRIMESTRIEL": relativedelta(months=3), "ANNUEL": relativedelta(years=1)}
    prochaine = now + freq_map.get(freq, relativedelta(months=1))

    mp = {
        "titre": data.get("titre", f"Prevention - {doc.get('titre', '')}"),
        "equipement_id": data.get("equipement_id", ""),
        "frequence": freq,
        "prochaineMaintenance": prochaine,
        "assigne_a_id": data.get("assigne_a_id"),
        "duree": data.get("duree", 1.0),
        "statut": "ACTIF",
        "dateCreation": now,
        "derniereMaintenance": None,
        "origine": "ANALYSE_ACCIDENT",
        "analyse_accident_id": analysis_id,
        "description": data.get("description", ""),
    }
    result = await db.preventive_maintenances.insert_one(mp)
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
# Rapport PDF
# =============================================

ISHIKAWA_LABELS = {
    "main_oeuvre": "Main d'oeuvre",
    "materiel": "Materiel",
    "methodes": "Methodes",
    "milieu": "Milieu",
    "matieres": "Matieres",
}

ALARM_LABELS = {
    "patient_facteurs": "Facteurs patient / victime",
    "taches_facteurs": "Facteurs taches",
    "individus_facteurs": "Facteurs individuels",
    "equipe_facteurs": "Facteurs equipe",
    "environnement_facteurs": "Facteurs environnement",
    "organisation_facteurs": "Facteurs organisation",
    "contexte_facteurs": "Facteurs contexte institutionnel",
}


def _build_pdf_html(analysis: dict, selected_action_indices: list = None) -> str:
    """Genere le HTML du rapport PDF pour une analyse d'accident"""
    titre = analysis.get("titre", "Analyse")
    date_acc = analysis.get("date_accident", "N/A")
    lieu = analysis.get("lieu", "N/A")
    gravite = analysis.get("gravite", "N/A")
    desc = analysis.get("description_initiale", "")
    created_by = analysis.get("created_by_name", "")

    # QQOQCP
    qqoqcp = analysis.get("qqoqcp", {})
    qqoqcp_html = ""
    for key, label in [("quoi","Quoi"), ("qui","Qui"), ("ou","Ou"), ("quand","Quand"), ("comment","Comment"), ("pourquoi","Pourquoi")]:
        val = qqoqcp.get(key, "")
        if val:
            qqoqcp_html += f"<tr><td class='label'>{label} ?</td><td>{val}</td></tr>"

    # 5 Pourquoi
    cinq_p = analysis.get("cinq_pourquoi", {})
    iterations = cinq_p.get("iterations", [])
    cause_racine = cinq_p.get("cause_racine", "")
    pourquoi_html = ""
    for i, it in enumerate(iterations):
        pourquoi_html += f"<tr><td class='label'>Pourquoi {i+1}</td><td>{it.get('reponse', '')}</td></tr>"
    if cause_racine:
        pourquoi_html += f"<tr class='highlight'><td class='label'>Cause racine</td><td><strong>{cause_racine}</strong></td></tr>"

    # Ishikawa
    ishikawa = analysis.get("ishikawa", {})
    ishikawa_html = ""
    for key, label in ISHIKAWA_LABELS.items():
        causes = ishikawa.get(key, [])
        if causes:
            items = ", ".join(c.get("cause", str(c)) if isinstance(c, dict) else str(c) for c in causes)
            ishikawa_html += f"<tr><td class='label'>{label}</td><td>{items}</td></tr>"

    # ALARM
    alarm = analysis.get("alarm", {})
    alarm_html = ""
    for key, label in ALARM_LABELS.items():
        factors = alarm.get(key, [])
        if factors:
            items = ", ".join(f.get("facteur", str(f)) if isinstance(f, dict) else str(f) for f in factors)
            alarm_html += f"<tr><td class='label'>{label}</td><td>{items}</td></tr>"

    # Actions correctives (filtrées si indices fournis)
    all_actions = analysis.get("actions_correctives", [])
    if selected_action_indices is not None:
        actions = [all_actions[i] for i in selected_action_indices if i < len(all_actions)]
    else:
        actions = all_actions

    actions_html = ""
    for i, a in enumerate(actions):
        prio = a.get("priorite", "")
        prio_class = "prio-haute" if prio in ("URGENTE", "HAUTE") else "prio-moyenne" if prio == "MOYENNE" else ""
        source = "Manuelle" if a.get("source") == "MANUELLE" else "IA"
        actions_html += f"""
        <tr>
            <td class='label'>{i+1}</td>
            <td>{a.get('titre', '')}</td>
            <td>{a.get('description', '')}</td>
            <td class='{prio_class}'>{prio}</td>
            <td>{(a.get('type', '') or '').replace('_', ' ')}</td>
            <td>{source}</td>
        </tr>"""

    # Elements generes
    generes_html = ""
    ot_gen = analysis.get("ot_generes", [])
    mp_gen = analysis.get("mp_generees", [])
    cl_gen = analysis.get("checklists_generees", [])
    if ot_gen or mp_gen or cl_gen:
        generes_html = "<h2>Elements generes dans la GMAO</h2><ul>"
        for ot in ot_gen:
            generes_html += f"<li><strong>OT</strong> #{ot.get('numero', '')} - {ot.get('titre', '')}</li>"
        for mp in mp_gen:
            generes_html += f"<li><strong>Maint. Prev.</strong> - {mp.get('titre', '')}</li>"
        for cl in cl_gen:
            generes_html += f"<li><strong>Checklist</strong> - {cl.get('titre', '')}</li>"
        generes_html += "</ul>"

    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rapport - {titre}</title>
<style>
  @media print {{
    body {{ margin: 0; }}
    .no-print {{ display: none !important; }}
    @page {{ margin: 15mm; size: A4; }}
  }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; padding: 20px; max-width: 900px; margin: 0 auto; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c2410c; padding-bottom: 12px; margin-bottom: 20px; }}
  .header h1 {{ font-size: 20pt; color: #c2410c; margin: 0; }}
  .header .meta {{ text-align: right; font-size: 9pt; color: #666; }}
  .badge {{ display: inline-block; padding: 2px 10px; border-radius: 4px; font-weight: bold; font-size: 9pt; }}
  .badge-gravite {{ background: #fef3c7; color: #92400e; }}
  .badge-gravite.CRITIQUE {{ background: #fee2e2; color: #991b1b; }}
  .badge-gravite.HAUTE {{ background: #ffedd5; color: #9a3412; }}
  h2 {{ font-size: 13pt; color: #c2410c; border-left: 4px solid #c2410c; padding-left: 10px; margin-top: 24px; margin-bottom: 10px; page-break-after: avoid; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 16px; }}
  table th, table td {{ border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; font-size: 10pt; }}
  table th {{ background: #f3f4f6; font-weight: 600; }}
  td.label {{ font-weight: 600; width: 180px; background: #fafafa; }}
  tr.highlight td {{ background: #ecfdf5; }}
  .prio-haute {{ color: #dc2626; font-weight: bold; }}
  .prio-moyenne {{ color: #d97706; }}
  .desc {{ background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 16px; }}
  .print-btn {{ position: fixed; top: 15px; right: 15px; padding: 10px 24px; background: #c2410c; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 11pt; z-index: 100; }}
  .print-btn:hover {{ background: #9a3412; }}
  .footer {{ margin-top: 30px; padding-top: 10px; border-top: 1px solid #d1d5db; font-size: 8pt; color: #999; text-align: center; }}
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Imprimer / PDF</button>

<div class="header">
  <div>
    <h1>Rapport d'Analyse d'Accident</h1>
    <p style="margin:4px 0 0;font-size:10pt;color:#666;">{titre}</p>
  </div>
  <div class="meta">
    <div><strong>Date accident :</strong> {date_acc}</div>
    <div><strong>Lieu :</strong> {lieu}</div>
    <div><strong>Gravite :</strong> <span class="badge badge-gravite {gravite}">{gravite}</span></div>
    <div><strong>Analyste :</strong> {created_by}</div>
    <div><strong>Rapport genere le :</strong> {now_str}</div>
  </div>
</div>

<div class="desc"><strong>Description :</strong> {desc}</div>

<h2>1. Methode QQOQCP</h2>
{"<table>" + qqoqcp_html + "</table>" if qqoqcp_html else "<p style='color:#999;'>Non renseigne</p>"}

<h2>2. Methode des 5 Pourquoi</h2>
{"<table>" + pourquoi_html + "</table>" if pourquoi_html else "<p style='color:#999;'>Non renseigne</p>"}

<h2>3. Diagramme d'Ishikawa (5M)</h2>
{"<table><tr><th>Categorie</th><th>Causes identifiees</th></tr>" + ishikawa_html + "</table>" if ishikawa_html else "<p style='color:#999;'>Non renseigne</p>"}

<h2>4. Grille ALARM</h2>
{"<table><tr><th>Categorie</th><th>Facteurs identifies</th></tr>" + alarm_html + "</table>" if alarm_html else "<p style='color:#999;'>Non renseigne</p>"}

<h2>5. Actions correctives et preventives retenues</h2>
{"<table><tr><th>#</th><th>Action</th><th>Description</th><th>Priorite</th><th>Type</th><th>Source</th></tr>" + actions_html + "</table>" if actions_html else "<p style='color:#999;'>Aucune action</p>"}

{generes_html}

<div class="footer">
  FSAO Iris - Rapport d'analyse d'accident genere automatiquement le {now_str}
</div>
</body>
</html>"""
    return html


@router.get("/{analysis_id}/pdf")
async def generate_analysis_pdf(
    analysis_id: str,
    token: str = None,
    actions: str = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """Generer le rapport HTML/PDF pour une analyse d'accident"""
    from fastapi.responses import HTMLResponse
    from auth import decode_access_token

    # Auth via Bearer OU token query param
    if not current_user and token:
        payload = decode_access_token(token)
        if payload is None:
            raise HTTPException(status_code=401, detail="Token invalide ou expire")
    elif not current_user and not token:
        raise HTTPException(status_code=401, detail="Non authentifie")

    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id), "deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    selected = None
    if actions:
        try:
            selected = [int(i) for i in actions.split(",")]
        except ValueError:
            pass

    html = _build_pdf_html(doc, selected)
    return HTMLResponse(content=html)


@router.post("/{analysis_id}/archive-pdf")
async def archive_analysis_pdf(
    analysis_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Archiver un rapport PDF (stocker les metadonnees du rapport genere)"""
    doc = await db.accident_analyses.find_one({"_id": ObjectId(analysis_id), "deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Analyse non trouvee")

    now = datetime.now(timezone.utc)
    rapport = {
        "id": str(uuid.uuid4())[:8],
        "generated_at": now.isoformat(),
        "generated_by": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
        "generated_by_id": current_user.get("id"),
        "selected_actions": data.get("selected_actions", []),
        "total_actions": len(doc.get("actions_correctives", [])),
        "retained_actions": len(data.get("selected_actions", []))
    }

    await db.accident_analyses.update_one(
        {"_id": ObjectId(analysis_id)},
        {
            "$push": {"rapports_pdf": rapport},
            "$set": {"updated_at": now}
        }
    )
    return rapport
