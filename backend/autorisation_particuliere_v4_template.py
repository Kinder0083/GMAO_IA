"""
Template HTML pour l'Autorisation Particulière de Travaux
Format: MAINT/FE/003 Version 4 — Impression A4 portrait
"""

S1_ITEMS = [
    ("CONSIGNATION MAT. OU PIÈCE EN MOUV...", "s1_consignation_mat"),
    ("CONSIGNATION ÉLECTRIQUE……………….....", "s1_consignation_elec"),
    ("DÉBRANCHEMENT FORCE MOTRICE……....", "s1_debranchement"),
    ("VIDANGE APPAREIL/TUYAUTERIE…..……...", "s1_vidange"),
    ("DÉCONTAMINATION/LAVAGE…………………", "s1_decontamination"),
    ("DÉGAZAGE…………………………………….....", "s1_degazage"),
    ("POSE JOINT PLEIN………………………………", "s1_joint_plein"),
    ("VENTILATION FORCÉE……………………………", "s1_ventilation"),
    ("ZONE BALISÉE……………………………...…….", "s1_zone_balisee"),
]

S2_ITEMS = [
    ("CANALISATION ÉLECTRIQUES", "s2_canalisations_elec"),
    ("SOUTERRAINES BALISÉES…………….....", "s2_souterraines"),
    ("ÉGOUTS ET CÂBLES PROTÉGÉS….…....", "s2_egouts_cables"),
    ("TAUX D'OXYGÈNE…………………………....", "s2_taux_oxygene"),
    ("TAUX D'EXPLOSIVITÉ…………………….....", "s2_taux_explosivite"),
    ("EXPLOSIMÈTRE EN CONTINU………….....", "s2_explosimetre"),
    ("ÉCLAIRAGE DE SÛRETÉ…………….……...", "s2_eclairage_surete"),
    ("EXTINCTEUR TYPE……………………….......", "s2_extincteur"),
    ("AUTRES……………………………………….....", "s2_autres"),
]

S3_ITEMS = [
    ("VISIÈRE………………………………………….....", "s3_visiere"),
    ("TENUE IMPERMÉABLE, BOTTE…….......…", "s3_tenue"),
    ("CAGOULE AIR RESPIRABLE/ART…….......", "s3_cagoule"),
    ("MASQUE TYPE :…………….…………………...", "s3_masque"),
    ("GANT TYPE :………….……………………........", "s3_gant"),
    ("HARNAIS DE SÉCURITÉ……………………...", "s3_harnais"),
    ("OUTILLAGE ANTI-ÉTINCELLE………….......", "s3_outillage"),
    ("PRÉSENCE D'UN SURVEILLANT……........", "s3_surveillant"),
    ("AUTRES.……………………………………….....…", "s3_autres"),
]


def generate_autorisation_v4_html(data: dict) -> str:
    """Génère le HTML pour l'Autorisation Particulière MAINT/FE/003 V4"""

    def cb(key):
        return "&#9745;" if data.get(key) else "&#9744;"

    def radio_nof(key, choice):
        return "&#9679;" if data.get(key, "") == choice else "&#9675;"

    def radio_no(key, choice):
        return "&#9679;" if data.get(key, "") == choice else "&#9675;"

    def field(key, default=""):
        val = data.get(key, default)
        return str(val) if val else ""

    date_formulaire = field("date_formulaire")

    # Générer les lignes du tableau précautions
    table_rows_html = ""
    for i in range(9):
        s1_label, s1_key = S1_ITEMS[i]
        s2_label, s2_key = S2_ITEMS[i]
        s3_label, s3_key = S3_ITEMS[i]

        s1v = data.get(s1_key, "")
        s2v = data.get(s2_key, "")
        s3v = data.get(s3_key, "")

        table_rows_html += f"""
        <tr>
          <td style="font-size:6.5pt;padding:1px 3px;white-space:nowrap;">{s1_label}</td>
          <td style="text-align:center;font-size:8pt;width:16px;">{"&#9679;" if s1v=="NON" else "&#9675;"}</td>
          <td style="text-align:center;font-size:8pt;width:16px;">{"&#9679;" if s1v=="OUI" else "&#9675;"}</td>
          <td style="text-align:center;font-size:8pt;width:16px;border-right:2px solid #000;">{"&#9679;" if s1v=="FAIT" else "&#9675;"}</td>
          <td style="font-size:6.5pt;padding:1px 3px;white-space:nowrap;">{s2_label}</td>
          <td style="text-align:center;font-size:8pt;width:16px;">{"&#9679;" if s2v=="NON" else "&#9675;"}</td>
          <td style="text-align:center;font-size:8pt;width:16px;">{"&#9679;" if s2v=="OUI" else "&#9675;"}</td>
          <td style="text-align:center;font-size:8pt;width:16px;border-right:2px solid #000;">{"&#9679;" if s2v=="FAIT" else "&#9675;"}</td>
          <td style="font-size:6.5pt;padding:1px 3px;white-space:nowrap;">{s3_label}</td>
          <td style="text-align:center;font-size:8pt;width:16px;">{"&#9679;" if s3v=="NON" else "&#9675;"}</td>
          <td style="text-align:center;font-size:8pt;width:16px;">{"&#9679;" if s3v=="OUI" else "&#9675;"}</td>
        </tr>"""

    precautions_supp = field("precautions_supp")
    detail_travaux = field("detail_travaux")
    lieu = field("lieu_intervention")
    materiel = field("materiel")
    produit = field("produit_fluide")
    danger = field("danger_associe")
    appareil_danger = field("appareil_danger")
    detail_autre_cas = field("detail_autre_cas")
    etabli_par = field("etabli_par")
    etabli_le = field("etabli_le")
    delivre_a = field("delivre_a")
    entreprise = field("entreprise")
    visa_am = field("visa_am")
    visa_30 = field("visa_30min")
    visa_1h = field("visa_1h")
    visa_2h = field("visa_2h")

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Autorisation Particulière de Travaux — MAINT/FE/003 V4</title>
<style>
@page {{ size: A4 portrait; margin: 9mm 11mm 9mm 11mm; }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:Arial,sans-serif; font-size:9pt; color:#000; background:#fff; }}
.container {{ width:100%; }}
table {{ width:100%; border-collapse:collapse; }}
th,td {{ border:1px solid #000; vertical-align:middle; }}
.underline {{ border:none; border-bottom:1px solid #333; font-size:9pt; padding:1px 0; width:100%; }}
@media print {{
  .no-print {{ display:none!important; }}
  body {{ font-size:9pt; }}
  .container {{ page-break-inside:avoid; }}
}}
</style>
</head>
<body>
<div class="container">

<!-- ZONE 1 — EN-TÊTE -->
<table style="margin-bottom:4px;">
  <colgroup>
    <col style="width:22%;">
    <col style="width:30%;">
    <col style="width:14%;">
    <col style="width:34%;">
  </colgroup>
  <tr>
    <td rowspan="2" style="text-align:center;padding:4px;height:16mm;">
      <svg width="80" height="36" xmlns="http://www.w3.org/2000/svg">
        <path d="M8,32 Q12,8 30,4 Q18,18 26,32 Z" fill="#4CAF50"/>
        <text x="34" y="26" font-family="Arial" font-size="20" font-weight="bold" fill="#003366">IRIS</text>
      </svg>
    </td>
    <td colspan="2" style="text-align:center;padding:3px;">
      <div style="font-size:10pt;">FORMULAIRE / ENREGISTREMENT</div>
      <div style="font-size:13pt;font-weight:bold;">Autorisation particulière de travaux</div>
    </td>
    <td style="text-align:center;font-size:9pt;padding:3px;">Page 1/1</td>
  </tr>
  <tr>
    <td style="text-align:center;font-size:12pt;font-weight:bold;padding:2px;">MAINT/FE/003</td>
    <td style="text-align:center;font-size:9pt;padding:2px;">Version 4</td>
    <td style="font-size:9pt;padding:3px;">Date : {date_formulaire}</td>
  </tr>
  <tr>
    <td colspan="4" style="background:#CCCCCC;height:5px;border:1px solid #000;"></td>
  </tr>
  <tr>
    <td colspan="2" style="padding:3px;font-size:9pt;">
      Rédigée par : <strong>G.BUENO</strong><br>
      <em style="font-size:7pt;">Responsable Maintenance</em>
    </td>
    <td colspan="2" style="padding:3px;font-size:9pt;">
      Approuvée par : <strong>T.GARNIER</strong><br>
      <em style="font-size:7pt;">Directeur d'Activité</em>
    </td>
  </tr>
</table>

<!-- ZONE 2 — AVERTISSEMENT -->
<p style="font-size:9pt;font-weight:bold;margin:3px 0 2px;">A rédiger par l'agent de maîtrise avant le début des travaux :</p>
<div style="border:1.5px solid #000;text-align:center;padding:3px;font-weight:bold;font-size:10pt;margin-bottom:4px;">
  A LIRE ATTENTIVEMENT<br>
  A CONSERVER PAR L'EXECUTANT PENDANT L'INTERVENTION
</div>

<!-- ZONE 3 — INFORMATIONS TRAVAUX -->
<p style="font-size:9pt;font-weight:bold;margin:2px 0 2px;">Cette autorisation particulière de travail concerne des travaux :</p>
<table style="margin-bottom:2px;border:none;">
  <tr>
    <td style="border:none;font-size:9pt;width:33%;">{cb("type_point_chaud")} par point chaud</td>
    <td style="border:none;font-size:9pt;width:33%;">{cb("type_fouille")} de fouille</td>
    <td style="border:none;font-size:9pt;width:34%;">{cb("type_espace_clos")} en espace clos ou confiné</td>
  </tr>
  <tr>
    <td colspan="3" style="border:none;font-size:9pt;">{cb("type_autre_cas")} autre cas : <span style="border-bottom:1px solid #333;">{detail_autre_cas}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></td>
  </tr>
</table>

<table style="margin-bottom:1px;border:none;">
  <tr><td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 0;">Détail des travaux à réaliser : {detail_travaux}</td></tr>
  <tr><td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 0;">&nbsp;</td></tr>
</table>
<table style="margin-bottom:1px;border:none;"><tr><td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 0;">Lieu d'intervention : {lieu}</td></tr></table>
<table style="margin-bottom:1px;border:none;"><tr><td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 0;">Matériel ou appareillage utilisé par l'entreprise : {materiel}</td></tr></table>
<table style="margin-bottom:1px;border:none;"><tr><td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 0;">Dernier produit ou fluide contenu dans l'appareil (ou tuyauterie) : {produit}</td></tr></table>
<table style="margin-bottom:1px;border:none;"><tr><td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 0;">Danger associé : {danger}</td></tr></table>
<table style="margin-bottom:4px;border:none;"><tr><td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 0;">Appareil, matériel ou activité avoisinantes présentant un danger : {appareil_danger}</td></tr></table>

<!-- ZONE 4 — TABLEAU DES PRÉCAUTIONS -->
<p style="font-size:9pt;font-weight:bold;margin:2px 0 2px;">Précautions à prendre :</p>
<table style="font-size:7pt;margin-bottom:3px;">
  <colgroup>
    <col style="width:29%;">
    <col style="width:3.5%;">
    <col style="width:3.5%;">
    <col style="width:3.5%;">
    <col style="width:22%;">
    <col style="width:3.5%;">
    <col style="width:3.5%;">
    <col style="width:3.5%;">
    <col style="width:21%;">
    <col style="width:3.5%;">
    <col style="width:3.5%;">
  </colgroup>
  <tr style="background:#e0e0e0;font-size:6.5pt;font-weight:bold;">
    <th colspan="4" style="text-align:center;padding:2px;">PRÉCAUTIONS À PRENDRE</th>
    <th colspan="4" style="text-align:center;border-left:2px solid #000;padding:2px;">PRÉCAUTIONS À PRENDRE (suite)</th>
    <th colspan="3" style="text-align:center;border-left:2px solid #000;padding:2px;">ÉQUIPEMENT COMPLÉMENTAIRE</th>
  </tr>
  <tr style="font-size:6pt;font-weight:bold;background:#f5f5f5;">
    <th style="padding:1px 2px;">Libellé</th>
    <th style="text-align:center;">NON</th><th style="text-align:center;">OUI</th><th style="text-align:center;border-right:2px solid #000;">FAIT</th>
    <th style="padding:1px 2px;border-left:2px solid #000;">Libellé</th>
    <th style="text-align:center;">NON</th><th style="text-align:center;">OUI</th><th style="text-align:center;border-right:2px solid #000;">FAIT</th>
    <th style="padding:1px 2px;border-left:2px solid #000;">Libellé</th>
    <th style="text-align:center;">NON</th><th style="text-align:center;">OUI</th>
  </tr>
  {table_rows_html}
  <tr>
    <td colspan="11" style="font-size:8pt;background:#f5f5f5;padding:3px;">
      <strong>PRÉCAUTIONS SUPPLÉMENTAIRES :</strong>&nbsp;{precautions_supp}
    </td>
  </tr>
</table>

<!-- ZONE 5 — VALIDATION -->
<p style="font-size:9pt;font-weight:bold;margin:2px 0 2px;">Validation (Responsable du site ou son délégué) :</p>
<table style="margin-bottom:2px;border:none;">
  <tr>
    <td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 0;width:60%;">
      Cette autorisation est établie par : {etabli_par}
    </td>
    <td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 8px;width:40%;">
      Le : {etabli_le}
    </td>
  </tr>
  <tr>
    <td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 0;">
      Est délivrée à : {delivre_a}
    </td>
    <td style="border:none;border-bottom:1px solid #333;font-size:9pt;padding:1px 8px;">
      de l'entreprise : {entreprise}
    </td>
  </tr>
</table>
<table style="margin-bottom:4px;">
  <tr>
    <td style="width:45%;font-size:9pt;font-weight:bold;padding:4px;vertical-align:top;">
      Nom et visa AM ou responsable d'intervention
    </td>
    <td style="width:55%;font-size:9pt;min-height:22mm;padding:4px;vertical-align:top;">
      {visa_am}
    </td>
  </tr>
</table>

<!-- ZONE 6 — VÉRIFICATION POST-TRAVAUX -->
<p style="font-size:9pt;font-weight:bold;margin:2px 0 2px;">Vérification à la fin des travaux de l'absence de risque résiduel suite à l'intervention</p>
<table style="margin-bottom:5px;">
  <tr style="background:#e0e0e0;">
    <th style="width:60%;font-size:9pt;padding:3px;">Visite AM après la fin de l'intervention</th>
    <th style="width:40%;font-size:9pt;padding:3px;">Visa AM</th>
  </tr>
  <tr>
    <td style="text-align:center;font-size:9pt;padding:2px;">30 minutes</td>
    <td style="font-size:9pt;min-height:9mm;padding:3px;">{visa_30}</td>
  </tr>
  <tr>
    <td style="text-align:center;font-size:9pt;padding:2px;">1 heure</td>
    <td style="font-size:9pt;padding:3px;">{visa_1h}</td>
  </tr>
  <tr>
    <td style="text-align:center;font-size:9pt;padding:2px;">2 heures</td>
    <td style="font-size:9pt;padding:3px;">{visa_2h}</td>
  </tr>
</table>

<!-- PIED DE PAGE -->
<p style="text-align:center;font-style:italic;font-size:8pt;margin-top:4px;">
  Remettre une copie à l'intervenant – Archivage Direction du site
</p>

</div>
</body>
</html>"""

    return html
