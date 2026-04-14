import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { usePreferences } from '../../contexts/PreferencesContext';
import { useToast } from '../../hooks/use-toast';
import { Clock, Save, ShieldCheck, Info } from 'lucide-react';

/**
 * Section "Sécurité" dans la page Personnalisation.
 * Permet à chaque utilisateur de définir son propre timeout d'inactivité.
 * Cette valeur est stockée dans user_preferences (propre à chaque utilisateur).
 * Si non défini, l'application utilise le réglage global défini par l'admin.
 */
const SecurityPreferencesSection = () => {
  const { preferences, updatePreferences } = usePreferences();
  const { toast } = useToast();
  const [timeoutValue, setTimeoutValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Charger la valeur depuis les préférences utilisateur au montage
  useEffect(() => {
    const saved = preferences?.inactivity_timeout_minutes;
    if (saved !== undefined && saved !== null) {
      setTimeoutValue(String(saved));
    } else {
      setTimeoutValue(''); // Vide = utilise le défaut global
    }
  }, [preferences]);

  const handleSave = async () => {
    const parsed = parseInt(timeoutValue, 10);

    if (timeoutValue !== '' && (isNaN(parsed) || parsed < 1 || parsed > 120)) {
      toast({
        title: 'Valeur invalide',
        description: 'Le délai doit être compris entre 1 et 120 minutes.',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      // Sauvegarder dans les préférences de l'utilisateur courant via PUT /api/user-preferences
      await updatePreferences({
        inactivity_timeout_minutes: timeoutValue === '' ? null : parsed
      });
      toast({
        title: 'Préférence sauvegardée',
        description: timeoutValue === ''
          ? 'Vous utiliserez le délai par défaut configuré par l\'administrateur.'
          : `Votre délai de déconnexion est fixé à ${parsed} minute${parsed > 1 ? 's' : ''}.`
      });
    } catch {
      toast({
        title: 'Erreur',
        description: 'Impossible de sauvegarder la préférence.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      // Sauvegarder null = utiliser le défaut admin
      await updatePreferences({ inactivity_timeout_minutes: null });
      setTimeoutValue('');
      toast({
        title: 'Réinitialisé',
        description: 'Le délai par défaut de l\'administrateur sera appliqué.'
      });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de réinitialiser.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-purple-50">
              <ShieldCheck size={22} className="text-purple-600" />
            </div>
            <div>
              <Label className="text-base font-semibold">Déconnexion automatique par inactivité</Label>
              <p className="text-sm text-gray-500 mt-0.5">
                Définissez votre propre délai de déconnexion. Cette valeur est personnelle et ne s'applique qu'à votre compte.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Champ de saisie */}
            <div>
              <Label htmlFor="inactivity-timeout" className="text-sm font-medium text-gray-700 mb-2 block">
                Temps d'inactivité avant déconnexion (minutes)
              </Label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="inactivity-timeout"
                    data-testid="inactivity-timeout-input"
                    type="number"
                    min={1}
                    max={120}
                    value={timeoutValue}
                    onChange={(e) => setTimeoutValue(e.target.value)}
                    placeholder="Défaut admin"
                    className="pl-9 w-40 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none"
                  />
                </div>
                <span className="text-gray-400 text-sm">minutes (1 – 120)</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Laissez vide pour utiliser le délai par défaut configuré par l'administrateur.
              </p>
            </div>

            {/* Info box */}
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
              <Info size={15} className="text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                Votre réglage personnel prend toujours la priorité sur le réglage global.
                La déconnexion automatique est désactivée sur les appareils mobiles et sur les pages Chat Live / Tableau d'affichage.
              </p>
            </div>

            {/* Boutons */}
            <div className="flex items-center gap-3">
              <Button
                data-testid="save-inactivity-timeout-btn"
                onClick={handleSave}
                disabled={saving}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
                size="sm"
              >
                <Save size={15} />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
              <Button
                data-testid="reset-inactivity-timeout-btn"
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={saving || timeoutValue === ''}
              >
                Réinitialiser au défaut
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SecurityPreferencesSection;
