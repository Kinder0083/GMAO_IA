"""
Template HTML — Autorisation Particulière de Travaux
Format : MAINT/FE/003 Version 4 — Impression A4 portrait

USAGE :
    from autorisation_particuliere_v4_template import generate_autorisation_v4_html
    html = generate_autorisation_v4_html(data_dict)

Le HTML généré s'affiche dans un navigateur et produit UNE SEULE PAGE A4
fidèle au document Word original lors d'une impression via Ctrl+P / window.print().

CLÉS DU DICTIONNAIRE data :
  date_formulaire     : str  "YYYY-MM-DD"
  type_point_chaud    : bool
  type_fouille        : bool
  type_espace_clos    : bool
  type_autre_cas      : bool
  detail_autre_cas    : str
  detail_travaux      : str   (1ère ligne)
  detail_travaux_2    : str   (2e  ligne)
  detail_travaux_3    : str   (3e  ligne)
  lieu_intervention   : str
  materiel            : str
  produit_fluide      : str   (1ère ligne)
  produit_fluide_2    : str   (2e  ligne)
  danger_associe      : str
  appareil_danger     : str   (1ère ligne)
  appareil_danger_2   : str   (2e  ligne)

  Tableau précautions — valeur attendue : "NON", "OUI", "FAIT" ou ""
  s1_consignation_mat, s1_consignation_elec, s1_debranchement, s1_vidange,
  s1_decontamination, s1_degazage, s1_joint_plein, s1_ventilation, s1_zone_balisee
  s2_canalisations_elec, s2_souterraines, s2_egouts_cables, s2_taux_oxygene,
  s2_taux_explosivite, s2_explosimetre, s2_eclairage_surete, s2_extincteur, s2_autres
  s3_visiere, s3_tenue, s3_cagoule, s3_masque, s3_gant, s3_harnais,
  s3_outillage, s3_surveillant, s3_autres

  precautions_supp    : str  (ligne 1 précautions supplémentaires)
  precautions_supp_2  : str  (ligne 2)
  etabli_par          : str
  etabli_le           : str
  delivre_a           : str
  entreprise          : str
  visa_am             : str
  visa_30min          : str
  visa_1h             : str
  visa_2h             : str
"""

# ─────────────────────────────────────────────────────────────────────────────
# Libellés du tableau — MAJUSCULES SANS ACCENTS + points de suspension originaux
# ─────────────────────────────────────────────────────────────────────────────
S1_ITEMS = [
    ("CONSIGNATION MAT. OU PIECE EN MOUV...",                       "s1_consignation_mat"),
    ("CONSIGNATION ELECTRIQUE\u2026\u2026\u2026\u2026\u2026\u2026\u2026...",   "s1_consignation_elec"),
    ("DEBRANCHEMENT FORCE MOTRICE\u2026\u2026\u2026.",              "s1_debranchement"),
    ("VIDANGE APPAREIL/TUYAUTERIE\u2026.\u2026\u2026..\u2026",      "s1_vidange"),
    ("DECONTAMINATION/LAVAGE\u2026\u2026\u2026\u2026\u2026\u2026.", "s1_decontamination"),
    ("DEGAZAGE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026..\u2026", "s1_degazage"),
    ("POSE JOINT PLEIN\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s1_joint_plein"),
    ("VENTILATION FORCEE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s1_ventilation"),
    ("ZONE BALISEE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026....\u2026\u2026", "s1_zone_balisee"),
]

S2_ITEMS = [
    ("CANALISATION ELECTRIQUES",                                     "s2_canalisations_elec"),
    ("SOUTERRAINES BALISEES\u2026\u2026\u2026\u2026\u2026...",       "s2_souterraines"),
    ("EGOUTS ET CABLES PROTEGES\u2026..\u2026.",                     "s2_egouts_cables"),
    ("TAUX D\u2019OXYGENE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s2_taux_oxygene"),
    ("TAUX D\u2019EXPLOSIVITE\u2026\u2026\u2026\u2026\u2026\u2026\u2026....", "s2_taux_explosivite"),
    ("EXPLOSIMETRE EN CONTINU\u2026\u2026\u2026\u2026\u2026.",       "s2_explosimetre"),
    ("ECLAIRAGE DE SURETE\u2026\u2026\u2026\u2026.\u2026....",       "s2_eclairage_surete"),
    ("EXTINCTEUR TYPE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s2_extincteur"),
    ("AUTRES\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s2_autres"),
]

S3_ITEMS = [
    ("VISIERE\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s3_visiere"),
    ("TENUE IMPERMEABLE, BOTTE\u2026\u2026\u2026\u2026.",            "s3_tenue"),
    ("CAGOULE AIR RESPIRABLE/ART\u2026\u2026.",                      "s3_cagoule"),
    ("MASQUE TYPE :\u2026\u2026\u2026\u2026.\u2026\u2026\u2026\u2026\u2026\u2026.", "s3_masque"),
    ("GANT TYPE :\u2026\u2026\u2026\u2026.\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s3_gant"),
    ("HARNAIS DE SECURITE\u2026\u2026\u2026\u2026\u2026\u2026.",     "s3_harnais"),
    ("OUTILLAGE ANTI-ETINCELLE\u2026\u2026\u2026\u2026.",            "s3_outillage"),
    ("PRESENCE D\u2019UN SURVEILLANT\u2026\u2026\u2026.",            "s3_surveillant"),
    ("AUTRES.\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026\u2026.", "s3_autres"),
]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers HTML
# ─────────────────────────────────────────────────────────────────────────────

def _esc(v) -> str:
    """Échappe les caractères HTML spéciaux."""
    return (str(v)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")) if v else ""


def _cb(val) -> str:
    """Checkbox booléenne — cochée si val est truthy."""
    checked = "checked" if val else ""
    return (
        f'<input type="checkbox" {checked} '
        'style="width:10px;height:10px;margin:0 2px 0 0;vertical-align:middle;'
        'accent-color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;">'
    )


def _radio(field_val: str, choice: str) -> str:
    """Checkbox NON/OUI/FAIT — cochée si field_val == choice."""
    checked = "checked" if str(field_val).upper().strip() == choice else ""
    return (
        f'<input type="checkbox" {checked} '
        'style="width:9px;height:9px;margin:0 auto;display:block;'
        'accent-color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;">'
    )


# Style commun des inputs texte
_INPUT_STYLE = (
    "border:none;background:transparent;"
    "font-family:Arial,sans-serif;font-size:7.5pt;"
    "padding:0 1px;box-sizing:border-box;outline:none;vertical-align:baseline;"
)


def _inp(key: str, data: dict, width: str = "100%", extra: str = "") -> str:
    """Input texte depuis data[key]."""
    val = _esc(str(data.get(key) or ""))
    return f'<input type="text" value="{val}" style="width:{width};{_INPUT_STYLE}{extra}">'


def _inp_v(val, width: str = "100%", extra: str = "") -> str:
    """Input texte avec valeur directe."""
    safe = _esc(str(val or ""))
    return f'<input type="text" value="{safe}" style="width:{width};{_INPUT_STYLE}{extra}">'


def _date(val: str) -> str:
    safe = _esc(str(val or ""))
    return (
        f'<input type="date" value="{safe}" '
        f'style="border:none;background:transparent;font-family:Arial,sans-serif;font-size:7.5pt;padding:0 1px;outline:none;">'
    )


# ─────────────────────────────────────────────────────────────────────────────
# Générateur principal
# ─────────────────────────────────────────────────────────────────────────────

def generate_autorisation_v4_html(data: dict) -> str:
    """Retourne le HTML complet du formulaire MAINT/FE/003 V4."""

    d = data

    # ── Lignes du tableau précautions ─────────────────────────────────────────
    rows = ""
    for i in range(9):
        s1l, s1k = S1_ITEMS[i]
        s2l, s2k = S2_ITEMS[i]
        s3l, s3k = S3_ITEMS[i]
        v1 = str(d.get(s1k) or "").upper().strip()
        v2 = str(d.get(s2k) or "").upper().strip()
        v3 = str(d.get(s3k) or "").upper().strip()
        rows += (
            f'<tr style="height:10px;">'
            f'<td class="lb">{s1l}</td>'
            f'<td class="ck">{_radio(v1,"NON")}</td>'
            f'<td class="ck">{_radio(v1,"OUI")}</td>'
            f'<td class="ck rs">{_radio(v1,"FAIT")}</td>'
            f'<td class="lb">{s2l}</td>'
            f'<td class="ck">{_radio(v2,"NON")}</td>'
            f'<td class="ck">{_radio(v2,"OUI")}</td>'
            f'<td class="ck rs">{_radio(v2,"FAIT")}</td>'
            f'<td class="lb">{s3l}</td>'
            f'<td class="ck">{_radio(v3,"NON")}</td>'
            f'<td class="ck">{_radio(v3,"OUI")}</td>'
            f'</tr>\n'
        )

    # ── Valeurs extraites ──────────────────────────────────────────────────────
    date_v    = str(d.get("date_formulaire") or "")
    supp1     = str(d.get("precautions_supp")   or "")
    supp2     = str(d.get("precautions_supp_2") or "")
    etpar     = str(d.get("etabli_par")  or "")
    etle      = str(d.get("etabli_le")   or "")
    deliv     = str(d.get("delivre_a")   or "")
    entrep    = str(d.get("entreprise")  or "")
    visa_am   = str(d.get("visa_am")     or "")
    v30       = str(d.get("visa_30min")  or "")
    v1h       = str(d.get("visa_1h")     or "")
    v2h       = str(d.get("visa_2h")     or "")

    # ── HTML ──────────────────────────────────────────────────────────────────
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Autorisation Particuli&#232;re de Travaux &#8212; MAINT/FE/003 V4</title>
<style>
/* ── RESET ────────────────────────────────────────────── */
*{{margin:0;padding:0;box-sizing:border-box;}}
body{{font-family:Arial,sans-serif;font-size:8pt;color:#000;background:#f0f0f0;}}

/* ── CONTENEUR A4 ─────────────────────────────────────── */
.apt{{
  width:210mm;
  margin:10px auto;
  padding:6mm 8mm 5mm 8mm;
  background:#fff;
  box-shadow:0 2px 14px rgba(0,0,0,.25);
}}

/* ── TABLEAUX ─────────────────────────────────────────── */
table{{width:100%;border-collapse:collapse;}}
th,td{{border:1px solid #000;vertical-align:middle;padding:1px 3px;}}

/* ── INPUTS ───────────────────────────────────────────── */
input[type=text],input[type=date]{{
  font-family:Arial,sans-serif;font-size:7.5pt;
  border:none;
  background:transparent;outline:none;padding:0 1px;
  vertical-align:baseline;
}}
input[type=checkbox]{{
  accent-color:#000;cursor:pointer;vertical-align:middle;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}}
textarea{{
  font-family:Arial,sans-serif;font-size:7.5pt;
  border:none;background:transparent;outline:none;resize:none;
}}

/* ── LIGNES DE CHAMPS ─────────────────────────────────── */
.fl{{display:flex;align-items:baseline;margin-bottom:1.5px;line-height:1.3;}}
.lbl{{white-space:nowrap;flex-shrink:0;margin-right:3px;font-size:8pt;}}
.bold{{font-weight:bold;}}
.ln{{display:block;width:100%;margin-bottom:1.5px;}}

/* ── TABLEAU PRÉCAUTIONS ──────────────────────────────── */
.tprec{{font-size:6.3pt;margin-bottom:2px;table-layout:fixed;}}
.tprec col.cl1{{width:28%;}}
.tprec col.ccb{{width:2.5%;}}
.tprec col.cl2{{width:21%;}}
.tprec col.cl3{{width:19.5%;}}
.lb{{font-size:6.3pt;padding:1px 2px;overflow:hidden;white-space:nowrap;}}
.ck{{text-align:center;padding:1px 0;}}
.rs{{border-right:2px solid #000 !important;}}
.hd1{{text-align:center;font-weight:bold;font-size:6.5pt;padding:2px;background:#d5d5d5;}}
.hd2{{text-align:center;font-weight:bold;font-size:5.8pt;padding:1px;background:#e8e8e8;}}

/* ── IMPRESSION A4 STRICT ─────────────────────────────── */
@media print{{
  @page{{size:A4 portrait;margin:6mm 8mm 5mm 8mm;}}
  body{{background:#fff;font-size:8pt;margin:0;padding:0;
        -webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  .apt{{width:100%;padding:0;margin:0;box-shadow:none;}}
  .no-print{{display:none!important;}}
  input[type=text],input[type=date]{{
    border:none!important;
    background:transparent!important;
    padding:0!important;
  }}
  textarea{{border:1px solid #000!important;background:transparent!important;}}
  input[type=checkbox]{{
    -webkit-print-color-adjust:exact!important;
    print-color-adjust:exact!important;
    width:9px!important;height:9px!important;
  }}
  th,td{{border:1px solid #000!important;}}
  .rs{{border-right:2px solid #000!important;}}
}}
</style>
</head>
<body>

<!-- Bouton impression (masqué à l'impression) -->
<div class="no-print" style="text-align:center;padding:8px;background:#e8e8e8;margin-bottom:8px;">
  <button onclick="window.print()"
    style="padding:7px 24px;font-size:12px;background:#003366;color:#fff;
           border:none;border-radius:4px;cursor:pointer;font-family:Arial;">
    &#128438;&nbsp;Imprimer / Exporter PDF
  </button>
</div>

<div class="apt">

<!-- ════════════════════════════════════════════════════
     ZONE 1 — EN-TÊTE  (style Bon de Travail MAINT/FE/004)
════════════════════════════════════════════════════ -->

<!-- Ligne 1 : Logo | Titre | Référence  — header_table style ReportLab -->
<table style="margin-bottom:0;border-collapse:collapse;width:100%;border:0.8px solid #000;">
  <colgroup>
    <col style="width:17%;">
    <col style="width:57%;">
    <col style="width:26%;">
  </colgroup>
  <tr style="height:18mm;">
    <td style="padding:0;text-align:center;vertical-align:middle;
               border-right:0.5px solid #000;background:#fff;overflow:hidden;">
      <img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAQABAADASIAAhEBAxEB/8QAHAABAQACAwEBAAAAAAAAAAAAAAEGBwIEBQMI/8QAXBAAAgEDAQQEBg0HBQ8DBAIDAAECAwQRBQYhMUEHElFhE3GBkbLRFhciMjZCVXSSlKGx0hQVUlRys8EjM2JzgiQmNDVDRFNkdZOiwuHw8UVjg2WEo8MlN+In0//EABwBAQACAwEBAQAAAAAAAAAAAAABBgQFBwMCCP/EAEMRAAEDAgEGCwYGAgEEAgMAAAABAgMEBREGEiExQXETFjM0UVJTYZGhsRQVFyIygQc1QnLB0SPwJEOC4fElYjZEsv/aAAwDAQACEQMRAD8A/ZYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/2Q==" style="width:100%;height:100%;object-fit:cover;display:block;" alt="IRIS Maintenance">
    </td>
    <td style="text-align:center;vertical-align:middle;padding:4px 6px;
               border-right:0.5px solid #000;">
      <div style="font-size:9.5pt;font-weight:normal;line-height:1.3;">
        FORMULAIRE / ENREGISTREMENT
      </div>
      <div style="font-size:13pt;font-weight:bold;line-height:1.2;">
        Autorisation particuli&egrave;re de travaux
      </div>
    </td>
    <td style="text-align:right;vertical-align:middle;padding:4px 8px;
               font-size:8pt;line-height:1.7;">
      MAINT/FE/003<br>
      Version&nbsp;4<br>
      Date&nbsp;: 13/04/2026<br>
      Page&nbsp;1/1
    </td>
  </tr>
</table>

<!-- Ligne 2 : sous-en-tête Rédigée/Approuvée — subheader_table style ReportLab, fond #F2F2F2 -->
<table style="margin-bottom:3px;border-collapse:collapse;width:100%;
              border:0.5px solid #000;border-top:none;">
  <colgroup>
    <col style="width:50%;">
    <col style="width:50%;">
  </colgroup>
  <tr style="height:10mm;background:#F2F2F2;">
    <td style="font-size:8pt;padding:3px 6px;vertical-align:middle;
               border-right:0.5px solid #000;">
      R&eacute;dig&eacute;e par&nbsp;: <strong>G.BUENO</strong><br>
      <em style="font-size:7pt;">Responsable Maintenance</em>
    </td>
    <td style="font-size:8pt;padding:3px 6px;vertical-align:middle;">
      Approuv&eacute;e par&nbsp;: <strong>T.GARNIER</strong><br>
      <em style="font-size:7pt;">Directeur d&rsquo;Activit&eacute;</em>
    </td>
  </tr>
</table>

<!-- ════════════════════════════════════════════════════
     ZONE 2 — AVERTISSEMENT
════════════════════════════════════════════════════ -->
<p style="font-size:8pt;font-weight:bold;margin:2px 0;">
  A r&eacute;diger par l&rsquo;agent de ma&icirc;trise avant le d&eacute;but des travaux&nbsp;:
</p>
<div style="border:1.5px solid #000;text-align:center;padding:3px 4px;
            font-weight:bold;font-size:9.5pt;margin-bottom:3px;line-height:1.4;">
  A LIRE ATTENTIVEMENT<br>
  A CONSERVER PAR L&rsquo;EXECUTANT PENDANT L&rsquo;INTERVENTION
</div>

<!-- ════════════════════════════════════════════════════
     ZONE 3 — INFORMATIONS TRAVAUX
════════════════════════════════════════════════════ -->
<p style="font-size:8pt;font-weight:bold;margin-bottom:1.5px;">
  Cette autorisation particuli&egrave;re de travail concerne des travaux&nbsp;:
</p>

<!-- Type : 3 options sur 1 ligne -->
<div style="display:flex;align-items:center;margin-bottom:1.5px;font-size:8pt;">
  <label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;margin-right:16px;">
    {_cb(d.get("type_point_chaud"))}&nbsp;par point chaud
  </label>
  <label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;margin-right:16px;">
    {_cb(d.get("type_fouille"))}&nbsp;de fouille
  </label>
  <label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;">
    {_cb(d.get("type_espace_clos"))}&nbsp;en espace clos ou confin&eacute;
  </label>
</div>

<!-- Autre cas -->
<div class="fl" style="margin-bottom:2px;">
  <label style="display:inline-flex;align-items:center;gap:3px;flex-shrink:0;
                cursor:pointer;margin-right:3px;font-size:8pt;">
    {_cb(d.get("type_autre_cas"))}&nbsp;autre cas&nbsp;:
  </label>
  {_inp("detail_autre_cas", d, "calc(100% - 90px)")}
</div>

<!-- Détail travaux (3 lignes) -->
<div class="fl">
  <span class="lbl">D&eacute;tail des travaux &agrave; r&eacute;aliser&nbsp;:</span>
  {_inp("detail_travaux", d, "calc(100% - 206px)")}
</div>
<div class="ln">{_inp_v(d.get("detail_travaux_2"))}</div>
<div class="ln" style="margin-bottom:2px;">{_inp_v(d.get("detail_travaux_3"))}</div>

<!-- Lieu intervention -->
<div class="fl">
  <span class="lbl"><strong>Lieu d&rsquo;intervention</strong>&nbsp;:</span>
  {_inp("lieu_intervention", d, "calc(100% - 138px)")}
</div>

<!-- Matériel -->
<div class="fl">
  <span class="lbl">Mat&eacute;riel ou appareillage utilis&eacute; par l&rsquo;entreprise&nbsp;:</span>
  {_inp("materiel", d, "calc(100% - 316px)")}
</div>

<!-- Dernier produit/fluide (2 lignes) -->
<div class="fl">
  <span class="lbl">Dernier produit ou fluide contenu dans l&rsquo;appareil (ou tuyauterie)&nbsp;:</span>
  {_inp("produit_fluide", d, "calc(100% - 392px)")}
</div>
<div class="ln" style="margin-bottom:2px;">{_inp_v(d.get("produit_fluide_2"))}</div>

<!-- Danger associé -->
<div class="fl">
  <span class="lbl">Danger associ&eacute;&nbsp;:</span>
  {_inp("danger_associe", d, "calc(100% - 112px)")}
</div>

<!-- Appareil danger (2 lignes) -->
<div class="fl">
  <span class="lbl">Appareil, mat&eacute;riel ou activit&eacute; avoisinantes pr&eacute;sentant un danger&nbsp;:</span>
  {_inp("appareil_danger", d, "calc(100% - 384px)")}
</div>
<div class="ln" style="margin-bottom:3px;">{_inp_v(d.get("appareil_danger_2"))}</div>

<!-- ════════════════════════════════════════════════════
     ZONE 4 — TABLEAU DES PRÉCAUTIONS
════════════════════════════════════════════════════ -->
<p style="font-size:8pt;font-weight:bold;margin-bottom:1.5px;">Pr&eacute;cautions &agrave; prendre&nbsp;:</p>

<table class="tprec">
  <colgroup>
    <col class="cl1"><!-- S1 libellé -->
    <col class="ccb"><!-- NON -->
    <col class="ccb"><!-- OUI -->
    <col class="ccb"><!-- FAIT -->
    <col class="cl2"><!-- S2 libellé -->
    <col class="ccb"><!-- NON -->
    <col class="ccb"><!-- OUI -->
    <col class="ccb"><!-- FAIT -->
    <col class="cl3"><!-- S3 libellé -->
    <col class="ccb"><!-- NON -->
    <col class="ccb"><!-- OUI -->
  </colgroup>

  <!-- En-tête niveau 1 -->
  <tr>
    <th colspan="8" class="hd1 rs">PRECAUTIONS A PRENDRE</th>
    <th colspan="3" class="hd1">EQUIPEMENT COMPLEMENTAIRE</th>
  </tr>
  <!-- En-tête niveau 2 -->
  <tr>
    <th class="hd2" style="text-align:left;padding:1px 2px;"></th>
    <th class="hd2">NON</th>
    <th class="hd2">OUI</th>
    <th class="hd2 rs">FAIT</th>
    <th class="hd2" style="text-align:left;padding:1px 2px;"></th>
    <th class="hd2">NON</th>
    <th class="hd2">OUI</th>
    <th class="hd2 rs">FAIT</th>
    <th class="hd2" style="text-align:left;padding:1px 2px;"></th>
    <th class="hd2">NON</th>
    <th class="hd2">OUI</th>
  </tr>

  {rows}

  <!-- Précautions supplémentaires -->
  <tr style="background:#ebebeb;">
    <td colspan="11" style="padding:2px 4px;border-top:1.5px solid #000;">
      <div style="display:flex;align-items:baseline;gap:3px;line-height:1.3;">
        <strong style="font-size:6.5pt;white-space:nowrap;flex-shrink:0;">
          PRECAUTIONS SUPPLEMENTAIRES&hellip;
        </strong>
        {_inp_v(supp1, "calc(100% - 230px)", "border:none;background:transparent;font-family:Arial,sans-serif;font-size:7pt;padding:0 1px;box-sizing:border-box;outline:none;vertical-align:baseline;")}
      </div>
      <div style="margin-top:1px;">{_inp_v(supp2, "100%", "border:none;background:transparent;font-family:Arial,sans-serif;font-size:7pt;padding:0 1px;box-sizing:border-box;outline:none;vertical-align:baseline;")}</div>
    </td>
  </tr>
</table>

<!-- ════════════════════════════════════════════════════
     ZONE 5 — VALIDATION
════════════════════════════════════════════════════ -->
<p style="font-size:8pt;font-weight:bold;margin:2px 0;">
  Validation (Responsable du site ou son d&eacute;l&eacute;gu&eacute;)&nbsp;:
</p>

<!-- Établie par … Le … -->
<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:1.5px;">
  <div style="display:flex;align-items:baseline;flex:2.4;">
    <span class="lbl">Cette autorisation est &eacute;tablie par&nbsp;:</span>
    {_inp_v(etpar, "100%")}
  </div>
  <div style="display:flex;align-items:baseline;flex:1;">
    <span class="lbl">Le&nbsp;:</span>
    {_inp_v(etle, "100%")}
  </div>
</div>

<!-- Délivrée à … de l'entreprise … -->
<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:3px;">
  <div style="display:flex;align-items:baseline;flex:1;">
    <span class="lbl">Est d&eacute;livr&eacute;e &agrave;&nbsp;:</span>
    {_inp_v(deliv, "100%")}
  </div>
  <div style="display:flex;align-items:baseline;flex:1;">
    <span class="lbl">de l&rsquo;entreprise&nbsp;:</span>
    {_inp_v(entrep, "100%")}
  </div>
</div>

<!-- Tableau Visa AM -->
<table style="margin-bottom:3px;">
  <tr style="height:18mm;">
    <td style="width:50%;font-size:8pt;padding:4px 6px;vertical-align:middle;">
      Nom et visa AM ou responsable d&rsquo;intervention
    </td>
    <td style="width:50%;padding:3px;vertical-align:top;">
      <textarea style="width:100%;height:16mm;font-family:Arial,sans-serif;font-size:7.5pt;
                       border:none;background:transparent;outline:none;resize:none;">{_esc(visa_am)}</textarea>
    </td>
  </tr>
</table>

<!-- ════════════════════════════════════════════════════
     ZONE 6 — VÉRIFICATION POST-TRAVAUX
════════════════════════════════════════════════════ -->
<p style="font-size:8pt;font-weight:bold;margin:2px 0;">
  V&eacute;rification &agrave; la fin des travaux de l&rsquo;absence de risque r&eacute;siduel suite &agrave; l&rsquo;intervention
</p>
<table style="margin-bottom:3px;">
  <tr style="background:#d5d5d5;">
    <th style="width:55%;text-align:center;font-size:8pt;font-weight:bold;padding:2px;">
      Visite AM apr&egrave;s la fin de l&rsquo;intervention
    </th>
    <th style="width:45%;text-align:center;font-size:8pt;font-weight:bold;padding:2px;">
      Visa AM
    </th>
  </tr>
  <tr style="height:13mm;">
    <td style="text-align:center;font-size:8pt;">30 minutes</td>
    <td style="padding:2px;vertical-align:middle;"></td>
  </tr>
  <tr style="height:13mm;">
    <td style="text-align:center;font-size:8pt;">1 heure</td>
    <td style="padding:2px;vertical-align:middle;"></td>
  </tr>
  <tr style="height:13mm;">
    <td style="text-align:center;font-size:8pt;">2 heures</td>
    <td style="padding:2px;vertical-align:middle;"></td>
  </tr>
</table>

<!-- Pied de page -->
<p style="text-align:center;font-style:italic;font-size:8pt;margin-top:3px;">
  Remettre une copie &agrave; l&rsquo;intervenant &ndash; Archivage Direction du site
</p>

</div><!-- /.apt -->
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# Point d'entrée — test rapide
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import datetime, os

    # Données vides (formulaire vierge)
    sample = {
        "date_formulaire": datetime.date.today().isoformat(),
        **{k: False for k in [
            "type_point_chaud", "type_fouille",
            "type_espace_clos", "type_autre_cas",
        ]},
        **{k: "" for k in [
            "detail_autre_cas",
            "detail_travaux", "detail_travaux_2", "detail_travaux_3",
            "lieu_intervention", "materiel",
            "produit_fluide", "produit_fluide_2",
            "danger_associe", "appareil_danger", "appareil_danger_2",
            "precautions_supp", "precautions_supp_2",
            "etabli_par", "etabli_le", "delivre_a", "entreprise",
            "visa_am", "visa_30min", "visa_1h", "visa_2h",
        ]},
        **{k: "" for _, k in S1_ITEMS},
        **{k: "" for _, k in S2_ITEMS},
        **{k: "" for _, k in S3_ITEMS},
    }

    out = "autorisation_particuliere_v4.html"
    with open(out, "w", encoding="utf-8") as f:
        f.write(generate_autorisation_v4_html(sample))

    print(f"[OK] {os.path.abspath(out)}")
    print("     Ouvrir dans Chrome/Firefox > Ctrl+P > Enregistrer en PDF")
