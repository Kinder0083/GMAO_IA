/**
 * AutorisationParticulierePrintDialog
 * Dialog complet pour l'Autorisation Particulière de Travaux — MAINT/FE/003 V4
 * Même pattern que BonDeTravailPrintDialog :
 *  - Saisie des données dans un dialog modal
 *  - Sauvegarde en base (POST /documentations/autorisations-particulieres/save)
 *  - Impression via génération HTML backend (POST /documentations/autorisations-particulieres/generate-html)
 */
import React, { useState, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Shield, Printer, Loader2, Save, X } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import api from '../services/api';

const today = new Date().toISOString().split('T')[0];

const EMPTY_DATA = {
  date_formulaire: today,
  // Types de travaux
  type_point_chaud: false,
  type_fouille: false,
  type_espace_clos: false,
  type_autre_cas: false,
  detail_autre_cas: '',
  // Zone 3 — Informations travaux
  detail_travaux: '',
  lieu_intervention: '',
  materiel: '',
  produit_fluide: '',
  danger_associe: '',
  appareil_danger: '',
  // Zone 4 — Précautions Section 1 (NON/OUI/FAIT)
  s1_consignation_mat: '',
  s1_consignation_elec: '',
  s1_debranchement: '',
  s1_vidange: '',
  s1_decontamination: '',
  s1_degazage: '',
  s1_joint_plein: '',
  s1_ventilation: '',
  s1_zone_balisee: '',
  // Zone 4 — Précautions Section 2 (NON/OUI/FAIT)
  s2_canalisations_elec: '',
  s2_souterraines: '',
  s2_egouts_cables: '',
  s2_taux_oxygene: '',
  s2_taux_explosivite: '',
  s2_explosimetre: '',
  s2_eclairage_surete: '',
  s2_extincteur: '',
  s2_autres: '',
  // Zone 4 — Équipement complémentaire Section 3 (NON/OUI)
  s3_visiere: '',
  s3_tenue: '',
  s3_cagoule: '',
  s3_masque: '',
  s3_gant: '',
  s3_harnais: '',
  s3_outillage: '',
  s3_surveillant: '',
  s3_autres: '',
  // Précautions supplémentaires
  precautions_supp: '',
  // Zone 5 — Validation
  etabli_par: '',
  etabli_le: today,
  delivre_a: '',
  entreprise: '',
  visa_am: '',
  // Zone 6 — Vérification post-travaux
  visa_30min: '',
  visa_1h: '',
  visa_2h: '',
};

// Libellés des lignes du tableau précautions
const S1_LABELS = [
  'CONSIGNATION MAT. OU PIÈCE EN MOUV.',
  'CONSIGNATION ÉLECTRIQUE',
  'DÉBRANCHEMENT FORCE MOTRICE',
  'VIDANGE APPAREIL/TUYAUTERIE',
  'DÉCONTAMINATION/LAVAGE',
  'DÉGAZAGE',
  'POSE JOINT PLEIN',
  'VENTILATION FORCÉE',
  'ZONE BALISÉE',
];
const S1_KEYS = [
  's1_consignation_mat', 's1_consignation_elec', 's1_debranchement',
  's1_vidange', 's1_decontamination', 's1_degazage',
  's1_joint_plein', 's1_ventilation', 's1_zone_balisee',
];

const S2_LABELS = [
  'CANALISATION ÉLECTRIQUES',
  'SOUTERRAINES BALISÉES',
  'ÉGOUTS ET CÂBLES PROTÉGÉS',
  "TAUX D'OXYGÈNE",
  "TAUX D'EXPLOSIVITÉ",
  'EXPLOSIMÈTRE EN CONTINU',
  'ÉCLAIRAGE DE SÛRETÉ',
  'EXTINCTEUR TYPE',
  'AUTRES',
];
const S2_KEYS = [
  's2_canalisations_elec', 's2_souterraines', 's2_egouts_cables',
  's2_taux_oxygene', 's2_taux_explosivite', 's2_explosimetre',
  's2_eclairage_surete', 's2_extincteur', 's2_autres',
];

const S3_LABELS = [
  'VISIÈRE',
  'TENUE IMPERMÉABLE, BOTTE',
  'CAGOULE AIR RESPIRABLE/ART',
  'MASQUE TYPE',
  'GANT TYPE',
  'HARNAIS DE SÉCURITÉ',
  'OUTILLAGE ANTI-ÉTINCELLE',
  "PRÉSENCE D'UN SURVEILLANT",
  'AUTRES',
];
const S3_KEYS = [
  's3_visiere', 's3_tenue', 's3_cagoule',
  's3_masque', 's3_gant', 's3_harnais',
  's3_outillage', 's3_surveillant', 's3_autres',
];

/** Bouton radio compact NON / OUI / FAIT */
function RadioGroup3({ value, onChange }) {
  const opts = ['NON', 'OUI', 'FAIT'];
  return (
    <div className="flex gap-0.5">
      {opts.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors leading-tight ${
            value === opt
              ? 'bg-blue-700 text-white border-blue-700'
              : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/** Bouton radio compact NON / OUI */
function RadioGroup2({ value, onChange }) {
  const opts = ['NON', 'OUI'];
  return (
    <div className="flex gap-0.5">
      {opts.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors leading-tight ${
            value === opt
              ? 'bg-blue-700 text-white border-blue-700'
              : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/** Ligne de précaution compacte */
function PrecRow({ label, valueKey, data, onChange, threeOpts = true }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 last:border-0">
      <span className="text-[11px] text-gray-700 leading-tight flex-1">{label}</span>
      {threeOpts
        ? <RadioGroup3 value={data[valueKey]} onChange={v => onChange(valueKey, v)} />
        : <RadioGroup2 value={data[valueKey]} onChange={v => onChange(valueKey, v)} />
      }
    </div>
  );
}

/** Champ texte avec label */
function FieldRow({ label, valueKey, data, onChange, multiline = false, placeholder = '' }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-gray-600">{label}</Label>
      {multiline ? (
        <Textarea
          value={data[valueKey] || ''}
          onChange={e => onChange(valueKey, e.target.value)}
          rows={2}
          placeholder={placeholder}
          className="text-sm"
        />
      ) : (
        <Input
          value={data[valueKey] || ''}
          onChange={e => onChange(valueKey, e.target.value)}
          placeholder={placeholder}
          className="text-sm h-8"
        />
      )}
    </div>
  );
}

export default function AutorisationParticulierePrintDialog({
  open,
  onClose,
  poleId,
  prefillData = null,
  onSaved,
}) {
  const { toast } = useToast();
  const [data, setData] = useState(() => ({
    ...EMPTY_DATA,
    ...(prefillData?.form_data || prefillData || {}),
    id: prefillData?.id || undefined,
  }));
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handleChange = useCallback((key, value) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleCheckbox = useCallback((key, checked) => {
    setData(prev => ({ ...prev, [key]: checked }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...data, pole_id: poleId };
      await api.post('/documentations/autorisations-particulieres/save', payload);
      toast({ title: 'Succès', description: 'Autorisation enregistrée' });
      if (onSaved) onSaved();
    } catch (err) {
      toast({
        title: 'Erreur',
        description: "Impossible d'enregistrer l'autorisation",
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async (vierge = false) => {
    setPrinting(true);
    try {
      const payload = vierge ? {} : data;
      // La réponse est HTML — on la récupère comme texte
      const response = await api.post(
        '/documentations/autorisations-particulieres/generate-html',
        payload,
        { responseType: 'text' }
      );
      const htmlContent = response.data;
      const win = window.open('', '_blank');
      if (!win) {
        toast({
          title: 'Popup bloqué',
          description: 'Autorisez les popups pour ce site.',
          variant: 'destructive',
        });
        return;
      }
      win.document.open();
      win.document.write(htmlContent);
      win.document.close();
      setTimeout(() => win.print(), 600);
    } catch (err) {
      toast({
        title: 'Erreur',
        description: 'Impossible de générer le formulaire',
        variant: 'destructive',
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={open ? undefined : onClose}>
      <DialogContent
        className="max-w-5xl max-h-[92vh] overflow-y-auto p-0"
        onPointerDownOutside={e => e.preventDefault()}
      >
        {/* Header fixe */}
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-yellow-600" />
            <div>
              <DialogTitle className="text-base font-bold leading-tight">
                Autorisation Particulière de Travaux
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                MAINT/FE/003 — Version 4
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePrint(true)}
              disabled={printing}
              data-testid="auto-print-vierge-btn"
            >
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              <span className="ml-1 text-xs">Vierge</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePrint(false)}
              disabled={printing}
              data-testid="auto-print-btn"
            >
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              <span className="ml-1 text-xs">Imprimer</span>
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !poleId}
              title={!poleId ? "Ouvrez ce formulaire depuis un Pôle documentaire pour pouvoir l'enregistrer" : "Enregistrer"}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50"
              data-testid="auto-save-btn"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span className="ml-1 text-xs">Enregistrer</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-5">

          {/* ── Zone 1 : Date + en-tête info ─────────────────── */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-xs font-medium text-gray-600">Date du formulaire</Label>
              <Input
                type="date"
                value={data.date_formulaire || today}
                onChange={e => handleChange('date_formulaire', e.target.value)}
                className="text-sm h-8 w-48 mt-1"
                data-testid="auto-date-field"
              />
            </div>
            <div className="text-right text-xs text-gray-400">
              <p className="font-semibold text-gray-600">MAINT/FE/003 V4</p>
              <p>Rédigée par : G.BUENO</p>
              <p>Approuvée par : T.GARNIER</p>
            </div>
          </div>

          {/* ── Zone 2 : Types de travaux ─────────────────────── */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2 border-b pb-1">
              Type de travaux concernés
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['type_point_chaud', 'Par point chaud'],
                ['type_fouille', 'De fouille'],
                ['type_espace_clos', 'En espace clos ou confiné'],
                ['type_autre_cas', 'Autre cas'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={key}
                    checked={!!data[key]}
                    onCheckedChange={v => handleCheckbox(key, v)}
                    data-testid={`auto-${key}`}
                  />
                  <label htmlFor={key} className="text-sm cursor-pointer">{label}</label>
                </div>
              ))}
            </div>
            {data.type_autre_cas && (
              <div className="mt-2">
                <Label className="text-xs font-medium text-gray-600">Précisions (autre cas)</Label>
                <Input
                  value={data.detail_autre_cas || ''}
                  onChange={e => handleChange('detail_autre_cas', e.target.value)}
                  placeholder="Préciser..."
                  className="text-sm h-8 mt-1"
                />
              </div>
            )}
          </div>

          {/* ── Zone 3 : Informations travaux ────────────────── */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2 border-b pb-1">
              Informations sur les travaux
            </h3>
            <div className="space-y-3">
              <FieldRow label="Détail des travaux à réaliser" valueKey="detail_travaux" data={data} onChange={handleChange} multiline placeholder="Description complète des travaux..." />
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Lieu d'intervention" valueKey="lieu_intervention" data={data} onChange={handleChange} placeholder="Localisation précise" />
                <FieldRow label="Matériel ou appareillage utilisé" valueKey="materiel" data={data} onChange={handleChange} placeholder="Équipements de l'entreprise" />
              </div>
              <FieldRow label="Dernier produit ou fluide contenu dans l'appareil (ou tuyauterie)" valueKey="produit_fluide" data={data} onChange={handleChange} placeholder="Nature du produit / fluide" />
              <FieldRow label="Danger associé" valueKey="danger_associe" data={data} onChange={handleChange} placeholder="Risques identifiés" />
              <FieldRow label="Appareil, matériel ou activité avoisinants présentant un danger" valueKey="appareil_danger" data={data} onChange={handleChange} multiline placeholder="Équipements / activités à proximité dangereux" />
            </div>
          </div>

          {/* ── Zone 4 : Tableau des précautions ─────────────── */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2 border-b pb-1">
              Précautions à prendre
              <span className="ml-2 text-xs font-normal text-gray-400">(cliquez sur NON / OUI / FAIT pour sélectionner)</span>
            </h3>

            <div className="grid grid-cols-3 gap-3">
              {/* Section 1 */}
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 text-center">
                  Précautions à prendre
                </p>
                {S1_LABELS.map((label, i) => (
                  <PrecRow
                    key={S1_KEYS[i]}
                    label={label}
                    valueKey={S1_KEYS[i]}
                    data={data}
                    onChange={handleChange}
                    threeOpts
                  />
                ))}
              </div>

              {/* Section 2 */}
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 text-center">
                  Canalisations / Mesures
                </p>
                {S2_LABELS.map((label, i) => (
                  <PrecRow
                    key={S2_KEYS[i]}
                    label={label}
                    valueKey={S2_KEYS[i]}
                    data={data}
                    onChange={handleChange}
                    threeOpts
                  />
                ))}
              </div>

              {/* Section 3 */}
              <div className="border rounded-lg p-3 bg-blue-50">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 text-center">
                  Équipement complémentaire
                </p>
                {S3_LABELS.map((label, i) => (
                  <PrecRow
                    key={S3_KEYS[i]}
                    label={label}
                    valueKey={S3_KEYS[i]}
                    data={data}
                    onChange={handleChange}
                    threeOpts={false}
                  />
                ))}
              </div>
            </div>

            {/* Précautions supplémentaires */}
            <div className="mt-3">
              <FieldRow label="Précautions supplémentaires" valueKey="precautions_supp" data={data} onChange={handleChange} multiline placeholder="Toutes autres précautions particulières..." />
            </div>
          </div>

          {/* ── Zone 5 : Validation ───────────────────────────── */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2 border-b pb-1">
              Validation (Responsable du site ou son délégué)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Cette autorisation est établie par" valueKey="etabli_par" data={data} onChange={handleChange} placeholder="Nom du responsable" />
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-600">Le</Label>
                <Input
                  type="date"
                  value={data.etabli_le || today}
                  onChange={e => handleChange('etabli_le', e.target.value)}
                  className="text-sm h-8"
                />
              </div>
              <FieldRow label="Est délivrée à" valueKey="delivre_a" data={data} onChange={handleChange} placeholder="Nom de l'exécutant" />
              <FieldRow label="De l'entreprise" valueKey="entreprise" data={data} onChange={handleChange} placeholder="Nom de l'entreprise" />
            </div>
            <div className="mt-3">
              <FieldRow label="Nom et visa AM ou responsable d'intervention" valueKey="visa_am" data={data} onChange={handleChange} multiline placeholder="Nom complet + visa/signature" />
            </div>
          </div>

          {/* ── Zone 6 : Vérification post-travaux ──────────── */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2 border-b pb-1">
              Vérification à la fin des travaux (absence de risque résiduel)
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <FieldRow label="Visa AM — 30 minutes" valueKey="visa_30min" data={data} onChange={handleChange} placeholder="Visa" />
              <FieldRow label="Visa AM — 1 heure" valueKey="visa_1h" data={data} onChange={handleChange} placeholder="Visa" />
              <FieldRow label="Visa AM — 2 heures" valueKey="visa_2h" data={data} onChange={handleChange} placeholder="Visa" />
            </div>
          </div>

        </div>

        {/* Footer fixe */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-3 flex justify-between items-center text-xs text-gray-400">
          <span>Remettre une copie à l'intervenant – Archivage Direction du site</span>
          <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
