import React, { useState, useEffect, useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { 
  AlertTriangle, 
  Clock, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  Wrench
} from 'lucide-react';
import { demandesArretAPI } from '../../services/api';

/**
 * Composant d'alerte affichant les maintenances terminées 
 * qui attendent la sélection d'un nouveau statut
 */
const MaintenanceStatusPendingAlert = () => {
  const [pendingMaintenances, setPendingMaintenances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchPendingMaintenances = useCallback(async () => {
    try {
      const data = await demandesArretAPI.getPendingStatusUpdate();
      setPendingMaintenances(data.maintenances || []);
    } catch (error) {
      console.error('Erreur récupération maintenances en attente:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingMaintenances();
    
    // Rafraîchir toutes les 2 minutes
    const interval = setInterval(fetchPendingMaintenances, 2 * 60 * 1000);

    // Rafraîchir quand l'utilisateur revient sur l'onglet/la fenêtre
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchPendingMaintenances();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Rafraîchir quand la fenêtre reprend le focus (retour depuis l'onglet end-maintenance)
    const handleFocus = () => {
      fetchPendingMaintenances();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchPendingMaintenances]);

  // Écouter les notifications cross-tab via localStorage (quand l'utilisateur valide depuis un autre onglet)
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === 'maintenance_status_resolved') {
        fetchPendingMaintenances();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [fetchPendingMaintenances]);

  // Ne rien afficher si pas de maintenances en attente
  if (loading || pendingMaintenances.length === 0) {
    return null;
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleOpenEndMaintenance = (token) => {
    // Ouvrir la page de fin de maintenance dans un nouvel onglet
    const baseUrl = window.location.origin;
    window.open(`${baseUrl}/end-maintenance?token=${token}`, '_blank');
  };

  return (
    <Alert 
      className="mb-6 border-amber-300 bg-amber-50 shadow-sm"
      data-testid="maintenance-status-pending-alert"
    >
      <AlertTriangle className="h-5 w-5 text-amber-600" />
      <AlertTitle className="text-amber-800 font-semibold flex items-center gap-2">
        <span>Action requise</span>
        <span className="inline-flex items-center justify-center w-6 h-6 text-sm font-bold text-white bg-amber-600 rounded-full">
          {pendingMaintenances.length}
        </span>
      </AlertTitle>
      <AlertDescription className="text-amber-700">
        <p className="mb-3">
          {pendingMaintenances.length === 1 
            ? "Une maintenance préventive s'est terminée et attend la sélection du nouveau statut de l'équipement."
            : `${pendingMaintenances.length} maintenances préventives se sont terminées et attendent la sélection du nouveau statut des équipements.`
          }
        </p>
        
        {/* Bouton pour voir les détails */}
        <Button
          variant="ghost"
          size="sm"
          className="text-amber-800 hover:bg-amber-100 mb-2 -ml-2"
          onClick={() => setExpanded(!expanded)}
          data-testid="toggle-pending-maintenances"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Masquer les détails
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              Voir les détails
            </>
          )}
        </Button>

        {/* Liste des maintenances en attente */}
        {expanded && (
          <div className="space-y-3 mt-2">
            {pendingMaintenances.map((maintenance) => (
              <div 
                key={maintenance.id}
                className="bg-white rounded-lg p-3 border border-amber-200 shadow-sm"
                data-testid={`pending-maintenance-${maintenance.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-amber-900 font-medium mb-1">
                      <Wrench className="h-4 w-4" />
                      <span>{maintenance.equipement_noms?.join(', ') || 'Équipement inconnu'}</span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        <span>
                          Du {formatDate(maintenance.date_debut)} au {formatDate(maintenance.date_fin)}
                        </span>
                      </div>
                      {maintenance.motif && (
                        <p className="text-gray-500 italic pl-5">
                          "{maintenance.motif}"
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {maintenance.end_maintenance_token && (
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                      onClick={() => handleOpenEndMaintenance(maintenance.end_maintenance_token)}
                      data-testid={`select-status-btn-${maintenance.id}`}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Définir le statut
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default MaintenanceStatusPendingAlert;
