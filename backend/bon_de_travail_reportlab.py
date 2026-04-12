"""
Générateur PDF ReportLab pour le Bon de Travail MAINT/FE/004 Version 2
Reproduit fidèlement le document officiel COSMEVA/IRIS
Marges : haut 12mm, bas 10mm, gauche 18mm, droite 14mm
"""
from io import BytesIO
import os
import logging

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY

logger = logging.getLogger(__name__)

# ─── Couleurs ──────────────────────────────────────────────────────────────────
BLUE_DARK    = colors.HexColor('#1F4E79')   # Fond titres de section (texte blanc)
BLUE_SECTION = colors.HexColor('#D9E2F3')   # Fond léger (tableau signature)
BLUE_LOGO    = colors.HexColor('#1F5C99')   # Fond cellule logo
GRAY_LIGHT   = colors.HexColor('#F2F2F2')   # Fond labels tableau travaux
BLACK        = colors.black
WHITE        = colors.white

# ─── Logo ──────────────────────────────────────────────────────────────────────
_LOGO_CANDIDATES = [
    '/app/frontend/public/logo-iris.png',
    os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'logo-iris.png'),
]
LOGO_PATH = next((p for p in _LOGO_CANDIDATES if os.path.exists(p)), None)

# ─── Dimensions ────────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4
M_TOP, M_BOT, M_LEFT, M_RIGHT = 12*mm, 10*mm, 18*mm, 14*mm
CONTENT_W = PAGE_W - M_LEFT - M_RIGHT
COL_W = CONTENT_W / 2


# ─── Helpers styles ────────────────────────────────────────────────────────────
def _s(parent, **kw) -> ParagraphStyle:
    return ParagraphStyle('_', parent=parent, **kw)


def _cb(label: str, checked: bool) -> Paragraph:
    """Case à cocher avec libellé."""
    mark = '<b>■</b>' if checked else '□'
    return Paragraph(f'{mark} {label}', _s(
        getSampleStyleSheet()['Normal'],
        fontSize=7.5, leading=10
    ))


def _sub_title(text: str) -> Paragraph:
    return Paragraph(f'<b>{text}</b>', _s(
        getSampleStyleSheet()['Normal'],
        fontSize=8, leading=10, fontName='Helvetica-Bold'
    ))


def _section_header(title: str, content_w: float) -> Table:
    """Barre de titre de section : fond bleu foncé, texte blanc."""
    s = _s(getSampleStyleSheet()['Normal'],
           fontSize=9, leading=11, fontName='Helvetica-Bold', textColor=WHITE)
    t = Table([[Paragraph(title, s)]], colWidths=[content_w])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLUE_DARK),
        ('PADDING',    (0, 0), (-1, -1), 3),
        ('BOX',        (0, 0), (-1, -1), 0.5, BLACK),
    ]))
    return t


def generate_bon_travail_pdf(data: dict) -> bytes:
    """
    Génère un PDF A4 fidèle au document MAINT/FE/004 V2.
    Fonctionne avec un dict vide (bon vierge) ou pré-rempli.
    """
    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=M_TOP, bottomMargin=M_BOT,
        leftMargin=M_LEFT, rightMargin=M_RIGHT,
        title='Bon de Travail MAINT/FE/004 V2',
    )

    base = getSampleStyleSheet()
    N = base['Normal']

    s_normal      = _s(N, fontSize=8, leading=10)
    s_small       = _s(N, fontSize=7.5, leading=9.5)
    s_bold        = _s(N, fontSize=8, leading=10, fontName='Helvetica-Bold')
    s_bold_center = _s(N, fontSize=9, leading=11, fontName='Helvetica-Bold', alignment=TA_CENTER)
    s_ref         = _s(N, fontSize=7.5, leading=9.5, alignment=TA_RIGHT)
    s_header_main = _s(N, fontSize=10, leading=12, fontName='Helvetica-Bold', alignment=TA_CENTER)
    s_italic_sm   = _s(N, fontSize=7, leading=9, fontName='Helvetica-Oblique', alignment=TA_CENTER)
    s_justify     = _s(N, fontSize=7.5, leading=10, alignment=TA_JUSTIFY)
    s_note        = _s(N, fontSize=6.5, leading=8.5, fontName='Helvetica-Oblique')
    s_logo_text   = _s(N, fontSize=20, fontName='Helvetica-Bold', textColor=WHITE, alignment=TA_CENTER)

    story = []

    # ══════════════════════════════════════════════════════════════════════════
    # EN-TÊTE PRINCIPAL
    # ══════════════════════════════════════════════════════════════════════════
    if LOGO_PATH:
        try:
            logo_cell = Image(LOGO_PATH, width=28*mm, height=16*mm)
        except Exception:
            logo_cell = Paragraph('IRIS', s_logo_text)
    else:
        logo_cell = Paragraph('IRIS', s_logo_text)

    header_data = [[
        logo_cell,
        Paragraph('FORMULAIRE / ENREGISTREMENT<br/><b>Bon de travail</b>', s_header_main),
        Paragraph('MAINT/FE/004<br/>Version 2<br/>Date : 20/11/25<br/>Page 1/1', s_ref),
    ]]
    header_col_w = [32*mm, CONTENT_W - 72*mm, 40*mm]
    header_table = Table(header_data, colWidths=header_col_w, rowHeights=[18*mm])
    header_table.setStyle(TableStyle([
        ('BOX',        (0, 0), (-1, -1), 0.8, BLACK),
        ('LINEAFTER',  (0, 0), (0, 0),   0.5, BLACK),
        ('LINEAFTER',  (1, 0), (1, 0),   0.5, BLACK),
        ('VALIGN',     (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING',    (0, 0), (-1, -1), 4),
        ('BACKGROUND', (0, 0), (0, 0),   BLUE_LOGO),
    ]))
    story.append(header_table)

    # Sous-en-tête : Rédigé par / Approuvé par
    subheader_data = [[
        Paragraph('Rédigée par : <b>G.BUENO</b><br/>Responsable Maintenance', s_small),
        Paragraph('Approuvée par : <b>T.GARNIER</b><br/>Directeur d\'Activité', s_small),
    ]]
    subheader_table = Table(subheader_data, colWidths=[CONTENT_W / 2, CONTENT_W / 2], rowHeights=[10*mm])
    subheader_table.setStyle(TableStyle([
        ('BOX',        (0, 0), (-1, -1), 0.5, BLACK),
        ('LINEBEFORE', (1, 0), (1, 0),   0.5, BLACK),
        ('VALIGN',     (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING',    (0, 0), (-1, -1), 3),
        ('BACKGROUND', (0, 0), (-1, -1), GRAY_LIGHT),
    ]))
    story.append(subheader_table)
    story.append(Spacer(1, 2*mm))

    # ══════════════════════════════════════════════════════════════════════════
    # TEXTE INTRODUCTIF
    # ══════════════════════════════════════════════════════════════════════════
    intro_txt = (
        'Le bon de travail, permet d\'identifier les risques liés aux travaux spécifiés ci-dessous ainsi que les précautions '
        'à prendre pour éviter tout accident, dégât matériel ou atteinte à l\'environnement. Ce bon de travail tient lieu de '
        'plan de prévention. <b>Sauf contre-indication particulière (ou modification des conditions d\'intervention), le bon '
        'de travail est valable pour toute la durée du chantier (dans la limite de 24 heures).</b>'
    )
    intro_table = Table([[Paragraph(intro_txt, s_justify)]], colWidths=[CONTENT_W])
    intro_table.setStyle(TableStyle([
        ('BOX',        (0, 0), (-1, -1), 0.8, colors.HexColor('#2E75B6')),
        ('BACKGROUND', (0, 0), (-1, -1), BLUE_SECTION),
        ('PADDING',    (0, 0), (-1, -1), 4),
    ]))
    story.append(intro_table)
    story.append(Spacer(1, 2*mm))

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 1 — TRAVAUX À RÉALISER
    # ══════════════════════════════════════════════════════════════════════════
    story.append(_section_header('1. Travaux à réaliser', CONTENT_W))

    localisation = data.get('localisation', '')
    description  = data.get('description', '')
    intervenants = data.get('intervenants', '')

    trav_data = [
        [Paragraph('<b>Localisation / Ligne :</b>', s_bold), Paragraph(localisation, s_normal)],
        [Paragraph('<b>Description des travaux :</b>', s_bold), Paragraph(description, s_normal)],
        [Paragraph('<b>Nom des intervenants :</b>', s_bold), Paragraph(intervenants, s_normal)],
    ]
    trav_table = Table(
        trav_data,
        colWidths=[48*mm, CONTENT_W - 48*mm],
        rowHeights=[8*mm, 16*mm, 8*mm]
    )
    trav_table.setStyle(TableStyle([
        ('BOX',        (0, 0), (-1, -1), 0.5, BLACK),
        ('INNERGRID',  (0, 0), (-1, -1), 0.3, colors.grey),
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('PADDING',    (0, 0), (-1, -1), 3),
        ('BACKGROUND', (0, 0), (0, -1),  GRAY_LIGHT),
    ]))
    story.append(trav_table)
    story.append(Spacer(1, 2*mm))

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 2 — RISQUES IDENTIFIÉS
    # ══════════════════════════════════════════════════════════════════════════
    story.append(_section_header('2. Risques Identifiés', CONTENT_W))

    # ── Colonne gauche ─────────────────────────────────────────────────────
    autre_mat_text = data.get('risque_autre_materiel_text', '') if data.get('risque_autre_materiel') else ''
    env_autre_text = data.get('env_autre_text', '') if data.get('env_autre') else ''

    left_risques = [
        _sub_title('Intervention sur du matériel ou des infrastructures :'),
        _cb('Non décontaminé ou en charge avec des produits ;',     data.get('risque_non_decontamine', False)),
        _cb('Sous pression ;',                                       data.get('risque_sous_pression', False)),
        _cb('Alimenté (électricité, air comprimé,...) ;',            data.get('risque_alimente', False)),
        _cb('Présentant des pièces en mouvements ;',                 data.get('risque_pieces_mouvements', False)),
        _cb('En hauteur (> 2 m) ;',                                  data.get('risque_en_hauteur', False)),
        Paragraph(f'□ Autre (préciser) : <u>{autre_mat_text}</u>', _s(N, fontSize=7.5, leading=10)),
        Spacer(1, 2*mm),
        _sub_title('Travaux nécessitant une autorisation particulière :'),
        _cb('Point chaud ;',      data.get('risque_point_chaud', False)),
        _cb('Espace confiné ;',   data.get('risque_espace_confine', False)),
        Spacer(1, 2*mm),
        _sub_title('Produits dangereux :'),
        _cb('Pour l\'homme (Toxique, Corrosif, Irritant, ou sensibilisant)', data.get('risque_prod_homme', False)),
        _cb('Pour l\'homme ou le matériel (inflammable, explosif)',           data.get('risque_prod_incendie', False)),
        _cb('Pour l\'environnement',                                          data.get('risque_prod_env', False)),
    ]

    # ── Colonne droite ─────────────────────────────────────────────────────
    right_risques = [
        _sub_title('Environnement des travaux nécessitant une attention particulière :'),
        _cb('Co-activité avec du personnel d\'IRIS ou d\'autres entreprises intervenantes ;', data.get('env_coactivite', False)),
        _cb('Passage de chariot à proximité ;',         data.get('env_chariot', False)),
        _cb('Tuyauterie ou ligne électrique à proximité ;', data.get('env_tuyauterie', False)),
        _cb('Poussières sensibles à l\'explosion ;',     data.get('env_poussieres', False)),
        Paragraph(f'□ Autre (préciser) : <u>{env_autre_text}</u>', _s(N, fontSize=7.5, leading=10)),
    ]

    # Égaliser la hauteur des colonnes
    diff = len(left_risques) - len(right_risques)
    if diff > 0:
        right_risques += [Spacer(1, 1)] * diff
    elif diff < 0:
        left_risques += [Spacer(1, 1)] * (-diff)

    risques_table = Table(
        [[left_risques, right_risques]],
        colWidths=[COL_W, COL_W]
    )
    risques_table.setStyle(TableStyle([
        ('BOX',        (0, 0), (-1, -1), 0.5, BLACK),
        ('LINEBEFORE', (1, 0), (1, 0),   0.5, BLACK),
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('PADDING',    (0, 0), (-1, -1), 4),
    ]))
    story.append(risques_table)
    story.append(Spacer(1, 2*mm))

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 3 — PRÉCAUTIONS À PRENDRE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(_section_header('3. Précautions à Prendre', CONTENT_W))

    autre_mat2_text = data.get('prec_autre_mat_text', '') if data.get('prec_autre_mat') else ''
    autre_hom_text  = data.get('prec_autre_hom_text', '') if data.get('prec_autre_hom') else ''

    note_chariot = (
        'L\'utilisation d\'un chariot ou d\'une nacelle n\'est possible qu\'après que l\'entreprise intervenante '
        'ait fourni à IRIS une autorisation nominative de conduite.'
    )

    left_prec = [
        _sub_title('Sur le matériel ou les infrastructures :'),
        _cb('Vidange / lavage / décontamination préalable ;', data.get('prec_vidange', False)),
        _cb('Pose d\'un joint plein ;',                       data.get('prec_joint', False)),
        _cb('Consignation électrique et/ou mécanique ;',      data.get('prec_consignation', False)),
        _cb('Utilisation d\'un échafaudage ;',                data.get('prec_echafaudage', False)),
        _cb('Utilisation d\'un chariot ou d\'une nacelle ;',  data.get('prec_chariot_nacelle', False)),
        Paragraph(f'□ Autre (préciser) : <u>{autre_mat2_text}</u>', _s(N, fontSize=7.5, leading=10)),
        Spacer(1, 2*mm),
        Paragraph(note_chariot, s_note),
    ]

    right_prec = [
        _sub_title('Sur les hommes, le matériel ou l\'environnement :'),
        _cb('Lunettes ou visière adaptée ;',     data.get('prec_lunettes', False)),
        _cb('Gants adaptés ;',                   data.get('prec_gants', False)),
        _cb('Combinaison ;',                     data.get('prec_combinaison', False)),
        _cb('Masque à gaz ou à poussière ;',     data.get('prec_masque', False)),
        Paragraph(f'□ Autre (préciser) : <u>{autre_hom_text}</u>', _s(N, fontSize=7.5, leading=10)),
        Spacer(1, 2*mm),
        _sub_title('Sur l\'environnement des travaux :'),
        _cb('Balisage de la zone de travaux ;',              data.get('prec_balisage', False)),
        _cb('Extincteurs adaptés ou RIA à proximité ;',      data.get('prec_extincteurs', False)),
        _cb('Autre : Zone Inflammable Vide ;',                data.get('prec_autre_env', False)),
    ]

    diff = len(left_prec) - len(right_prec)
    if diff > 0:
        right_prec += [Spacer(1, 1)] * diff
    elif diff < 0:
        left_prec += [Spacer(1, 1)] * (-diff)

    prec_table = Table(
        [[left_prec, right_prec]],
        colWidths=[COL_W, COL_W]
    )
    prec_table.setStyle(TableStyle([
        ('BOX',        (0, 0), (-1, -1), 0.5, BLACK),
        ('LINEBEFORE', (1, 0), (1, 0),   0.5, BLACK),
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('PADDING',    (0, 0), (-1, -1), 4),
    ]))
    story.append(prec_table)
    story.append(Spacer(1, 2*mm))

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 4 — ENGAGEMENT
    # ══════════════════════════════════════════════════════════════════════════
    story.append(_section_header('4. Engagement', CONTENT_W))

    engage_txt = (
        'Le représentant de l\'entreprise intervenante reconnaît avoir pris connaissance des risques liés aux travaux '
        'qui lui sont confiés et s\'engage à appliquer et faire appliquer les mesures de précaution qui lui ont été notifiées.'
    )
    engage_table = Table([[Paragraph(engage_txt, s_justify)]], colWidths=[CONTENT_W])
    engage_table.setStyle(TableStyle([
        ('BOX',     (0, 0), (-1, -1), 0.5, BLACK),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(engage_table)

    # Tableau signatures
    date_sig  = data.get('date_signature', '')
    visa_dem  = data.get('visa_demandeur', '')
    visa_int  = data.get('visa_intervenant', '')

    col_date = 28*mm
    col_sig  = (CONTENT_W - col_date) / 2

    sig_table = Table(
        [
            [
                Paragraph('<b>Date</b>', s_bold_center),
                Paragraph('<b>Nom et visa du demandeur</b>', s_bold_center),
                Paragraph('<b>Nom et visa du représentant de l\'intervenant</b>', s_bold_center),
            ],
            [
                Paragraph(date_sig, s_normal),
                Paragraph(visa_dem, s_normal),
                Paragraph(visa_int, s_normal),
            ],
        ],
        colWidths=[col_date, col_sig, col_sig],
        rowHeights=[8*mm, 20*mm],
    )
    sig_table.setStyle(TableStyle([
        ('BOX',        (0, 0), (-1, -1), 0.5, BLACK),
        ('INNERGRID',  (0, 0), (-1, -1), 0.5, BLACK),
        ('BACKGROUND', (0, 0), (-1, 0),  BLUE_SECTION),
        ('VALIGN',     (0, 0), (-1, 0),  'MIDDLE'),
        ('VALIGN',     (0, 1), (-1, 1),  'TOP'),
        ('ALIGN',      (0, 0), (-1, 0),  'CENTER'),
        ('PADDING',    (0, 0), (-1, -1), 3),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 3*mm))

    # ══════════════════════════════════════════════════════════════════════════
    # PIED DE PAGE
    # ══════════════════════════════════════════════════════════════════════════
    footer_table = Table(
        [[Paragraph('<i>Remettre une copie à l\'intervenant – Archivage Direction du site</i>', s_italic_sm)]],
        colWidths=[CONTENT_W]
    )
    footer_table.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, -1), 0.5, BLACK),
        ('PADDING',   (0, 0), (-1, -1), 3),
    ]))
    story.append(footer_table)

    doc.build(story)
    return buffer.getvalue()
