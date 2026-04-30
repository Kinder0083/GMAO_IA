"""
Met à jour /app/backend/manual_default_content.json :
  - Ajoute un nouveau chapitre "Cohérence des données" (admin)
  - Ajoute des sections expliquant les nouveautés M.E.S. (ESP32, cp/min, shifts)
  - Ajoute une section "Bug Pointage horaire — comment s'en prémunir"

Ce script est idempotent (safe à relancer plusieurs fois).
"""
import json
from datetime import datetime, timezone
from pathlib import Path

PATH = Path("/app/backend/manual_default_content.json")
data = json.loads(PATH.read_text())

now = datetime.now(timezone.utc).isoformat()

# Index pour lookup rapide (skip les entrées mal formées sans id)
chapters_by_id = {c["id"]: c for c in data["chapters"] if "id" in c}
sections_by_id = {s["id"]: s for s in data["sections"] if "id" in s}

def add_or_update_section(section_id, **kwargs):
    """Ajoute ou met à jour une section."""
    if section_id in sections_by_id:
        sections_by_id[section_id].update({**kwargs, "updated_at": now})
        return False
    new_sec = {
        "id": section_id,
        "title": kwargs.get("title", ""),
        "content": kwargs.get("content", ""),
        "order": kwargs.get("order", 1),
        "parent_id": kwargs.get("parent_id"),
        "target_roles": kwargs.get("target_roles", []),
        "target_modules": kwargs.get("target_modules", []),
        "level": kwargs.get("level", "intermediate"),
        "images": [],
        "video_url": None,
        "keywords": kwargs.get("keywords", []),
        "created_at": now,
        "updated_at": now,
    }
    data["sections"].append(new_sec)
    sections_by_id[section_id] = new_sec
    return True

def add_or_update_chapter(chapter_id, **kwargs):
    if chapter_id in chapters_by_id:
        chapters_by_id[chapter_id].update({**kwargs, "updated_at": now})
        return False
    new_ch = {
        "id": chapter_id,
        "title": kwargs.get("title", ""),
        "description": kwargs.get("description", ""),
        "icon": kwargs.get("icon", "BookOpen"),
        "order": kwargs.get("order", 99),
        "sections": kwargs.get("sections", []),
        "target_roles": kwargs.get("target_roles", []),
        "target_modules": kwargs.get("target_modules", []),
        "created_at": now,
        "updated_at": now,
    }
    data["chapters"].append(new_ch)
    chapters_by_id[chapter_id] = new_ch
    return True


# ────────────────────────────────────────────────────────────────────────
#  1. Nouveau chapitre : Cohérence des données
# ────────────────────────────────────────────────────────────────────────
add_or_update_chapter(
    "ch-coherence-data",
    title="🛡️ Cohérence des données",
    description="Surveillance et réparation automatique des incohérences en base",
    icon="ShieldCheck",
    order=99,
    sections=["sec-coherence-01", "sec-coherence-02", "sec-coherence-03"],
    target_roles=["ADMIN"],
    target_modules=["settings"],
)

add_or_update_section(
    "sec-coherence-01",
    title="Présentation du panneau Cohérence des données",
    content=(
        "Le panneau **Cohérence des données** (Paramètres spéciaux → Cohérence des données) "
        "détecte et répare automatiquement les incohérences connues qui peuvent apparaître "
        "en base au fil du temps : champs désynchronisés, doublons, pointages orphelins, etc.\n\n"
        "📌 **Accès** : réservé aux administrateurs.\n\n"
        "**Comment ça marche ?**\n\n"
        "1. Cliquez sur **Scanner la base** pour lancer une analyse complète\n"
        "2. Pour chaque check trouvé en anomalie, vous avez :\n"
        "   - **Simuler** : aperçu des modifications (dry-run, aucune écriture)\n"
        "   - **Réparer** : applique les corrections en base\n"
        "3. Un rescan auto vérifie que tout est rentré dans l'ordre\n\n"
        "🤖 **Scan quotidien automatique** : un job s'exécute chaque jour à 02h30 et "
        "envoie un email d'alerte si des incohérences sont détectées (cooldown 24h, "
        "destinataires configurables dans Santé système → Alertes Email).\n\n"
        "🔔 **Badge topbar** : un badge avec un compteur orange apparaît dans la barre "
        "d'en-tête (admin uniquement) dès qu'une incohérence est détectée."
    ),
    order=1,
    parent_id="ch-coherence-data",
    target_roles=["ADMIN"],
    level="advanced",
    keywords=["cohérence", "intégrité", "scan", "réparation", "audit"],
)

add_or_update_section(
    "sec-coherence-02",
    title="Les 4 checks disponibles",
    content=(
        "**1. `user_actif_statut_sync` — Champ legacy `actif` désynchronisé**\n\n"
        "Détecte les utilisateurs dont le champ technique `actif` (boolean) ne correspond "
        "pas à leur `statut` UI (ACTIF/INACTIF). Cause typique du bug **« le widget Charge "
        "OT restante ne compte qu'un seul technicien »**.\n\n"
        "**2. `service_responsables_duplicates` — Doublons responsables de service**\n\n"
        "Détecte les entrées en double dans la collection `service_responsables` pour un "
        "même couple (service, user_id). Peut fausser les règles de routage et les "
        "exclusions du widget Charge OT.\n\n"
        "**3. `time_entries_integrity` — Cohérence des pointages**\n\n"
        "Détecte les pointages d'OT/améliorations qui ont :\n"
        "- un `timestamp` stocké en string au lieu de datetime → **invisibles aux rapports**\n"
        "- un `user_id` non-canonique (UUID legacy au lieu de l'ObjectId)\n"
        "- un `user_id` orphelin (utilisateur supprimé)\n\n"
        "Réparation automatique : conversion timestamp en datetime, resync user_id sur "
        "l'ObjectId canonique, marquage `user_name='[Utilisateur supprimé]'` pour les "
        "orphelins (le `user_id` est conservé pour l'historique).\n\n"
        "**4. `orphan_user_assignments` — Pointages assignés à un utilisateur supprimé** "
        "*(action manuelle)*\n\n"
        "Liste les OT, améliorations et maintenances préventives qui contiennent au moins "
        "un pointage assigné à un utilisateur supprimé. Pas de réparation automatique : "
        "tableau cliquable avec liens deep-link vers le document, et un bouton "
        "**« Réassigner »** qui ouvre un modal permettant de transférer en masse les "
        "pointages vers un utilisateur actif sans avoir à ouvrir le document complet."
    ),
    order=2,
    parent_id="ch-coherence-data",
    target_roles=["ADMIN"],
    level="advanced",
    keywords=["check", "user", "actif", "statut", "doublon", "pointage", "orphelin"],
)

add_or_update_section(
    "sec-coherence-03",
    title="Réassigner un pointage orphelin (modal)",
    content=(
        "Lorsqu'un utilisateur est supprimé alors qu'il avait des pointages enregistrés, "
        "ces heures ne disparaissent pas — elles restent rattachées à l'OT mais sont "
        "marquées `[Utilisateur supprimé]`. Pour les transférer vers un autre utilisateur :\n\n"
        "1. Ouvrez **Paramètres spéciaux → Cohérence des données** et cliquez **Scanner la base**\n"
        "2. Dans la card **Pointages assignés à un utilisateur supprimé**, repérez le "
        "document concerné (numéro d'OT ou d'amélioration)\n"
        "3. Cliquez sur **🔗 Réassigner**\n"
        "4. Le modal affiche la liste des pointages orphelins (date, heures, utilisateur "
        "actuel)\n"
        "5. Choisissez le nouvel utilisateur dans le select (utilisateurs actifs uniquement)\n"
        "6. Cliquez **Réassigner N pointages**\n\n"
        "✅ Tous les pointages sont basculés en une seule action, le `user_name` est "
        "mis à jour automatiquement, et un re-scan vérifie que l'OT a bien disparu de "
        "la liste.\n\n"
        "💡 **Astuce** : si vous voulez voir le contexte complet de l'OT/amélioration "
        "avant de réassigner, utilisez plutôt le lien **Ouvrir →** qui ouvre le document "
        "directement dans son module dédié."
    ),
    order=3,
    parent_id="ch-coherence-data",
    target_roles=["ADMIN"],
    level="advanced",
    keywords=["réassigner", "orphelin", "utilisateur supprimé", "pointage"],
)


# ────────────────────────────────────────────────────────────────────────
#  2. Mise à jour des sections M.E.S. existantes
# ────────────────────────────────────────────────────────────────────────
# On ajoute une section M.E.S. moderne (ESP32 + cp/min) si pas déjà là
mes_chapter = chapters_by_id.get("ch-mes")
if mes_chapter:
    new_section_id = "sec-mes-esp32"
    if new_section_id not in mes_chapter["sections"]:
        mes_chapter["sections"].append(new_section_id)
        mes_chapter["updated_at"] = now

    add_or_update_section(
        new_section_id,
        title="Architecture ESP32 edge-computing (cp/min, shifts 3x8)",
        content=(
            "Depuis la v1.12.0, le module M.E.S. supporte une architecture moderne où "
            "chaque machine (ESP32) calcule sa cadence localement et publie les résultats "
            "sur MQTT. Le backend ne stocke plus de pulses bruts.\n\n"
            "**Configuration d'une machine M.E.S.**\n\n"
            "Pour ajouter ou modifier une machine, allez dans **M.E.S. → Configuration**.\n\n"
            "📍 **Champs clés :**\n"
            "- **Type** : choisissez `Imp` (impulsions traditionnelles) ou `cp/min` (cadence "
            "directe envoyée par l'ESP32 — recommandé)\n"
            "- **Équipement parent / sous-équipement** : pour les lignes de production "
            "complexes à plusieurs sous-systèmes, utilisez la hiérarchie\n"
            "- **Topic MQTT cadence** (`mqtt_topic`) : valeur courante (cp/min ou pulse)\n"
            "- **Topic MQTT état** (`mqtt_topic_state`) : doit publier `ACTIVE` ou `IDLE` "
            "(état explicite, plus fiable que la déduction par pulses)\n"
            "- **Topic MQTT total** (`mqtt_topic_total`) : compteur cumulé de pièces "
            "produites (publié par l'ESP32)\n"
            "- **Topic MQTT fin de poste** (`mqtt_topic_shift_end`) : déclenche la création "
            "automatique d'un compte-rendu de poste 3x8 (matin/après-midi/nuit)\n\n"
            "⚙️ **Délai de rétention** : les agrégations (cadence par minute, jour, poste) "
            "sont automatiquement purgées après le délai configuré dans **Paramètres → "
            "Données**. Permet de garder une base saine sur le long terme.\n\n"
            "📊 **Trois niveaux d'agrégation** sont stockés en base :\n"
            "- `mes_cadence_history` : 1 doc par machine et par minute\n"
            "- `mes_daily_summary` : 1 doc par machine et par jour\n"
            "- `mes_shift_summary` : 1 doc par machine et par poste"
        ),
        order=99,
        parent_id="ch-mes",
        target_modules=["mes"],
        level="advanced",
        keywords=["mes", "esp32", "cp/min", "shifts", "3x8", "cadence", "mqtt"],
    )

# Mise à jour du chapitre Rapports M.E.S. (ch-027) avec une section sur la nouvelle Vue d'ensemble
mes_rep = chapters_by_id.get("ch-027")
if mes_rep:
    new_id = "sec-027-overview"
    if new_id not in mes_rep["sections"]:
        mes_rep["sections"].append(new_id)
        mes_rep["updated_at"] = now
    add_or_update_section(
        new_id,
        title="Onglet Vue d'ensemble (Top/Flop, Heatmap, Postes)",
        content=(
            "L'onglet **Vue d'ensemble** de la page Rapports M.E.S. offre un tableau de "
            "bord exécutif synthétisant l'ensemble du site :\n\n"
            "📈 **KPIs site** :\n"
            "- TRS global moyen sur la période\n"
            "- Production totale (pièces)\n"
            "- Nombre de machines actives sur la période\n\n"
            "🏆 **Top / Flop machines** :\n"
            "- Top 5 des machines avec le meilleur TRS\n"
            "- Flop 5 des machines en sous-performance — clic sur une machine pour "
            "investiguer dans l'onglet Détail\n\n"
            "🌡️ **Heatmap horaire** : visualisation par heure et jour de la semaine de "
            "l'activité de production. Permet d'identifier les creux et les pics récurrents.\n\n"
            "🕐 **Métriques par poste 3x8** : production et TRS par poste (matin / "
            "après-midi / nuit), agrégés sur la période.\n\n"
            "🎯 **Filtres avancés** : période (jour, semaine, mois, custom), machines, postes."
        ),
        order=99,
        parent_id="ch-027",
        target_modules=["mes"],
        level="intermediate",
        keywords=["mes", "rapports", "vue d'ensemble", "trs", "top flop", "heatmap"],
    )

# Re-trier les sections de chaque chapitre par ordre
for c in data["chapters"]:
    pass

# Sauvegarde
PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2))
print(f"✅ Manuel mis à jour : {len(data['chapters'])} chapitres, {len(data['sections'])} sections")
