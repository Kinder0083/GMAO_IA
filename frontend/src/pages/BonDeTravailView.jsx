import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Download, Printer, Edit } from 'lucide-react';
import { documentationsAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { formatErrorMessage } from '../utils/errorFormatter';

function BonDeTravailView() {
  const { poleId, bonId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bon, setBon] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
    loadBon();
  }, [bonId]);

  const loadBon = async () => {
    try {
      setLoading(true);
      const data = await documentationsAPI.getBonTravail(bonId);
      setBon(data);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Erreur lors du chargement'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const canEdit = () => {
    if (!currentUser || !bon) return false;
    if (currentUser.role === 'ADMIN') return true;
    return bon.created_by === currentUser.id;
  };

  const handlePrint = () => {
    const token = localStorage.getItem('token');
    const printUrl = `${process.env.REACT_APP_BACKEND_URL || window.location.origin}/api/documentations/bons-travail/${bonId}/pdf?token=${token}`;
    const printWindow = window.open(printUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => printWindow.print();
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Chargement...</div>;
  }

  if (!bon) {
    return <div className="text-center text-gray-500 py-12">Bon de travail non trouvé</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{bon.titre || "Bon de travail"}</h1>
            <p className="text-gray-500">
              Créé le {bon.created_at ? new Date(bon.created_at).toLocaleDateString('fr-FR') : 'Date inconnue'}
            </p>
            {bon.entreprise && (
              <Badge variant="outline" className="mt-2">
                {bon.entreprise}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit() && (
            <Button
              variant="outline"
              onClick={() => navigate(`/documentations/${poleId}/bon-de-travail/${bonId}/edit`)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Modifier
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimer
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const token = localStorage.getItem('token');
              window.open(`${process.env.REACT_APP_BACKEND_URL || window.location.origin}/api/documentations/bons-travail/${bonId}/pdf?token=${token}`, '_blank');
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Télécharger PDF
          </Button>
        </div>
      </div>

      {/* Travaux à réaliser */}
      <Card>
        <CardHeader>
          <CardTitle>1. Travaux à réaliser</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-600">Localisation / Ligne</p>
            <p className="text-base">{bon.localisation_ligne || 'Non renseigné'}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600">Description des travaux</p>
            <p className="text-base whitespace-pre-wrap">{bon.description_travaux || 'Non renseigné'}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600">Nom des intervenants</p>
            <p className="text-base">{bon.nom_intervenants || 'Non renseigné'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Risques identifiés */}
      <Card>
        <CardHeader>
          <CardTitle>2. Risques identifiés</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Matériel</p>
            <div className="flex flex-wrap gap-2">
              {bon.risques_materiel?.length > 0 ? (
                bon.risques_materiel.map((r, i) => (
                  <Badge key={i} variant="secondary">{r}</Badge>
                ))
              ) : (
                <span className="text-gray-400 text-sm">Aucun</span>
              )}
            </div>
            {bon.risques_materiel_autre && (
              <p className="text-sm mt-2 text-gray-600">Autre: {bon.risques_materiel_autre}</p>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Autorisation</p>
            <div className="flex flex-wrap gap-2">
              {bon.risques_autorisation?.length > 0 ? (
                bon.risques_autorisation.map((r, i) => (
                  <Badge key={i} variant="secondary">{r}</Badge>
                ))
              ) : (
                <span className="text-gray-400 text-sm">Aucun</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Produits</p>
            <div className="flex flex-wrap gap-2">
              {bon.risques_produits?.length > 0 ? (
                bon.risques_produits.map((r, i) => (
                  <Badge key={i} variant="secondary">{r}</Badge>
                ))
              ) : (
                <span className="text-gray-400 text-sm">Aucun</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Environnement</p>
            <div className="flex flex-wrap gap-2">
              {bon.risques_environnement?.length > 0 ? (
                bon.risques_environnement.map((r, i) => (
                  <Badge key={i} variant="secondary">{r}</Badge>
                ))
              ) : (
                <span className="text-gray-400 text-sm">Aucun</span>
              )}
            </div>
            {bon.risques_environnement_autre && (
              <p className="text-sm mt-2 text-gray-600">Autre: {bon.risques_environnement_autre}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Précautions à prendre */}
      <Card>
        <CardHeader>
          <CardTitle>3. Précautions à prendre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Matériel</p>
            <div className="flex flex-wrap gap-2">
              {bon.precautions_materiel?.length > 0 ? (
                bon.precautions_materiel.map((p, i) => (
                  <Badge key={i} variant="outline">{p}</Badge>
                ))
              ) : (
                <span className="text-gray-400 text-sm">Aucune</span>
              )}
            </div>
            {bon.precautions_materiel_autre && (
              <p className="text-sm mt-2 text-gray-600">Autre: {bon.precautions_materiel_autre}</p>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">EPI (Équipements de Protection Individuelle)</p>
            <div className="flex flex-wrap gap-2">
              {bon.precautions_epi?.length > 0 ? (
                bon.precautions_epi.map((p, i) => (
                  <Badge key={i} variant="outline">{p}</Badge>
                ))
              ) : (
                <span className="text-gray-400 text-sm">Aucun</span>
              )}
            </div>
            {bon.precautions_epi_autre && (
              <p className="text-sm mt-2 text-gray-600">Autre: {bon.precautions_epi_autre}</p>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Environnement</p>
            <div className="flex flex-wrap gap-2">
              {bon.precautions_environnement?.length > 0 ? (
                bon.precautions_environnement.map((p, i) => (
                  <Badge key={i} variant="outline">{p}</Badge>
                ))
              ) : (
                <span className="text-gray-400 text-sm">Aucune</span>
              )}
            </div>
            {bon.precautions_environnement_autre && (
              <p className="text-sm mt-2 text-gray-600">Autre: {bon.precautions_environnement_autre}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Engagement */}
      <Card>
        <CardHeader>
          <CardTitle>4. Engagement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-600">Date d'engagement</p>
            <p className="text-base">
              {bon.date_engagement ? new Date(bon.date_engagement).toLocaleDateString('fr-FR') : 'Non renseignée'}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600">Nom Agent de Maîtrise</p>
            <p className="text-base">{bon.nom_agent_maitrise || 'Non renseigné'}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600">Nom Représentant</p>
            <p className="text-base">{bon.nom_representant || 'Non renseigné'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default BonDeTravailView;
