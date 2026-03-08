"""
Routes pour la gestion des QR codes équipements
- Génération de QR codes (auth)
- Page publique d'actions rapides (sans auth)
- Configuration des actions (admin)
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from dependencies import get_current_user, get_current_admin_user
from datetime import datetime, timezone
import io
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/qr", tags=["qr-codes"])

from server import db

ACTIONS_COLLECTION = "qr_actions_config"

# Actions par défaut
DEFAULT_ACTIONS = [
    {"id": "last-wo", "label": "Dernier ordre de travail", "icon": "ClipboardList", "type": "link", "enabled": True, "order": 1, "requires_auth": False},
    {"id": "wo-history", "label": "Historique des OT", "icon": "History", "type": "link", "enabled": True, "order": 2, "requires_auth": False},
    {"id": "kpi", "label": "KPI de l'équipement", "icon": "BarChart3", "type": "link", "enabled": True, "order": 3, "requires_auth": False},
    {"id": "create-intervention", "label": "Créer une demande d'intervention", "icon": "PlusCircle", "type": "action", "enabled": True, "order": 4, "requires_auth": True},
    {"id": "report-breakdown", "label": "Signaler une panne", "icon": "AlertTriangle", "type": "action", "enabled": True, "order": 5, "requires_auth": True},
    {"id": "preventive-plan", "label": "Plan de maintenance préventive", "icon": "Calendar", "type": "link", "enabled": True, "order": 6, "requires_auth": False},
    {"id": "create-presquaccident", "label": "Signaler un presqu'accident", "icon": "AlertCircle", "type": "action", "enabled": True, "order": 7, "requires_auth": True},
]


async def ensure_default_actions():
    """S'assurer que les actions par défaut existent et que les nouvelles actions sont ajoutées."""
    config = await db[ACTIONS_COLLECTION].find_one({"config_id": "default"})
    if not config:
        await db[ACTIONS_COLLECTION].insert_one({
            "config_id": "default",
            "actions": DEFAULT_ACTIONS,
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
    else:
        existing_ids = {a["id"] for a in config.get("actions", [])}
        new_actions = [a for a in DEFAULT_ACTIONS if a["id"] not in existing_ids]
        if new_actions:
            await db[ACTIONS_COLLECTION].update_one(
                {"config_id": "default"},
                {"$push": {"actions": {"$each": new_actions}}}
            )



@router.get("/check-deps")
async def check_qr_dependencies():
    """Vérifier que les dépendances QR sont installées (endpoint de diagnostic)."""
    result = {"qrcode": False, "pillow": False, "frontend_url": False}
    try:
        import qrcode
        result["qrcode"] = True
    except ImportError:
        pass
    try:
        from PIL import Image
        import PIL
        result["pillow"] = True
    except ImportError:
        pass
    result["frontend_url"] = bool(os.environ.get("FRONTEND_URL", ""))
    result["all_ok"] = all([result["qrcode"], result["pillow"], result["frontend_url"]])
    return result


# ========== PARAMÈTRES IA QR (SYSTÈME) ==========

# Providers/modèles supportés pour QR IA (via Emergent key)
QR_AI_PROVIDERS = {
    "gemini": {
        "id": "gemini", "name": "Google Gemini",
        "models": [
            {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "default": True},
            {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro"},
            {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite"},
        ]
    },
    "openai": {
        "id": "openai", "name": "OpenAI GPT",
        "models": [
            {"id": "gpt-4o", "name": "GPT-4o", "default": True},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
        ]
    },
    "anthropic": {
        "id": "anthropic", "name": "Anthropic Claude",
        "models": [
            {"id": "claude-4-sonnet-20250514", "name": "Claude 4 Sonnet", "default": True},
            {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku"},
        ]
    },
}

QR_AI_SETTINGS_KEY = "qr_ai_settings"


@router.get("/ai-settings")
async def get_qr_ai_settings():
    """Récupérer les paramètres IA pour les résumés QR (public pour lecture)."""
    settings = await db.system_settings.find_one({"key": QR_AI_SETTINGS_KEY}, {"_id": 0})
    if settings:
        return {"provider": settings.get("provider", "gemini"), "model": settings.get("model", "gemini-2.5-flash"), "providers": QR_AI_PROVIDERS}
    return {"provider": "gemini", "model": "gemini-2.5-flash", "providers": QR_AI_PROVIDERS}


@router.put("/ai-settings")
async def update_qr_ai_settings(data: dict, current_user: dict = Depends(get_current_admin_user)):
    """Mettre à jour les paramètres IA pour les résumés QR (admin uniquement)."""
    provider = data.get("provider", "gemini")
    model = data.get("model", "gemini-2.5-flash")

    # Valider que le provider et le modèle existent
    if provider not in QR_AI_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Fournisseur inconnu: {provider}")
    valid_models = [m["id"] for m in QR_AI_PROVIDERS[provider]["models"]]
    if model not in valid_models:
        raise HTTPException(status_code=400, detail=f"Modèle inconnu pour {provider}: {model}")

    await db.system_settings.update_one(
        {"key": QR_AI_SETTINGS_KEY},
        {"$set": {"key": QR_AI_SETTINGS_KEY, "provider": provider, "model": model, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"provider": provider, "model": model, "message": "Paramètres IA QR mis à jour"}


# ========== ROUTES PUBLIQUES (SANS AUTH) ==========

@router.get("/public/equipment/{eq_id}")
async def get_equipment_public(eq_id: str):
    """Récupérer les infos publiques d'un équipement (sans auth)."""
    from bson import ObjectId
    try:
        eq = await db.equipments.find_one({"_id": ObjectId(eq_id)}, {"_id": 0})
    except Exception:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")

    if not eq:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")

    # Récupérer l'emplacement
    location_name = None
    if eq.get("emplacement_id"):
        try:
            loc = await db.locations.find_one({"_id": ObjectId(eq["emplacement_id"])})
            if loc:
                location_name = loc.get("nom")
        except Exception:
            pass

    # Retourner les infos publiques
    return {
        "id": eq_id,
        "nom": eq.get("nom", ""),
        "type": eq.get("type", ""),
        "marque": eq.get("marque", ""),
        "modele": eq.get("modele", ""),
        "numero_serie": eq.get("numero_serie", ""),
        "statut": eq.get("statut", ""),
        "emplacement": location_name,
        "photo": eq.get("photo"),
        "service": eq.get("service", ""),
    }


@router.get("/public/equipment/{eq_id}/last-wo")
async def get_last_work_order_public(eq_id: str):
    """Récupérer le dernier OT d'un équipement (sans auth)."""
    from bson import ObjectId
    wo = await db.work_orders.find(
        {"equipement_id": eq_id},
        {"_id": 0, "id": 1, "numero": 1, "titre": 1, "statut": 1, "priorite": 1, "date_creation": 1, "assignee_name": 1}
    ).sort("date_creation", -1).limit(1).to_list(1)

    return wo[0] if wo else None


@router.get("/public/equipment/{eq_id}/wo-history")
async def get_wo_history_public(eq_id: str):
    """Récupérer l'historique des OT d'un équipement (sans auth, limité)."""
    wos = await db.work_orders.find(
        {"equipement_id": eq_id},
        {"_id": 0, "id": 1, "numero": 1, "titre": 1, "statut": 1, "priorite": 1, "date_creation": 1, "assignee_name": 1}
    ).sort("date_creation", -1).limit(20).to_list(20)

    return wos


@router.get("/public/equipment/{eq_id}/kpi")
async def get_equipment_kpi_public(eq_id: str):
    """Récupérer les KPI d'un équipement (sans auth)."""
    # Total OTs
    total_wos = await db.work_orders.count_documents({"equipement_id": eq_id})
    open_wos = await db.work_orders.count_documents({"equipement_id": eq_id, "statut": {"$nin": ["TERMINE", "ANNULE"]}})
    closed_wos = await db.work_orders.count_documents({"equipement_id": eq_id, "statut": "TERMINE"})

    # Temps moyen de résolution (OT terminés)
    pipeline = [
        {"$match": {"equipement_id": eq_id, "statut": "TERMINE", "temps_reel": {"$gt": 0}}},
        {"$group": {"_id": None, "avg_time": {"$avg": "$temps_reel"}}}
    ]
    avg_result = await db.work_orders.aggregate(pipeline).to_list(1)
    avg_resolution_time = round(avg_result[0]["avg_time"], 1) if avg_result else 0

    # Maintenances préventives
    total_preventive = await db.preventive_checklists.count_documents({"equipement_id": eq_id})

    return {
        "total_work_orders": total_wos,
        "open_work_orders": open_wos,
        "closed_work_orders": closed_wos,
        "avg_resolution_time_hours": avg_resolution_time,
        "total_preventive_plans": total_preventive,
    }


@router.get("/public/equipment/{eq_id}/preventive")
async def get_preventive_plan_public(eq_id: str):
    """Récupérer le plan de maintenance préventive (sans auth)."""
    checklists = await db.preventive_checklists.find(
        {"equipement_id": eq_id},
        {"_id": 0, "id": 1, "titre": 1, "frequence": 1, "derniere_execution": 1, "prochaine_execution": 1, "statut": 1}
    ).to_list(20)
    return checklists


@router.get("/public/equipment/{eq_id}/ai-summary")
async def get_equipment_ai_summary(eq_id: str):
    """Générer un résumé IA complet d'un équipement : état, historique, prochaines maintenances."""
    from bson import ObjectId
    import uuid as _uuid

    # 1. Récupérer l'équipement
    try:
        eq = await db.equipments.find_one({"_id": ObjectId(eq_id)}, {"_id": 0})
    except Exception:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")
    if not eq:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")

    # 2. Récupérer l'emplacement
    location_name = None
    if eq.get("emplacement_id"):
        try:
            loc = await db.locations.find_one({"_id": ObjectId(eq["emplacement_id"])})
            if loc:
                location_name = loc.get("nom")
        except Exception:
            pass

    # 3. Historique des OT (20 derniers)
    wos = await db.work_orders.find(
        {"equipement_id": eq_id},
        {"_id": 0, "numero": 1, "titre": 1, "statut": 1, "priorite": 1, "date_creation": 1,
         "date_cloture": 1, "temps_reel": 1, "assignee_name": 1, "categorie": 1, "description": 1}
    ).sort("date_creation", -1).limit(20).to_list(20)

    # 4. KPI
    total_wos = await db.work_orders.count_documents({"equipement_id": eq_id})
    open_wos = await db.work_orders.count_documents({"equipement_id": eq_id, "statut": {"$nin": ["TERMINE", "ANNULE"]}})
    pipeline_avg = [
        {"$match": {"equipement_id": eq_id, "statut": "TERMINE", "temps_reel": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$temps_reel"}}}
    ]
    avg_result = await db.work_orders.aggregate(pipeline_avg).to_list(1)
    avg_time = round(avg_result[0]["avg"], 1) if avg_result else 0

    # 5. Maintenances préventives
    preventive = await db.preventive_checklists.find(
        {"equipement_id": eq_id},
        {"_id": 0, "titre": 1, "frequence": 1, "prochaine_execution": 1, "derniere_execution": 1, "statut": 1}
    ).to_list(20)

    # 6. Consignations LOTO actives
    loto_active = await db.loto_procedures.find(
        {"equipment_id": eq_id, "status": {"$in": ["DEMANDE", "CONSIGNE", "INTERVENTION"]}},
        {"_id": 0, "status": 1, "motif": 1, "created_at": 1}
    ).to_list(5)

    # 7. Construire le prompt
    wo_lines = []
    for wo in wos[:10]:
        line = f"- OT #{wo.get('numero','?')} : {wo.get('titre','Sans titre')} | Statut: {wo.get('statut','-')} | Priorité: {wo.get('priorite','-')} | Date: {wo.get('date_creation','?')}"
        if wo.get('temps_reel'):
            line += f" | Temps: {wo['temps_reel']}h"
        wo_lines.append(line)

    prev_lines = []
    for p in preventive:
        line = f"- {p.get('titre','Plan')} | Fréquence: {p.get('frequence','-')} | Prochaine: {p.get('prochaine_execution','Non planifiée')} | Dernière: {p.get('derniere_execution','Jamais')}"
        prev_lines.append(line)

    loto_lines = []
    for l in loto_active:
        loto_lines.append(f"- Statut: {l.get('status')} | Motif: {l.get('motif','-')}")

    data_context = f"""FICHE ÉQUIPEMENT :
- Nom : {eq.get('nom', 'Inconnu')}
- Type : {eq.get('type', '-')}
- Marque : {eq.get('marque', '-')} | Modèle : {eq.get('modele', '-')}
- N° série : {eq.get('numero_serie', '-')}
- Statut actuel : {eq.get('statut', '-')}
- Emplacement : {location_name or '-'}
- Service : {eq.get('service', '-')}
- Date installation : {eq.get('date_installation', '-')}

STATISTIQUES :
- Total OT : {total_wos} | OT ouverts : {open_wos} | Temps moyen résolution : {avg_time}h

DERNIERS ORDRES DE TRAVAIL ({len(wos)} récents) :
{chr(10).join(wo_lines) if wo_lines else 'Aucun OT enregistré'}

MAINTENANCES PRÉVENTIVES ({len(preventive)} plans) :
{chr(10).join(prev_lines) if prev_lines else 'Aucun plan préventif'}

CONSIGNATIONS LOTO ACTIVES :
{chr(10).join(loto_lines) if loto_lines else 'Aucune consignation active'}"""

    system_prompt = """Tu es un expert en maintenance industrielle (GMAO). 
On te fournit la fiche complète d'un équipement avec son historique.
Génère un résumé concis et structuré en français comprenant :
1. **État actuel** : statut de l'équipement, consignations actives
2. **Analyse de l'historique** : tendances des pannes, fréquence des interventions, types de problèmes récurrents
3. **Prochaines maintenances** : échéances à venir, retards éventuels
4. **Recommandations** : actions préventives suggérées, points d'attention

Sois concis, factuel et utile. Utilise des puces et du gras pour la lisibilité. Ne dépasse pas 400 mots."""

    # 8. Appeler le LLM avec le modèle configuré
    try:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            global_key = await db.global_settings.find_one({"key": "EMERGENT_LLM_KEY"})
            if global_key:
                api_key = global_key.get("value")

        if not api_key:
            raise HTTPException(status_code=500, detail="Clé API IA non configurée")

        # Lire le modèle configuré dans les paramètres système
        ai_settings = await db.system_settings.find_one({"key": QR_AI_SETTINGS_KEY}, {"_id": 0})
        ai_provider = ai_settings.get("provider", "gemini") if ai_settings else "gemini"
        ai_model = ai_settings.get("model", "gemini-2.5-flash") if ai_settings else "gemini-2.5-flash"

        # Fallback si provider non supporté par Emergent
        if ai_provider in ("deepseek", "mistral"):
            ai_provider = "gemini"
            ai_model = "gemini-2.5-flash"

        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = LlmChat(
            api_key=api_key,
            session_id=f"qr_ai_{eq_id}_{_uuid.uuid4().hex[:6]}",
            system_message=system_prompt
        )
        chat.with_model(ai_provider, ai_model)

        user_msg = UserMessage(text=f"Voici les données de l'équipement. Génère le résumé IA.\n\n{data_context}")
        response_text = await chat.send_message(user_msg)

        return {
            "equipment_id": eq_id,
            "equipment_name": eq.get("nom", ""),
            "summary": response_text,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model": ai_model,
            "provider": ai_provider,
            "data": {
                "total_work_orders": total_wos,
                "open_work_orders": open_wos,
                "avg_resolution_time": avg_time,
                "preventive_plans": len(preventive),
                "active_loto": len(loto_active)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur génération résumé IA pour {eq_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur génération résumé IA: {str(e)}")


@router.get("/public/actions")
async def get_qr_actions_public():
    """Récupérer la liste des actions configurées (sans auth)."""
    await ensure_default_actions()
    config = await db[ACTIONS_COLLECTION].find_one({"config_id": "default"}, {"_id": 0})
    actions = config.get("actions", []) if config else DEFAULT_ACTIONS
    return [a for a in actions if a.get("enabled", True)]


# ========== ROUTES AUTHENTIFIÉES ==========

@router.get("/equipment/{eq_id}/image")
async def generate_qr_image(eq_id: str, current_user: dict = Depends(get_current_user)):
    """Générer le QR code d'un équipement (PNG)."""
    try:
        import qrcode
    except ImportError:
        raise HTTPException(status_code=500, detail="Module qrcode non installé. Exécutez: pip install qrcode[pil]")
    try:
        from PIL import Image
    except ImportError:
        raise HTTPException(status_code=500, detail="Module Pillow non installé. Exécutez: pip install Pillow")
    from bson import ObjectId

    try:
        eq = await db.equipments.find_one({"_id": ObjectId(eq_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID d'équipement invalide")

    if not eq:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")

    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not frontend_url:
        raise HTTPException(status_code=500, detail="FRONTEND_URL non configuré dans le backend .env")
    qr_url = f"{frontend_url}/qr/{eq_id}"

    try:
        qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
        qr.add_data(qr_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        return StreamingResponse(buf, media_type="image/png", headers={
            "Content-Disposition": f"inline; filename=qr_{eq.get('nom', eq_id)}.png"
        })
    except Exception as e:
        logger.error(f"Erreur génération QR image pour {eq_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération: {str(e)}")


@router.get("/equipment/{eq_id}/label")
async def generate_qr_label(eq_id: str, current_user: dict = Depends(get_current_user)):
    """Générer une étiquette QR (PNG avec nom de l'équipement)."""
    try:
        import qrcode
    except ImportError:
        raise HTTPException(status_code=500, detail="Module qrcode non installé. Exécutez: pip install qrcode[pil]")
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        raise HTTPException(status_code=500, detail="Module Pillow non installé. Exécutez: pip install Pillow")
    from bson import ObjectId

    try:
        eq = await db.equipments.find_one({"_id": ObjectId(eq_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID d'équipement invalide")

    if not eq:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")

    equipment_name = eq.get("nom", "Équipement")
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not frontend_url:
        raise HTTPException(status_code=500, detail="FRONTEND_URL non configuré dans le backend .env")
    qr_url = f"{frontend_url}/qr/{eq_id}"

    try:
        # Générer le QR code
        qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=3)
        qr.add_data(qr_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")

        qr_width, qr_height = qr_img.size

        # Créer l'étiquette avec le nom en dessous
        label_padding = 20
        text_height = 40
        label_width = max(qr_width + label_padding * 2, 300)
        label_height = qr_height + label_padding * 2 + text_height

        label = Image.new("RGB", (label_width, label_height), "white")
        draw = ImageDraw.Draw(label)

        # Centrer le QR code
        qr_x = (label_width - qr_width) // 2
        label.paste(qr_img, (qr_x, label_padding))

        # Ajouter le texte
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
        except Exception:
            font = ImageFont.load_default()

        text_bbox = draw.textbbox((0, 0), equipment_name, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_x = (label_width - text_width) // 2
        text_y = qr_height + label_padding + 8
        draw.text((text_x, text_y), equipment_name, fill="black", font=font)

        # Ajouter un cadre
        draw.rectangle([(0, 0), (label_width - 1, label_height - 1)], outline="#cccccc", width=2)

        buf = io.BytesIO()
        label.save(buf, format="PNG")
        buf.seek(0)

        safe_name = equipment_name.replace(" ", "_").replace("/", "-")
        return StreamingResponse(buf, media_type="image/png", headers={
            "Content-Disposition": f"attachment; filename=etiquette_qr_{safe_name}.png"
        })
    except Exception as e:
        logger.error(f"Erreur génération étiquette QR pour {eq_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération: {str(e)}")


# ========== ADMIN : GESTION DES ACTIONS ==========

@router.get("/actions")
async def get_qr_actions(current_user: dict = Depends(get_current_user)):
    """Récupérer la configuration des actions QR (auth)."""
    await ensure_default_actions()
    config = await db[ACTIONS_COLLECTION].find_one({"config_id": "default"}, {"_id": 0})
    return config.get("actions", []) if config else DEFAULT_ACTIONS


@router.put("/actions")
async def update_qr_actions(data: dict, current_user: dict = Depends(get_current_admin_user)):
    """Mettre à jour la configuration des actions QR (admin uniquement)."""
    actions = data.get("actions", [])
    if not actions:
        raise HTTPException(status_code=400, detail="Au moins une action est requise")

    await db[ACTIONS_COLLECTION].update_one(
        {"config_id": "default"},
        {"$set": {
            "actions": actions,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.get("id", "")
        }},
        upsert=True
    )
    return {"message": "Actions mises à jour", "actions": actions}
