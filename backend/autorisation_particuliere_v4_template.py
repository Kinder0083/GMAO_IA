"""
Template HTML — Autorisation Particulière de Travaux
Format : MAINT/FE/003 Version 4 — Impression A4 portrait — Révision 2
Corrections appliquées (14 points) :
  1  En-tête : structure tableau 4 colonnes × 4 lignes correcte
  2  Positionnement : Date col 1, MAINT/FE/003 col 2+3, Version 4 col 4
  3  Cases à cocher : <input type="checkbox"> natifs
  4  Type de travaux : 2 lignes flex
  5  Champs texte : <input type="text"> inline (pas de textarea)
  6  En-tête tableau : PRECAUTIONS A PRENDRE | EQUIPEMENT COMPLEMENTAIRE
  7  Libellés sans accents + points de suspension originaux
  8  Précautions supplémentaires : ligne pied de tableau fond gris
  9  Validation : mise en page flex inline
 10  Visa AM : 50/50
 11  Post-travaux : lignes ~15mm
 12  Pied de page : centré, visible à l'impression
 13  @media print A4 strict, 1 seule page
 14  Espacements compactés (2-4px max)
"""

# ── Libellés SANS ACCENTS exactement comme le document original ──────────────
S1_ITEMS = [
    ("CONSIGNATION MAT. OU PIECE EN MOUV...",  "s1_consignation_mat"),
    ("CONSIGNATION ELECTRIQUE\u2026\u2026\u2026\u2026\u2026\u2026\u2026...", "s1_consignation_elec"),
    ("DEBRANCHEMENT FORCE MOTRICE\u2026\u2026\u2026.",  "s1_debranchement"),
    ("VIDANGE APPAREIL/TUYAUTERIE\u2026.\u2026\u2026..\u2026",  "s1_vidange"),
    ("DECONTAMINATION/LAVAGE\u2026\u2026\u2026\u2026\u2026\u2026.",  "s1_decontamination"),
    ("DEGAZAGE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026..\u2026",  "s1_degazage"),
    ("POSE JOINT PLEIN\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.",  "s1_joint_plein"),
    ("VENTILATION FORCEE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.",  "s1_ventilation"),
    ("ZONE BALISEE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026....\u2026\u2026",  "s1_zone_balisee"),
]

S2_ITEMS = [
    ("CANALISATION ELECTRIQUES",                            "s2_canalisations_elec"),
    ("SOUTERRAINES BALISEES\u2026\u2026\u2026\u2026\u2026...",  "s2_souterraines"),
    ("EGOUTS ET CABLES PROTEGES\u2026..\u2026.",             "s2_egouts_cables"),
    ("TAUX D'OXYGENE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.",  "s2_taux_oxygene"),
    ("TAUX D'EXPLOSIVITE\u2026\u2026\u2026\u2026\u2026\u2026\u2026....",       "s2_taux_explosivite"),
    ("EXPLOSIMETRE EN CONTINU\u2026\u2026\u2026\u2026\u2026.",  "s2_explosimetre"),
    ("ECLAIRAGE DE SURETE\u2026\u2026\u2026\u2026.\u2026....",  "s2_eclairage_surete"),
    ("EXTINCTEUR TYPE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.",  "s2_extincteur"),
    ("AUTRES\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.",  "s2_autres"),
]

S3_ITEMS = [
    ("VISIERE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.",   "s3_visiere"),
    ("TENUE IMPERMEABLE, BOTTE\u2026\u2026\u2026\u2026.",     "s3_tenue"),
    ("CAGOULE AIR RESPIRABLE/ART\u2026\u2026.",              "s3_cagoule"),
    ("MASQUE TYPE :\u2026\u2026\u2026\u2026.\u2026\u2026\u2026\u2026\u2026\u2026.",   "s3_masque"),
    ("GANT TYPE :\u2026\u2026\u2026\u2026.\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s3_gant"),
    ("HARNAIS DE SECURITE\u2026\u2026\u2026\u2026\u2026\u2026.", "s3_harnais"),
    ("OUTILLAGE ANTI-ETINCELLE\u2026\u2026\u2026\u2026.",     "s3_outillage"),
    ("PRESENCE D'UN SURVEILLANT\u2026\u2026\u2026.",          "s3_surveillant"),
    ("AUTRES.\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s3_autres"),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cb(val) -> str:
    """Checkbox booléen — coché si val est truthy."""
    c = "checked" if val else ""
    return (
        f'<input type="checkbox" {c} '
        'style="width:11px;height:11px;margin:0 2px;vertical-align:middle;'
        '-webkit-print-color-adjust:exact;print-color-adjust:exact;">'
    )


def _radio(field_val: str, choice: str) -> str:
    """Checkbox représentant NON / OUI / FAIT — coché si field_val == choice."""
    c = "checked" if (str(field_val).upper() == choice) else ""
    return (
        f'<input type="checkbox" {c} '
        'style="width:10px;height:10px;margin:0 1px;'
        '-webkit-print-color-adjust:exact;print-color-adjust:exact;">'
    )


def _txt(key: str, data: dict, width: str = "100%", extra: str = "") -> str:
    """Input texte inline pré-rempli."""
    raw = data.get(key, "")
    val = str(raw).replace('"', "&quot;").replace("<", "&lt;") if raw else ""
    return (
        f'<input type="text" value="{val}" '
        f'style="width:{width};border:none;border-bottom:1px solid #444;'
        f'background:transparent;font-family:Arial,sans-serif;font-size:8pt;'
        f'padding:0 2px;box-sizing:border-box;{extra}">'
    )


def _date_input(val: str) -> str:
    safe = str(val).replace('"', "") if val else ""
    return (
        f'<input type="date" value="{safe}" '
        'style="border:none;border-bottom:1px solid #444;background:transparent;'
        'font-family:Arial,sans-serif;font-size:8pt;padding:0 2px;">'
    )


# ── Générateur principal ──────────────────────────────────────────────────────

def generate_autorisation_v4_html(data: dict) -> str:
    """Génère le HTML A4 pour l'Autorisation Particulière MAINT/FE/003 V4."""

    d = data  # alias court

    # Lignes du tableau précautions
    rows_html = ""
    for i in range(9):
        s1l, s1k = S1_ITEMS[i]
        s2l, s2k = S2_ITEMS[i]
        s3l, s3k = S3_ITEMS[i]
        s1v = str(d.get(s1k, "")).upper()
        s2v = str(d.get(s2k, "")).upper()
        s3v = str(d.get(s3k, "")).upper()

        rows_html += f"""
      <tr>
        <td style="font-size:6.5pt;padding:1px 3px;white-space:nowrap;">{s1l}</td>
        <td style="text-align:center;padding:1px;">{_radio(s1v,'NON')}</td>
        <td style="text-align:center;padding:1px;">{_radio(s1v,'OUI')}</td>
        <td style="text-align:center;padding:1px;border-right:2px solid #000;">{_radio(s1v,'FAIT')}</td>
        <td style="font-size:6.5pt;padding:1px 3px;white-space:nowrap;">{s2l}</td>
        <td style="text-align:center;padding:1px;">{_radio(s2v,'NON')}</td>
        <td style="text-align:center;padding:1px;">{_radio(s2v,'OUI')}</td>
        <td style="text-align:center;padding:1px;border-right:2px solid #000;">{_radio(s2v,'FAIT')}</td>
        <td style="font-size:6.5pt;padding:1px 3px;white-space:nowrap;">{s3l}</td>
        <td style="text-align:center;padding:1px;">{_radio(s3v,'NON')}</td>
        <td style="text-align:center;padding:1px;">{_radio(s3v,'OUI')}</td>
      </tr>"""

    # Valeurs des champs simples
    date_form   = str(d.get("date_formulaire", ""))
    supp        = str(d.get("precautions_supp", "") or "")
    etabli_par  = str(d.get("etabli_par", "") or "")
    etabli_le   = str(d.get("etabli_le", "") or "")
    delivre_a   = str(d.get("delivre_a", "") or "")
    entreprise  = str(d.get("entreprise", "") or "")
    visa_am     = str(d.get("visa_am", "") or "")
    visa_30     = str(d.get("visa_30min", "") or "")
    visa_1h     = str(d.get("visa_1h", "") or "")
    visa_2h     = str(d.get("visa_2h", "") or "")

    def esc(v): return str(v).replace('"', "&quot;").replace("<", "&lt;")

    def inl(key, w="100%", ex=""):
        return _txt(key, d, w, ex)

    def inl_val(val, w="100%", ex=""):
        safe = esc(val)
        return (
            f'<input type="text" value="{safe}" '
            f'style="width:{w};border:none;border-bottom:1px solid #444;'
            f'background:transparent;font-family:Arial,sans-serif;font-size:8pt;'
            f'padding:0 2px;box-sizing:border-box;{ex}">'
        )

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Autorisation Particulière de Travaux — MAINT/FE/003 V4</title>
<style>
/* ─── IMPRESSION A4 ─────────────────────────────────────── */
@page {{
  size: A4 portrait;
  margin: 8mm 10mm 8mm 10mm;
}}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{
  font-family: Arial, sans-serif;
  font-size: 8pt;
  color: #000;
  background: #fff;
}}
.container {{ width:100%; page-break-inside:avoid; }}
table {{ width:100%; border-collapse:collapse; }}
th, td {{ border:1px solid #000; vertical-align:middle; padding:1px 3px; }}
p {{ margin:2px 0; font-size:8pt; }}
.flex-row {{ display:flex; align-items:baseline; margin-bottom:2px; }}
.flex-row span {{ white-space:nowrap; margin-right:4px; font-size:8pt; }}
.field-line {{ margin-bottom:2px; }}
input[type="text"], input[type="date"] {{
  font-family: Arial, sans-serif;
  font-size: 8pt;
  border: none;
  border-bottom: 1px solid #444;
  background: transparent;
  outline: none;
  padding: 0 2px;
}}
input[type="checkbox"] {{
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  width: 11px;
  height: 11px;
  margin: 0 2px;
  vertical-align: middle;
  cursor: pointer;
}}
/* ─── @media print ──────────────────────────────────────── */
@media print {{
  .no-print {{ display:none !important; }}
  body {{ font-size:8pt; margin:0; padding:0; }}
  .container {{ width:100%; max-width:100%; box-shadow:none; margin:0; padding:0; }}
  p, div, tr {{ line-height:1.2; }}
  input[type="text"], input[type="date"] {{
    border:none !important;
    border-bottom:1px solid #000 !important;
    background:transparent !important;
    padding:0 !important;
  }}
  input[type="checkbox"] {{
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    width:10px;
    height:10px;
  }}
}}
</style>
</head>
<body>
<div class="container">

<!-- ══ ZONE 1 — EN-TÊTE ══════════════════════════════════════════════ -->
<table style="margin-bottom:3px;">
  <colgroup>
    <col style="width:22%;">
    <col style="width:30%;">
    <col style="width:31%;">
    <col style="width:17%;">
  </colgroup>

  <!-- Ligne 1 : Logo | Titre (col 2+3) | Page 1/1 -->
  <tr style="height:18mm;">
    <td style="text-align:center;padding:4px;">
      <svg width="82" height="38" xmlns="http://www.w3.org/2000/svg">
        <path d="M8,34 Q13,9 32,4 Q19,19 28,34 Z" fill="#4CAF50"/>
        <text x="36" y="28" font-family="Arial" font-size="21" font-weight="bold" fill="#003366">IRIS</text>
      </svg>
    </td>
    <td colspan="2" style="text-align:center;padding:4px;">
      <div style="font-size:11pt;">FORMULAIRE / ENREGISTREMENT</div>
      <div style="font-size:14pt;font-weight:bold;">Autorisation particuli&#232;re de travaux</div>
    </td>
    <td style="text-align:center;font-size:9pt;">Page 1/1</td>
  </tr>

  <!-- Ligne 2 : Date | MAINT/FE/003 (col 2+3) | Version 4 -->
  <tr style="height:10mm;">
    <td style="font-size:8pt;padding:3px;">
      Date&#160;:&#160;{_date_input(date_form)}
    </td>
    <td colspan="2" style="text-align:center;font-weight:bold;font-size:13pt;">MAINT/FE/003</td>
    <td style="text-align:center;font-size:9pt;">Version 4</td>
  </tr>

  <!-- Ligne 3 : séparateur gris -->
  <tr>
    <td colspan="4" style="background:#CCCCCC;height:4mm;border-top:1px solid #000;border-bottom:1px solid #000;border-left:1px solid #000;border-right:1px solid #000;padding:0;line-height:0;font-size:0;">&nbsp;</td>
  </tr>

  <!-- Ligne 4 : Rédigée par | Approuvée par -->
  <tr style="height:12mm;">
    <td colspan="2" style="font-size:8pt;padding:3px;">
      R&#233;dig&#233;e par&#160;: <strong>G.BUENO</strong><br>
      <em style="font-size:7pt;">Responsable Maintenance</em>
    </td>
    <td colspan="2" style="font-size:8pt;padding:3px;">
      Approuv&#233;e par&#160;: <strong>T.GARNIER</strong><br>
      <em style="font-size:7pt;">Directeur d&rsquo;Activit&#233;</em>
    </td>
  </tr>
</table>

<!-- ══ ZONE 2 — AVERTISSEMENT ════════════════════════════════════════ -->
<p style="font-weight:bold;margin:3px 0 2px;">A r&#233;diger par l&rsquo;agent de ma&#238;trise avant le d&#233;but des travaux&#160;:</p>
<div style="border:2px solid #000;text-align:center;padding:3px 6px;font-weight:bold;font-size:9pt;margin-bottom:4px;">
  A LIRE ATTENTIVEMENT<br>
  A CONSERVER PAR L&rsquo;EXECUTANT PENDANT L&rsquo;INTERVENTION
</div>

<!-- ══ ZONE 3 — INFORMATIONS TRAVAUX ═════════════════════════════════ -->
<p style="font-weight:bold;margin:2px 0;">Cette autorisation particuli&#232;re de travail concerne des travaux&#160;:</p>

<!-- Ligne 1 : 3 checkboxes flex sur toute la largeur -->
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;width:100%;">
  <label style="display:inline-flex;align-items:center;gap:3px;font-size:8pt;cursor:pointer;">
    {_cb(d.get('type_point_chaud'))}&nbsp;par point chaud
  </label>
  <label style="display:inline-flex;align-items:center;gap:3px;font-size:8pt;cursor:pointer;">
    {_cb(d.get('type_fouille'))}&nbsp;de fouille
  </label>
  <label style="display:inline-flex;align-items:center;gap:3px;font-size:8pt;cursor:pointer;">
    {_cb(d.get('type_espace_clos'))}&nbsp;en espace clos ou confin&#233;
  </label>
</div>
<!-- Ligne 2 : autre cas -->
<div class="field-line" style="display:flex;align-items:baseline;margin-bottom:4px;">
  <label style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;margin-right:4px;font-size:8pt;cursor:pointer;">
    {_cb(d.get('type_autre_cas'))}&nbsp;autre cas&#160;:
  </label>
  {inl('detail_autre_cas','calc(100% - 90px)')}
</div>

<!-- Champs d'information -->
<div class="field-line" style="display:flex;align-items:baseline;margin-bottom:2px;">
  <span style="white-space:nowrap;margin-right:4px;">D&#233;tail des travaux &#224; r&#233;aliser&#160;:</span>
  {inl('detail_travaux','calc(100% - 210px)')}
</div>
<div class="field-line" style="margin-bottom:2px;">{inl_val('','100%')}</div>
<div class="field-line" style="margin-bottom:3px;">{inl_val('','100%')}</div>

<div class="field-line" style="display:flex;align-items:baseline;margin-bottom:2px;">
  <span style="white-space:nowrap;margin-right:4px;">Lieu d&rsquo;intervention&#160;:</span>
  {inl('lieu_intervention','calc(100% - 130px)')}
</div>

<div class="field-line" style="display:flex;align-items:baseline;margin-bottom:2px;">
  <span style="white-space:nowrap;margin-right:4px;">Mat&#233;riel ou appareillage utilis&#233; par l&rsquo;entreprise&#160;:</span>
  {inl('materiel','calc(100% - 330px)')}
</div>

<div class="field-line" style="display:flex;align-items:baseline;margin-bottom:2px;">
  <span style="white-space:nowrap;margin-right:4px;">Dernier produit ou fluide contenu dans l&rsquo;appareil (ou tuyauterie)&#160;:</span>
  {inl('produit_fluide','calc(100% - 400px)')}
</div>
<div class="field-line" style="margin-bottom:3px;">{inl_val('','100%')}</div>

<div class="field-line" style="display:flex;align-items:baseline;margin-bottom:2px;">
  <span style="white-space:nowrap;margin-right:4px;">Danger associ&#233;&#160;:</span>
  {inl('danger_associe','calc(100% - 120px)')}
</div>

<div class="field-line" style="display:flex;align-items:baseline;margin-bottom:2px;">
  <span style="white-space:nowrap;margin-right:4px;">Appareil, mat&#233;riel ou activit&#233; avoisinantes pr&#233;sentant un danger&#160;:</span>
  {inl('appareil_danger','calc(100% - 400px)')}
</div>
<div class="field-line" style="margin-bottom:4px;">{inl_val('','100%')}</div>

<!-- ══ ZONE 4 — TABLEAU DES PRÉCAUTIONS ══════════════════════════════ -->
<p style="font-weight:bold;margin:2px 0;">Pr&#233;cautions &#224; prendre&#160;:</p>
<table style="font-size:6.5pt;margin-bottom:3px;">
  <colgroup>
    <col style="width:29%;">
    <col style="width:3.2%;">
    <col style="width:3.2%;">
    <col style="width:3.2%;">
    <col style="width:21%;">
    <col style="width:3.2%;">
    <col style="width:3.2%;">
    <col style="width:3.2%;">
    <col style="width:21%;">
    <col style="width:3.2%;">
    <col style="width:3.2%;">
  </colgroup>

  <!-- En-tête niveau 1 -->
  <tr style="background:#e0e0e0;font-weight:bold;font-size:6.5pt;">
    <th colspan="8" style="text-align:center;padding:2px;border-right:2px solid #000;">
      PRECAUTIONS A PRENDRE
    </th>
    <th colspan="3" style="text-align:center;padding:2px;">
      EQUIPEMENT COMPLEMENTAIRE
    </th>
  </tr>

  <!-- En-tête niveau 2 -->
  <tr style="background:#f0f0f0;font-size:6pt;font-weight:bold;">
    <th style="padding:1px 3px;">Lib&#233;ll&#233;</th>
    <th style="text-align:center;">NON</th>
    <th style="text-align:center;">OUI</th>
    <th style="text-align:center;border-right:2px solid #000;">FAIT</th>
    <th style="padding:1px 3px;">Lib&#233;ll&#233;</th>
    <th style="text-align:center;">NON</th>
    <th style="text-align:center;">OUI</th>
    <th style="text-align:center;border-right:2px solid #000;">FAIT</th>
    <th style="padding:1px 3px;">Lib&#233;ll&#233;</th>
    <th style="text-align:center;">NON</th>
    <th style="text-align:center;">OUI</th>
  </tr>

  {rows_html}

  <!-- Pied de tableau : précautions supplémentaires -->
  <tr style="background:#f0f0f0;">
    <td colspan="11" style="padding:2px 5px;border-top:1px solid #000;">
      <strong>PRECAUTIONS SUPPLEMENTAIRES&#160;:</strong>&#160;
      {inl_val(supp,'calc(100% - 230px)')}
      <br>
      {inl_val('','100%','margin-top:2px;')}
    </td>
  </tr>
</table>

<!-- ══ ZONE 5 — VALIDATION ═══════════════════════════════════════════ -->
<p style="font-weight:bold;margin:2px 0;">Validation (Responsable du site ou son d&#233;l&#233;gu&#233;)&#160;:</p>

<div class="field-line" style="display:flex;gap:12px;margin-bottom:2px;">
  <div style="display:flex;align-items:baseline;flex:2;">
    <span style="white-space:nowrap;margin-right:4px;">Cette autorisation est &#233;tablie par&#160;:</span>
    {inl_val(etabli_par,'100%')}
  </div>
  <div style="display:flex;align-items:baseline;flex:1;">
    <span style="white-space:nowrap;margin-right:4px;">Le&#160;:</span>
    {inl_val(etabli_le,'100%')}
  </div>
</div>

<div class="field-line" style="display:flex;gap:12px;margin-bottom:3px;">
  <div style="display:flex;align-items:baseline;flex:1;">
    <span style="white-space:nowrap;margin-right:4px;">Est d&#233;livr&#233;e &#224;&#160;:</span>
    {inl_val(delivre_a,'100%')}
  </div>
  <div style="display:flex;align-items:baseline;flex:1;">
    <span style="white-space:nowrap;margin-right:4px;">de l&rsquo;entreprise&#160;:</span>
    {inl_val(entreprise,'100%')}
  </div>
</div>

<!-- Tableau Visa AM 50/50 -->
<table style="margin-bottom:4px;">
  <tr style="height:25mm;">
    <td style="width:50%;font-size:9pt;font-weight:bold;padding:4px;vertical-align:middle;">
      Nom et visa AM ou responsable d&rsquo;intervention
    </td>
    <td style="width:50%;padding:4px;vertical-align:top;">
      <textarea style="width:100%;height:22mm;border:none;background:transparent;font-family:Arial;font-size:8pt;resize:none;">{esc(visa_am)}</textarea>
    </td>
  </tr>
</table>

<!-- ══ ZONE 6 — VÉRIFICATION POST-TRAVAUX ════════════════════════════ -->
<p style="font-weight:bold;margin:2px 0;">
  V&#233;rification &#224; la fin des travaux de l&rsquo;absence de risque r&#233;siduel suite &#224; l&rsquo;intervention
</p>
<table style="margin-bottom:5px;">
  <tr style="background:#e0e0e0;">
    <th style="width:60%;text-align:center;font-size:9pt;padding:2px;">Visite AM apr&#232;s la fin de l&rsquo;intervention</th>
    <th style="width:40%;text-align:center;font-size:9pt;padding:2px;">Visa AM</th>
  </tr>
  <tr style="height:15mm;">
    <td style="text-align:center;font-size:8pt;">30 minutes</td>
    <td style="padding:3px;">{inl_val(visa_30,'100%')}</td>
  </tr>
  <tr style="height:15mm;">
    <td style="text-align:center;font-size:8pt;">1 heure</td>
    <td style="padding:3px;">{inl_val(visa_1h,'100%')}</td>
  </tr>
  <tr style="height:15mm;">
    <td style="text-align:center;font-size:8pt;">2 heures</td>
    <td style="padding:3px;">{inl_val(visa_2h,'100%')}</td>
  </tr>
</table>

<!-- ══ PIED DE PAGE ══════════════════════════════════════════════════ -->
<p style="text-align:center;font-style:italic;font-size:8pt;margin-top:5px;">
  Remettre une copie &#224; l&rsquo;intervenant &#8211; Archivage Direction du site
</p>

</div>
</body>
</html>"""

    return html
