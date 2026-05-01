"""
Helper partage pour la gestion des "etapes_realisation" sur les ordres de travail
et les ameliorations.

Logique metier :
- Une etape est verrouillee en modification si elle est deja "completed".
- L'ajout d'etapes en fin de liste est toujours autorise.
- Si on ajoute des etapes sur un OT/amelioration au statut TERMINE, on rebascule
  automatiquement le statut sur OUVERT.
- Renumerotation automatique des etapes (1, 2, 3, ...) lors de tout enregistrement.
"""
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
import uuid


def normalize_etapes(etapes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalise une liste d'etapes recues du frontend :
    - Garantit un id (uuid) pour chaque etape
    - Re-numerote en sequence (1, 2, 3, ...) selon l'ordre de la liste
    - Coerce les booleens et timestamps
    """
    if not etapes:
        return []

    normalized = []
    for idx, etape in enumerate(etapes):
        if not isinstance(etape, dict):
            continue
        eid = etape.get("id") or str(uuid.uuid4())
        normalized.append({
            "id": eid,
            "numero": idx + 1,
            "description": str(etape.get("description", "")).strip(),
            "checklist_template_id": etape.get("checklist_template_id") or None,
            "checklist_template_name": etape.get("checklist_template_name") or None,
            "checklist_execution_id": etape.get("checklist_execution_id") or None,
            "completed": bool(etape.get("completed", False)),
            "completed_at": etape.get("completed_at"),
            "completed_by_id": etape.get("completed_by_id"),
            "completed_by_name": etape.get("completed_by_name"),
        })
    return normalized


def merge_etapes_with_lock(
    existing_etapes: List[Dict[str, Any]],
    new_etapes: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Fusionne new_etapes (recues du payload) avec existing_etapes (en base) en
    appliquant la regle de verrouillage :
    - Pour chaque etape existante deja completed, on conserve la version DB
      (description, ordre, metadonnees de completion).
    - Pour chaque etape existante non completed, on accepte les modifications
      du payload.
    - Les nouvelles etapes (id absent de existing) sont ajoutees telles quelles
      en fin de liste.
    - Une etape existante COMPLETED ne peut pas etre supprimee : si elle n'est
      pas dans new_etapes, on la conserve.

    Renvoie (etapes_finales, has_added_steps).
    has_added_steps = True si au moins une nouvelle etape a ete ajoutee.
    """
    existing_by_id = {e.get("id"): e for e in (existing_etapes or []) if e.get("id")}
    new_by_id = {e.get("id"): e for e in (new_etapes or []) if e.get("id")}

    has_added_steps = False
    result = []
    seen_ids = set()

    # Iterer sur new_etapes pour conserver l'ordre choisi par l'utilisateur
    for new_e in (new_etapes or []):
        eid = new_e.get("id")
        if eid and eid in existing_by_id:
            existing = existing_by_id[eid]
            if existing.get("completed"):
                # Verrouillee : on garde la version DB telle quelle
                result.append(existing)
            else:
                # Non verrouillee : on accepte la modification (description,
                # checklist_template_id, ordre via la position dans new_etapes)
                merged = {
                    **existing,
                    "description": new_e.get("description", existing.get("description", "")),
                    "checklist_template_id": new_e.get("checklist_template_id") or existing.get("checklist_template_id"),
                    "checklist_template_name": new_e.get("checklist_template_name") or existing.get("checklist_template_name"),
                }
                result.append(merged)
            seen_ids.add(eid)
        else:
            # Nouvelle etape
            has_added_steps = True
            result.append({
                "id": eid or str(uuid.uuid4()),
                "description": str(new_e.get("description", "")).strip(),
                "checklist_template_id": new_e.get("checklist_template_id") or None,
                "checklist_template_name": new_e.get("checklist_template_name") or None,
                "checklist_execution_id": None,
                "completed": False,
                "completed_at": None,
                "completed_by_id": None,
                "completed_by_name": None,
            })

    # Ajouter les etapes existantes COMPLETED qui n'etaient pas dans new_etapes
    # (interdiction de supprimer une etape deja validee)
    for eid, existing in existing_by_id.items():
        if eid not in seen_ids and existing.get("completed"):
            # On les ajoute en fin pour preserver leur trace
            result.append(existing)

    # Renumerotation finale
    for idx, e in enumerate(result):
        e["numero"] = idx + 1

    return result, has_added_steps


def mark_etape_completed(etape: Dict[str, Any], current_user: Dict[str, Any]) -> Dict[str, Any]:
    """Marque une etape comme completed avec horodatage et user."""
    etape["completed"] = True
    etape["completed_at"] = datetime.now(timezone.utc).isoformat()
    etape["completed_by_id"] = current_user.get("id")
    etape["completed_by_name"] = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip() or current_user.get("email", "")
    return etape


def mark_etape_uncompleted(etape: Dict[str, Any]) -> Dict[str, Any]:
    """Decoche une etape (uniquement par son auteur ou un admin, controle au niveau de la route)."""
    etape["completed"] = False
    etape["completed_at"] = None
    etape["completed_by_id"] = None
    etape["completed_by_name"] = None
    return etape
