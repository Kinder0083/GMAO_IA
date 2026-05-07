"""
Service d'auto-mapping IA pour le module M.E.S.
- analyse un payload JSON (ou un echantillon) et propose des mappings de champs
- utilise Emergent Universal Key (Claude Sonnet 4.5 par defaut)
- respecte la config admin stockee dans system_settings.mes_ai_config
"""
import json
import logging
import os
import re
import uuid
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


DEFAULT_MES_AI_CONFIG = {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929",
    "enabled": True,
}


SYSTEM_PROMPT = """Tu es un expert en supervision industrielle (MES, OEE, IoT) qui aide a configurer
le mapping d'un payload JSON MQTT issu d'un capteur de production vers une fiche machine.

Pour chaque cle JSON fournie, tu proposes :
- key   : nom interne court en snake_case (ex: cadence, total_count, state, temp_celsius, oee_pct)
- label : libelle court en francais (Cadence, Compteur cumule, Etat, Temperature, OEE, ...)
- target: destination metier - choisis dans :
    "cadence"     (cadence courante en cp/min)
    "total"       (compteur cumule de pieces produites)
    "state"       (etat ACTIVE/IDLE/RUNNING/STOPPED)
    "shift_end"   (signal de fin de poste)
    "reset_24h"   (reset compteur sur 24h)
    "reset_shift" (reset compteur en debut de poste)
    "temperature" (temperature)
    "speed"       (vitesse)
    "alert"       (alerte / defaut)
    "quality"     (qualite / scrap rate)
    "oee"         (OEE / TRS)
    "timestamp"   (horodatage)
    "extra"       (metrique custom non standard)
- data_type : "number" | "string" | "boolean" | "datetime"
- unit : si pertinent (cp/min, °C, %, m/s, ...)
- description : phrase courte (max 80 caracteres)

REGLES :
- Identifie les noms abreges (ts, qty, rpm) et propose une description claire
- Pour les booleens true/false, data_type=boolean
- Pour les dates/heures ISO, data_type=datetime, target=timestamp
- Si tu n'es pas sur, target="extra"
- Reponds UNIQUEMENT en JSON valide selon le schema demande, sans markdown ni texte autour
"""


def _strip_json_codeblocks(text: str) -> str:
    """Supprimer les blocs ```json ... ``` si le LLM en met."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def _flatten(data: Any, prefix: str = "", out: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Aplatir un dict imbrique en {dotted.path: leaf_value}."""
    if out is None:
        out = {}
    if isinstance(data, dict):
        for k, v in data.items():
            new_prefix = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict) and v:
                _flatten(v, new_prefix, out)
            else:
                out[new_prefix] = v
    else:
        out[prefix] = data
    return out


def extract_value_from_path(payload: Any, json_path: str) -> Any:
    """Extraire une valeur d'un dict JSON via un chemin pointe (ex: 'sensor.temperature')."""
    if payload is None or not json_path:
        return None
    parts = json_path.split(".")
    cur = payload
    for p in parts:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return None
    return cur


def heuristic_detect_fields(flat: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Heuristique de fallback si le LLM est indisponible.
    Identifie les champs courants par nom et type de valeur.
    """
    NAME_PATTERNS = [
        (re.compile(r"^cadence$|cad(ence)?_min|rate_min|cps_min|cp_?min", re.I), "cadence", "Cadence", "cp/min"),
        (re.compile(r"^total$|count_total|total_count|cumul|prod_total|count$", re.I), "total", "Compteur cumule", "cp"),
        (re.compile(r"^etat$|^state$|^status$|running", re.I), "state", "Etat", None),
        (re.compile(r"shift_end|fin_poste|end_shift", re.I), "shift_end", "Fin de poste", None),
        (re.compile(r"reset.*24h|24h.*reset", re.I), "reset_24h", "Reset 24h", None),
        (re.compile(r"reset.*(poste|shift)", re.I), "reset_shift", "Reset poste", None),
        (re.compile(r"temp(erature)?", re.I), "temperature", "Temperature", "°C"),
        (re.compile(r"^speed$|vitesse|rpm", re.I), "speed", "Vitesse", "rpm"),
        (re.compile(r"alert|alarm|defaut|fault", re.I), "alert", "Alerte", None),
        (re.compile(r"qual|scrap|defect", re.I), "quality", "Qualite", "%"),
        (re.compile(r"oee|trs", re.I), "oee", "OEE", "%"),
        (re.compile(r"^ts$|timestamp|datetime|date_heure", re.I), "timestamp", "Horodatage", None),
    ]
    detected = []
    for path, value in flat.items():
        leaf = path.split(".")[-1]
        target = "extra"
        label = leaf.replace("_", " ").title()
        unit = None
        key = re.sub(r"[^a-zA-Z0-9_]", "_", leaf.lower())
        for pat, tgt, lbl, u in NAME_PATTERNS:
            if pat.search(leaf):
                target = tgt
                label = lbl
                unit = u
                key = tgt if tgt not in ("extra",) else key
                break
        if isinstance(value, bool):
            data_type = "boolean"
        elif isinstance(value, (int, float)):
            data_type = "number"
        elif isinstance(value, str) and re.match(r"^\d{4}-\d{2}-\d{2}", value):
            data_type = "datetime"
            if target == "extra":
                target = "timestamp"
        else:
            data_type = "string"
        detected.append({
            "key": key,
            "label": label,
            "json_path": path,
            "data_type": data_type,
            "target": target,
            "unit": unit,
            "description": f"Detecte automatiquement (heuristique) - exemple: {value}",
            "enabled": target != "extra",
        })
    return detected


class MESAIService:
    def __init__(self, db):
        self.db = db

    async def get_config(self) -> Dict[str, Any]:
        cfg = await self.db.system_settings.find_one({"_id": "mes_ai_config"})
        if not cfg:
            return dict(DEFAULT_MES_AI_CONFIG)
        return {
            "provider": cfg.get("provider", DEFAULT_MES_AI_CONFIG["provider"]),
            "model": cfg.get("model", DEFAULT_MES_AI_CONFIG["model"]),
            "enabled": cfg.get("enabled", True),
        }

    async def update_config(self, data: Dict[str, Any]) -> Dict[str, Any]:
        update = {k: v for k, v in data.items() if v is not None}
        await self.db.system_settings.update_one(
            {"_id": "mes_ai_config"},
            {"$set": update},
            upsert=True,
        )
        return await self.get_config()

    async def analyze_payload(self, payload_str: str, machine_name: Optional[str] = None,
                              machine_type: Optional[str] = None) -> Dict[str, Any]:
        """Analyser un payload JSON et proposer un mapping. Utilise le LLM, retombe sur l'heuristique en cas d'echec."""
        # Etape 1 : parser le JSON
        try:
            data = json.loads(payload_str)
            if not isinstance(data, dict):
                return {
                    "success": False,
                    "error": "Le payload n'est pas un objet JSON (attendu : { ... }).",
                    "detected_fields": [],
                    "raw_sample": None,
                }
        except json.JSONDecodeError as e:
            return {
                "success": False,
                "error": f"JSON invalide : {e.msg}",
                "detected_fields": [],
                "raw_sample": None,
            }

        flat = _flatten(data)

        # Etape 2 : tenter le LLM
        cfg = await self.get_config()
        if cfg.get("enabled", True):
            try:
                llm_fields = await self._call_llm(flat, cfg, machine_name=machine_name, machine_type=machine_type)
                if llm_fields:
                    return {
                        "success": True,
                        "detected_fields": llm_fields,
                        "raw_sample": data,
                        "model_used": f"{cfg['provider']}/{cfg['model']}",
                    }
            except Exception as e:
                logger.warning(f"[MES AI] LLM indisponible, fallback heuristique : {e}")

        # Etape 3 : fallback heuristique
        return {
            "success": True,
            "detected_fields": heuristic_detect_fields(flat),
            "raw_sample": data,
            "model_used": "heuristic",
        }

    async def _call_llm(self, flat: Dict[str, Any], cfg: Dict[str, Any],
                        machine_name: Optional[str] = None, machine_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Appel reel au LLM via Emergent Universal Key."""
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise RuntimeError("EMERGENT_LLM_KEY absent du backend/.env")

        # Import paresseux pour ne pas planter le serveur si lib indispo
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        sample_str = json.dumps(flat, ensure_ascii=False, indent=2, default=str)
        ctx = f"Machine : {machine_name or 'inconnue'} (type={machine_type or 'inconnu'})"
        user_text = f"""{ctx}

Voici les cles JSON aplaties extraites du payload MQTT (key -> exemple) :
{sample_str}

Renvoie un tableau JSON pur (pas de markdown) avec un objet par cle, dans cet ordre de cles :
[
  {{
    "key": "...",
    "label": "...",
    "json_path": "<la cle exacte de l'entree>",
    "data_type": "number|string|boolean|datetime",
    "target": "cadence|total|state|shift_end|reset_24h|reset_shift|temperature|speed|alert|quality|oee|timestamp|extra",
    "unit": null,
    "description": "..."
  }}
]"""
        chat = LlmChat(
            api_key=api_key,
            session_id=f"mes-ai-{uuid.uuid4()}",
            system_message=SYSTEM_PROMPT,
        ).with_model(cfg.get("provider", "anthropic"), cfg.get("model", "claude-sonnet-4-5-20250929"))

        resp = await chat.send_message(UserMessage(text=user_text))
        text = _strip_json_codeblocks(str(resp))
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"LLM a renvoye un JSON invalide : {e}")
        if not isinstance(parsed, list):
            raise RuntimeError("LLM n'a pas renvoye une liste")

        # Sanitiser et completer
        cleaned: List[Dict[str, Any]] = []
        valid_targets = {"cadence", "total", "state", "shift_end", "reset_24h", "reset_shift",
                         "temperature", "speed", "alert", "quality", "oee", "timestamp", "extra"}
        valid_types = {"number", "string", "boolean", "datetime"}
        for item in parsed:
            if not isinstance(item, dict):
                continue
            json_path = item.get("json_path") or ""
            if not json_path or json_path not in flat:
                continue
            target = item.get("target") if item.get("target") in valid_targets else "extra"
            data_type = item.get("data_type") if item.get("data_type") in valid_types else "string"
            cleaned.append({
                "key": str(item.get("key") or json_path).strip()[:64] or json_path,
                "label": item.get("label") or json_path,
                "json_path": json_path,
                "data_type": data_type,
                "target": target,
                "unit": item.get("unit"),
                "description": item.get("description") or "",
                "enabled": target != "extra",
            })
        return cleaned
