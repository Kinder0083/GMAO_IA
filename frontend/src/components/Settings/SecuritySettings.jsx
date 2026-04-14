import React, { useState, useEffect } from 'react';
import { Clock, Save, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { formatErrorMessage } from '../../utils/errorFormatter';

const SecuritySettings = () => {
  const [inactivityTimeout, setInactivityTimeout] = useState(15);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoadingSettings(true);
      const response = await api.settings.getSettings();
      setInactivityTimeout(response.data.inactivity_timeout_minutes);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les paramètres système',
        variant: 'destructive'
      });
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSaveSettings = async () => {
    if (inactivityTimeout < 1 || inactivityTimeout > 120) {
      toast({
        title: 'Erreur',
        description: 'Le temps d\'inactivité doit être entre 1 et 120 minutes',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSavingSettings(true);
      await api.settings.updateSettings({
        inactivity_timeout_minutes: inactivityTimeout
      });
      
      toast({
        title: 'Paramètres sauvegardés',
        description: 'Les paramètres de déconnexion automatique ont été mis à jour',
      });

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Impossible de sauvegarder les paramètres'),
        variant: 'destructive'
      });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <Clock className="h-6 w-6 text-purple-600" />
        <div>
          <h2 className="text-xl font-semibold">Paramètres de sécurité</h2>
          <p className="text-sm text-gray-600">Configuration de la déconnexion automatique par inactivité</p>
        </div>
      </div>

      {loadingSettings ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400 mr-2" />
          <span className="text-gray-500">Chargement des paramètres...</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temps d'inactivité avant déconnexion — Défaut global (minutes)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min={1}
                max={120}
                value={inactivityTimeout}
                onChange={(e) => setInactivityTimeout(parseInt(e.target.value) || 15)}
                className="w-32 border rounded-lg px-3 py-2"
              />
              <span className="text-gray-500 text-sm">minutes (1 - 120)</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Ce délai s'applique à tous les utilisateurs n'ayant pas défini de préférence personnelle.
              Chaque utilisateur peut surcharger cette valeur dans <strong>Personnalisation → Sécurité</strong>.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {savingSettings ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Sauvegarder
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecuritySettings;
