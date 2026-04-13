import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Printer, FileText, Loader2 } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import api from '../services/api';

// ─── État initial vierge ────────────────────────────────────────────────────
const EMPTY_DATA = {
  localisation: '', description: '', intervenants: '',
  // Risques — matériel
  risque_non_decontamine: false, risque_sous_pression: false,
  risque_alimente: false, risque_pieces_mouvements: false,
  risque_en_hauteur: false, risque_autre_materiel: false, risque_autre_materiel_text: '',
  // Risques — autorisation / produits
  risque_point_chaud: false, risque_espace_confine: false,
  risque_prod_homme: false, risque_prod_incendie: false, risque_prod_env: false,
  // Risques — environnement
  env_coactivite: false, env_chariot: false, env_tuyauterie: false,
  env_poussieres: false, env_autre: false, env_autre_text: '',
  // Précautions — matériel
  prec_vidange: false, prec_joint: false, prec_consignation: false,
  prec_echafaudage: false, prec_chariot_nacelle: false,
  prec_autre_mat: false, prec_autre_mat_text: '',
  // Précautions — hommes
  prec_lunettes: false, prec_gants: false, prec_combinaison: false,
  prec_masque: false, prec_autre_hom: false, prec_autre_hom_text: '',
  // Précautions — environnement
  prec_balisage: false, prec_extincteurs: false, prec_autre_env: false,
  // Engagement
  date_signature: '', visa_demandeur: '', visa_intervenant: '',
};

// ─── Sous-composants ─────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div className="bg-[#1F4E79] text-white font-bold text-sm px-3 py-1.5 rounded-sm mt-4 mb-2">
      {children}
    </div>
  );
}

function SubTitle({ children }) {
  return <p className="font-semibold text-xs text-gray-700 mt-2 mb-1">{children}</p>;
}

function CbRow({ id, label, checked, onChange, withText, textValue, textPlaceholder, onTextChange }) {
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onChange}
          className="mt-0.5"
          data-testid={`cb-${id}`}
        />
        <label htmlFor={id} className="text-xs leading-tight cursor-pointer">{label}</label>
      </div>
      {withText && checked && (
        <Input
          value={textValue}
          onChange={e => onTextChange(e.target.value)}
          placeholder={textPlaceholder || 'Préciser...'}
          className="h-6 text-xs ml-6"
          data-testid={`txt-${id}`}
        />
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function BonDeTravailPrintDialog({ open, onClose, prefillData = null }) {
  const { toast } = useToast();
  const [data, setData] = useState(() => prefillData ? { ...EMPTY_DATA, ...prefillData } : { ...EMPTY_DATA });
  const [printing, setPrinting] = useState(false);

  const set = useCallback((field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handlePrint = async (vierge = false) => {
    setPrinting(true);
    try {
      const payload = vierge ? {} : data;
      const response = await api.post('/documentations/bons-de-travail/generate-pdf', payload, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const win = window.open(url, '_blank');
      if (win) {
        win.addEventListener('load', () => {
          setTimeout(() => win.print(), 500);
        });
      }
      toast({ title: 'PDF généré', description: vierge ? 'Bon vierge prêt à imprimer.' : 'Bon pré-rempli prêt à imprimer.' });
    } catch (err) {
      console.error('Erreur génération PDF:', err);
      toast({ title: 'Erreur', description: 'Impossible de générer le PDF.', variant: 'destructive' });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0 overflow-hidden" data-testid="bon-travail-print-dialog">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-700" />
            Bon de Travail — MAINT/FE/004 V2
          </DialogTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Remplissez les champs souhaités puis cliquez sur Imprimer — ou imprimez un bon entièrement vierge.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
          {/* ── Section 1 : Travaux à réaliser ──────────────────────────── */}
          <SectionTitle>1. Travaux à réaliser</SectionTitle>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Localisation / Ligne</Label>
              <Input
                value={data.localisation}
                onChange={e => set('localisation', e.target.value)}
                placeholder="Ex : Ligne 3 — Zone conditionnement"
                className="h-7 text-xs"
                data-testid="field-localisation"
              />
            </div>
            <div>
              <Label className="text-xs">Description des travaux</Label>
              <Textarea
                value={data.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Décrire les travaux à réaliser..."
                rows={3}
                className="text-xs resize-none"
                data-testid="field-description"
              />
            </div>
            <div>
              <Label className="text-xs">Nom des intervenants</Label>
              <Input
                value={data.intervenants}
                onChange={e => set('intervenants', e.target.value)}
                placeholder="Noms et prénoms"
                className="h-7 text-xs"
                data-testid="field-intervenants"
              />
            </div>
          </div>

          {/* ── Section 2 : Risques identifiés ──────────────────────────── */}
          <SectionTitle>2. Risques Identifiés</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6">
            {/* Colonne gauche */}
            <div>
              <SubTitle>Intervention sur du matériel ou des infrastructures :</SubTitle>
              <div className="space-y-1.5">
                <CbRow id="risque_non_decontamine" label="Non décontaminé ou en charge avec des produits" checked={data.risque_non_decontamine} onChange={v => set('risque_non_decontamine', v)} />
                <CbRow id="risque_sous_pression" label="Sous pression" checked={data.risque_sous_pression} onChange={v => set('risque_sous_pression', v)} />
                <CbRow id="risque_alimente" label="Alimenté (électricité, air comprimé,...)" checked={data.risque_alimente} onChange={v => set('risque_alimente', v)} />
                <CbRow id="risque_pieces_mouvements" label="Présentant des pièces en mouvements" checked={data.risque_pieces_mouvements} onChange={v => set('risque_pieces_mouvements', v)} />
                <CbRow id="risque_en_hauteur" label="En hauteur (> 2 m)" checked={data.risque_en_hauteur} onChange={v => set('risque_en_hauteur', v)} />
                <CbRow id="risque_autre_materiel" label="Autre (préciser)" checked={data.risque_autre_materiel} onChange={v => set('risque_autre_materiel', v)}
                  withText textValue={data.risque_autre_materiel_text} onTextChange={v => set('risque_autre_materiel_text', v)} />
              </div>
              <SubTitle>Travaux nécessitant une autorisation particulière :</SubTitle>
              <div className="space-y-1.5">
                <CbRow id="risque_point_chaud" label="Point chaud" checked={data.risque_point_chaud} onChange={v => set('risque_point_chaud', v)} />
                <CbRow id="risque_espace_confine" label="Espace confiné" checked={data.risque_espace_confine} onChange={v => set('risque_espace_confine', v)} />
              </div>
              <SubTitle>Produits dangereux :</SubTitle>
              <div className="space-y-1.5">
                <CbRow id="risque_prod_homme" label="Pour l'homme (Toxique, Corrosif, Irritant, sensibilisant)" checked={data.risque_prod_homme} onChange={v => set('risque_prod_homme', v)} />
                <CbRow id="risque_prod_incendie" label="Pour l'homme ou le matériel (inflammable, explosif)" checked={data.risque_prod_incendie} onChange={v => set('risque_prod_incendie', v)} />
                <CbRow id="risque_prod_env" label="Pour l'environnement" checked={data.risque_prod_env} onChange={v => set('risque_prod_env', v)} />
              </div>
            </div>

            {/* Colonne droite */}
            <div>
              <SubTitle>Environnement des travaux nécessitant une attention particulière :</SubTitle>
              <div className="space-y-1.5">
                <CbRow id="env_coactivite" label="Co-activité avec du personnel d'IRIS ou d'autres entreprises intervenantes" checked={data.env_coactivite} onChange={v => set('env_coactivite', v)} />
                <CbRow id="env_chariot" label="Passage de chariot à proximité" checked={data.env_chariot} onChange={v => set('env_chariot', v)} />
                <CbRow id="env_tuyauterie" label="Tuyauterie ou ligne électrique à proximité" checked={data.env_tuyauterie} onChange={v => set('env_tuyauterie', v)} />
                <CbRow id="env_poussieres" label="Poussières sensibles à l'explosion" checked={data.env_poussieres} onChange={v => set('env_poussieres', v)} />
                <CbRow id="env_autre" label="Autre (préciser)" checked={data.env_autre} onChange={v => set('env_autre', v)}
                  withText textValue={data.env_autre_text} onTextChange={v => set('env_autre_text', v)} />
              </div>
            </div>
          </div>

          {/* ── Section 3 : Précautions à prendre ───────────────────────── */}
          <SectionTitle>3. Précautions à Prendre</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6">
            {/* Colonne gauche */}
            <div>
              <SubTitle>Sur le matériel ou les infrastructures :</SubTitle>
              <div className="space-y-1.5">
                <CbRow id="prec_vidange" label="Vidange / lavage / décontamination préalable" checked={data.prec_vidange} onChange={v => set('prec_vidange', v)} />
                <CbRow id="prec_joint" label="Pose d'un joint plein" checked={data.prec_joint} onChange={v => set('prec_joint', v)} />
                <CbRow id="prec_consignation" label="Consignation électrique et/ou mécanique" checked={data.prec_consignation} onChange={v => set('prec_consignation', v)} />
                <CbRow id="prec_echafaudage" label="Utilisation d'un échafaudage" checked={data.prec_echafaudage} onChange={v => set('prec_echafaudage', v)} />
                <CbRow id="prec_chariot_nacelle" label="Utilisation d'un chariot ou d'une nacelle" checked={data.prec_chariot_nacelle} onChange={v => set('prec_chariot_nacelle', v)} />
                <CbRow id="prec_autre_mat" label="Autre (préciser)" checked={data.prec_autre_mat} onChange={v => set('prec_autre_mat', v)}
                  withText textValue={data.prec_autre_mat_text} onTextChange={v => set('prec_autre_mat_text', v)} />
              </div>
              <div className="mt-2 text-[10px] text-gray-500 italic border-l-2 border-amber-400 pl-2">
                L'utilisation d'un chariot ou d'une nacelle n'est possible qu'après que l'entreprise intervenante ait fourni à IRIS une autorisation nominative de conduite.
              </div>
            </div>

            {/* Colonne droite */}
            <div>
              <SubTitle>Sur les hommes, le matériel ou l'environnement :</SubTitle>
              <div className="space-y-1.5">
                <CbRow id="prec_lunettes" label="Lunettes ou visière adaptée" checked={data.prec_lunettes} onChange={v => set('prec_lunettes', v)} />
                <CbRow id="prec_gants" label="Gants adaptés" checked={data.prec_gants} onChange={v => set('prec_gants', v)} />
                <CbRow id="prec_combinaison" label="Combinaison" checked={data.prec_combinaison} onChange={v => set('prec_combinaison', v)} />
                <CbRow id="prec_masque" label="Masque à gaz ou à poussière" checked={data.prec_masque} onChange={v => set('prec_masque', v)} />
                <CbRow id="prec_autre_hom" label="Autre (préciser)" checked={data.prec_autre_hom} onChange={v => set('prec_autre_hom', v)}
                  withText textValue={data.prec_autre_hom_text} onTextChange={v => set('prec_autre_hom_text', v)} />
              </div>
              <SubTitle>Sur l'environnement des travaux :</SubTitle>
              <div className="space-y-1.5">
                <CbRow id="prec_balisage" label="Balisage de la zone de travaux" checked={data.prec_balisage} onChange={v => set('prec_balisage', v)} />
                <CbRow id="prec_extincteurs" label="Extincteurs adaptés ou RIA à proximité" checked={data.prec_extincteurs} onChange={v => set('prec_extincteurs', v)} />
                <CbRow id="prec_autre_env" label="Autre : Zone Inflammable Vide" checked={data.prec_autre_env} onChange={v => set('prec_autre_env', v)} />
              </div>
            </div>
          </div>

          {/* ── Section 4 : Engagement ───────────────────────────────────── */}
          <SectionTitle>4. Engagement</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Date (JJ/MM/AAAA)</Label>
              <Input
                value={data.date_signature}
                onChange={e => set('date_signature', e.target.value)}
                placeholder="Ex : 12/04/2026"
                className="h-7 text-xs"
                data-testid="field-date-signature"
              />
            </div>
            <div>
              <Label className="text-xs">Nom et visa du demandeur</Label>
              <Input
                value={data.visa_demandeur}
                onChange={e => set('visa_demandeur', e.target.value)}
                placeholder="Nom / Visa"
                className="h-7 text-xs"
                data-testid="field-visa-demandeur"
              />
            </div>
            <div>
              <Label className="text-xs">Nom et visa du représentant de l'intervenant</Label>
              <Input
                value={data.visa_intervenant}
                onChange={e => set('visa_intervenant', e.target.value)}
                placeholder="Nom / Visa"
                className="h-7 text-xs"
                data-testid="field-visa-intervenant"
              />
            </div>
          </div>
          <div className="h-4" />
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-gray-50 flex-row justify-between">
          <Button variant="outline" size="sm" onClick={onClose} disabled={printing}>
            Annuler
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrint(true)}
              disabled={printing}
              data-testid="btn-print-vierge"
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Printer className="h-4 w-4 mr-1" />}
              Imprimer vierge
            </Button>
            <Button
              size="sm"
              className="bg-blue-700 hover:bg-blue-800 text-white"
              onClick={() => handlePrint(false)}
              disabled={printing}
              data-testid="btn-print-filled"
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Printer className="h-4 w-4 mr-1" />}
              Imprimer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
