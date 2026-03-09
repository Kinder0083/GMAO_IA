import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ArrowLeft, Save, Mail, FileDown, Printer } from 'lucide-react';
import { documentationsAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { formatErrorMessage } from '../utils/errorFormatter';

const RISQUES_MATERIEL = [
  'Chute plain pied',
  'Chute en hauteur',
  'Manutention',
  'Matériel en rotation',
  'Electricité',
  'Circulation engin'
];

const RISQUES_AUTORISATION = [
  'Point chaud',
  'Espace confiné'
];

const RISQUES_PRODUITS = [
  'Toxique',
  'Inflammable',
  'Corrosif',
  'Irritant',
  'CMR'
];

const RISQUES_ENVIRONNEMENT = [
  'Co-activité',
  'Passage chariot',
  'Zone piétonne',
  'Zone ATEX'
];

const PRECAUTIONS_MATERIEL = [
  'Echafaudage',
  'Nacelle',
  'Harnais',
  'Ligne vie',
  'Consignation',
  'Déconsignation'
];

const PRECAUTIONS_EPI = [
  'Casque',
  'Lunettes',
  'Gants',
  'Chaussures S3',
  'Masque',
  'Bouchons oreilles',
  'Gilet HV'
];

const PRECAUTIONS_ENVIRONNEMENT = [
  'Balisage',
  'Signalisation',
  'Permis feu',
  'Ventilation'
];

function BonDeTravailForm() {
  const { poleId, bonId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pole, setPole] = useState(null);
  const [showEntrepriseDialog, setShowEntrepriseDialog] = useState(false);
  const [entreprises, setEntreprises] = useState([]);
  const [newEntreprise, setNewEntreprise] = useState('');
  const [selectedEntreprise, setSelectedEntreprise] = useState('');

  const [formData, setFormData] = useState({
    titre: '',
    localisation_ligne: '',
    description_travaux: '',
    nom_intervenants: '',
    
    risques_materiel: [],
    risques_materiel_autre: '',
    risques_autorisation: [],
    risques_produits: [],
    risques_environnement: [],
    risques_environnement_autre: '',
    
    precautions_materiel: [],
    precautions_materiel_autre: '',
    precautions_epi: [],
    precautions_epi_autre: '',
    precautions_environnement: [],
    precautions_environnement_autre: '',
    
    date_engagement: new Date().toISOString().split('T')[0],
    nom_agent_maitrise: '',
    nom_representant: '',
    entreprise: 'Non assignée'
  });

  useEffect(() => {
    loadData();
  }, [poleId, bonId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [poleData, bonsTravail] = await Promise.all([
        documentationsAPI.getPole(poleId),
        documentationsAPI.getBonsTravail({ pole_id: poleId })
      ]);
      
      setPole(poleData);
      
      // Extraire les entreprises uniques
      const uniqueEntreprises = [...new Set(bonsTravail.map(b => b.entreprise).filter(Boolean))];
      setEntreprises(uniqueEntreprises);

      if (bonId && bonId !== 'new') {
        const bonData = await documentationsAPI.getBonTravail(bonId);
        setFormData(bonData);
      }
    } catch (error) {
      console.error('Erreur chargement:', error);
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Erreur lors du chargement'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (category, value) => {
    const current = formData[category];
    if (current.includes(value)) {
      setFormData({
        ...formData,
        [category]: current.filter(v => v !== value)
      });
    } else {
      setFormData({
        ...formData,
        [category]: [...current, value]
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Si c'est une création, ouvrir le dialogue d'entreprise
    if (!bonId || bonId === 'new') {
      setShowEntrepriseDialog(true);
    } else {
      // Si c'est une modification, sauvegarder directement
      await saveBonTravail(formData.entreprise);
    }
  };

  const saveBonTravail = async (entreprise) => {
    try {
      setLoading(true);
      const data = {
        ...formData,
        pole_id: poleId,
        entreprise: entreprise || 'Non assignée'
      };

      if (bonId && bonId !== 'new') {
        await documentationsAPI.updateBonTravail(bonId, data);
        toast({ title: 'Succès', description: 'Bon de travail mis à jour' });
      } else {
        await documentationsAPI.createBonTravail(data);
        toast({ title: 'Succès', description: 'Bon de travail créé' });
      }
      setShowEntrepriseDialog(false);
      navigate(-1);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Erreur lors de l\'enregistrement'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    const email = prompt('Entrez l\'adresse email de destination:');
    if (email && bonId && bonId !== 'new') {
      try {
        await documentationsAPI.sendEmail(bonId, email);
        toast({ title: 'Succès', description: 'Email envoyé' });
      } catch (error) {
        toast({
          title: 'Erreur',
          description: formatErrorMessage(error, 'Erreur lors de l\'envoi'),
          variant: 'destructive'
        });
      }
    }
  };

  const handleGeneratePDF = async () => {
    if (bonId && bonId !== 'new') {
      try {
        await documentationsAPI.generatePDF(bonId);
        toast({ title: 'Info', description: 'Génération PDF en cours...' });
      } catch (error) {
        toast({
          title: 'Erreur',
          description: formatErrorMessage(error, 'Erreur génération PDF'),
          variant: 'destructive'
        });
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading && !pole) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Bon de Travail</h1>
            <p className="text-gray-500">{pole?.nom || 'Pôle de service'}</p>
          </div>
          <div className="flex gap-2">
            {bonId && bonId !== 'new' && (
              <>
                <Button variant="outline" onClick={handleSendEmail}>
                  <Mail className="mr-2 h-4 w-4" />
                  Email
                </Button>
                <Button variant="outline" onClick={handleGeneratePDF}>
                  <FileDown className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimer
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Travaux à réaliser */}
        <Card>
          <CardHeader>
            <CardTitle>1. Travaux à réaliser</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Titre du bon de travail *</Label>
              <Input
                value={formData.titre}
                onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                placeholder="ex: Maintenance ligne 3"
                required
              />
            </div>
            
            <div>
              <Label>Localisation / Ligne *</Label>
              <Input
                value={formData.localisation_ligne}
                onChange={(e) => setFormData({ ...formData, localisation_ligne: e.target.value })}
                placeholder="ex: Ligne 3, Atelier B"
                required
              />
            </div>

            <div>
              <Label>Description des travaux *</Label>
              <Textarea
                value={formData.description_travaux}
                onChange={(e) => setFormData({ ...formData, description_travaux: e.target.value })}
                rows={4}
                placeholder="Décrivez les travaux à réaliser..."
                required
              />
            </div>

            <div>
              <Label>Nom des intervenants *</Label>
              <Input
                value={formData.nom_intervenants}
                onChange={(e) => setFormData({ ...formData, nom_intervenants: e.target.value })}
                placeholder="Nom(s) des intervenants"
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Risques identifiés */}
        <Card>
          <CardHeader>
            <CardTitle>2. Risques identifiés</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Risques matériels */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Risques matériels</Label>
              <div className="grid grid-cols-2 gap-3">
                {RISQUES_MATERIEL.map((risque) => (
                  <div key={risque} className="flex items-center space-x-2">
                    <Checkbox
                      id={`risque-mat-${risque}`}
                      checked={formData.risques_materiel.includes(risque)}
                      onCheckedChange={() => handleCheckboxChange('risques_materiel', risque)}
                    />
                    <label htmlFor={`risque-mat-${risque}`} className="text-sm cursor-pointer">
                      {risque}
                    </label>
                  </div>
                ))}
              </div>
              <Input
                className="mt-3"
                placeholder="Autre (préciser)..."
                value={formData.risques_materiel_autre}
                onChange={(e) => setFormData({ ...formData, risques_materiel_autre: e.target.value })}
              />
            </div>

            {/* Autorisation nécessaire */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Autorisation nécessaire</Label>
              <div className="grid grid-cols-2 gap-3">
                {RISQUES_AUTORISATION.map((risque) => (
                  <div key={risque} className="flex items-center space-x-2">
                    <Checkbox
                      id={`risque-auto-${risque}`}
                      checked={formData.risques_autorisation.includes(risque)}
                      onCheckedChange={() => handleCheckboxChange('risques_autorisation', risque)}
                    />
                    <label htmlFor={`risque-auto-${risque}`} className="text-sm cursor-pointer">
                      {risque}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Risques produits */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Risques liés aux produits</Label>
              <div className="grid grid-cols-2 gap-3">
                {RISQUES_PRODUITS.map((risque) => (
                  <div key={risque} className="flex items-center space-x-2">
                    <Checkbox
                      id={`risque-prod-${risque}`}
                      checked={formData.risques_produits.includes(risque)}
                      onCheckedChange={() => handleCheckboxChange('risques_produits', risque)}
                    />
                    <label htmlFor={`risque-prod-${risque}`} className="text-sm cursor-pointer">
                      {risque}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Risques environnement */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Risques liés à l'environnement</Label>
              <div className="grid grid-cols-2 gap-3">
                {RISQUES_ENVIRONNEMENT.map((risque) => (
                  <div key={risque} className="flex items-center space-x-2">
                    <Checkbox
                      id={`risque-env-${risque}`}
                      checked={formData.risques_environnement.includes(risque)}
                      onCheckedChange={() => handleCheckboxChange('risques_environnement', risque)}
                    />
                    <label htmlFor={`risque-env-${risque}`} className="text-sm cursor-pointer">
                      {risque}
                    </label>
                  </div>
                ))}
              </div>
              <Input
                className="mt-3"
                placeholder="Autre (préciser)..."
                value={formData.risques_environnement_autre}
                onChange={(e) => setFormData({ ...formData, risques_environnement_autre: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Précautions à prendre */}
        <Card>
          <CardHeader>
            <CardTitle>3. Précautions à prendre</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Précautions matériel */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Précautions matérielles</Label>
              <div className="grid grid-cols-2 gap-3">
                {PRECAUTIONS_MATERIEL.map((precaution) => (
                  <div key={precaution} className="flex items-center space-x-2">
                    <Checkbox
                      id={`prec-mat-${precaution}`}
                      checked={formData.precautions_materiel.includes(precaution)}
                      onCheckedChange={() => handleCheckboxChange('precautions_materiel', precaution)}
                    />
                    <label htmlFor={`prec-mat-${precaution}`} className="text-sm cursor-pointer">
                      {precaution}
                    </label>
                  </div>
                ))}
              </div>
              <Input
                className="mt-3"
                placeholder="Autre (préciser)..."
                value={formData.precautions_materiel_autre}
                onChange={(e) => setFormData({ ...formData, precautions_materiel_autre: e.target.value })}
              />
            </div>

            {/* EPI */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Équipements de Protection Individuelle (EPI)</Label>
              <div className="grid grid-cols-2 gap-3">
                {PRECAUTIONS_EPI.map((epi) => (
                  <div key={epi} className="flex items-center space-x-2">
                    <Checkbox
                      id={`epi-${epi}`}
                      checked={formData.precautions_epi.includes(epi)}
                      onCheckedChange={() => handleCheckboxChange('precautions_epi', epi)}
                    />
                    <label htmlFor={`epi-${epi}`} className="text-sm cursor-pointer">
                      {epi}
                    </label>
                  </div>
                ))}
              </div>
              <Input
                className="mt-3"
                placeholder="Autre (préciser)..."
                value={formData.precautions_epi_autre}
                onChange={(e) => setFormData({ ...formData, precautions_epi_autre: e.target.value })}
              />
            </div>

            {/* Précautions environnement */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Précautions environnementales</Label>
              <div className="grid grid-cols-2 gap-3">
                {PRECAUTIONS_ENVIRONNEMENT.map((precaution) => (
                  <div key={precaution} className="flex items-center space-x-2">
                    <Checkbox
                      id={`prec-env-${precaution}`}
                      checked={formData.precautions_environnement.includes(precaution)}
                      onCheckedChange={() => handleCheckboxChange('precautions_environnement', precaution)}
                    />
                    <label htmlFor={`prec-env-${precaution}`} className="text-sm cursor-pointer">
                      {precaution}
                    </label>
                  </div>
                ))}
              </div>
              <Input
                className="mt-3"
                placeholder="Autre (préciser)..."
                value={formData.precautions_environnement_autre}
                onChange={(e) => setFormData({ ...formData, precautions_environnement_autre: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Engagement */}
        <Card>
          <CardHeader>
            <CardTitle>4. Engagement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Date d'engagement *</Label>
              <Input
                type="date"
                value={formData.date_engagement}
                onChange={(e) => setFormData({ ...formData, date_engagement: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nom de l'agent de maîtrise *</Label>
                <Input
                  value={formData.nom_agent_maitrise}
                  onChange={(e) => setFormData({ ...formData, nom_agent_maitrise: e.target.value })}
                  placeholder="Signature agent de maîtrise"
                  required
                />
              </div>

              <div>
                <Label>Nom du représentant *</Label>
                <Input
                  value={formData.nom_representant}
                  onChange={(e) => setFormData({ ...formData, nom_representant: e.target.value })}
                  placeholder="Signature représentant"
                  required
                />
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
            <Save className="mr-2 h-4 w-4" />
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </form>

      {/* Dialog de sélection d'entreprise */}
      <Dialog open={showEntrepriseDialog} onOpenChange={setShowEntrepriseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sélectionner une entreprise</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Entreprise existante</Label>
              <Select 
                value={selectedEntreprise} 
                onValueChange={setSelectedEntreprise}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une entreprise..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Non assignée">Non assignée</SelectItem>
                  {entreprises.map((ent, idx) => (
                    <SelectItem key={idx} value={ent}>{ent}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-gray-300"></div>
              <span className="text-sm text-gray-500">OU</span>
              <div className="h-px flex-1 bg-gray-300"></div>
            </div>
            
            <div>
              <Label>Nouvelle entreprise</Label>
              <Input
                value={newEntreprise}
                onChange={(e) => setNewEntreprise(e.target.value)}
                placeholder="Nom de la nouvelle entreprise"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEntrepriseDialog(false)}>
              Annuler
            </Button>
            <Button 
              onClick={() => {
                const entrepriseToSave = newEntreprise || selectedEntreprise || 'Non assignée';
                saveBonTravail(entrepriseToSave);
              }}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BonDeTravailForm;
