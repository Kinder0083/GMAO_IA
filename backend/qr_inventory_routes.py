"""
Routes pour la gestion des QR codes articles d'inventaire
- Génération de QR codes / étiquettes (auth)
- Page publique d'actions rapides (sans auth pour consultation, auth pour mouvements)
- Historique des mouvements de stock
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from dependencies import get_current_user
from datetime import datetime, timezone
from bson import ObjectId
import io
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/qr-inventory", tags=["qr-inventory"])

from server import db

# WebSocket manager pour les broadcasts temps réel
try:
    from websocket_manager import manager as chat_manager
except ImportError:
    chat_manager = None

# Web Push notifications
try:
    from web_push import send_web_push_to_user, send_web_push_to_users
except ImportError:
    send_web_push_to_user = None
    send_web_push_to_users = None


# ========== ROUTES PUBLIQUES (SANS AUTH) ==========

@router.get("/public/item/{item_id}")
async def get_inventory_item_public(item_id: str):
    """Récupérer les infos publiques d'un article d'inventaire (sans auth)."""
    try:
        item = await db.inventory.find_one({"_id": ObjectId(item_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    if not item:
        raise HTTPException(status_code=404, detail="Article non trouvé")

    # Récupérer le nom du service propriétaire
    service_name = "Non classé"
    if item.get("service_id"):
        svc = await db.inventory_services.find_one({"id": item["service_id"]}, {"_id": 0, "name": 1})
        if svc:
            service_name = svc["name"]

    quantite = item.get("quantite", 0)
    seuil = item.get("quantiteMin") or item.get("seuil_alerte") or 0

    if quantite <= 0:
        stock_status = "rupture"
    elif quantite <= seuil:
        stock_status = "bas"
    else:
        stock_status = "ok"

    return {
        "id": str(item["_id"]),
        "nom": item.get("nom", ""),
        "reference": item.get("reference", ""),
        "categorie": item.get("categorie", ""),
        "fournisseur": item.get("fournisseur", ""),
        "emplacement": item.get("emplacement", ""),
        "quantite": quantite,
        "quantiteMin": seuil,
        "prixUnitaire": item.get("prixUnitaire") or item.get("prix_unitaire") or 0,
        "service_name": service_name,
        "service_id": item.get("service_id"),
        "stock_status": stock_status,
        "equipment_ids": item.get("equipment_ids", []),
    }


@router.get("/public/item/{item_id}/equipments")
async def get_item_equipments_public(item_id: str):
    """Récupérer les équipements associés à un article (sans auth)."""
    try:
        item = await db.inventory.find_one({"_id": ObjectId(item_id)}, {"equipment_ids": 1})
    except Exception:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    if not item:
        raise HTTPException(status_code=404, detail="Article non trouvé")

    eq_ids = item.get("equipment_ids", [])
    if not eq_ids:
        return []

    equipments = []
    for eq_id in eq_ids:
        try:
            eq = await db.equipments.find_one({"_id": ObjectId(eq_id)}, {"_id": 0, "nom": 1, "type": 1, "statut": 1, "marque": 1, "modele": 1})
            if eq:
                eq["id"] = eq_id
                equipments.append(eq)
        except Exception:
            pass
    return equipments


@router.get("/public/item/{item_id}/movements")
async def get_item_movements_public(item_id: str):
    """Récupérer l'historique des mouvements de stock (sans auth, 30 derniers)."""
    movements = await db.inventory_movements.find(
        {"item_id": item_id}
    ).sort("created_at", -1).limit(30).to_list(30)

    result = []
    for m in movements:
        result.append({
            "id": str(m["_id"]),
            "type": m.get("type", ""),
            "quantity": m.get("quantity", 0),
            "quantity_before": m.get("quantity_before", 0),
            "quantity_after": m.get("quantity_after", 0),
            "motif": m.get("motif", ""),
            "user_name": m.get("user_name", ""),
            "created_at": m.get("created_at", ""),
            "source": m.get("source", "qr"),
        })
    return result


# ========== ROUTES AUTHENTIFIÉES (MOUVEMENTS) ==========

@router.post("/item/{item_id}/movement")
async def create_stock_movement(
    item_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Créer un mouvement de stock (ajout ou retrait) via QR code.
    Body: { "type": "ajout"|"retrait", "quantity": int, "motif": str }
    """
    movement_type = data.get("type", "")
    quantity = data.get("quantity", 0)
    motif = data.get("motif", "").strip()

    if movement_type not in ("ajout", "retrait"):
        raise HTTPException(400, "Le type doit être 'ajout' ou 'retrait'")
    if not isinstance(quantity, int) or quantity <= 0:
        raise HTTPException(400, "La quantité doit être un entier positif")

    try:
        item = await db.inventory.find_one({"_id": ObjectId(item_id)})
    except Exception:
        raise HTTPException(404, "Article non trouvé")
    if not item:
        raise HTTPException(404, "Article non trouvé")

    current_qty = item.get("quantite", 0)

    if movement_type == "retrait" and quantity > current_qty:
        raise HTTPException(400, f"Stock insuffisant. Stock actuel: {current_qty}, retrait demandé: {quantity}")

    new_qty = current_qty + quantity if movement_type == "ajout" else current_qty - quantity

    # Mettre à jour le stock
    await db.inventory.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": {
            "quantite": new_qty,
            "derniereModification": datetime.now(timezone.utc)
        }}
    )

    # Enregistrer le mouvement
    user_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
    movement_doc = {
        "item_id": item_id,
        "item_name": item.get("nom", ""),
        "item_reference": item.get("reference", ""),
        "type": movement_type,
        "quantity": quantity,
        "quantity_before": current_qty,
        "quantity_after": new_qty,
        "motif": motif,
        "user_id": current_user.get("id", ""),
        "user_name": user_name,
        "user_email": current_user.get("email", ""),
        "source": "qr",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.inventory_movements.insert_one(movement_doc)

    logger.info(f"[QR-Inventaire] {movement_type} {quantity}x '{item.get('nom')}' par {user_name} (motif: {motif})")

    # Déterminer le nouveau statut
    seuil = item.get("quantiteMin") or item.get("seuil_alerte") or 0
    if new_qty <= 0:
        stock_status = "rupture"
    elif new_qty <= seuil:
        stock_status = "bas"
    else:
        stock_status = "ok"

    # Broadcast WebSocket pour mise à jour temps réel de l'inventaire
    if chat_manager:
        try:
            await chat_manager.broadcast({
                "type": "inventory_update",
                "action": movement_type,
                "item_id": item_id,
                "item_name": item.get("nom", ""),
                "quantity_before": current_qty,
                "quantity_after": new_qty,
                "stock_status": stock_status,
                "user_name": user_name,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as ws_err:
            logger.warning(f"[QR-Inventaire] Erreur broadcast WS: {ws_err}")

    return {
        "success": True,
        "message": f"{'Ajout' if movement_type == 'ajout' else 'Retrait'} de {quantity} unité(s) effectué",
        "quantity_before": current_qty,
        "quantity_after": new_qty,
        "stock_status": stock_status,
        "movement_type": movement_type,
    }


@router.post("/item/{item_id}/request-restock")
async def request_restock(
    item_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Signaler un besoin de réapprovisionnement via QR code."""
    try:
        item = await db.inventory.find_one({"_id": ObjectId(item_id)})
    except Exception:
        raise HTTPException(404, "Article non trouvé")
    if not item:
        raise HTTPException(404, "Article non trouvé")

    user_name = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
    comment = data.get("comment", "").strip()

    # Enregistrer la demande
    restock_doc = {
        "item_id": item_id,
        "item_name": item.get("nom", ""),
        "item_reference": item.get("reference", ""),
        "current_quantity": item.get("quantite", 0),
        "min_quantity": item.get("quantiteMin") or item.get("seuil_alerte") or 0,
        "comment": comment,
        "requested_by": current_user.get("id", ""),
        "requested_by_name": user_name,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.inventory_restock_requests.insert_one(restock_doc)

    # Enregistrer aussi comme mouvement (type: demande)
    movement_doc = {
        "item_id": item_id,
        "item_name": item.get("nom", ""),
        "item_reference": item.get("reference", ""),
        "type": "demande_reappro",
        "quantity": 0,
        "quantity_before": item.get("quantite", 0),
        "quantity_after": item.get("quantite", 0),
        "motif": f"Demande de réapprovisionnement{': ' + comment if comment else ''}",
        "user_id": current_user.get("id", ""),
        "user_name": user_name,
        "source": "qr",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.inventory_movements.insert_one(movement_doc)

    logger.info(f"[QR-Inventaire] Demande réappro '{item.get('nom')}' par {user_name}")

    # Créer automatiquement une Demande d'Achat visible dans la page "Demandes d'Achat"
    try:
        from models import PurchaseRequest, PurchaseRequestType, PurchaseRequestUrgency, PurchaseRequestStatus, PurchaseRequestHistoryEntry
        from routes.shared import get_next_purchase_request_numero
        numero = await get_next_purchase_request_numero()

        urgency = PurchaseRequestUrgency.URGENT if item.get("quantite", 0) <= 0 else PurchaseRequestUrgency.NORMAL
        description = f"Signalement de besoin via QR code par {user_name}"
        if comment:
            description += f" - Commentaire: {comment}"

        purchase_request = PurchaseRequest(
            numero=numero,
            type=PurchaseRequestType.CONSOMMABLE,
            designation=item.get("nom", "Article inconnu"),
            description=description,
            quantite=item.get("quantiteMin") or item.get("seuil_alerte") or 10,
            unite="Unite",
            reference=item.get("reference", ""),
            fournisseur_suggere=item.get("fournisseur", ""),
            urgence=urgency,
            justification=f"Besoin signale via QR code. Article: '{item.get('nom')}' (Ref: {item.get('reference', 'N/A')}). Stock actuel: {item.get('quantite', 0)}. {comment}",
            destinataire_id=None,
            destinataire_nom="Service Maintenance",
            inventory_item_id=item_id,
            attached_files=[],
            demandeur_id=current_user.get("id", ""),
            demandeur_nom=user_name,
            demandeur_email=current_user.get("email", ""),
            status=PurchaseRequestStatus.SOUMISE,
            responsable_n1_id=None,
            responsable_n1_nom=None,
            history=[
                PurchaseRequestHistoryEntry(
                    user_id=current_user.get("id", ""),
                    user_name=user_name,
                    action="Signalement de besoin via QR code",
                    new_status=PurchaseRequestStatus.SOUMISE.value,
                    comment=comment or f"Besoin signale pour '{item.get('nom')}'"
                )
            ]
        )
        await db.purchase_requests.insert_one(purchase_request.model_dump())
        logger.info(f"[QR-Inventaire] Demande d'achat {numero} creee pour '{item.get('nom')}'")
    except Exception as pr_err:
        logger.warning(f"[QR-Inventaire] Erreur creation demande d'achat: {pr_err}")

    # Broadcast WebSocket pour notifier tous les utilisateurs connectés
    if chat_manager:
        try:
            await chat_manager.broadcast({
                "type": "inventory_restock_request",
                "item_id": item_id,
                "item_name": item.get("nom", ""),
                "item_reference": item.get("reference", ""),
                "current_quantity": item.get("quantite", 0),
                "comment": comment,
                "requested_by_name": user_name,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as ws_err:
            logger.warning(f"[QR-Inventaire] Erreur broadcast WS restock: {ws_err}")

    # Notification push vers le responsable du service ou les admins
    if send_web_push_to_user:
        try:
            item_name = item.get("nom", "Article")
            stock_actuel = item.get("quantite", 0)
            push_title = "Signalement de besoin"
            push_body = f"{user_name} signale un besoin pour \"{item_name}\" (stock: {stock_actuel})"
            if comment:
                push_body += f" - {comment[:80]}"
            push_data = {
                "type": "inventory_restock",
                "item_id": item_id,
                "url": "/purchase-requests"
            }

            service_id = item.get("service_id")
            notified = False

            # Si l'article appartient à un service, notifier le responsable du service
            if service_id:
                try:
                    service_query = {"_id": ObjectId(str(service_id))} if ObjectId.is_valid(str(service_id)) else {"id": str(service_id)}
                    service = await db.inventory_services.find_one(service_query)
                    if service and service.get("responsable_id"):
                        resp_id = str(service["responsable_id"])
                        if resp_id != str(current_user.get("id", "")):
                            await send_web_push_to_user(
                                db, resp_id,
                                title=push_title, body=push_body,
                                data=push_data, tag=f"restock-{item_id}"
                            )
                            notified = True
                            logger.info(f"[QR-Inventaire] Push envoyee au responsable du service '{service.get('name')}'")
                except Exception as svc_err:
                    logger.warning(f"[QR-Inventaire] Erreur lookup service: {svc_err}")

            # Si pas de service (Non classé) ou pas de responsable, notifier les admins
            if not notified:
                admin_ids = []
                async for admin in db.users.find({"role": "ADMIN", "statut": "actif"}, {"_id": 1, "id": 1}):
                    admin_id = str(admin.get("id") or admin.get("_id", ""))
                    if admin_id and admin_id != str(current_user.get("id", "")):
                        admin_ids.append(admin_id)
                if admin_ids:
                    await send_web_push_to_users(
                        db, admin_ids,
                        title=push_title, body=push_body,
                        data=push_data, tag=f"restock-{item_id}"
                    )
                    logger.info(f"[QR-Inventaire] Push envoyee a {len(admin_ids)} admin(s)")
        except Exception as push_err:
            logger.warning(f"[QR-Inventaire] Erreur notification push: {push_err}")

    return {"success": True, "message": "Demande de réapprovisionnement enregistrée et transmise aux Demandes d'Achat"}


# ========== GÉNÉRATION QR CODES ==========

@router.get("/item/{item_id}/image")
async def generate_inventory_qr_image(item_id: str, current_user: dict = Depends(get_current_user)):
    """Générer le QR code d'un article d'inventaire (PNG)."""
    try:
        import qrcode
    except ImportError:
        raise HTTPException(500, "Module qrcode non installé")
    from bson import ObjectId

    try:
        item = await db.inventory.find_one({"_id": ObjectId(item_id)})
    except Exception:
        raise HTTPException(400, "ID invalide")
    if not item:
        raise HTTPException(404, "Article non trouvé")

    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not frontend_url:
        raise HTTPException(500, "FRONTEND_URL non configuré")
    qr_url = f"{frontend_url}/qr-inventory/{item_id}"

    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
    qr.add_data(qr_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png", headers={
        "Content-Disposition": f"inline; filename=qr_{item.get('nom', item_id)}.png"
    })


@router.get("/item/{item_id}/label")
async def generate_inventory_qr_label(item_id: str, current_user: dict = Depends(get_current_user)):
    """Générer une étiquette QR pour un article d'inventaire (PNG avec nom + référence)."""
    try:
        import qrcode
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        raise HTTPException(500, "Modules qrcode/Pillow non installés")
    from bson import ObjectId

    try:
        item = await db.inventory.find_one({"_id": ObjectId(item_id)})
    except Exception:
        raise HTTPException(400, "ID invalide")
    if not item:
        raise HTTPException(404, "Article non trouvé")

    item_name = item.get("nom", "Article")
    item_ref = item.get("reference", "")
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not frontend_url:
        raise HTTPException(500, "FRONTEND_URL non configuré")
    qr_url = f"{frontend_url}/qr-inventory/{item_id}"

    # Générer le QR code
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=3)
    qr.add_data(qr_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    qr_width, qr_height = qr_img.size

    # Créer l'étiquette
    label_padding = 20
    text_height = 55
    label_width = max(qr_width + label_padding * 2, 300)
    label_height = qr_height + label_padding * 2 + text_height

    label = Image.new("RGB", (label_width, label_height), "white")
    draw = ImageDraw.Draw(label)

    # QR centré
    qr_x = (label_width - qr_width) // 2
    label.paste(qr_img, (qr_x, label_padding))

    # Nom de l'article
    try:
        font_bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except Exception:
        font_bold = ImageFont.load_default()
        font_small = font_bold

    # Nom
    name_bbox = draw.textbbox((0, 0), item_name, font=font_bold)
    name_w = name_bbox[2] - name_bbox[0]
    name_x = (label_width - name_w) // 2
    name_y = qr_height + label_padding + 5
    draw.text((name_x, name_y), item_name, fill="black", font=font_bold)

    # Référence
    if item_ref:
        ref_text = f"Réf: {item_ref}"
        ref_bbox = draw.textbbox((0, 0), ref_text, font=font_small)
        ref_w = ref_bbox[2] - ref_bbox[0]
        ref_x = (label_width - ref_w) // 2
        ref_y = name_y + 22
        draw.text((ref_x, ref_y), ref_text, fill="#666666", font=font_small)

    # Cadre
    draw.rectangle([(0, 0), (label_width - 1, label_height - 1)], outline="#cccccc", width=2)

    buf = io.BytesIO()
    label.save(buf, format="PNG")
    buf.seek(0)

    safe_name = item_name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(buf, media_type="image/png", headers={
        "Content-Disposition": f"attachment; filename=etiquette_qr_{safe_name}.png"
    })
