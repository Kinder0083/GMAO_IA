import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Wand2, Save, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const FALLBACK_MODELS = [
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (recommandé)' },
  { provider: 'openai', model: 'gpt-5.2', label: 'OpenAI GPT-5.2' },
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI GPT-4o' },
  { provider: 'google', model: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
];

export default function MESAIModelSettings() {
  const { toast } = useToast();
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [selectedModel, setSelectedModel] = useState('anthropic|claude-sonnet-4-5-20250929');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/ai/available-models').then(r => r.data?.models).catch(() => null),
      api.get('/mes/ai/config').then(r => r.data).catch(() => null),
    ]).then(([fetchedModels, config]) => {
      if (fetchedModels?.length) setModels(fetchedModels);
      if (config?.provider && config?.model) {
        setSelectedModel(`${config.provider}|${config.model}`);
        setEnabled(config.enabled !== false);
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const [provider, model] = selectedModel.split('|');
      await api.put('/mes/ai/config', { provider, model, enabled });
      const lbl = models.find(m => `${m.provider}|${m.model}` === selectedModel)?.label || `${provider}/${model}`;
      toast({ title: 'Sauvegardé', description: `Modèle IA M.E.S : ${lbl}` });
    } catch (e) {
      const msg = typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Impossible de sauvegarder';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="mes-ai-settings-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-purple-600" />
          Modèle IA pour M.E.S (auto-mapping JSON)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Modèle d'IA utilisé pour analyser les payloads MQTT JSON et proposer
          automatiquement le mapping des champs (cadence, total, état, OEE, …)
          vers les destinations métier d'une machine M.E.S.
        </p>

        <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            data-testid="mes-ai-enabled-switch"
            id="mes-ai-enabled-switch"
          />
          <Label htmlFor="mes-ai-enabled-switch" className="text-sm cursor-pointer">
            Activer l'auto-mapping IA
            <p className="text-xs text-gray-500 font-normal">
              Si désactivé, une heuristique locale (par nom de champ) est utilisée.
            </p>
          </Label>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label>Modèle IA</Label>
            {loading ? (
              <div className="flex items-center gap-2 h-10 text-sm text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" /> Chargement...
              </div>
            ) : (
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger data-testid="mes-ai-model-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map(m => (
                    <SelectItem key={`${m.provider}|${m.model}`} value={`${m.provider}|${m.model}`}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving || loading} data-testid="mes-ai-save-btn">
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
