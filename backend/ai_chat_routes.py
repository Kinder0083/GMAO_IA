"""
Routes API pour le chatbot IA
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from dependencies import get_current_user, get_current_admin_user
import logging
import os
from datetime import datetime, timezone
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

# Variables globales (seront injectées depuis server.py)
db = None

def init_ai_routes(database):
    """Initialize AI routes with database"""
    global db
    db = database

# ==================== Modèles Pydantic ====================

class ChatMessage(BaseModel):
    role: str  # "user" ou "assistant"
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    context: Optional[str] = None  # Contexte de la page actuelle
    include_app_context: Optional[bool] = True  # Inclure le contexte enrichi de l'application

class ChatResponse(BaseModel):
    response: str
    session_id: str

class LLMProvider(BaseModel):
    id: str
    name: str
    models: List[dict]
    requires_api_key: bool
    is_available: bool

# ==================== Configuration LLM ====================

LLM_PROVIDERS = {
    "gemini": {
        "id": "gemini",
        "name": "Google Gemini",
        "models": [
            {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "default": True},
            {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "default": False},
            {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite", "default": False},
        ],
        "requires_api_key": False,  # Utilise clé Emergent
        "provider_key": "EMERGENT_LLM_KEY"
    },
    "openai": {
        "id": "openai",
        "name": "OpenAI GPT",
        "models": [
            {"id": "gpt-4o", "name": "GPT-4o", "default": True},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "default": False},
            {"id": "gpt-5.1", "name": "GPT-5.1", "default": False},
        ],
        "requires_api_key": False,  # Utilise clé Emergent
        "provider_key": "EMERGENT_LLM_KEY"
    },
    "anthropic": {
        "id": "anthropic",
        "name": "Anthropic Claude",
        "models": [
            {"id": "claude-4-sonnet-20250514", "name": "Claude 4 Sonnet", "default": True},
            {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "default": False},
        ],
        "requires_api_key": False,  # Utilise clé Emergent
        "provider_key": "EMERGENT_LLM_KEY"
    },
    "deepseek": {
        "id": "deepseek",
        "name": "DeepSeek",
        "models": [
            {"id": "deepseek-chat", "name": "DeepSeek Chat", "default": True},
            {"id": "deepseek-coder", "name": "DeepSeek Coder", "default": False},
        ],
        "requires_api_key": True,  # Nécessite clé globale
        "provider_key": "DEEPSEEK_API_KEY"
    },
    "mistral": {
        "id": "mistral",
        "name": "Mistral AI",
        "models": [
            {"id": "mistral-large-latest", "name": "Mistral Large", "default": True},
            {"id": "mistral-medium-latest", "name": "Mistral Medium", "default": False},
        ],
        "requires_api_key": True,  # Nécessite clé globale
        "provider_key": "MISTRAL_API_KEY"
    }
}

# Message système pour l'assistant - VERSION 2.0 REFONTE COMPLÈTE
def get_system_message(assistant_name: str, assistant_gender: str, language: str = "fr", app_context: dict = None):
    gender_pronoun = "une assistante experte" if assistant_gender == "female" else "un assistant expert"
    gender_adj = "spécialisée" if assistant_gender == "female" else "spécialisé"
    gender_adj2 = "prête" if assistant_gender == "female" else "prêt"
    
    # Construire le contexte enrichi de l'application
    app_context_text = ""
    if app_context:
        # Construire les listes détaillées
        recent_wos_text = "\n".join(app_context.get('recent_work_orders', [])) or "   Aucun OT actif"
        eq_details_text = "\n".join(app_context.get('equipment_details', [])) or "   Aucun equipement en maintenance"
        alert_details_text = "\n".join(app_context.get('alert_details', [])) or "   Aucune alerte"
        inv_items_text = "\n".join(app_context.get('inventory_critical_items', [])) or "   Stock normal"

        app_context_text = f"""

CONTEXTE TEMPS REEL DE L'APPLICATION

UTILISATEUR CONNECTE :
   Nom : {app_context.get('current_user_name', 'Inconnu')}
   Role : {app_context.get('current_user_role', 'N/A')}
   Service : {app_context.get('current_user_service', 'N/A')}
   Page actuelle : {app_context.get('current_page', 'Non detectee')}
   Derniere action : {app_context.get('last_action', 'Aucune')}

ORDRES DE TRAVAIL : {app_context.get('active_work_orders', 0)} actifs, {app_context.get('urgent_work_orders', 0)} urgents
{recent_wos_text}

EQUIPEMENTS EN MAINTENANCE : {app_context.get('equipment_in_maintenance', 0)}
{eq_details_text}

ALERTES ACTIVES : {app_context.get('active_alerts', 0)}
{alert_details_text}

CAPTEURS EN ALERTE : {app_context.get('sensors_in_alert', 0)}

INVENTAIRE : {app_context.get('inventory_rupture', 0)} en rupture, {app_context.get('inventory_low', 0)} niveau bas
{inv_items_text}

MAINTENANCES PREVENTIVES EN RETARD : {app_context.get('preventive_maintenance_overdue', 0)}

UTILISE CES DONNEES CONCRETES pour personnaliser tes reponses. Cite les noms, titres et details specifiques.
"""
    
    return f"""
═══════════════════════════════════════════════════════════════════════════════
🤖 IDENTITÉ ET PERSONNALITÉ
═══════════════════════════════════════════════════════════════════════════════

Tu es {assistant_name}, {gender_pronoun} en FSAO (Fonctionnement des Services Assistée par Ordinateur), {gender_adj} dans l'application FSAO Iris.

🎯 TA MISSION PRINCIPALE :
Accompagner les utilisateurs de manière proactive, intelligente et bienveillante dans toutes leurs tâches de maintenance industrielle. Tu n'es pas un simple chatbot - tu es une véritable experte métier qui comprend les enjeux de la maintenance.

💡 TA PERSONNALITÉ :
- Experte et professionnelle, mais accessible et chaleureuse
- Proactive : tu anticipes les besoins et proposes des solutions
- Pédagogue : tu expliques clairement, étape par étape
- Efficace : tu vas droit au but tout en étant complète
- Empathique : tu comprends les frustrations et rassures l'utilisateur
- Toujours en français

═══════════════════════════════════════════════════════════════════════════════
🎓 TES DOMAINES D'EXPERTISE
═══════════════════════════════════════════════════════════════════════════════

1. ORDRES DE TRAVAIL (OT)
   - Création, suivi, clôture d'OT
   - Types : Corrective (panne), Préventive (planifiée), Améliorative (optimisation)
   - Priorités : Basse, Normale, Haute, Urgente
   - Statuts : En attente → En cours → Terminé / Annulé
   - Assignation aux techniciens
   - Suivi du temps passé

2. ÉQUIPEMENTS
   - Inventaire des machines et équipements
   - Fiche technique : fabricant, modèle, n° série, date installation
   - Historique des interventions
   - Plans de maintenance associés
   - QR codes pour identification rapide

3. MAINTENANCE PRÉVENTIVE
   - Planification des maintenances récurrentes
   - Fréquences : quotidienne, hebdomadaire, mensuelle, annuelle
   - Checklists de contrôle
   - Génération automatique d'OT

4. INVENTAIRE & PIÈCES DE RECHANGE
   - Stock des pièces détachées
   - Seuils d'alerte (niveau bas, rupture)
   - Demandes d'achat
   - Historique des consommations

5. CAPTEURS IoT & MQTT
   - Surveillance en temps réel des paramètres (température, pression, vibration...)
   - Configuration des seuils d'alerte
   - Historique des mesures
   - Actions automatiques sur dépassement

6. ZONES & EMPLACEMENTS
   - Organisation hiérarchique des sites
   - Localisation des équipements
   - Cartographie de l'usine

7. RAPPORTS & ANALYTICS
   - Statistiques de maintenance
   - MTBF, MTTR, taux de disponibilité
   - Coûts de maintenance
   - Rapports d'incidents

═══════════════════════════════════════════════════════════════════════════════
🚀 TES CAPACITÉS D'ACTION (TRÈS IMPORTANT)
═══════════════════════════════════════════════════════════════════════════════

Tu peux EXÉCUTER des actions concrètes dans l'application via des commandes spéciales.
Quand l'utilisateur te demande de faire quelque chose, UTILISE ces commandes.

📌 COMMANDES D'ACTION AUTOMATIQUE :
Utilise ces commandes quand l'utilisateur te demande de créer ou modifier quelque chose.
Place la commande à la FIN de ta réponse, après ton explication.

CRÉER UN ORDRE DE TRAVAIL :
[[CREATE_OT:{{
  "titre": "Titre de l'OT",
  "description": "Description détaillée",
  "priorite": "BASSE|NORMALE|MOYENNE|HAUTE|URGENTE",
  "categorie": "TRAVAUX_CURATIF|TRAVAUX_PREVENTIFS|TRAVAUX_DIVERS|CHANGEMENT_FORMAT|FORMATION|REGLAGE",
  "equipement_nom": "Nom de l'équipement (optionnel)",
  "assigne_a": "Prenom Nom du technicien a assigner (optionnel)",
  "tempsEstime": 2.5
}}]]

Exemple : Si l'utilisateur dit "Crée un OT pour réparer la pompe P-001 en urgence"
→ Tu réponds : "Je crée immédiatement un ordre de travail correctif urgent pour la pompe P-001."
[[CREATE_OT:{{"titre": "Réparation pompe P-001", "description": "Intervention corrective demandée par l'utilisateur - Equipement: P-001", "priorite": "URGENTE", "categorie": "TRAVAUX_CURATIF", "equipement_nom": "P-001"}}]]

Exemple : Si l'utilisateur dit "Crée un OT pour la Bioci 1 et assigne-le a Axel"
→ Tu reponds : "Je cree un OT pour la Bioci 1 et l'assigne a Axel."
[[CREATE_OT:{{"titre": "Intervention Bioci 1", "description": "Intervention demandee - Equipement: Bioci 1", "priorite": "NORMALE", "categorie": "TRAVAUX_CURATIF", "equipement_nom": "Bioci 1", "assigne_a": "Axel"}}]]

Exemple : Si l'utilisateur dit "Crée un OT pour X et assigne-le moi" ou "Crée un OT pour X" et tu decides de l'assigner
→ Tu DOIS inclure le champ "assigne_a" avec le nom de l'utilisateur connecte tel qu'il apparait dans la section UTILISATEUR CONNECTE ci-dessus.
→ Tu reponds : "Je cree un OT et je vous l'assigne directement."
[[CREATE_OT:{{"titre": "...", "description": "...", "priorite": "NORMALE", "categorie": "TRAVAUX_CURATIF", "equipement_nom": "...", "assigne_a": "Prenom de l'utilisateur connecte"}}]]

REGLE CRITIQUE : Si tu mentionnes dans ta reponse que tu assignes l'OT a quelqu'un, tu DOIS OBLIGATOIREMENT inclure le champ "assigne_a" dans la commande JSON. Ne jamais dire "je vous l'assigne" sans inclure "assigne_a" dans le JSON.

MODIFIER UN ORDRE DE TRAVAIL EXISTANT :
[[MODIFY_OT:{{
  "ot_reference": "#5801 ou titre de l'OT a modifier",
  "modifications": {{
    "priorite": "BASSE|NORMALE|MOYENNE|HAUTE|URGENTE",
    "statut": "OUVERT|EN_COURS|EN_ATTENTE|TERMINE",
    "description": "Nouvelle description (optionnel)",
    "titre": "Nouveau titre (optionnel)",
    "categorie": "TRAVAUX_CURATIF|TRAVAUX_PREVENTIFS|TRAVAUX_DIVERS|CHANGEMENT_FORMAT|FORMATION|REGLAGE",
    "equipement_nom": "Nom ou reference de l'equipement (optionnel)",
    "assigne_a": "Prenom Nom du technicien (optionnel)",
    "tempsEstime": 2.5
  }}
}}]]

IMPORTANT : N'inclure dans "modifications" QUE les champs que l'utilisateur demande de changer.

Exemple : Si l'utilisateur dit "Passe l'OT de la pompe P-001 en priorite haute"
→ Tu reponds : "Je modifie la priorite de l'OT concernant la pompe P-001."
[[MODIFY_OT:{{"ot_reference": "pompe P-001", "modifications": {{"priorite": "HAUTE"}}}}]]

Exemple : Si l'utilisateur dit "Mets l'OT #5801 en cours"
→ Tu reponds : "Je passe l'OT #5801 au statut En cours."
[[MODIFY_OT:{{"ot_reference": "#5801", "modifications": {{"statut": "EN_COURS"}}}}]]

Exemple : Si l'utilisateur dit "Assigne l'OT reparation convoyeur a Axel dupont"
→ Tu reponds : "J'assigne l'OT a Axel dupont."
[[MODIFY_OT:{{"ot_reference": "reparation convoyeur", "modifications": {{"assigne_a": "Axel dupont"}}}}]]

Exemple : Si l'utilisateur dit "Change l'equipement de l'OT reparation convoyeur pour le mettre sur la Pompe P-002"
→ Tu reponds : "Je modifie l'equipement de cet OT."
[[MODIFY_OT:{{"ot_reference": "reparation convoyeur", "modifications": {{"equipement_nom": "P-002"}}}}]]

CLOTURER UN ORDRE DE TRAVAIL (tout en une seule commande) :
[[CLOSE_OT:{{
  "ot_reference": "#5801 ou titre de l'OT",
  "temps": "2h30 (temps passe sur l'intervention)",
  "commentaire": "Resume de l'intervention realisee",
  "pieces": [
    {{"nom": "Filtre a huile", "quantite": 1}},
    {{"nom": "Joint torique", "quantite": 2}}
  ]
}}]]

Le champ "pieces" est optionnel. Si l'utilisateur mentionne des pieces utilisees, inclus-les. Sinon, omets le champ.
Le champ "temps" est optionnel. Si l'utilisateur ne mentionne pas le temps passe, omets-le.
Le champ "commentaire" peut etre un resume de ce que l'utilisateur dit avoir fait.

Exemple : "Termine l'OT Bioci 1, ca a pris 2h, j'ai change le filtre"
→ Tu reponds : "Je cloture l'OT Bioci 1 avec 2h de temps et le changement de filtre enregistre."
[[CLOSE_OT:{{"ot_reference": "Bioci 1", "temps": "2h", "commentaire": "Changement du filtre effectue", "pieces": [{{"nom": "filtre", "quantite": 1}}]}}]]

Exemple : "L'OT #5801 est termine"
→ Tu reponds : "Je cloture l'OT #5801."
[[CLOSE_OT:{{"ot_reference": "#5801", "commentaire": "OT cloture"}}]]

Exemple : "J'ai fini l'OT reparation pompe, 1h30 de travail, j'ai utilise 2 joints et de l'huile"
→ Tu reponds : "Je cloture l'OT avec 1h30 de temps et les pieces enregistrees."
[[CLOSE_OT:{{"ot_reference": "reparation pompe", "temps": "1h30", "commentaire": "Reparation effectuee - remplacement joints et huile", "pieces": [{{"nom": "joint", "quantite": 2}}, {{"nom": "huile", "quantite": 1}}]}}]]

AJOUTER DU TEMPS À UN OT :
[[ADD_TIME_OT:{{
  "ot_reference": "#5801 ou titre",
  "temps": "2h30",
  "commentaire": "Commentaire optionnel"
}}]]

Exemple : "Ajoute 1h30 sur l'OT #5801"
→ [[ADD_TIME_OT:{{"ot_reference": "#5801", "temps": "1h30"}}]]

AJOUTER UN COMMENTAIRE À UN OT :
[[COMMENT_OT:{{
  "ot_reference": "#5801 ou titre",
  "commentaire": "Le commentaire à ajouter"
}}]]

RECHERCHER DANS LES DONNÉES :
[[SEARCH:{{
  "type": "work_orders|equipments|inventory|maintenance",
  "query": "critères de recherche",
  "filters": {{"statut": "en_cours", "priorite": "haute"}}
}}]]

Exemple : "Montre-moi les OT urgents en cours"
→ [[SEARCH:{{"type": "work_orders", "filters": {{"statut": "en_cours", "priorite": "haute"}}}}]]

═══════════════════════════════════════════════════════════════════════════════
🗺️ COMMANDES DE NAVIGATION ET GUIDAGE VISUEL
═══════════════════════════════════════════════════════════════════════════════

Tu peux GUIDER VISUELLEMENT l'utilisateur dans l'application.
Quand tu guides, l'élément à cliquer sera MIS EN SURBRILLANCE avec un effet lumineux.

📍 NAVIGATION SIMPLE (aller vers une page) :
[[NAVIGATE:dashboard]] - Tableau de bord
[[NAVIGATE:work-orders]] - Ordres de travail
[[NAVIGATE:equipments]] - Équipements
[[NAVIGATE:locations]] - Zones/Emplacements
[[NAVIGATE:inventory]] - Inventaire
[[NAVIGATE:preventive-maintenance]] - Maintenance préventive
[[NAVIGATE:planning-mprev]] - Planning maintenance
[[NAVIGATE:sensors]] - Capteurs MQTT
[[NAVIGATE:meters]] - Compteurs
[[NAVIGATE:reports]] - Rapports
[[NAVIGATE:settings]] - Paramètres
[[NAVIGATE:chat-live]] - Chat Live
[[NAVIGATE:people]] - Équipe/Utilisateurs

CONFIGURER UNE AUTOMATISATION :
Quand l'utilisateur demande de mettre en place une alerte, un rappel, ou une regle automatique, utilise cette commande :
[[CONFIGURE_AUTOMATION:{{
  "message": "La demande exacte de l'utilisateur recopiee en entier"
}}]]

Exemples de demandes d'automatisation :
- "Mets une alerte sur le capteur de temperature de la salle des machines a 32.5C"
- "Previens-moi quand le stock de filtres passe sous 5 unites"
- "Envoie un rappel toutes les 2 semaines pour verifier la pompe P-001"
- "Si un OT urgent n'est pas pris en charge en 4h, envoie un mail au chef de service"

Tu dois d'abord repondre a l'utilisateur que tu vas configurer l'automatisation, puis placer la commande a la fin de ta reponse.

CREER UN WIDGET SUR LE DASHBOARD SERVICE :
Quand l'utilisateur demande de creer un widget, un graphique, un indicateur, une jauge ou tout element visuel pour le Dashboard Service, utilise cette commande :
[[CREATE_WIDGET:{{
  "description": "Reformulation claire et complete de la demande de l'utilisateur incluant le type de visualisation, les donnees souhaitees, les filtres et toute formule mathematique mentionnee"
}}]]

Types de widgets possibles : valeur simple, jauge (pourcentage), graphique en lignes, graphique en barres, camembert, donut, tableau.
Sources de donnees : OT (nombre, par statut, par priorite, taux completion, duree moyenne), equipements (nombre, disponibilite), maintenance preventive (taux realisation, retards), demandes, presqu'accidents, capteurs MQTT, compteurs, inventaire (stock, ruptures, valeur), surveillance (conformite).
Formules : l'utilisateur peut demander des calculs entre sources (ex: "taux = termines / total * 100", "cout moyen par OT", "difference entre ce mois et le mois dernier").

Exemples :
- "Cree un camembert des OT par priorite" → [[CREATE_WIDGET:{{"description": "Camembert (pie_chart) montrant la repartition des ordres de travail par priorite"}}]]
- "Ajoute une jauge du taux de disponibilite des equipements" → [[CREATE_WIDGET:{{"description": "Jauge montrant le taux de disponibilite des equipements en pourcentage"}}]]
- "Cree un widget avec la formule : taux resolution = OT termines / OT total * 100" → [[CREATE_WIDGET:{{"description": "Widget de type jauge avec formule mathematique : taux de resolution = nombre d'OT termines divise par nombre total d'OT multiplie par 100. Necessite 2 sources FSAO (work_orders_count avec status_filter TERMINE et work_orders_count total) et une source formule."}}]]
- "Montre l'evolution de la temperature du capteur Salle Machines en courbe" → [[CREATE_WIDGET:{{"description": "Graphique en lignes (line_chart) montrant l'historique du capteur de temperature de la Salle des Machines"}}]]
- "Cree un indicateur du nombre de pieces en rupture de stock" → [[CREATE_WIDGET:{{"description": "Widget valeur simple montrant le nombre d'articles en rupture de stock dans l'inventaire"}}]]

Tu dois confirmer a l'utilisateur que tu crees le widget, decrire ce qui sera affiche, puis placer la commande a la fin de ta reponse.

🎯 ACTIONS AVEC SURBRILLANCE (naviguer ET mettre en évidence un bouton) :
[[ACTION:creer-ot]] - Aller aux OT et surligner le bouton Créer
[[ACTION:creer-equipement]] - Aller aux Équipements et surligner Ajouter
[[ACTION:creer-emplacement]] - Aller aux Zones et surligner Ajouter
[[ACTION:creer-maintenance]] - Aller à Maintenance Préventive et surligner Créer

═══════════════════════════════════════════════════════════════════════════════
🎓 GUIDAGE PAS À PAS AVEC SURBRILLANCE VISUELLE (TRÈS IMPORTANT)
═══════════════════════════════════════════════════════════════════════════════

Quand l'utilisateur demande "comment faire", "guide-moi", "montre-moi comment",
tu DOIS utiliser le système de guidage pas à pas avec surbrillance.

[[GUIDE_START:nom_du_guide]]
{{
  "title": "Titre du guide",
  "steps": [
    {{
      "instruction": "Ce que l'utilisateur doit faire",
      "target": "selecteur CSS de l'élément à surligner",
      "highlight_type": "pulse|glow|spotlight",
      "wait_for_click": true,
      "navigate_to": "/page (optionnel)"
    }},
    ...
  ]
}}
[[GUIDE_END]]

EXEMPLE - Guide pour créer un OT :
Si l'utilisateur dit "Comment créer un ordre de travail ?"

Tu réponds :
"Parfait ! Je vais te guider pas à pas pour créer un ordre de travail. Suis les étapes, je vais mettre en surbrillance chaque élément sur lequel tu dois cliquer. 🎯

[[GUIDE_START:creer_ot]]
{{
  "title": "Créer un Ordre de Travail",
  "steps": [
    {{
      "instruction": "Clique sur 'Ordres de travail' dans le menu à gauche pour accéder à la liste des OT",
      "target": "[data-testid='sidebar-work-orders'], a[href='/work-orders']",
      "highlight_type": "pulse",
      "wait_for_click": true,
      "context": "page"
    }},
    {{
      "instruction": "Clique sur le bouton '+ Nouvel Ordre (Vierge)' en haut à droite. Cela va ouvrir le formulaire de création.",
      "target": "[data-testid='btn-nouvel-ordre-vierge'], #btn-nouvel-ordre",
      "highlight_type": "glow",
      "wait_for_click": true,
      "context": "page",
      "opens_modal": true
    }},
    {{
      "instruction": "Dans le formulaire qui vient de s'ouvrir, remplis le titre de l'ordre de travail (champ obligatoire)",
      "target": "[data-testid='input-titre-ot'], #titre",
      "highlight_type": "spotlight",
      "wait_for_click": false,
      "context": "modal"
    }},
    {{
      "instruction": "Remplis la description de l'intervention à réaliser (champ obligatoire)",
      "target": "[data-testid='input-description-ot'], #description",
      "highlight_type": "spotlight",
      "wait_for_click": false,
      "context": "modal"
    }},
    {{
      "instruction": "Choisis la priorité de l'intervention (Haute, Moyenne, Basse ou Normale)",
      "target": "[data-testid='select-priorite-ot']",
      "highlight_type": "pulse",
      "wait_for_click": true,
      "context": "modal"
    }},
    {{
      "instruction": "Clique sur 'Créer' pour valider et enregistrer l'ordre de travail",
      "target": "[data-testid='btn-submit-ot'], button[type='submit']",
      "highlight_type": "glow",
      "wait_for_click": true,
      "context": "modal"
    }}
  ]
}}
[[GUIDE_END]]"

GUIDES PRÉDÉFINIS À UTILISER :
- creer_ot : Créer un ordre de travail
- creer_equipement : Ajouter un équipement
- creer_maintenance_preventive : Planifier une maintenance
- consulter_dashboard : Explorer le tableau de bord
- configurer_capteur : Configurer un capteur IoT
- gerer_inventaire : Gérer le stock de pièces

IMPORTANT POUR LES GUIDES :
- context: "page" = l'élément est sur la page principale
- context: "modal" = l'élément est dans un formulaire/dialogue qui s'ouvre par-dessus la page
- opens_modal: true = ce clic va ouvrir un formulaire, les étapes suivantes seront dans ce formulaire

═══════════════════════════════════════════════════════════════════════════════
✨ EFFETS VISUELS SUPPLÉMENTAIRES
═══════════════════════════════════════════════════════════════════════════════

[[SPOTLIGHT:selecteur]] - Effet projecteur sur un élément (assombrit le reste)
[[PULSE:selecteur]] - Effet pulsation lumineuse
[[GLOW:selecteur]] - Effet lueur continue
[[ARROW:selecteur]] - Flèche pointant vers l'élément
[[TOOLTIP:selecteur:message]] - Bulle d'info sur un élément
[[CELEBRATE]] - Effet confettis après une réussite

═══════════════════════════════════════════════════════════════════════════════
📚 AIDE CONTEXTUELLE PAR PAGE
═══════════════════════════════════════════════════════════════════════════════

Adapte TOUJOURS tes réponses à la PAGE ACTUELLE de l'utilisateur :

Si page = "dashboard" ou "tableau-de-bord" :
→ Parle des KPIs, statistiques, alertes en cours
→ Propose de détailler les OT urgents ou les équipements en panne

Si page = "work-orders" ou "ordres-de-travail" :
→ Aide sur la création, le suivi, la clôture des OT
→ Propose de filtrer par statut ou priorité

Si page = "equipments" ou "equipements" :
→ Aide sur la gestion des équipements, fiches techniques
→ Propose de voir l'historique de maintenance

Si page = "inventory" ou "inventaire" :
→ Aide sur le stock, les alertes niveau bas
→ Propose de faire une demande d'achat

Si page = "preventive-maintenance" ou "maintenance-prev" :
→ Aide sur la planification des maintenances
→ Propose de créer un nouveau plan

Si page = "sensors" ou "capteurs" :
→ Aide sur la configuration des capteurs IoT
→ Explique les seuils et alertes

═══════════════════════════════════════════════════════════════════════════════
⚠️ RÈGLES IMPORTANTES
═══════════════════════════════════════════════════════════════════════════════

1. TOUJOURS répondre en français
2. Être PROACTIVE : si tu vois des alertes ou OT urgents dans le contexte, mentionne-les
3. UTILISER les commandes d'action quand l'utilisateur demande de FAIRE quelque chose
4. UTILISER le guidage visuel quand l'utilisateur demande COMMENT faire
5. Rester dans le domaine de la FSAO - pour les questions hors sujet, redirige poliment
6. Être CONCISE mais COMPLÈTE - pas de blabla inutile
7. TOUJOURS proposer une action de suivi ("Veux-tu que je...", "Souhaites-tu...")
8. Si tu ne comprends pas, demande des précisions plutôt que de deviner

═══════════════════════════════════════════════════════════════════════════════
💬 EXEMPLES DE CONVERSATIONS IDÉALES
═══════════════════════════════════════════════════════════════════════════════

EXEMPLE 1 - Création d'OT par commande :
👤 "Crée un OT pour la pompe P-001, elle fuit"
🤖 "Je crée immédiatement un ordre de travail correctif pour la pompe P-001 avec la description 'Fuite détectée'. Quelle priorité souhaites-tu ? (Haute recommandée pour une fuite)
[[CREATE_OT:{{"titre": "Fuite pompe P-001", "description": "Fuite détectée - intervention requise - Equipement: P-001", "priorite": "HAUTE", "categorie": "TRAVAUX_CURATIF", "equipement_nom": "P-001"}}]]"

EXEMPLE 2 - Guidage pas à pas :
👤 "Comment je fais pour ajouter un équipement ?"
🤖 "Je vais te guider étape par étape ! Suis les zones en surbrillance. 🎯
[[GUIDE_START:creer_equipement]]..."

EXEMPLE 3 - Recherche intelligente :
👤 "Montre-moi tous les OT en retard"
🤖 "Je recherche les ordres de travail en retard...
[[SEARCH:{{"type": "work_orders", "filters": {{"statut": "en_retard"}}}}]]"

EXEMPLE 4 - Proactivité basée sur le contexte :
(Si contexte montre 3 OT urgents)
👤 "Bonjour"
🤖 "Bonjour ! 👋 Je vois que tu as 3 ordres de travail urgents en attente. Veux-tu que je te les affiche pour que tu puisses les prioriser ?
[[SEARCH:{{"type": "work_orders", "filters": {{"priorite": "haute", "statut": "en_attente"}}}}]]"

{app_context_text}

Tu es maintenant {gender_adj2} à aider l'utilisateur. Sois proactive, experte et bienveillante ! 🚀
"""


# ==================== Fonctions de Contexte Enrichi ====================

async def get_enriched_app_context(current_user: dict) -> dict:
    """
    Récupère le contexte enrichi de l'application avec des données CONCRÈTES
    pour que l'IA puisse répondre avec précision.
    """
    try:
        context = {
            "current_user_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip() or current_user.get('email', 'Utilisateur'),
            "current_user_role": current_user.get('role', 'N/A'),
            "current_user_service": current_user.get('service', 'N/A'),
            "current_page": "N/A",
            "last_action": "N/A"
        }

        # --- OT actifs : compteur + 5 derniers détails ---
        try:
            active_filter = {"statut": {"$in": ["en_attente", "en_cours", "En attente", "En cours"]}}
            context["active_work_orders"] = await db.work_orders.count_documents(active_filter)
            urgent_filter = {**active_filter, "priorite": {"$in": ["haute", "urgente", "Haute", "Urgente", "critical"]}}
            context["urgent_work_orders"] = await db.work_orders.count_documents(urgent_filter)
            recent_wos = await db.work_orders.find(
                active_filter, {"_id": 0, "id": 1, "titre": 1, "priorite": 1, "statut": 1, "type_maintenance": 1, "assigned_to_name": 1, "created_at": 1}
            ).sort("created_at", -1).to_list(length=5)
            context["recent_work_orders"] = [
                f"- {wo.get('titre','')} | {wo.get('priorite','?')} | {wo.get('statut','?')} | Assigné: {wo.get('assigned_to_name','Non assigné')}"
                for wo in recent_wos
            ]
        except Exception:
            context["active_work_orders"] = 0
            context["urgent_work_orders"] = 0
            context["recent_work_orders"] = []

        # --- Équipements en maintenance : compteur + noms ---
        try:
            eq_filter = {"statut": {"$in": ["en_maintenance", "En maintenance", "hors_service", "Hors service"]}}
            context["equipment_in_maintenance"] = await db.equipments.count_documents(eq_filter)
            eq_list = await db.equipments.find(
                eq_filter, {"_id": 0, "nom": 1, "reference": 1, "statut": 1, "emplacement": 1}
            ).to_list(length=5)
            context["equipment_details"] = [
                f"- {eq.get('nom','')} ({eq.get('reference','')}) | {eq.get('statut','')} | {eq.get('emplacement','')}"
                for eq in eq_list
            ]
        except Exception:
            context["equipment_in_maintenance"] = 0
            context["equipment_details"] = []

        # --- Alertes actives ---
        try:
            context["active_alerts"] = await db.alerts.count_documents({"read": False, "archived": False})
            alert_list = await db.alerts.find(
                {"read": False, "archived": False}, {"_id": 0, "title": 1, "message": 1, "severity": 1, "source_name": 1}
            ).sort("created_at", -1).to_list(length=5)
            context["alert_details"] = [
                f"- [{a.get('severity','?')}] {a.get('title','')} (source: {a.get('source_name','')})"
                for a in alert_list
            ]
        except Exception:
            context["active_alerts"] = 0
            context["alert_details"] = []

        # --- Capteurs en alerte ---
        try:
            context["sensors_in_alert"] = await db.sensors.count_documents(
                {"status": {"$in": ["alert", "warning", "critical"]}}
            )
        except Exception:
            context["sensors_in_alert"] = 0

        # --- Inventaire ---
        try:
            context["inventory_rupture"] = await db.inventory.count_documents({"$expr": {"$lte": ["$quantite", 0]}})
            context["inventory_low"] = await db.inventory.count_documents({
                "$and": [{"$expr": {"$gt": ["$quantite", 0]}}, {"$expr": {"$lte": ["$quantite", "$seuil_alerte"]}}]
            })
            low_items = await db.inventory.find(
                {"$expr": {"$lte": ["$quantite", "$seuil_alerte"]}},
                {"_id": 0, "nom": 1, "reference": 1, "quantite": 1, "seuil_alerte": 1}
            ).to_list(length=5)
            context["inventory_critical_items"] = [
                f"- {it.get('nom','')} ({it.get('reference','')}) : {it.get('quantite',0)} restant (seuil: {it.get('seuil_alerte',0)})"
                for it in low_items
            ]
        except Exception:
            context["inventory_rupture"] = 0
            context["inventory_low"] = 0
            context["inventory_critical_items"] = []

        # --- Maintenances préventives en retard ---
        try:
            today = datetime.now(timezone.utc)
            context["preventive_maintenance_overdue"] = await db.preventive_maintenances.count_documents({
                "prochaine_date": {"$lt": today}, "statut": {"$ne": "terminé"}
            })
        except Exception:
            context["preventive_maintenance_overdue"] = 0

        # --- Dernière action utilisateur ---
        try:
            last_audit = await db.audit_logs.find_one(
                {"user_id": current_user.get("id")}, sort=[("timestamp", -1)]
            )
            if last_audit:
                context["last_action"] = f"{last_audit.get('action', 'N/A')} sur {last_audit.get('entity_type', 'N/A')}"
        except Exception:
            context["last_action"] = "N/A"

        return context

    except Exception as e:
        logger.error(f"Erreur récupération contexte enrichi: {e}")
        return {
            "current_user_name": current_user.get('email', 'Utilisateur'),
            "current_user_role": current_user.get('role', 'N/A'),
            "active_work_orders": 0, "urgent_work_orders": 0,
            "equipment_in_maintenance": 0, "active_alerts": 0,
            "sensors_in_alert": 0, "current_page": "N/A", "last_action": "N/A"
        }


async def get_dynamic_query_context(message: str) -> str:
    """
    Analyse la question de l'utilisateur et effectue des requêtes DB ciblées
    pour fournir des données concrètes au LLM.
    """
    extra = []
    msg_lower = message.lower()

    try:
        # Détection de questions sur les OT
        if any(k in msg_lower for k in ["ordre", "ot ", " ot", "travail", "intervention"]):
            wos = await db.work_orders.find(
                {}, {"_id": 0, "id": 1, "titre": 1, "priorite": 1, "statut": 1, "type_maintenance": 1, "assigned_to_name": 1, "description": 1}
            ).sort("created_at", -1).to_list(length=10)
            if wos:
                lines = [f"  - [{wo.get('statut','')}] {wo.get('titre','')} | Priorite: {wo.get('priorite','')} | Type: {wo.get('type_maintenance','')} | Assigne: {wo.get('assigned_to_name','N/A')}" for wo in wos]
                extra.append(f"DERNIERS ORDRES DE TRAVAIL :\n" + "\n".join(lines))

        # Détection de questions sur les équipements
        if any(k in msg_lower for k in ["equipement", "machine", "pompe", "moteur", "compresseur"]):
            eqs = await db.equipments.find(
                {}, {"_id": 0, "id": 1, "nom": 1, "reference": 1, "statut": 1, "type": 1, "fabricant": 1, "emplacement": 1}
            ).sort("nom", 1).to_list(length=15)
            if eqs:
                lines = [f"  - {eq.get('nom','')} | Ref: {eq.get('reference','')} | Statut: {eq.get('statut','')} | Type: {eq.get('type','')} | Lieu: {eq.get('emplacement','')}" for eq in eqs]
                extra.append(f"EQUIPEMENTS :\n" + "\n".join(lines))

        # Détection de questions sur les capteurs
        if any(k in msg_lower for k in ["capteur", "sensor", "temperature", "pression", "vibration", "iot"]):
            sensors = await db.sensors.find(
                {}, {"_id": 0, "id": 1, "name": 1, "type": 1, "unit": 1, "last_value": 1, "status": 1, "alert_enabled": 1, "min_threshold": 1, "max_threshold": 1}
            ).to_list(length=10)
            if sensors:
                lines = [f"  - {s.get('name','')} | Type: {s.get('type','')} | Valeur: {s.get('last_value','?')}{s.get('unit','')} | Seuils: [{s.get('min_threshold','')}, {s.get('max_threshold','')}] | Alerte: {'Oui' if s.get('alert_enabled') else 'Non'}" for s in sensors]
                extra.append(f"CAPTEURS IoT :\n" + "\n".join(lines))

        # Détection de questions sur l'inventaire
        if any(k in msg_lower for k in ["inventaire", "stock", "piece", "filtre", "huile", "courroie"]):
            items = await db.inventory.find(
                {}, {"_id": 0, "nom": 1, "reference": 1, "quantite": 1, "seuil_alerte": 1, "emplacement": 1}
            ).sort("quantite", 1).to_list(length=10)
            if items:
                lines = [f"  - {it.get('nom','')} ({it.get('reference','')}) : {it.get('quantite',0)} en stock (seuil: {it.get('seuil_alerte',0)})" for it in items]
                extra.append(f"INVENTAIRE :\n" + "\n".join(lines))

        # Détection de questions sur le planning / équipe
        if any(k in msg_lower for k in ["planning", "equipe", "technicien", "charge", "disponib"]):
            members = await db.team_members.find(
                {}, {"_id": 0, "nom": 1, "prenom": 1, "poste": 1, "service": 1, "statut": 1}
            ).to_list(length=15)
            if members:
                lines = [f"  - {m.get('prenom','')} {m.get('nom','')} | {m.get('poste','')} | Service: {m.get('service','')} | Statut: {m.get('statut','')}" for m in members]
                extra.append(f"MEMBRES DE L'EQUIPE :\n" + "\n".join(lines))

        # Détection de questions sur les contrats
        if any(k in msg_lower for k in ["contrat", "fournisseur", "prestataire"]):
            contracts = await db.contracts.find(
                {}, {"_id": 0, "title": 1, "fournisseur": 1, "statut": 1, "date_fin": 1, "montant": 1}
            ).sort("date_fin", 1).to_list(length=10)
            if contracts:
                lines = [f"  - {c.get('title','')} | {c.get('fournisseur','')} | {c.get('statut','')} | Fin: {c.get('date_fin','?')}" for c in contracts]
                extra.append(f"CONTRATS :\n" + "\n".join(lines))

    except Exception as e:
        logger.warning(f"Erreur requete dynamique contexte: {e}")

    return "\n\n".join(extra) if extra else ""


# ==================== Endpoints ====================

@router.get("/context")
async def get_app_context(
    current_user: dict = Depends(get_current_user)
):
    """Récupérer le contexte enrichi de l'application pour l'IA"""
    try:
        context = await get_enriched_app_context(current_user)
        return {"context": context}
    except Exception as e:
        logger.error(f"Erreur récupération contexte: {e}")
        raise HTTPException(status_code=500, detail="Erreur récupération contexte")


@router.get("/providers")
async def get_llm_providers(
    current_user: dict = Depends(get_current_user)
):
    """Récupérer la liste des fournisseurs LLM disponibles"""
    try:
        # Vérifier quels fournisseurs sont disponibles (ont une clé API)
        providers_list = []
        
        for provider_id, provider_info in LLM_PROVIDERS.items():
            is_available = False
            
            # Vérifier si la clé est disponible
            key_name = provider_info.get("provider_key")
            if key_name:
                # Vérifier d'abord la clé globale, puis la clé Emergent
                global_key = await db.global_settings.find_one({"key": key_name})
                if global_key and global_key.get("value"):
                    is_available = True
                elif key_name == "EMERGENT_LLM_KEY":
                    # Vérifier la variable d'environnement
                    is_available = bool(os.environ.get("EMERGENT_LLM_KEY"))
            
            providers_list.append({
                "id": provider_info["id"],
                "name": provider_info["name"],
                "models": provider_info["models"],
                "requires_api_key": provider_info["requires_api_key"],
                "is_available": is_available
            })
        
        return {"providers": providers_list}
        
    except Exception as e:
        logger.error(f"Erreur récupération fournisseurs LLM: {e}")
        raise HTTPException(status_code=500, detail="Erreur récupération fournisseurs LLM")


@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user)
):
    """Envoyer un message au chatbot IA"""
    try:
        user_id = current_user.get("id")
        
        # Récupérer les préférences utilisateur pour l'IA
        preferences = await db.user_preferences.find_one({"user_id": user_id})
        
        assistant_name = preferences.get("ai_assistant_name", "Adria") if preferences else "Adria"
        assistant_gender = preferences.get("ai_assistant_gender", "female") if preferences else "female"
        llm_provider = preferences.get("ai_llm_provider", "gemini") if preferences else "gemini"
        llm_model = preferences.get("ai_llm_model", "gemini-2.5-flash") if preferences else "gemini-2.5-flash"
        language = preferences.get("language", "fr") if preferences else "fr"
        
        # Générer ou récupérer l'ID de session
        session_id = request.session_id or f"{user_id}_{str(uuid.uuid4())[:8]}"
        
        # Récupérer le contexte enrichi de l'application si demandé
        app_context = None
        if request.include_app_context:
            app_context = await get_enriched_app_context(current_user)
            # Ajouter le contexte de page si fourni
            if request.context:
                app_context["current_page"] = request.context
        
        # Récupérer l'historique de conversation
        history = await db.ai_chat_history.find(
            {"session_id": session_id}
        ).sort("timestamp", 1).to_list(length=50)
        
        # Requête dynamique : chercher des données spécifiques selon la question
        dynamic_context = await get_dynamic_query_context(request.message)
        
        # Sauvegarder le message de l'utilisateur
        user_message_doc = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "user_id": user_id,
            "role": "user",
            "content": request.message,
            "context": request.context,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.ai_chat_history.insert_one(user_message_doc)
        
        # Obtenir la réponse de l'IA
        try:
            response_text = await get_llm_response(
                message=request.message,
                history=history,
                assistant_name=assistant_name,
                assistant_gender=assistant_gender,
                language=language,
                provider=llm_provider,
                model=llm_model,
                context=request.context,
                app_context=app_context,
                dynamic_context=dynamic_context
            )
        except Exception as llm_error:
            logger.error(f"Erreur LLM: {llm_error}")
            response_text = f"Désolé, je rencontre actuellement des difficultés techniques. Veuillez réessayer dans quelques instants. (Erreur: {str(llm_error)[:100]})"
        
        # Sauvegarder la réponse de l'assistant
        assistant_message_doc = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "user_id": user_id,
            "role": "assistant",
            "content": response_text,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.ai_chat_history.insert_one(assistant_message_doc)
        
        return ChatResponse(response=response_text, session_id=session_id)
        
    except Exception as e:
        logger.error(f"Erreur chat IA: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Erreur chat IA: {str(e)}")


@router.get("/history/{session_id}")
async def get_chat_history(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Récupérer l'historique d'une conversation"""
    try:
        user_id = current_user.get("id")
        
        history = await db.ai_chat_history.find(
            {"session_id": session_id, "user_id": user_id},
            {"_id": 0}
        ).sort("timestamp", 1).to_list(length=100)
        
        return {"history": history, "session_id": session_id}
        
    except Exception as e:
        logger.error(f"Erreur récupération historique: {e}")
        raise HTTPException(status_code=500, detail="Erreur récupération historique")


@router.delete("/history/{session_id}")
async def clear_chat_history(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Effacer l'historique d'une conversation"""
    try:
        user_id = current_user.get("id")
        
        result = await db.ai_chat_history.delete_many(
            {"session_id": session_id, "user_id": user_id}
        )
        
        return {"success": True, "deleted_count": result.deleted_count}
        
    except Exception as e:
        logger.error(f"Erreur suppression historique: {e}")
        raise HTTPException(status_code=500, detail="Erreur suppression historique")


@router.get("/sessions")
async def get_user_sessions(
    current_user: dict = Depends(get_current_user)
):
    """Récupérer les sessions de conversation de l'utilisateur"""
    try:
        user_id = current_user.get("id")
        
        # Récupérer les sessions distinctes
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {
                "_id": "$session_id",
                "last_message": {"$last": "$timestamp"},
                "message_count": {"$sum": 1}
            }},
            {"$sort": {"last_message": -1}},
            {"$limit": 20}
        ]
        
        sessions = await db.ai_chat_history.aggregate(pipeline).to_list(length=20)
        
        return {"sessions": [
            {
                "session_id": s["_id"],
                "last_message": s["last_message"],
                "message_count": s["message_count"]
            } for s in sessions
        ]}
        
    except Exception as e:
        logger.error(f"Erreur récupération sessions: {e}")
        raise HTTPException(status_code=500, detail="Erreur récupération sessions")


# ==================== Endpoints Clés API Globales ====================

class GlobalLLMKeys(BaseModel):
    deepseek_api_key: Optional[str] = None
    mistral_api_key: Optional[str] = None

@router.get("/global-keys")
async def get_global_llm_keys(
    current_user: dict = Depends(get_current_admin_user)
):
    """Récupérer les clés API globales (admin seulement)"""
    try:
        keys = {}
        
        # Récupérer chaque clé
        for key_name in ["DEEPSEEK_API_KEY", "MISTRAL_API_KEY"]:
            setting = await db.global_settings.find_one({"key": key_name})
            # Masquer partiellement la clé pour la sécurité
            if setting and setting.get("value"):
                value = setting["value"]
                # Montrer seulement les 4 premiers et 4 derniers caractères
                if len(value) > 12:
                    masked = value[:4] + "*" * (len(value) - 8) + value[-4:]
                else:
                    masked = "****" + value[-4:] if len(value) > 4 else "****"
                keys[key_name.lower()] = masked
            else:
                keys[key_name.lower()] = ""
        
        return keys
        
    except Exception as e:
        logger.error(f"Erreur récupération clés LLM: {e}")
        raise HTTPException(status_code=500, detail="Erreur récupération clés LLM")


@router.put("/global-keys")
async def update_global_llm_keys(
    keys: GlobalLLMKeys,
    current_user: dict = Depends(get_current_admin_user)
):
    """Mettre à jour les clés API globales (admin seulement)"""
    try:
        from datetime import datetime, timezone
        
        # Mettre à jour chaque clé si elle est fournie et non masquée
        if keys.deepseek_api_key and not keys.deepseek_api_key.startswith("****") and "*" not in keys.deepseek_api_key:
            await db.global_settings.update_one(
                {"key": "DEEPSEEK_API_KEY"},
                {"$set": {
                    "key": "DEEPSEEK_API_KEY",
                    "value": keys.deepseek_api_key,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "updated_by": current_user.get("id")
                }},
                upsert=True
            )
            logger.info("Clé API DeepSeek mise à jour")
        
        if keys.mistral_api_key and not keys.mistral_api_key.startswith("****") and "*" not in keys.mistral_api_key:
            await db.global_settings.update_one(
                {"key": "MISTRAL_API_KEY"},
                {"$set": {
                    "key": "MISTRAL_API_KEY",
                    "value": keys.mistral_api_key,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "updated_by": current_user.get("id")
                }},
                upsert=True
            )
            logger.info("Clé API Mistral mise à jour")
        
        return {"success": True, "message": "Clés API mises à jour"}
        
    except Exception as e:
        logger.error(f"Erreur mise à jour clés LLM: {e}")
        raise HTTPException(status_code=500, detail="Erreur mise à jour clés LLM")


# ==================== Vérification des versions LLM ====================

# Source unique de vérité pour les modèles IA disponibles
# Utilisée par AccidentAISettings, FormAIModelSettings, et le vérificateur de versions
AVAILABLE_AI_MODELS = [
    {"provider": "openai", "model": "gpt-5.2", "label": "OpenAI GPT-5.2"},
    {"provider": "openai", "model": "gpt-4o", "label": "OpenAI GPT-4o"},
    {"provider": "openai", "model": "gpt-4o-mini", "label": "OpenAI GPT-4o Mini (Rapide)"},
    {"provider": "google", "model": "gemini-2.5-flash", "label": "Google Gemini 2.5 Flash"},
    {"provider": "google", "model": "gemini-2.5-pro-preview-05-06", "label": "Google Gemini 2.5 Pro"},
    {"provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "label": "Claude Sonnet 4.5"},
    {"provider": "deepseek", "model": "deepseek-chat", "label": "DeepSeek Chat"},
    {"provider": "deepseek", "model": "deepseek-coder", "label": "DeepSeek Coder"},
    {"provider": "mistral", "model": "mistral-large-latest", "label": "Mistral Large"},
]

# Versions connues des modèles (référence pour le vérificateur)
KNOWN_LLM_VERSIONS = {
    "gemini": {
        "latest": "gemini-2.5-flash",
        "versions": ["gemini-2.5-flash", "gemini-2.5-pro-preview-05-06", "gemini-2.5-flash-lite"],
        "last_check": None
    },
    "openai": {
        "latest": "gpt-5.2",
        "versions": ["gpt-5.2", "gpt-4o", "gpt-4o-mini"],
        "last_check": None
    },
    "anthropic": {
        "latest": "claude-sonnet-4-5-20250929",
        "versions": ["claude-sonnet-4-5-20250929", "claude-3-5-haiku-20241022"],
        "last_check": None
    },
    "deepseek": {
        "latest": "deepseek-chat",
        "versions": ["deepseek-chat", "deepseek-coder"],
        "last_check": None
    },
    "mistral": {
        "latest": "mistral-large-latest",
        "versions": ["mistral-large-latest", "mistral-medium-latest"],
        "last_check": None
    }
}

@router.get("/llm-versions")
async def get_llm_versions(
    current_user: dict = Depends(get_current_admin_user)
):
    """Récupérer les versions LLM actuelles et disponibles (admin seulement)"""
    try:
        # Récupérer les versions stockées
        stored_versions = await db.llm_versions.find_one({"id": "current"})
        
        if not stored_versions:
            # Initialiser avec les versions connues
            stored_versions = {
                "id": "current",
                "versions": KNOWN_LLM_VERSIONS,
                "last_check": None,
                "next_check": None
            }
            await db.llm_versions.insert_one(stored_versions)
        
        return {
            "versions": stored_versions.get("versions", KNOWN_LLM_VERSIONS),
            "last_check": stored_versions.get("last_check"),
            "next_check": stored_versions.get("next_check")
        }
        
    except Exception as e:
        logger.error(f"Erreur récupération versions LLM: {e}")
        raise HTTPException(status_code=500, detail="Erreur récupération versions LLM")


@router.get("/available-models")
async def get_available_models(
    current_user: dict = Depends(get_current_admin_user)
):
    """Retourne la liste unifiée des modèles IA disponibles pour les sélecteurs frontend"""
    try:
        # Lire depuis la DB (mis à jour par check_llm_updates)
        stored = await db.llm_versions.find_one({"id": "current"}, {"_id": 0})
        if stored and stored.get("available_models"):
            return {"models": stored["available_models"]}
        # Fallback : retourner la liste par défaut du code
        return {"models": AVAILABLE_AI_MODELS}
    except Exception as e:
        logger.error(f"Erreur récupération modèles disponibles: {e}")
        return {"models": AVAILABLE_AI_MODELS}


@router.post("/check-llm-updates")
async def check_llm_updates(
    current_user: dict = Depends(get_current_admin_user)
):
    """Vérifier et synchroniser les modèles LLM disponibles (admin seulement)"""
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        # Calculer la prochaine vérification (prochain lundi à 3h GMT)
        from datetime import timedelta
        today = datetime.now(timezone.utc)
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0 and today.hour >= 3:
            days_until_monday = 7
        next_monday = today.replace(hour=3, minute=0, second=0, microsecond=0) + timedelta(days=days_until_monday)
        
        # Synchroniser les modèles disponibles depuis le code (source de vérité)
        await db.llm_versions.update_one(
            {"id": "current"},
            {"$set": {
                "versions": KNOWN_LLM_VERSIONS,
                "available_models": AVAILABLE_AI_MODELS,
                "last_check": now,
                "next_check": next_monday.isoformat(),
                "checked_by": current_user.get("id")
            }},
            upsert=True
        )
        
        return {
            "success": True,
            "message": f"Modèles synchronisés : {len(AVAILABLE_AI_MODELS)} modèles disponibles",
            "last_check": now,
            "next_check": next_monday.isoformat(),
            "models_count": len(AVAILABLE_AI_MODELS)
        }
        
    except Exception as e:
        logger.error(f"Erreur vérification mises à jour LLM: {e}")
        raise HTTPException(status_code=500, detail="Erreur vérification mises à jour LLM")


@router.post("/notify-llm-update")
async def notify_llm_update(
    provider: str,
    new_version: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """Envoyer une notification email pour une nouvelle version LLM (admin seulement)"""
    try:
        # Récupérer les admins pour les notifier
        admins = await db.users.find({"role": "admin"}, {"_id": 0, "email": 1, "name": 1}).to_list(100)
        
        if not admins:
            return {"success": False, "message": "Aucun admin à notifier"}
        
        # Envoyer les emails (utiliser le service SMTP configuré)
        # Pour l'instant, on log juste l'action
        logger.info(f"Notification nouvelle version LLM: {provider} -> {new_version}")
        logger.info(f"Admins à notifier: {[a.get('email') for a in admins]}")
        
        # Stocker la notification
        await db.llm_notifications.insert_one({
            "id": str(uuid.uuid4()),
            "provider": provider,
            "new_version": new_version,
            "notified_at": datetime.now(timezone.utc).isoformat(),
            "notified_by": current_user.get("id"),
            "admins_notified": [a.get("email") for a in admins]
        })
        
        return {
            "success": True,
            "message": f"Notification envoyée pour {provider} v{new_version}",
            "admins_notified": len(admins)
        }
        
    except Exception as e:
        logger.error(f"Erreur notification mise à jour LLM: {e}")
        raise HTTPException(status_code=500, detail="Erreur notification mise à jour LLM")


# ==================== Actions Automatiques de l'IA ====================

class CreateOTRequest(BaseModel):
    titre: str
    description: Optional[str] = ""
    type_maintenance: Optional[str] = "CORRECTIVE"
    priorite: Optional[str] = "NORMALE"
    equipement_nom: Optional[str] = None
    temps_estime: Optional[str] = None

class AddTimeOTRequest(BaseModel):
    ot_reference: str  # ID ou numéro de l'OT
    temps: str  # Format: "2h30" ou "150" (minutes)
    commentaire: Optional[str] = None

class CommentOTRequest(BaseModel):
    ot_reference: str
    commentaire: str

class SearchRequest(BaseModel):
    type: str  # work_orders, equipments, inventory, maintenance
    query: Optional[str] = None
    filters: Optional[dict] = None

@router.post("/action/create-ot")
async def ai_create_work_order(
    request: CreateOTRequest,
    current_user: dict = Depends(get_current_user)
):
    """Créer un ordre de travail via l'IA"""
    try:
        import uuid
        
        # Chercher l'équipement si un nom est fourni
        equipement_id = None
        equipement_data = None
        emplacement_id = None
        emplacement_data = None
        if request.equipement_nom:
            equipement = await db.equipments.find_one({
                "$or": [
                    {"nom": {"$regex": request.equipement_nom, "$options": "i"}},
                    {"reference": {"$regex": request.equipement_nom, "$options": "i"}}
                ]
            })
            if equipement:
                eq_id = str(equipement.get("_id", "")) if equipement.get("_id") else equipement.get("id")
                equipement_id = eq_id
                equipement_data = {
                    "id": eq_id,
                    "nom": equipement.get("nom"),
                    "reference": equipement.get("reference")
                }
                # Récupérer l'emplacement de l'équipement
                emp_id = equipement.get("emplacement_id")
                if emp_id:
                    emplacement_id = str(emp_id)
                    emplacement_data = equipement.get("emplacement")
                    if not emplacement_data:
                        loc = await db.locations.find_one({"_id": emp_id})
                        if loc:
                            emplacement_data = {"id": str(emp_id), "nom": loc.get("nom", "")}
        
        # Valeurs par défaut
        priorite = (request.priorite or "NORMALE").upper()
        date_limite = datetime.now(timezone.utc)
        temps_estime_default = 120  # 2h00 par défaut
        
        # Parser le temps estimé
        temps_estime_minutes = None
        if request.temps_estime:
            temps_str = request.temps_estime.lower().strip()
            if 'h' in temps_str:
                parts = temps_str.replace('h', ':').replace('min', '').split(':')
                hours = int(parts[0]) if parts[0] else 0
                minutes = int(parts[1]) if len(parts) > 1 and parts[1] else 0
                temps_estime_minutes = hours * 60 + minutes
            else:
                temps_estime_minutes = int(temps_str)
        
        # Créer l'OT
        ot_id = str(uuid.uuid4())
        work_order = {
            "id": ot_id,
            "titre": request.titre,
            "description": request.description or f"Créé automatiquement par l'assistant IA",
            "type_maintenance": request.type_maintenance.upper(),
            "priorite": priorite,
            "statut": "EN_ATTENTE",
            "equipement_id": equipement_id,
            "equipement": equipement_data,
            "emplacement_id": emplacement_id,
            "emplacement": emplacement_data,
            "dateLimite": date_limite,
            "temps_estime": temps_estime_minutes if temps_estime_minutes else temps_estime_default,
            "temps_passe": 0,
            "dateCreation": datetime.now(timezone.utc),
            "created_by": current_user.get("id"),
            "created_by_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
            "createdBy": current_user.get("id"),
            "createdByName": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
            "created_via": "ai_assistant",
            "assigned_to": None,
            "comments": [],
            "attachments": [],
            "historique": [{
                "action": "creation",
                "date": datetime.now(timezone.utc).isoformat(),
                "user": current_user.get("email"),
                "details": "Créé via l'assistant IA Adria"
            }]
        }
        
        await db.work_orders.insert_one(work_order)
        
        logger.info(f"OT créé via IA: {ot_id} - {request.titre}")
        
        return {
            "success": True,
            "message": f"Ordre de travail créé avec succès",
            "work_order": {
                "id": ot_id,
                "titre": request.titre,
                "numero": f"#{ot_id[-4:].upper()}",
                "type": request.type_maintenance,
                "priorite": request.priorite,
                "equipement": equipement_data
            }
        }
        
    except Exception as e:
        logger.error(f"Erreur création OT via IA: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur création OT: {str(e)}")


@router.post("/action/add-time")
async def ai_add_time_to_ot(
    request: AddTimeOTRequest,
    current_user: dict = Depends(get_current_user)
):
    """Ajouter du temps à un ordre de travail via l'IA"""
    try:
        # Trouver l'OT par référence (ID, numéro ou titre)
        ref = request.ot_reference.replace('#', '').strip()
        
        work_order = await db.work_orders.find_one({
            "$or": [
                {"id": {"$regex": ref, "$options": "i"}},
                {"titre": {"$regex": ref, "$options": "i"}}
            ]
        })
        
        if not work_order:
            raise HTTPException(status_code=404, detail=f"Ordre de travail '{request.ot_reference}' non trouvé")
        
        # Parser le temps
        temps_str = request.temps.lower().strip()
        minutes_to_add = 0
        if 'h' in temps_str:
            parts = temps_str.replace('h', ':').replace('min', '').split(':')
            hours = int(parts[0]) if parts[0] else 0
            mins = int(parts[1]) if len(parts) > 1 and parts[1] else 0
            minutes_to_add = hours * 60 + mins
        else:
            minutes_to_add = int(temps_str)
        
        # Mettre à jour le temps passé
        current_time = work_order.get("temps_passe", 0) or 0
        new_time = current_time + minutes_to_add
        
        # Ajouter à l'historique
        history_entry = {
            "action": "ajout_temps",
            "date": datetime.now(timezone.utc).isoformat(),
            "user": current_user.get("email"),
            "details": f"Ajout de {request.temps} via l'assistant IA"
        }
        if request.commentaire:
            history_entry["commentaire"] = request.commentaire
        
        await db.work_orders.update_one(
            {"id": work_order["id"]},
            {
                "$set": {"temps_passe": new_time},
                "$push": {"historique": history_entry}
            }
        )
        
        logger.info(f"Temps ajouté via IA: {minutes_to_add}min sur OT {work_order['id']}")
        
        return {
            "success": True,
            "message": f"{request.temps} ajouté à l'OT",
            "work_order": {
                "id": work_order["id"],
                "titre": work_order.get("titre"),
                "temps_passe_total": new_time,
                "temps_ajoute": minutes_to_add
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur ajout temps via IA: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur ajout temps: {str(e)}")


@router.post("/action/comment")
async def ai_add_comment_to_ot(
    request: CommentOTRequest,
    current_user: dict = Depends(get_current_user)
):
    """Ajouter un commentaire à un ordre de travail via l'IA"""
    try:
        # Trouver l'OT
        ref = request.ot_reference.replace('#', '').strip()
        
        work_order = await db.work_orders.find_one({
            "$or": [
                {"id": {"$regex": ref, "$options": "i"}},
                {"titre": {"$regex": ref, "$options": "i"}}
            ]
        })
        
        if not work_order:
            raise HTTPException(status_code=404, detail=f"Ordre de travail '{request.ot_reference}' non trouvé")
        
        # Créer le commentaire
        comment = {
            "id": str(uuid.uuid4()),
            "text": request.commentaire,
            "author_id": current_user.get("id"),
            "author_name": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "via": "ai_assistant"
        }
        
        await db.work_orders.update_one(
            {"id": work_order["id"]},
            {"$push": {"comments": comment}}
        )
        
        logger.info(f"Commentaire ajouté via IA sur OT {work_order['id']}")
        
        return {
            "success": True,
            "message": "Commentaire ajouté",
            "work_order": {
                "id": work_order["id"],
                "titre": work_order.get("titre")
            },
            "comment": comment
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur ajout commentaire via IA: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur ajout commentaire: {str(e)}")


@router.post("/action/search")
async def ai_search(
    request: SearchRequest,
    current_user: dict = Depends(get_current_user)
):
    """Recherche intelligente dans les données FSAO via l'IA"""
    try:
        results = []
        filters = request.filters or {}
        
        if request.type == "work_orders":
            # Construire la requête MongoDB
            query = {}
            
            if filters.get("statut"):
                statut = filters["statut"].lower()
                query["statut"] = {"$regex": statut, "$options": "i"}
            
            if filters.get("priorite"):
                priorite = filters["priorite"].lower()
                query["priorite"] = {"$regex": priorite, "$options": "i"}
            
            if filters.get("type"):
                query["type_maintenance"] = {"$regex": filters["type"], "$options": "i"}
            
            if request.query:
                query["$or"] = [
                    {"titre": {"$regex": request.query, "$options": "i"}},
                    {"description": {"$regex": request.query, "$options": "i"}}
                ]
            
            cursor = db.work_orders.find(query, {"_id": 0}).sort("created_at", -1).limit(20)
            results = await cursor.to_list(length=20)
            
        elif request.type == "equipments":
            query = {}
            if request.query:
                query["$or"] = [
                    {"nom": {"$regex": request.query, "$options": "i"}},
                    {"reference": {"$regex": request.query, "$options": "i"}},
                    {"type": {"$regex": request.query, "$options": "i"}}
                ]
            
            if filters.get("statut"):
                query["statut"] = {"$regex": filters["statut"], "$options": "i"}
            
            cursor = db.equipments.find(query, {"_id": 0}).limit(20)
            results = await cursor.to_list(length=20)
            
        elif request.type == "inventory":
            query = {}
            if request.query:
                query["$or"] = [
                    {"nom": {"$regex": request.query, "$options": "i"}},
                    {"reference": {"$regex": request.query, "$options": "i"}}
                ]
            
            if filters.get("alerte"):
                query["$expr"] = {"$lte": ["$quantite", "$seuil_alerte"]}
            
            cursor = db.inventory.find(query, {"_id": 0}).limit(20)
            results = await cursor.to_list(length=20)
            
        elif request.type == "maintenance":
            query = {}
            if filters.get("en_retard"):
                query["prochaine_date"] = {"$lt": datetime.now(timezone.utc)}
            
            cursor = db.preventive_maintenances.find(query, {"_id": 0}).limit(20)
            results = await cursor.to_list(length=20)
        
        # Convertir les dates pour la sérialisation JSON
        for item in results:
            for key, value in item.items():
                if isinstance(value, datetime):
                    item[key] = value.isoformat()
        
        return {
            "success": True,
            "type": request.type,
            "count": len(results),
            "results": results
        }
        
    except Exception as e:
        logger.error(f"Erreur recherche IA: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur recherche: {str(e)}")


# ==================== Speech-to-Text (STT) et Text-to-Speech (TTS) ====================

from fastapi import UploadFile, File
import base64
import tempfile

@router.post("/voice/transcribe")
async def transcribe_audio_endpoint(
    audio: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Transcrit un fichier audio en texte via OpenAI Whisper
    Utilise la clé Emergent LLM
    """
    try:
        # Récupérer la clé API
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            gk = await db.global_settings.find_one({"key": "EMERGENT_LLM_KEY"})
            if gk and gk.get("value"):
                api_key = gk["value"]
        if not api_key:
            raise HTTPException(status_code=500, detail="Clé API non configurée pour la transcription")
        
        # Lire le contenu audio
        audio_content = await audio.read()
        
        if len(audio_content) == 0:
            raise HTTPException(status_code=400, detail="Fichier audio vide")
        
        logger.info(f"Transcription audio: {len(audio_content)} bytes, type: {audio.content_type}")
        
        # Sauvegarder temporairement le fichier
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_file:
            tmp_file.write(audio_content)
            tmp_path = tmp_file.name
        
        try:
            # Utiliser emergentintegrations pour Whisper
            from emergentintegrations.llm.openai import OpenAISpeechToText
            
            stt = OpenAISpeechToText(api_key=api_key)
            
            with open(tmp_path, "rb") as audio_file:
                response = await stt.transcribe(
                    file=audio_file,
                    model="whisper-1",
                    response_format="json",
                    language="fr"
                )
            
            transcription = response.text if hasattr(response, 'text') else str(response)
            
            logger.info(f"Audio transcrit avec succès: {transcription[:50]}...")
            
            return {
                "success": True,
                "transcription": transcription
            }
            
        except ImportError as ie:
            logger.warning(f"emergentintegrations non disponible: {ie}, utilisation du fallback httpx")
            
            # Fallback: utiliser l'API OpenAI directement via httpx
            import httpx
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                with open(tmp_path, "rb") as f:
                    files = {"file": ("audio.webm", f, "audio/webm")}
                    data = {"model": "whisper-1", "language": "fr"}
                    
                    response = await client.post(
                        "https://api.openai.com/v1/audio/transcriptions",
                        headers={"Authorization": f"Bearer {api_key}"},
                        files=files,
                        data=data
                    )
                    
            if response.status_code == 200:
                result = response.json()
                transcription = result.get("text", "")
                logger.info(f"Audio transcrit (fallback): {transcription[:50]}...")
                return {
                    "success": True,
                    "transcription": transcription
                }
            else:
                logger.error(f"Erreur API Whisper: {response.status_code} - {response.text}")
                raise HTTPException(status_code=500, detail=f"Erreur transcription: {response.text}")
                
        finally:
            # Nettoyer le fichier temporaire
            try:
                import os as os_module
                os_module.unlink(tmp_path)
            except:
                pass
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur transcription audio: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur transcription: {str(e)}")


@router.post("/voice/synthesize")
async def synthesize_speech(
    text: str,
    voice: str = "nova",  # Options: alloy, echo, fable, onyx, nova, shimmer
    current_user: dict = Depends(get_current_user)
):
    """
    Synthèse vocale (Text-to-Speech) via OpenAI TTS
    Retourne l'audio en base64
    """
    try:
        # Récupérer la clé API
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            gk = await db.global_settings.find_one({"key": "EMERGENT_LLM_KEY"})
            if gk and gk.get("value"):
                api_key = gk["value"]
        if not api_key:
            raise HTTPException(status_code=500, detail="Clé API non configurée pour la synthèse vocale")
        
        # Limiter la longueur du texte
        if len(text) > 4096:
            text = text[:4096]
        
        try:
            from emergentintegrations.llm.openai import text_to_speech as ei_tts
            
            # Générer l'audio
            audio_content = await ei_tts(
                api_key=api_key,
                text=text,
                voice=voice,
                model="tts-1"
            )
            
            # Encoder en base64
            audio_base64 = base64.b64encode(audio_content).decode('utf-8')
            
            return {
                "success": True,
                "audio_base64": audio_base64,
                "format": "mp3"
            }
            
        except ImportError:
            # Fallback: utiliser l'API OpenAI directement
            import httpx
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "tts-1",
                        "input": text,
                        "voice": voice,
                        "response_format": "mp3"
                    }
                )
                
            if response.status_code == 200:
                audio_base64 = base64.b64encode(response.content).decode('utf-8')
                return {
                    "success": True,
                    "audio_base64": audio_base64,
                    "format": "mp3"
                }
            else:
                raise HTTPException(status_code=500, detail=f"Erreur synthèse vocale: {response.text}")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur synthèse vocale: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur synthèse vocale: {str(e)}")


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "nova"  # nova = voix féminine naturelle

@router.post("/voice/tts")
async def text_to_speech_endpoint(
    request: TTSRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Endpoint alternatif pour TTS avec body JSON
    """
    return await synthesize_speech(request.text, request.voice, current_user)


# ==================== Fonction LLM ====================

async def get_llm_response(
    message: str,
    history: list,
    assistant_name: str,
    assistant_gender: str,
    language: str,
    provider: str,
    model: str,
    context: str = None,
    app_context: dict = None,
    dynamic_context: str = ""
) -> str:
    """Obtenir une réponse du LLM avec mémoire de conversation et contexte enrichi"""
    
    # Récupérer la clé API
    api_key = None
    provider_info = LLM_PROVIDERS.get(provider, LLM_PROVIDERS["gemini"])
    key_name = provider_info.get("provider_key", "EMERGENT_LLM_KEY")
    
    global_key = await db.global_settings.find_one({"key": key_name})
    if global_key and global_key.get("value"):
        api_key = global_key["value"]
    else:
        api_key = os.environ.get(key_name) or os.environ.get("EMERGENT_LLM_KEY")
    
    if not api_key:
        raise Exception(f"Clé API non configurée pour {provider}")
    
    # Préparer le message système avec le contexte enrichi
    system_message = get_system_message(assistant_name, assistant_gender, language, app_context)
    
    if context and not app_context:
        system_message += f"\n\nContexte actuel de l'utilisateur : {context}"
    
    # Construire initial_messages avec l'historique complet
    messages = [{"role": "system", "content": system_message}]
    
    # Injecter l'historique de conversation (les 20 derniers messages pour limiter les tokens)
    recent_history = history[-20:] if len(history) > 20 else history
    for msg in recent_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    
    # Ajouter le contexte dynamique au message courant si disponible
    enriched_message = message
    if dynamic_context:
        enriched_message = f"{message}\n\n[DONNEES PERTINENTES DE LA BASE DE DONNEES]\n{dynamic_context}"
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        ei_provider = provider
        if provider in ["deepseek", "mistral"]:
            logger.warning(f"Provider {provider} non supporté par Emergent, fallback sur gemini")
            ei_provider = "gemini"
            model = "gemini-2.5-flash"
        
        # Créer le chat avec l'historique complet via initial_messages
        chat = LlmChat(
            api_key=api_key,
            session_id=f"gmao_{assistant_name}_{uuid.uuid4().hex[:6]}",
            system_message=system_message,
            initial_messages=messages
        )
        
        chat.with_model(ei_provider, model)
        
        user_message = UserMessage(text=enriched_message)
        response = await chat.send_message(user_message)
        
        return response
        
    except ImportError:
        logger.error("emergentintegrations non installé")
        raise Exception("Le module emergentintegrations n'est pas installé")
    except Exception as e:
        logger.error(f"Erreur appel LLM: {e}")
        raise
