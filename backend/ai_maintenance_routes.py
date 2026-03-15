"""
Routes IA pour les Checklists et la Maintenance Préventive
- Feature 1: Génération IA de checklists depuis documentation technique
- Feature 2: Génération IA de programme de maintenance préventive
- Feature 3: Analyse IA des non-conformités récurrentes
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from dependencies import get_current_user
from typing import Optional
from datetime import datetime, timezone
import logging
import uuid
import json
import os
import tempfile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-maintenance", tags=["IA Maintenance"])

db = None
audit_service = None


def init_ai_maintenance_routes(database, audit_svc):
    global db, audit_service
    db = database
    audit_service = audit_svc


def clean_json_response(text: str) -> str:
    """Nettoie la réponse JSON de l'IA (supprime backticks, etc.)"""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return t.strip()


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


# ========================================================
# Feature 1: Génération IA de checklists
# ========================================================

@router.post("/generate-checklist")
async def generate_checklist_from_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)  # Placeholder, remplacé à l'init
):
    """
    Upload un document technique (PDF, image) et l'IA génère un template de checklist
    avec les points de contrôle extraits.
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

        api_key = await _get_llm_key()

        ext = os.path.splitext(file.filename)[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        mime_map = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp"
        }
        mime_type = mime_map.get(ext, "application/pdf")

        chat = LlmChat(
            api_key=api_key,
            session_id=f"checklist_gen_{uuid.uuid4().hex[:8]}",
            system_message="""Tu es un expert en maintenance industrielle et en création de checklists de contrôle préventif.
Analyse le document technique fourni (manuel constructeur, fiche technique, notice de maintenance, norme, etc.)
et génère une checklist complète de points de contrôle.

Réponds UNIQUEMENT avec un JSON valide, sans texte autour ni backticks.

Format attendu:
{
  "document_info": {
    "titre": "string - titre ou objet du document",
    "equipement": "string - nom/type de l'équipement concerné",
    "fabricant": "string - fabricant/marque ou null",
    "reference": "string - référence du document ou null"
  },
  "checklists": [
    {
      "name": "string - nom descriptif de la checklist (ex: 'Contrôle mensuel compresseur Atlas Copco GA30')",
      "description": "string - description de l'objectif de cette checklist",
      "frequence_recommandee": "string - fréquence de contrôle recommandée (ex: 'Mensuel', 'Trimestriel', 'Annuel')",
      "items": [
        {
          "label": "string - libellé précis du point de contrôle",
          "type": "YES_NO|NUMERIC|TEXT",
          "unit": "string ou null - unité pour NUMERIC (°C, bar, mm, etc.)",
          "min_value": "number ou null - valeur min pour NUMERIC",
          "max_value": "number ou null - valeur max pour NUMERIC",
          "expected_value": "number ou null - valeur attendue pour NUMERIC",
          "instructions": "string ou null - instructions détaillées pour effectuer le contrôle",
          "required": true
        }
      ]
    }
  ],
  "notes_supplementaires": "string - recommandations générales de maintenance"
}

IMPORTANT:
- Crée des items précis et actionnables (pas de descriptions vagues)
- Utilise NUMERIC avec unités et seuils quand des valeurs mesurables sont mentionnées
- Utilise YES_NO pour les vérifications visuelles ou de présence
- Utilise TEXT pour les relevés de numéros de série, observations, etc.
- Groupe les items par thème logique si le document couvre plusieurs aspects
- Si le document mentionne plusieurs fréquences de maintenance, crée une checklist par fréquence"""
        ).with_model("gemini", "gemini-2.5-flash")

        file_content = FileContentWithMimeType(file_path=tmp_path, mime_type=mime_type)
        response = await chat.send_message(UserMessage(
            text="Analyse ce document technique et génère des checklists de contrôle préventif détaillées.",
            file_contents=[file_content]
        ))

        os.unlink(tmp_path)
        response_text = clean_json_response(response)
        extracted = json.loads(response_text)

        return {
            "success": True,
            "data": extracted,
            "source_filename": file.filename
        }

    except json.JSONDecodeError:
        logger.error("Erreur parsing JSON checklist IA")
        return {"success": False, "error": "L'IA n'a pas pu extraire les informations correctement. Réessayez."}
    except Exception as e:
        logger.error(f"Erreur génération checklist IA: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": f"Erreur lors de l'analyse: {str(e)}"}


@router.post("/create-checklists-batch")
async def create_checklists_batch(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Crée les checklists templates à partir des données extraites par l'IA."""
    try:
        checklists_data = data.get("checklists", [])
        created = []
        
        for cl in checklists_data:
            items = []
            for i, item in enumerate(cl.get("items", [])):
                items.append({
                    "id": str(uuid.uuid4()),
                    "label": item.get("label", ""),
                    "type": item.get("type", "YES_NO"),
                    "order": i,
                    "required": item.get("required", True),
                    "unit": item.get("unit"),
                    "min_value": item.get("min_value"),
                    "max_value": item.get("max_value"),
                    "expected_value": item.get("expected_value"),
                    "instructions": item.get("instructions")
                })
            
            template = {
                "id": str(uuid.uuid4()),
                "name": cl.get("name", "Checklist IA"),
                "description": cl.get("description", ""),
                "equipment_ids": [],
                "items": items,
                "is_template": True,
                "created_by_id": current_user.get("id"),
                "created_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "source": "ai_generated",
                "frequence_recommandee": cl.get("frequence_recommandee"),
                "source_filename": data.get("source_filename")
            }
            
            await db.checklist_templates.insert_one(template)
            template.pop("_id", None)
            created.append(template)
        
        return {
            "success": True,
            "created_count": len(created),
            "checklists": created
        }
    except Exception as e:
        logger.error(f"Erreur création batch checklists: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================
# Feature 2: Génération IA de programme de maintenance
# ========================================================

@router.post("/generate-maintenance-program")
async def generate_maintenance_program(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload un document constructeur et l'IA génère un programme complet
    de maintenance préventive avec checklists associées.
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

        api_key = await _get_llm_key()

        ext = os.path.splitext(file.filename)[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        mime_map = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp"
        }
        mime_type = mime_map.get(ext, "application/pdf")

        chat = LlmChat(
            api_key=api_key,
            session_id=f"maint_prog_{uuid.uuid4().hex[:8]}",
            system_message="""Tu es un expert en maintenance industrielle préventive.
Analyse le document fourni (carnet de maintenance constructeur, fiche technique, notice d'entretien)
et génère un programme complet de maintenance préventive.

Réponds UNIQUEMENT avec un JSON valide, sans texte autour ni backticks.

Format attendu:
{
  "equipement_info": {
    "nom": "string - nom/type de l'équipement",
    "fabricant": "string - fabricant ou null",
    "modele": "string - modèle ou null",
    "reference": "string - référence ou null"
  },
  "programme_maintenance": [
    {
      "titre": "string - titre de l'opération de maintenance (ex: 'Vidange huile et filtre compresseur')",
      "description": "string - description détaillée de l'opération",
      "frequence": "JOURNALIER|HEBDOMADAIRE|MENSUEL|TRIMESTRIEL|SEMESTRIEL|ANNUEL",
      "duree_estimee_heures": 0.5,
      "competences_requises": "string - compétences/habilitations nécessaires",
      "pieces_rechange": "string - pièces de rechange nécessaires ou null",
      "checklist_items": [
        {
          "label": "string - point de contrôle",
          "type": "YES_NO|NUMERIC|TEXT",
          "unit": "string ou null",
          "min_value": null,
          "max_value": null,
          "instructions": "string ou null"
        }
      ]
    }
  ],
  "recommandations_generales": "string - recommandations générales du constructeur"
}

IMPORTANT:
- Sépare clairement les opérations par fréquence (journalier, mensuel, annuel, etc.)
- Chaque opération doit avoir sa propre checklist d'items de contrôle
- Sois précis sur les valeurs numériques (seuils, tolérances)
- Inclus les pièces de rechange et consommables nécessaires
- Mentionne les compétences/habilitations requises"""
        ).with_model("gemini", "gemini-2.5-flash")

        file_content = FileContentWithMimeType(file_path=tmp_path, mime_type=mime_type)
        response = await chat.send_message(UserMessage(
            text="Analyse ce document et génère un programme complet de maintenance préventive avec toutes les opérations et checklists associées.",
            file_contents=[file_content]
        ))

        os.unlink(tmp_path)
        response_text = clean_json_response(response)
        extracted = json.loads(response_text)

        return {
            "success": True,
            "data": extracted,
            "source_filename": file.filename
        }

    except json.JSONDecodeError:
        logger.error("Erreur parsing JSON maintenance IA")
        return {"success": False, "error": "L'IA n'a pas pu extraire les informations correctement. Réessayez."}
    except Exception as e:
        logger.error(f"Erreur génération programme maintenance IA: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": f"Erreur lors de l'analyse: {str(e)}"}


@router.post("/create-maintenance-batch")
async def create_maintenance_batch(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Crée le programme de maintenance préventive + checklists associées
    à partir des données extraites par l'IA.
    """
    try:
        freq_map = {
            "JOURNALIER": "JOURNALIER",
            "HEBDOMADAIRE": "HEBDOMADAIRE",
            "MENSUEL": "MENSUEL",
            "TRIMESTRIEL": "TRIMESTRIEL",
            "SEMESTRIEL": "SEMESTRIEL",
            "ANNUEL": "ANNUEL"
        }
        
        programme = data.get("programme_maintenance", [])
        equipment_id = data.get("equipment_id")
        created_maintenance = []
        created_checklists = []

        for op in programme:
            # 1. Créer la checklist template
            items = []
            for i, item in enumerate(op.get("checklist_items", [])):
                items.append({
                    "id": str(uuid.uuid4()),
                    "label": item.get("label", ""),
                    "type": item.get("type", "YES_NO"),
                    "order": i,
                    "required": True,
                    "unit": item.get("unit"),
                    "min_value": item.get("min_value"),
                    "max_value": item.get("max_value"),
                    "expected_value": item.get("expected_value"),
                    "instructions": item.get("instructions")
                })

            checklist_id = str(uuid.uuid4())
            checklist_template = {
                "id": checklist_id,
                "name": f"Checklist - {op.get('titre', 'Maintenance')}",
                "description": op.get("description", ""),
                "equipment_ids": [equipment_id] if equipment_id else [],
                "items": items,
                "is_template": True,
                "created_by_id": current_user.get("id"),
                "created_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "source": "ai_generated"
            }
            await db.checklist_templates.insert_one(checklist_template)
            checklist_template.pop("_id", None)
            created_checklists.append(checklist_template)

            # 2. Créer la maintenance préventive
            freq = freq_map.get(op.get("frequence", "ANNUEL"), "ANNUEL")
            duree = op.get("duree_estimee_heures", 1.0)
            
            pm_id = str(uuid.uuid4())
            pm = {
                "id": pm_id,
                "titre": op.get("titre", "Maintenance IA"),
                "equipement_id": equipment_id or "",
                "frequence": freq,
                "prochaineMaintenance": datetime.now(timezone.utc).isoformat(),
                "assigne_a_id": None,
                "duree": duree,
                "statut": "ACTIF",
                "checklist_template_id": checklist_id,
                "derniereMaintenance": None,
                "dateCreation": datetime.now(timezone.utc).isoformat(),
                "source": "ai_generated",
                "competences_requises": op.get("competences_requises"),
                "pieces_rechange": op.get("pieces_rechange"),
                "source_filename": data.get("source_filename")
            }
            await db.preventive_maintenances.insert_one(pm)
            pm.pop("_id", None)
            created_maintenance.append(pm)

        return {
            "success": True,
            "created_maintenance": len(created_maintenance),
            "created_checklists": len(created_checklists),
            "maintenance": created_maintenance,
            "checklists": created_checklists
        }
    except Exception as e:
        logger.error(f"Erreur création batch maintenance: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================
# Feature 3: Analyse IA des non-conformités
# ========================================================

@router.post("/analyze-nonconformities")
async def analyze_nonconformities(
    data: dict = {},
    current_user: dict = Depends(get_current_user)
):
    """
    Analyse l'historique des exécutions de checklists via IA pour détecter
    les patterns de non-conformités et générer des recommandations.
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = await _get_llm_key()

        # Récupérer l'historique des exécutions (90 derniers jours)
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=int(data.get("days", 90)))).isoformat()
        
        executions = await db.checklist_executions.find(
            {"executed_at": {"$gte": cutoff}},
            {"_id": 0}
        ).to_list(length=500)

        if not executions:
            return {
                "success": True,
                "data": {
                    "summary": "Aucune exécution de checklist trouvée sur la période analysée.",
                    "non_conformities": [],
                    "recommendations": [],
                    "work_orders_suggested": []
                }
            }

        # Préparer les données pour l'IA
        nc_data = []
        for ex in executions:
            checklist_name = ex.get("checklist_name", "Inconnue")
            equipment_name = ex.get("equipment_name", "Inconnu")
            executed_at = ex.get("executed_at", "")
            
            for item_resp in ex.get("item_responses", []):
                if not item_resp.get("is_compliant", True) or item_resp.get("has_issue", False):
                    nc_data.append({
                        "checklist": checklist_name,
                        "equipement": equipment_name,
                        "date": executed_at[:10] if executed_at else "",
                        "item": item_resp.get("item_label", ""),
                        "type": item_resp.get("item_type", ""),
                        "valeur": item_resp.get("value_numeric") or item_resp.get("value_text") or str(item_resp.get("value_yes_no", "")),
                        "description_probleme": item_resp.get("issue_description", "")
                    })

        total_items = sum(len(ex.get("item_responses", [])) for ex in executions)
        total_nc = len(nc_data)
        
        # Préparer aussi les stats par checklist
        stats_by_checklist = {}
        for ex in executions:
            name = ex.get("checklist_name", "Inconnue")
            if name not in stats_by_checklist:
                stats_by_checklist[name] = {"total_executions": 0, "total_items": 0, "non_conformes": 0}
            stats_by_checklist[name]["total_executions"] += 1
            stats_by_checklist[name]["total_items"] += len(ex.get("item_responses", []))
            stats_by_checklist[name]["non_conformes"] += sum(
                1 for r in ex.get("item_responses", []) if not r.get("is_compliant", True)
            )

        analysis_prompt = f"""Voici les données des contrôles préventifs des {data.get('days', 90)} derniers jours:

STATISTIQUES GLOBALES:
- Total exécutions: {len(executions)}
- Total points vérifiés: {total_items}
- Total non-conformités: {total_nc}
- Taux de conformité global: {round((1 - total_nc/max(total_items,1))*100, 1)}%

STATS PAR CHECKLIST:
{json.dumps(stats_by_checklist, indent=2, ensure_ascii=False)}

NON-CONFORMITÉS DÉTAILLÉES ({len(nc_data)} items):
{json.dumps(nc_data[:100], indent=2, ensure_ascii=False)}

Analyse ces données et identifie:
1. Les patterns récurrents de non-conformité
2. Les équipements à risque
3. Les recommandations d'action
4. Les ordres de travail curatifs à créer"""

        chat = LlmChat(
            api_key=api_key,
            session_id=f"nc_analysis_{uuid.uuid4().hex[:8]}",
            system_message="""Tu es un expert en maintenance industrielle et analyse de données.
Analyse les données de non-conformités des contrôles préventifs et génère un rapport d'analyse.

Réponds UNIQUEMENT avec un JSON valide, sans texte autour ni backticks.

Format attendu:
{
  "summary": "string - résumé exécutif de l'analyse (2-3 phrases)",
  "taux_conformite_global": 0.0,
  "tendance": "AMELIORATION|STABLE|DEGRADATION",
  "non_conformities_patterns": [
    {
      "pattern": "string - description du pattern détecté",
      "severity": "CRITIQUE|IMPORTANT|MODERE|MINEUR",
      "occurrences": 0,
      "equipements_concernes": ["string"],
      "items_concernes": ["string"],
      "cause_probable": "string - cause probable identifiée",
      "action_recommandee": "string - action corrective recommandée"
    }
  ],
  "equipements_a_risque": [
    {
      "equipement": "string - nom de l'équipement",
      "taux_nc": 0.0,
      "problemes_principaux": ["string"],
      "urgence": "HAUTE|MOYENNE|BASSE"
    }
  ],
  "recommendations": [
    {
      "type": "CHECKLIST_MODIFICATION|FREQUENCE_AJUSTEMENT|FORMATION|REMPLACEMENT|INTERVENTION",
      "titre": "string - titre de la recommandation",
      "description": "string - description détaillée",
      "priorite": "HAUTE|MOYENNE|BASSE",
      "impact_estime": "string - impact attendu de la mise en oeuvre"
    }
  ],
  "work_orders_suggested": [
    {
      "titre": "string - titre de l'OT curatif suggéré",
      "description": "string - description de l'intervention",
      "priorite": "URGENTE|HAUTE|NORMALE|BASSE",
      "equipement": "string - équipement concerné",
      "type": "CURATIF"
    }
  ]
}"""
        ).with_model("gemini", "gemini-2.5-flash")

        response = await chat.send_message(UserMessage(text=analysis_prompt))
        response_text = clean_json_response(response)
        analysis = json.loads(response_text)

        # Sauvegarder l'analyse en DB
        analysis_record = {
            "id": str(uuid.uuid4()),
            "type": "nonconformity_analysis",
            "analyzed_by": current_user.get("id"),
            "analyzed_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "period_days": data.get("days", 90),
            "total_executions": len(executions),
            "total_nc": total_nc,
            "analysis_result": analysis
        }
        await db.ai_analysis_history.insert_one(analysis_record)

        # --- Alertes automatiques pour patterns critiques ---
        notifications_sent = []
        critical_patterns = [
            p for p in analysis.get("non_conformities_patterns", [])
            if p.get("severity") in ("CRITIQUE", "IMPORTANT")
        ]

        if critical_patterns:
            notifications_sent = await _send_nc_critical_alerts(
                analysis=analysis,
                critical_patterns=critical_patterns,
                stats={
                    "total_executions": len(executions),
                    "total_items_checked": total_items,
                    "total_non_conformities": total_nc,
                    "period_days": data.get("days", 90)
                },
                analyzed_by_name=f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
            )

        return {
            "success": True,
            "data": analysis,
            "stats": {
                "total_executions": len(executions),
                "total_items_checked": total_items,
                "total_non_conformities": total_nc,
                "period_days": data.get("days", 90)
            },
            "notifications_sent": notifications_sent
        }

    except json.JSONDecodeError:
        logger.error("Erreur parsing JSON analyse NC")
        return {"success": False, "error": "L'IA n'a pas pu analyser les données correctement."}
    except Exception as e:
        logger.error(f"Erreur analyse non-conformités IA: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": f"Erreur lors de l'analyse: {str(e)}"}


# ========================================================
# Helper: Alertes automatiques pour NC critiques
# ========================================================

async def _send_nc_critical_alerts(analysis: dict, critical_patterns: list, stats: dict, analyzed_by_name: str) -> list:
    """
    Envoie des alertes (notification in-app + email) aux responsables de service
    lorsque des patterns critiques sont détectés par l'analyse IA.
    """
    from email_service import send_critical_nc_alert_email

    notifications_sent = []

    try:
        # Collecter les noms d'équipements concernés par les patterns critiques
        equipment_names = set()
        for p in critical_patterns:
            for eq_name in p.get("equipements_concernes", []):
                equipment_names.add(eq_name.strip().lower())

        # Aussi depuis equipements_a_risque avec urgence HAUTE
        for eq in analysis.get("equipements_a_risque", []):
            if eq.get("urgence") == "HAUTE":
                equipment_names.add(eq.get("equipement", "").strip().lower())

        # Trouver les services des équipements concernés via la DB
        services_to_notify = set()

        if equipment_names:
            # Chercher les équipements en DB pour récupérer leur emplacement/service
            regex_patterns = [{"nom": {"$regex": name, "$options": "i"}} for name in equipment_names if name]
            if regex_patterns:
                equipments = await db.equipments.find(
                    {"$or": regex_patterns},
                    {"_id": 0, "service": 1, "emplacement_id": 1, "nom": 1}
                ).to_list(length=100)

                for eq in equipments:
                    if eq.get("service"):
                        services_to_notify.add(eq["service"])

        # Si aucun service trouvé, notifier tous les responsables de service
        if not services_to_notify:
            all_responsables = await db.service_responsables.find({}, {"_id": 0}).to_list(length=50)
            services_to_notify = {r.get("service") for r in all_responsables if r.get("service")}

        if not services_to_notify:
            logger.warning("Aucun service responsable trouvé pour les alertes NC")
            return notifications_sent

        # Pour chaque service, trouver le responsable et envoyer les alertes
        for service_name in services_to_notify:
            responsable = await db.service_responsables.find_one(
                {"service": {"$regex": f"^{service_name}$", "$options": "i"}},
                {"_id": 0}
            )
            if not responsable:
                continue

            user_id = responsable.get("user_id")
            responsable_name = responsable.get("user_name", "Responsable")

            # Récupérer l'email du responsable
            from bson import ObjectId
            user = None
            try:
                user = await db.users.find_one({"_id": ObjectId(user_id)}, {"_id": 0, "email": 1, "prenom": 1, "nom": 1})
            except Exception:
                pass
            if not user:
                user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "prenom": 1, "nom": 1})

            if not user or not user.get("email"):
                logger.warning(f"Email non trouvé pour le responsable {responsable_name} (service: {service_name})")
                continue

            email = user["email"]
            full_name = f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or responsable_name

            # 1. Créer notification in-app
            notification = {
                "id": str(uuid.uuid4()),
                "type": "ai_nc_critical_alert",
                "title": f"Alerte NC critique - {service_name}",
                "message": f"L'analyse IA a détecté {len(critical_patterns)} pattern(s) critique(s) affectant votre service. {analysis.get('summary', '')}",
                "severity": "CRITICAL",
                "user_id": user_id,
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source": "ai_nonconformity_analysis",
                "data": {
                    "critical_patterns_count": len(critical_patterns),
                    "analyzed_by": analyzed_by_name,
                    "period_days": stats.get("period_days", 90)
                }
            }
            await db.notifications.insert_one(notification)

            # 2. Envoyer l'email
            email_sent = send_critical_nc_alert_email(
                to_email=email,
                responsable_name=full_name,
                service_name=service_name,
                analysis_summary=analysis.get("summary", ""),
                critical_patterns=critical_patterns,
                equipements_a_risque=analysis.get("equipements_a_risque", []),
                work_orders_suggested=analysis.get("work_orders_suggested", []),
                stats=stats
            )

            notifications_sent.append({
                "service": service_name,
                "responsable": full_name,
                "email": email,
                "email_sent": email_sent,
                "notification_created": True
            })

            logger.info(f"{'✅' if email_sent else '⚠️'} Alerte NC envoyée à {full_name} ({email}) pour service {service_name} - Email: {'OK' if email_sent else 'ECHEC'}")

    except Exception as e:
        logger.error(f"Erreur envoi alertes NC critiques: {e}")
        import traceback
        logger.error(traceback.format_exc())

    return notifications_sent


# ========================================================
# Feature 4: Création d'OT curatifs depuis l'analyse IA
# ========================================================

@router.post("/create-work-orders-from-analysis")
async def create_work_orders_from_analysis(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Crée des ordres de travail curatifs à partir des suggestions de l'analyse IA.
    Accepte une liste de work_orders avec titre, description, priorite, equipement.
    """
    try:
        from bson import ObjectId
        
        suggested_wos = data.get("work_orders", [])
        if not suggested_wos:
            raise HTTPException(status_code=400, detail="Aucun OT à créer")
        
        priority_map = {
            "URGENTE": "URGENTE",
            "HAUTE": "HAUTE",
            "NORMALE": "NORMALE",
            "MOYENNE": "MOYENNE",
            "BASSE": "BASSE"
        }
        
        created = []
        for wo_data in suggested_wos:
            # Générer numéro séquentiel
            count = await db.work_orders.count_documents({})
            numero = str(5800 + count + 1)
            
            priorite = priority_map.get(wo_data.get("priorite", "NORMALE"), "NORMALE")
            
            wo = {
                "_id": ObjectId(),
                "titre": wo_data.get("titre", "OT Curatif IA"),
                "description": wo_data.get("description", ""),
                "statut": "OUVERT",
                "priorite": priorite,
                "categorie": "TRAVAUX_CURATIF",
                "equipement_id": wo_data.get("equipement_id") or None,
                "assigne_a_id": None,
                "emplacement_id": None,
                "dateLimite": None,
                "tempsEstime": None,
                "tempsReel": None,
                "dateTermine": None,
                "createdBy": current_user.get("id"),
                "service": None,
                "preventive_maintenance_id": None,
                "checklist_id": None,
                "numero": numero,
                "dateCreation": datetime.now(timezone.utc),
                "attachments": [],
                "comments": [],
                "parts_used": [],
                "source": "ai_nonconformity_analysis",
                "equipement_name": wo_data.get("equipement", "")
            }
            wo["id"] = str(wo["_id"])
            
            await db.work_orders.insert_one(wo)
            
            created.append({
                "id": wo["id"],
                "numero": numero,
                "titre": wo["titre"],
                "priorite": priorite
            })
        
        logger.info(f"✅ {len(created)} OT curatif(s) créé(s) depuis analyse IA")
        
        return {
            "success": True,
            "created_count": len(created),
            "work_orders": created
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur création OT depuis analyse IA: {e}")
        raise HTTPException(status_code=500, detail=str(e))

