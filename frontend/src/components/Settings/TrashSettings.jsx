import React, { useState, useEffect } from 'react';
import { Trash2, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useToast } from '../../hooks/use-toast';
import api from '../../services/api';

const TrashSettings = () => {
  const { toast } = useToast();
  const [retentionDays, setRetentionDays] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/trash/settings').then(res => {
      setRetentionDays(res.data.retention_days);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const days = parseInt(retentionDays);
    if (isNaN(days) || days < 1 || days > 365) {
      toast({ title: 'Erreur', description: 'Le delai doit etre entre 1 et 365 jours', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      await api.put('/trash/settings', { retention_days: days });
      toast({ title: 'Sauvegarde', description: `Delai de retention mis a jour : ${days} jour(s)` });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Corbeille
        </CardTitle>
        <CardDescription>
          Les elements supprimes sont conserves dans la corbeille pendant la duree configuree ci-dessous, puis supprimes automatiquement.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-4">
          <div className="space-y-2 flex-1 max-w-xs">
            <Label htmlFor="retention-days">Delai de retention (jours)</Label>
            <Input
              id="retention-days"
              type="number"
              min="1"
              max="365"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              data-testid="trash-retention-input"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} data-testid="trash-settings-save">
            {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
            Sauvegarder
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          La purge automatique s'execute toutes les 12 heures. Valeur recommandee : 2 a 7 jours.
        </p>
      </CardContent>
    </Card>
  );
};

export default TrashSettings;
