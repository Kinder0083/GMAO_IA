import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { CheckCircle, XCircle, Loader2, Wrench, Calendar, AlertTriangle } from 'lucide-react';
import api from '../services/api';

const EndMaintenance = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const preSelectedStatut = searchParams.get('statut');

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [maintenanceInfo, setMaintenanceInfo] = useState(null);
  const [selectedStatut, setSelectedStatut] = useState(null);

  // Couleurs des statuts correspondant à Planning M.Prev
  const statutColors = {
    'OPERATIONNEL': { bg: '#10b981', text: 'white', label: 'Opérationnel' },
    'EN_FONCTIONNEMENT': { bg: '#059669', text: 'white', label: 'En Fonctionnement' },
    'A_LARRET': { bg: '#6b7280', text: 'white', label: 'À l\'arrêt' },
    'EN_MAINTENANCE': { bg: '#eab308', text: 'black', label: 'En maintenance' },
    'HORS_SERVICE': { bg: '#ef4444', text: 'white', label: 'Hors service' },
    'EN_CT': { bg: '#8b5cf6', text: 'white', label: 'En C.T' },
    'DEGRADE': { bg: '#3b82f6', text: 'white', label: 'Dégradé' }
  };

  useEffect(() => {
    const fetchMaintenanceInfo = async () => {
      if (!token) {
        setError('Token manquant dans l\'URL');
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/demandes-arret/end-maintenance?token=${token}`);
        setMaintenanceInfo(response.data);
        
        // Si un statut est pré-sélectionné dans l'URL, le traiter directement
        if (preSelectedStatut && statutColors[preSelectedStatut]) {
          handleSelectStatut(preSelectedStatut);
        }
      } catch (err) {
        console.error('Erreur:', err);
        if (err.response?.status === 404) {
          setError('Token invalide ou maintenance non trouvée');
        } else if (err.response?.status === 400) {
          setError(err.response?.data?.detail || 'Cette maintenance a déjà été traitée');
        } else {
          setError('Erreur de connexion au serveur');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMaintenanceInfo();
  }, [token]);

  const handleSelectStatut = async (statut) => {
    setSelectedStatut(statut);
    setProcessing(true);
    setError(null);

    try {
      const response = await api.post(`/demandes-arret/end-maintenance?token=${token}&statut=${statut}`);
      setSuccess({
        message: response.data.message,
        statut: statut
      });
      // Notifier les autres onglets (dashboard) que le statut a été résolu
      localStorage.setItem('maintenance_status_resolved', Date.now().toString());
    } catch (err) {
      console.error('Erreur:', err);
      setError(err.response?.data?.detail || 'Erreur lors du traitement');
      setSelectedStatut(null);
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 text-green-500 animate-spin mb-4" />
            <p className="text-gray-600">Chargement...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error && !maintenanceInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="h-16 w-16 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Erreur</h2>
            <p className="text-gray-600 text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (success) {
    const statutInfo = statutColors[success.statut];
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-green-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Maintenance terminée !</h2>
            <p className="text-gray-600 text-center mb-4">{success.message}</p>
            <div 
              className="px-4 py-2 rounded-full font-medium"
              style={{ 
                backgroundColor: statutInfo?.bg || '#gray', 
                color: statutInfo?.text || 'white' 
              }}
            >
              {statutInfo?.label || success.statut}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="bg-green-600 text-white rounded-t-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-6 w-6" />
            <CardTitle>Fin de Maintenance</CardTitle>
          </div>
          <CardDescription className="text-green-100">
            Sélectionnez le nouveau statut de l'équipement
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pt-6 space-y-6">
          {/* Informations de la maintenance */}
          {maintenanceInfo && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-gray-700 font-medium">
                <Wrench className="h-5 w-5" />
                <span>Détails de la maintenance</span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Équipement(s) :</span>
                  <span className="ml-2 text-gray-800">{maintenanceInfo.equipement_noms?.join(', ')}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">Période :</span>
                  <span className="text-gray-800">
                    Du {formatDate(maintenanceInfo.date_debut)} au {formatDate(maintenanceInfo.date_fin)}
                  </span>
                </div>
                
                {maintenanceInfo.motif && (
                  <div>
                    <span className="font-medium text-gray-600">Motif :</span>
                    <span className="ml-2 text-gray-800">{maintenanceInfo.motif}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          )}

          {/* Sélection du statut */}
          <div className="space-y-3">
            <p className="font-medium text-gray-700 text-center">
              Choisissez le nouveau statut :
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(statutColors).map(([code, info]) => (
                <Button
                  key={code}
                  onClick={() => handleSelectStatut(code)}
                  disabled={processing}
                  className="h-auto py-3 px-4 text-sm font-medium transition-all hover:scale-105"
                  style={{
                    backgroundColor: selectedStatut === code && processing ? `${info.bg}99` : info.bg,
                    color: info.text,
                    border: 'none'
                  }}
                >
                  {processing && selectedStatut === code ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {info.label}
                </Button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Le statut de l'équipement sera immédiatement mis à jour.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default EndMaintenance;
