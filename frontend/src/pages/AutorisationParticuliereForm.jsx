import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { autorisationsAPI, documentationsAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { ArrowLeft, Save, Trash2, Plus, FileText, X } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

const AutorisationParticuliereForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { toast } = useToast();
  
  // Récupérer le poleId depuis le state de navigation
  const fromPoleId = location.state?.fromPoleId;

  const [loading, setLoading] = useState(false);
  const [bonsTravail, setBonsTravail] = useState([]);
  const [selectedBonId, setSelectedBonId] = useState('');
  const [formData, setFormData] = useState({
    service_demandeur: '',
    responsable: '',
    personnel_autorise: [
      { nom: '', fonction: '' },
      { nom: '', fonction: '' },
      { nom: '', fonction: '' },
      { nom: '', fonction: '' }
    ],
    // Types de travaux
    type_point_chaud: false,
    type_fouille: false,
    type_espace_clos: false,
    type_autre_cas: false,
    description_travaux: '',
    // Horaires
    horaire_debut: '',
    horaire_fin: '',
    lieu_travaux: '',
    risques_potentiels: '',
    // Mesures de sécurité (FAIT/A_FAIRE)
    mesure_consignation_materiel: '',
    mesure_consignation_electrique: '',
    mesure_debranchement_force: '',
    mesure_vidange_appareil: '',
    mesure_decontamination: '',
    mesure_degazage: '',
    mesure_pose_joint: '',
    mesure_ventilation: '',
    mesure_zone_balisee: '',
    mesure_canalisations_electriques: '',
    mesure_souterraines_balisees: '',
    mesure_egouts_cables: '',
    mesure_taux_oxygene: '',
    mesure_taux_explosivite: '',
    mesure_explosimetre: '',
    mesure_eclairage_surete: '',
    mesure_extincteur: '',
    mesure_autres: '',
    mesures_securite_texte: '',
    // EPI
    epi_visiere: false,
    epi_tenue_impermeable: false,
    epi_cagoule_air: false,
    epi_masque: false,
    epi_gant: false,
    epi_harnais: false,
    epi_outillage_anti_etincelle: false,
    epi_presence_surveillant: false,
    epi_autres: false,
    equipements_protection_texte: '',
    // Signatures
    signature_demandeur: '',
    date_signature_demandeur: '',
    signature_responsable_securite: '',
    date_signature_responsable: '',
    bons_travail_ids: []
  });

  useEffect(() => {
    loadBonsTravail();
    if (isEdit) {
      loadAutorisation();
    }
  }, [id]);

  const loadBonsTravail = async () => {
    try {
      const data = await documentationsAPI.getBonsTravail();
      setBonsTravail(data);
    } catch (error) {
      console.error('Erreur chargement bons de travail:', error);
    }
  };

  const loadAutorisation = async () => {
    try {
      const data = await autorisationsAPI.getById(id);
      // Assurer que personnel_autorise a toujours 4 entrées
      const personnel = data.personnel_autorise || [];
      while (personnel.length < 4) {
        personnel.push({ nom: '', fonction: '' });
      }
      setFormData({
        ...data,
        personnel_autorise: personnel,
        bons_travail_ids: data.bons_travail_ids || []
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors du chargement de l\'autorisation',
        variant: 'destructive'
      });
      console.error(error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePersonnelChange = (index, field, value) => {
    const newPersonnel = [...formData.personnel_autorise];
    newPersonnel[index] = { ...newPersonnel[index], [field]: value };
    setFormData(prev => ({ ...prev, personnel_autorise: newPersonnel }));
  };

  const handleAddBonTravail = () => {
    if (selectedBonId && !formData.bons_travail_ids.includes(selectedBonId)) {
      setFormData(prev => ({
        ...prev,
        bons_travail_ids: [...prev.bons_travail_ids, selectedBonId]
      }));
      setSelectedBonId('');
    }
  };

  const handleRemoveBonTravail = (bonId) => {
    setFormData(prev => ({
      ...prev,
      bons_travail_ids: prev.bons_travail_ids.filter(id => id !== bonId)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Nettoyer les entrées personnel vides
      const cleanedData = {
        ...formData,
        personnel_autorise: formData.personnel_autorise.filter(
          p => p.nom.trim() !== '' || p.fonction.trim() !== ''
        )
      };

      if (isEdit) {
        await autorisationsAPI.update(id, cleanedData);
        toast({
          title: 'Succès',
          description: 'Autorisation mise à jour avec succès'
        });
      } else {
        await autorisationsAPI.create(cleanedData);
        toast({
          title: 'Succès',
          description: 'Autorisation créée avec succès'
        });
      }
      // Retourner au pôle ou à la liste des autorisations
      navigate(-1);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'enregistrement',
        variant: 'destructive'
      });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette autorisation ?')) {
      return;
    }

    try {
      await autorisationsAPI.delete(id);
      toast({
        title: 'Succès',
        description: 'Autorisation supprimée'
      });
      // Retourner au pôle ou à la page documentations
      navigate(-1);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression',
        variant: 'destructive'
      });
      console.error(error);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">
            {isEdit ? 'Modifier l\'Autorisation Particulière' : 'Nouvelle Autorisation Particulière'}
          </h1>
        </div>
        {isEdit && (
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer
          </Button>
        )}
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Informations principales */}
          <Card>
            <CardHeader>
              <CardTitle>Informations Principales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="service_demandeur">Service Demandeur *</Label>
                  <Input
                    id="service_demandeur"
                    name="service_demandeur"
                    value={formData.service_demandeur}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="responsable">Responsable *</Label>
                  <Input
                    id="responsable"
                    name="responsable"
                    value={formData.responsable}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bons de travail liés */}
          <Card>
            <CardHeader>
              <CardTitle>Bons de Travail Liés (optionnel)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {bonsTravail.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun bon de travail disponible</p>
              ) : (
                <>
                  {/* Sélecteur */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select value={selectedBonId} onValueChange={setSelectedBonId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un bon de travail" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {bonsTravail
                            .filter(bon => !formData.bons_travail_ids.includes(bon.id))
                            .map((bon) => (
                              <SelectItem key={bon.id} value={bon.id}>
                                N° {bon.numero} - {bon.titre || 'Sans titre'}
                                {bon.equipement && ` • ${bon.equipement}`}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button 
                      type="button" 
                      onClick={handleAddBonTravail} 
                      disabled={!selectedBonId}
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Liste des bons sélectionnés */}
                  {formData.bons_travail_ids.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Bons sélectionnés :</Label>
                      <div className="flex flex-wrap gap-2">
                        {formData.bons_travail_ids.map((bonId) => {
                          const bon = bonsTravail.find(b => b.id === bonId);
                          if (!bon) return null;
                          return (
                            <Badge key={bonId} variant="secondary" className="flex items-center gap-1 px-3 py-1">
                              <span className="text-sm">
                                N° {bon.numero} - {bon.titre || 'Sans titre'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBonTravail(bonId)}
                                className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Personnel autorisé */}
          <Card>
            <CardHeader>
              <CardTitle>Personnel Autorisé</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {formData.personnel_autorise.map((person, index) => (
                  <div key={index} className="grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-1 text-center font-bold">{index + 1}</div>
                    <div className="col-span-6">
                      <Input
                        placeholder="Nom et Prénom"
                        value={person.nom}
                        onChange={(e) => handlePersonnelChange(index, 'nom', e.target.value)}
                      />
                    </div>
                    <div className="col-span-5">
                      <Input
                        placeholder="Fonction"
                        value={person.fonction}
                        onChange={(e) => handlePersonnelChange(index, 'fonction', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Description des travaux (Type de travaux) */}
          <Card>
            <CardHeader>
              <CardTitle>Type de Travaux *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="type_point_chaud"
                    checked={formData.type_point_chaud}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, type_point_chaud: checked }))}
                  />
                  <label htmlFor="type_point_chaud" className="text-sm font-medium cursor-pointer">
                    Par point chaud
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="type_fouille"
                    checked={formData.type_fouille}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, type_fouille: checked }))}
                  />
                  <label htmlFor="type_fouille" className="text-sm font-medium cursor-pointer">
                    De fouille
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="type_espace_clos"
                    checked={formData.type_espace_clos}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, type_espace_clos: checked }))}
                  />
                  <label htmlFor="type_espace_clos" className="text-sm font-medium cursor-pointer">
                    En espace clos ou confiné
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="type_autre_cas"
                    checked={formData.type_autre_cas}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, type_autre_cas: checked }))}
                  />
                  <label htmlFor="type_autre_cas" className="text-sm font-medium cursor-pointer">
                    Autre cas
                  </label>
                </div>
              </div>
              <div>
                <Label htmlFor="description_travaux">Précisions</Label>
                <Textarea
                  id="description_travaux"
                  name="description_travaux"
                  value={formData.description_travaux}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Détails supplémentaires sur les travaux..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Horaires et lieu */}
          <Card>
            <CardHeader>
              <CardTitle>Horaires et Lieu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="horaire_debut">Horaire Début *</Label>
                  <Input
                    id="horaire_debut"
                    name="horaire_debut"
                    type="time"
                    value={formData.horaire_debut}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="horaire_fin">Horaire Fin *</Label>
                  <Input
                    id="horaire_fin"
                    name="horaire_fin"
                    type="time"
                    value={formData.horaire_fin}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="lieu_travaux">Lieu des Travaux *</Label>
                <Input
                  id="lieu_travaux"
                  name="lieu_travaux"
                  value={formData.lieu_travaux}
                  onChange={handleChange}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Risques potentiels */}
          <Card>
            <CardHeader>
              <CardTitle>Risques Potentiels *</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                name="risques_potentiels"
                value={formData.risques_potentiels}
                onChange={handleChange}
                rows={4}
                placeholder="Liste des risques potentiels (un par ligne)"
                required
              />
            </CardContent>
          </Card>

          {/* Mesures de sécurité */}
          <Card>
            <CardHeader>
              <CardTitle>Mesures de Sécurité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'mesure_consignation_materiel', label: 'CONSIGNATION MAT. OU PIÈCE EN MOUV' },
                { key: 'mesure_consignation_electrique', label: 'CONSIGNATION ÉLECTRIQUE' },
                { key: 'mesure_debranchement_force', label: 'DÉBRANCHEMENT FORCE MOTRICE' },
                { key: 'mesure_vidange_appareil', label: 'VIDANGE APPAREIL/TUYAUTERIE' },
                { key: 'mesure_decontamination', label: 'DÉCONTAMINATION/LAVAGE' },
                { key: 'mesure_degazage', label: 'DÉGAZAGE' },
                { key: 'mesure_pose_joint', label: 'POSE JOINT PLEIN' },
                { key: 'mesure_ventilation', label: 'VENTILATION FORCÉE' },
                { key: 'mesure_zone_balisee', label: 'ZONE BALISÉE' },
                { key: 'mesure_canalisations_electriques', label: 'CANALISATIONS ÉLECTRIQUES' },
                { key: 'mesure_souterraines_balisees', label: 'SOUTERRAINES BALISÉES' },
                { key: 'mesure_egouts_cables', label: 'ÉGOUTS ET CÂBLES PROTÉGÉS' },
                { key: 'mesure_taux_oxygene', label: 'TAUX D\'OXYGÈNE' },
                { key: 'mesure_taux_explosivite', label: 'TAUX D\'EXPLOSIVITÉ' },
                { key: 'mesure_explosimetre', label: 'EXPLOSIMÈTRE EN CONTINU' },
                { key: 'mesure_eclairage_surete', label: 'ÉCLAIRAGE DE SÛRETÉ' },
                { key: 'mesure_extincteur', label: 'EXTINCTEUR TYPE' },
                { key: 'mesure_autres', label: 'AUTRES' }
              ].map((mesure) => (
                <div key={mesure.key} className="flex items-center justify-between p-2 border rounded hover:bg-gray-50">
                  <span className="text-sm font-medium flex-1">{mesure.label}</span>
                  <RadioGroup
                    value={formData[mesure.key]}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, [mesure.key]: value }))}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="A_FAIRE" id={`${mesure.key}_afaire`} />
                      <label htmlFor={`${mesure.key}_afaire`} className="text-sm cursor-pointer">À FAIRE</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="FAIT" id={`${mesure.key}_fait`} />
                      <label htmlFor={`${mesure.key}_fait`} className="text-sm cursor-pointer">FAIT</label>
                    </div>
                  </RadioGroup>
                </div>
              ))}
              <div className="mt-4">
                <Label htmlFor="mesures_securite_texte">Précisions supplémentaires</Label>
                <Textarea
                  id="mesures_securite_texte"
                  name="mesures_securite_texte"
                  value={formData.mesures_securite_texte}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Détails supplémentaires..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Équipements de protection */}
          <Card>
            <CardHeader>
              <CardTitle>Équipements de Protection Individuelle (EPI) *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'epi_visiere', label: 'VISIÈRE' },
                  { key: 'epi_tenue_impermeable', label: 'TENUE IMPERMÉABLE, BOTTES' },
                  { key: 'epi_cagoule_air', label: 'CAGOULE AIR RESPIRABLE/ART' },
                  { key: 'epi_masque', label: 'MASQUE TYPE' },
                  { key: 'epi_gant', label: 'GANT TYPE' },
                  { key: 'epi_harnais', label: 'HARNAIS DE SÉCURITÉ' },
                  { key: 'epi_outillage_anti_etincelle', label: 'OUTILLAGE ANTI-ÉTINCELLE' },
                  { key: 'epi_presence_surveillant', label: 'PRÉSENCE D\'UN SURVEILLANT' },
                  { key: 'epi_autres', label: 'AUTRES' }
                ].map((epi) => (
                  <div key={epi.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={epi.key}
                      checked={formData[epi.key]}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, [epi.key]: checked }))}
                    />
                    <label htmlFor={epi.key} className="text-sm font-medium cursor-pointer">
                      {epi.label}
                    </label>
                  </div>
                ))}
              </div>
              <div>
                <Label htmlFor="equipements_protection_texte">Précisions supplémentaires</Label>
                <Textarea
                  id="equipements_protection_texte"
                  name="equipements_protection_texte"
                  value={formData.equipements_protection_texte}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Détails supplémentaires sur les EPI..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Signatures */}
          <Card>
            <CardHeader>
              <CardTitle>Signatures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="font-semibold">Demandeur</h3>
                  <div>
                    <Label htmlFor="signature_demandeur">Nom</Label>
                    <Input
                      id="signature_demandeur"
                      name="signature_demandeur"
                      value={formData.signature_demandeur}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date_signature_demandeur">Date de signature</Label>
                    <Input
                      id="date_signature_demandeur"
                      name="date_signature_demandeur"
                      type="date"
                      value={formData.date_signature_demandeur}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="font-semibold">Responsable Sécurité</h3>
                  <div>
                    <Label htmlFor="signature_responsable_securite">Nom</Label>
                    <Input
                      id="signature_responsable_securite"
                      name="signature_responsable_securite"
                      value={formData.signature_responsable_securite}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date_signature_responsable">Date de signature</Label>
                    <Input
                      id="date_signature_responsable"
                      name="date_signature_responsable"
                      type="date"
                      value={formData.date_signature_responsable}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => navigate(-1)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default AutorisationParticuliereForm;