"""
Routes IA pour les Presqu'accidents
- Feature 1: Analyse IA des causes racines (traitement)
- Feature 2: Détection d'incidents similaires (création)
- Feature 3: Analyse IA des tendances globales (rapport)
- Feature 4: Génération de rapport de synthèse QHSE
"""
from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_current_user
from datetime import datetime, timezone, timedelta
import logging
import uuid
import json
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-presqu-accident", tags=["IA Presqu'accidents"])

db = None
audit_service = None


def init_ai_pa_routes(database, audit_svc):
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


# Providers supportes par emergentintegrations avec fallback
FALLBACK_CHAIN = [
    ("gemini", "gemini-2.5-flash"),
    ("openai", "gpt-4o-mini"),
    ("anthropic", "claude-sonnet-4-5"),
]


async def _get_llm_key():
    """Recupere la cle LLM depuis l'env ou la DB global_settings."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        gk = await db.global_settings.find_one({"key": "EMERGENT_LLM_KEY"})
        if gk and gk.get("value"):
            key = gk["value"]
    if not key:
        raise HTTPException(status_code=500, detail="Cle LLM non configuree")
    return key


async def _get_user_ai_config(user_id: str):
    """Recupere le provider/model prefere de l'utilisateur depuis ses preferences."""
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


async def _call_llm_with_fallback(api_key: str, session_id: str, system_message: str,
                                   user_text: str, preferred_provider: str, preferred_model: str):
    """Appelle le LLM avec fallback automatique si le provider prefere echoue."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import asyncio as _asyncio

    # Construire la chaine: provider prefere en premier, puis les fallbacks
    chain = [(preferred_provider, preferred_model)]
    for prov, mod in FALLBACK_CHAIN:
        if prov != preferred_provider:
            chain.append((prov, mod))

    last_error = None
    for provider, model in chain:
        try:
            logger.info(f"[IA PA] Essai {provider}/{model}...")
            chat = LlmChat(
                api_key=api_key,
                session_id=f"{session_id}_{provider}",
                system_message=system_message
            ).with_model(provider, model)

            response = await _asyncio.wait_for(
                chat.send_message(UserMessage(text=user_text)),
                timeout=90
            )
            logger.info(f"[IA PA] Succes avec {provider}/{model}")
            return response, provider, model

        except _asyncio.TimeoutError:
            last_error = f"Timeout avec {provider}/{model}"
            logger.warning(f"[IA PA] {last_error}")
        except Exception as e:
            last_error = f"{provider}/{model}: {str(e)}"
            logger.warning(f"[IA PA] Echec {last_error}")

    raise Exception(f"Tous les providers IA ont echoue. Derniere erreur: {last_error}")


# ========================================================
# Feature 1: Analyse IA des causes racines
# ========================================================

@router.post("/analyze-root-causes")
async def analyze_root_causes(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Analyse IA des causes racines d'un presqu'accident.
    Utilise la méthode 5 Pourquoi + Ishikawa pour proposer
    des causes racines, actions préventives et évaluation sévérité/récurrence.
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = await _get_llm_key()

        item_id = data.get("item_id")
        if not item_id:
            raise HTTPException(status_code=400, detail="item_id requis")

        item = await db.presqu_accident_items.find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Presqu'accident non trouvé")

        # Chercher des incidents similaires dans l'historique pour enrichir l'analyse
        similar_items = await db.presqu_accident_items.find(
            {"id": {"$ne": item_id}},
            {"_id": 0, "titre": 1, "description": 1, "lieu": 1, "service": 1,
             "categorie_incident": 1, "contexte_cause": 1, "actions_preventions": 1,
             "severite": 1, "status": 1}
        ).to_list(length=100)

        history_context = ""
        if similar_items:
            history_context = f"\n\nHISTORIQUE DES {len(similar_items)} AUTRES INCIDENTS:\n"
            for si in similar_items[:30]:
                history_context += f"- {si.get('titre','')} | Lieu: {si.get('lieu','')} | Service: {si.get('service','')} | Catégorie: {si.get('categorie_incident','')} | Sévérité: {si.get('severite','')} | Actions: {si.get('actions_preventions','')}\n"

        incident_text = f"""
INCIDENT À ANALYSER:
Titre: {item.get('titre', '')}
Description: {item.get('description', '')}
Date: {item.get('date_incident', '')}
Lieu: {item.get('lieu', '')}
Service: {item.get('service', '')}
Catégorie: {item.get('categorie_incident', '')}
Équipement: {item.get('equipement_nom', '')}
Contexte/Cause déclarée: {item.get('contexte_cause', '')}
Mesures immédiates: {item.get('mesures_immediates', '')}
Sévérité déclarée: {item.get('severite', '')}
Type lésion potentielle: {item.get('type_lesion_potentielle', '')}
Facteurs contributifs déclarés: {', '.join(item.get('facteurs_contributifs', []))}
Conditions: {item.get('conditions_incident', '')}
Actions proposées par déclarant: {item.get('actions_proposees', '')}
{history_context}
"""

        chat = LlmChat(
            api_key=api_key,
            session_id=f"rca_{uuid.uuid4().hex[:8]}",
            system_message="""Tu es un expert QHSE et en analyse d'accidents industriels.
Analyse le presqu'accident fourni en utilisant les méthodes 5 Pourquoi et Ishikawa.
Prends en compte l'historique des incidents si disponible pour identifier les récurrences.

Réponds UNIQUEMENT avec un JSON valide, sans texte autour ni backticks.

Format attendu:
{
  "analyse_5_pourquoi": [
    {"niveau": 1, "pourquoi": "string - question", "reponse": "string - réponse"},
    {"niveau": 2, "pourquoi": "string", "reponse": "string"},
    {"niveau": 3, "pourquoi": "string", "reponse": "string"},
    {"niveau": 4, "pourquoi": "string", "reponse": "string"},
    {"niveau": 5, "pourquoi": "string", "reponse": "string - cause racine"}
  ],
  "diagramme_ishikawa": {
    "main_effect": "string - l'incident",
    "causes": {
      "Milieu": ["string - cause liée à l'environnement de travail"],
      "Matériel": ["string - cause liée aux équipements/outils"],
      "Méthode": ["string - cause liée aux procédures/process"],
      "Main d'oeuvre": ["string - cause liée au facteur humain"],
      "Matière": ["string - cause liée aux matériaux/produits"],
      "Management": ["string - cause liée à l'organisation/supervision"]
    }
  },
  "cause_racine_principale": "string - la cause racine identifiée",
  "causes_secondaires": ["string - autres causes contributives"],
  "actions_preventives": [
    {
      "action": "string - description de l'action",
      "priorite": "HAUTE|MOYENNE|BASSE",
      "type": "TECHNIQUE|ORGANISATIONNEL|HUMAIN|ENVIRONNEMENTAL",
      "delai_recommande": "string - ex: Immédiat, 1 semaine, 1 mois"
    }
  ],
  "evaluation_risque": {
    "severite_recommandee": "1|2|3|4",
    "recurrence_estimee": "1|2|3|4",
    "justification": "string - pourquoi ces scores"
  },
  "incidents_similaires_identifies": "string - patterns récurrents identifiés dans l'historique",
  "recommandations_generales": "string - recommandations de fond"
}"""
        ).with_model("gemini", "gemini-2.5-flash")

        response = await chat.send_message(UserMessage(
            text=f"Analyse les causes racines de cet incident et propose des actions correctives:\n{incident_text}"
        ))

        cleaned = clean_json_response(response)
        analysis = json.loads(cleaned)

        # Sauvegarder l'analyse
        record = {
            "id": str(uuid.uuid4()),
            "type": "root_cause_analysis",
            "item_id": item_id,
            "analyzed_by": current_user.get("id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "analysis": analysis
        }
        await db.ai_analysis_history.insert_one(record)

        return {"success": True, "data": analysis}

    except json.JSONDecodeError as e:
        logger.error(f"Erreur parsing JSON IA: {e}")
        return {"success": False, "error": "L'IA a retourné un format invalide. Réessayez."}
    except Exception as e:
        logger.error(f"Erreur analyse causes racines: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================
# Feature 2: Détection d'incidents similaires
# ========================================================

@router.post("/find-similar")
async def find_similar_incidents(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Recherche des incidents similaires dans l'historique en utilisant l'IA
    pour comparer le texte de description, lieu, service et catégorie.
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = await _get_llm_key()

        titre = data.get("titre", "")
        description = data.get("description", "")
        lieu = data.get("lieu", "")
        service = data.get("service", "")
        categorie = data.get("categorie_incident", "")

        if not description and not titre:
            return {"success": True, "data": {"similar_incidents": [], "message": "Pas assez d'informations"}}

        # Récupérer tous les incidents existants
        existing = await db.presqu_accident_items.find(
            {},
            {"_id": 0, "id": 1, "numero": 1, "titre": 1, "description": 1, "lieu": 1,
             "service": 1, "categorie_incident": 1, "date_incident": 1, "severite": 1,
             "status": 1, "actions_preventions": 1, "actions_proposees": 1,
             "contexte_cause": 1, "equipement_nom": 1}
        ).to_list(length=200)

        if not existing:
            return {"success": True, "data": {"similar_incidents": [], "message": "Aucun historique disponible"}}

        incidents_text = "\n".join([
            f"ID:{it.get('id')} | N°:{it.get('numero')} | Titre:{it.get('titre')} | "
            f"Desc:{it.get('description','')} | Lieu:{it.get('lieu','')} | "
            f"Service:{it.get('service','')} | Cat:{it.get('categorie_incident','')} | "
            f"Sévérité:{it.get('severite','')} | Statut:{it.get('status','')} | "
            f"Cause:{it.get('contexte_cause','')} | Equipement:{it.get('equipement_nom','')} | "
            f"Actions:{it.get('actions_preventions','') or it.get('actions_proposees','')}"
            for it in existing
        ])

        chat = LlmChat(
            api_key=api_key,
            session_id=f"similar_{uuid.uuid4().hex[:8]}",
            system_message="""Tu es un expert en sécurité industrielle. On te donne un nouvel incident et un historique.
Identifie les incidents similaires ou liés (même type de risque, même lieu, même équipement, mêmes causes).

Réponds UNIQUEMENT avec un JSON valide, sans texte autour ni backticks.

Format:
{
  "similar_incidents": [
    {
      "id": "string - ID de l'incident similaire",
      "numero": "string - numéro",
      "titre": "string - titre",
      "similarity_score": 85,
      "raison_similarite": "string - pourquoi cet incident est similaire",
      "actions_deja_prises": "string - actions qui avaient été prises",
      "lecons_a_retenir": "string - ce qu'on peut apprendre de cet incident"
    }
  ],
  "patterns_identifies": "string - si des patterns récurrents sont identifiés",
  "recommandation": "string - recommandation basée sur l'historique"
}

Classe par score de similarité décroissant. Ne retourne que les incidents avec un score >= 40.
Maximum 5 incidents similaires."""
        ).with_model("gemini", "gemini-2.5-flash")

        response = await chat.send_message(UserMessage(
            text=f"""NOUVEL INCIDENT:
Titre: {titre}
Description: {description}
Lieu: {lieu}
Service: {service}
Catégorie: {categorie}

HISTORIQUE DES INCIDENTS:
{incidents_text}"""
        ))

        cleaned = clean_json_response(response)
        result = json.loads(cleaned)

        return {"success": True, "data": result}

    except json.JSONDecodeError:
        return {"success": True, "data": {"similar_incidents": [], "message": "Analyse non concluante"}}
    except Exception as e:
        logger.error(f"Erreur recherche incidents similaires: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================
# Feature 3: Analyse IA des tendances globales
# ========================================================

@router.post("/analyze-trends")
async def analyze_trends(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Analyse globale IA de tous les presqu'accidents pour détecter
    les tendances, zones à risque, et prédire les risques futurs.
    """
    try:
        api_key = await _get_llm_key()
        pref_provider, pref_model = await _get_user_ai_config(current_user.get("id"))

        days = data.get("days", 365)

        # Limiter a 150 incidents (les plus recents) pour eviter depassement tokens
        items = await db.presqu_accident_items.find(
            {},
            {"_id": 0}
        ).sort("created_at", -1).to_list(length=150)

        if len(items) < 2:
            return {"success": False, "error": "Pas assez de données pour une analyse (minimum 2 incidents)"}

        # Preparer le contexte (format compact)
        incidents_detail = []
        for it in items:
            incidents_detail.append(
                f"N°:{it.get('numero')} | Date:{it.get('date_incident')} | "
                f"Titre:{it.get('titre')} | Desc:{it.get('description','')[:100]} | "
                f"Lieu:{it.get('lieu','')} | Service:{it.get('service','')} | "
                f"Cat:{it.get('categorie_incident','')} | Sévérité:{it.get('severite','')} | "
                f"Statut:{it.get('status','')} | Cause:{it.get('contexte_cause','')[:80]}"
            )

        system_msg = """Tu es un expert QHSE en analyse de données de sécurité industrielle.
Analyse l'ensemble des presqu'accidents pour identifier les tendances, patterns récurrents,
zones à risque et prédire les risques futurs.

Réponds UNIQUEMENT avec un JSON valide, sans texte autour ni backticks.

Format:
{
  "summary": "string - résumé en 2-3 phrases de la situation globale",
  "tendance_globale": "DEGRADATION|STABLE|AMELIORATION",
  "kpi": {
    "total_incidents": 0,
    "taux_traitement": "string - % d'incidents traités",
    "severite_moyenne": "string",
    "categories_les_plus_frequentes": ["string"],
    "services_les_plus_touches": ["string"]
  },
  "patterns_recurrents": [
    {
      "pattern": "string - description du pattern",
      "severity": "CRITIQUE|IMPORTANT|MODERE",
      "occurrences": 0,
      "lieux_concernes": ["string"],
      "services_concernes": ["string"],
      "cause_probable": "string",
      "recommandation": "string - action recommandée"
    }
  ],
  "zones_a_risque": [
    {
      "zone": "string - lieu ou zone",
      "niveau_risque": "ELEVE|MOYEN|FAIBLE",
      "nombre_incidents": 0,
      "types_incidents": ["string"],
      "recommandation": "string"
    }
  ],
  "predictions": [
    {
      "risque": "string - description du risque prédit",
      "probabilite": "HAUTE|MOYENNE|BASSE",
      "zone_concernee": "string",
      "justification": "string",
      "action_preventive": "string"
    }
  ],
  "facteurs_analyse": {
    "humain": {"count": 0, "description": "string"},
    "materiel": {"count": 0, "description": "string"},
    "organisationnel": {"count": 0, "description": "string"},
    "environnemental": {"count": 0, "description": "string"}
  },
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
            session_id=f"trends_{uuid.uuid4().hex[:8]}",
            system_message=system_msg,
            user_text=f"Analyse ces {len(items)} presqu'accidents et identifie les tendances:\n\n" +
                       "\n".join(incidents_detail),
            preferred_provider=pref_provider,
            preferred_model=pref_model
        )

        cleaned = clean_json_response(response)
        analysis = json.loads(cleaned)

        # Sauvegarder
        record = {
            "id": str(uuid.uuid4()),
            "type": "pa_trend_analysis",
            "analyzed_by": current_user.get("id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_incidents": len(items),
            "period_days": days,
            "analysis": analysis
        }
        await db.ai_analysis_history.insert_one(record)

        # Alertes si patterns critiques
        notifications_sent = []
        critical_patterns = [
            p for p in analysis.get("patterns_recurrents", [])
            if p.get("severity") in ("CRITIQUE", "IMPORTANT")
        ]

        if critical_patterns:
            notifications_sent = await _send_pa_critical_alerts(
                analysis=analysis,
                critical_patterns=critical_patterns,
                total_incidents=len(items),
                analyzed_by_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
            )

        return {
            "success": True,
            "data": analysis,
            "stats": {"total_incidents": len(items), "period_days": days},
            "notifications_sent": notifications_sent
        }

    except json.JSONDecodeError:
        return {"success": False, "error": "L'IA a retourné un format invalide. Réessayez."}
    except Exception as e:
        logger.error(f"Erreur analyse tendances PA: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _send_pa_critical_alerts(analysis, critical_patterns, total_incidents, analyzed_by_name):
    """Envoie des alertes aux responsables de service pour les patterns PA critiques."""
    from email_service import send_critical_nc_alert_email
    notifications_sent = []

    try:
        services_to_notify = set()
        for p in critical_patterns:
            for s in p.get("services_concernes", []):
                services_to_notify.add(s)

        if not services_to_notify:
            all_resps = await db.service_responsables.find({}, {"_id": 0}).to_list(50)
            services_to_notify = {r.get("service") for r in all_resps if r.get("service")}

        for service_name in services_to_notify:
            responsable = await db.service_responsables.find_one(
                {"service": {"$regex": f"^{service_name}$", "$options": "i"}},
                {"_id": 0}
            )
            if not responsable:
                continue

            user_id = responsable.get("user_id")
            from bson import ObjectId
            user = None
            try:
                user = await db.users.find_one({"_id": ObjectId(user_id)}, {"_id": 0, "email": 1, "prenom": 1, "nom": 1})
            except Exception:
                pass
            if not user:
                user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "prenom": 1, "nom": 1})

            if not user or not user.get("email"):
                continue

            full_name = f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or responsable.get("user_name", "")

            notification = {
                "id": str(uuid.uuid4()),
                "type": "ai_pa_critical_alert",
                "title": f"Alerte Presqu'accidents - {service_name}",
                "message": f"L'analyse IA a détecté {len(critical_patterns)} tendance(s) critique(s). {analysis.get('summary', '')}",
                "severity": "CRITICAL",
                "user_id": user_id,
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source": "ai_pa_trend_analysis"
            }
            await db.notifications.insert_one(notification)

            email_sent = send_critical_nc_alert_email(
                to_email=user["email"],
                responsable_name=full_name,
                service_name=service_name,
                analysis_summary=analysis.get("summary", ""),
                critical_patterns=critical_patterns,
                equipements_a_risque=analysis.get("zones_a_risque", []),
                work_orders_suggested=analysis.get("recommandations_prioritaires", []),
                stats={"total_executions": total_incidents, "total_non_conformities": len(critical_patterns)}
            )

            notifications_sent.append({
                "service": service_name,
                "responsable": full_name,
                "email": user["email"],
                "email_sent": email_sent,
                "notification_created": True
            })

    except Exception as e:
        logger.error(f"Erreur alertes PA: {e}")

    return notifications_sent


# ========================================================
# Feature 4: Génération de rapport de synthèse QHSE
# ========================================================

@router.post("/generate-report")
async def generate_qhse_report(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Génère un rapport de synthèse QHSE structuré prêt pour présentation en réunion.
    """
    try:
        api_key = await _get_llm_key()
        pref_provider, pref_model = await _get_user_ai_config(current_user.get("id"))

        days = data.get("days", 365)

        # Limiter a 150 incidents (les plus recents) pour eviter depassement tokens
        items = await db.presqu_accident_items.find(
            {},
            {"_id": 0}
        ).sort("created_at", -1).to_list(length=150)

        if not items:
            return {"success": False, "error": "Aucun presqu'accident enregistré"}

        # Stats de base
        total = len(items)
        traites = sum(1 for i in items if i.get("status") in ("TERMINE", "RISQUE_RESIDUEL"))
        en_cours = sum(1 for i in items if i.get("status") == "EN_COURS")
        a_traiter = sum(1 for i in items if i.get("status") == "A_TRAITER")
        en_retard = sum(1 for i in items if i.get("status") == "EN_RETARD")

        incidents_detail = []
        for it in items:
            incidents_detail.append(
                f"N°:{it.get('numero')} | Date:{it.get('date_incident')} | "
                f"Titre:{it.get('titre')} | Lieu:{it.get('lieu','')} | "
                f"Service:{it.get('service','')} | Cat:{it.get('categorie_incident','')} | "
                f"Sévérité:{it.get('severite','')} | Statut:{it.get('status','')} | "
                f"Cause:{it.get('contexte_cause','')[:80]}"
            )

        system_msg = """Tu es un expert QHSE. Génère un rapport de synthèse structuré et professionnel
pour une réunion de comité QHSE. Le rapport doit être clair, factuel et orienté actions.

Réponds UNIQUEMENT avec un JSON valide, sans texte autour ni backticks.

Format:
{
  "titre_rapport": "string - ex: Synthèse Presqu'accidents - Février 2026",
  "date_generation": "string - date du jour",
  "resume_executif": "string - paragraphe de synthèse pour le management (3-5 phrases)",
  "indicateurs_cles": {
    "total_incidents": 0,
    "taux_traitement_pct": 0,
    "en_retard": 0,
    "tendance": "HAUSSE|STABLE|BAISSE",
    "commentaire_tendance": "string"
  },
  "analyse_par_service": [
    {
      "service": "string",
      "nombre": 0,
      "severite_dominante": "string",
      "problematique_principale": "string"
    }
  ],
  "analyse_par_categorie": [
    {
      "categorie": "string",
      "nombre": 0,
      "evolution": "string"
    }
  ],
  "top_risques": [
    {
      "rang": 1,
      "risque": "string - description",
      "gravite": "CRITIQUE|IMPORTANT|MODERE|FAIBLE",
      "localisation": "string",
      "statut_traitement": "string"
    }
  ],
  "actions_en_cours": [
    {
      "action": "string",
      "responsable_service": "string",
      "statut": "string",
      "efficacite": "string"
    }
  ],
  "plan_action_propose": [
    {
      "action": "string - action concrète à proposer en réunion",
      "priorite": "1|2|3",
      "responsable_suggere": "string - service",
      "echeance_suggeree": "string",
      "resultat_attendu": "string"
    }
  ],
  "conclusion": "string - conclusion et message pour le prochain mois",
  "points_de_vigilance": ["string - points à surveiller particulièrement"]
}"""

        user_text = f"""Génère le rapport de synthèse QHSE pour ces {total} presqu'accidents.
Statistiques: {traites} traités, {en_cours} en cours, {a_traiter} à traiter, {en_retard} en retard.

DÉTAIL DES INCIDENTS:
{chr(10).join(incidents_detail)}"""

        response, used_provider, used_model = await _call_llm_with_fallback(
            api_key=api_key,
            session_id=f"report_{uuid.uuid4().hex[:8]}",
            system_message=system_msg,
            user_text=user_text,
            preferred_provider=pref_provider,
            preferred_model=pref_model
        )

        cleaned = clean_json_response(response)
        report = json.loads(cleaned)

        # Sauvegarder
        record = {
            "id": str(uuid.uuid4()),
            "type": "pa_qhse_report",
            "generated_by": current_user.get("id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "report": report
        }
        await db.ai_analysis_history.insert_one(record)

        return {"success": True, "data": report}

    except json.JSONDecodeError:
        return {"success": False, "error": "L'IA a retourné un format invalide. Réessayez."}
    except Exception as e:
        logger.error(f"Erreur génération rapport QHSE: {e}")
        raise HTTPException(status_code=500, detail=str(e))
