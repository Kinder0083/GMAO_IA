import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Sparkles, Save, RefreshCw } from 'lucide-react';
import api, { documentationsAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const FALLBACK_MODELS = [
  { provider: 'openai', model: 'gpt-5.2', label: 'OpenAI GPT-5.2' },
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI GPT-4o' },
  { provider: 'google', model: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
];

export default function FormAIModelSettings() {
  const { toast } = useToast();
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [selectedModel, setSelectedModel] = useState('openai|gpt-4o');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/ai/available-models').then(r => r.data?.models).catch(() => null),
      documentationsAPI.getAIModelConfig?.().catch(() => null)
    ]).then(([fetchedModels, config]) => {
      if (fetchedModels?.length) setModels(fetchedModels);
      if (config?.provider && config?.model) {
        setSelectedModel(`${config.provider}|${config.model}`);
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const [provider, model] = selectedModel.split('|');
      await documentationsAPI.updateAIModelConfig({ provider, model });
      toast({ title: 'Sauvegardé', description: `Modèle IA : ${models.find(m => `${m.provider}|${m.model}` === selectedModel)?.label}` });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          Modèle IA pour formulaires
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Choisissez le modèle d'intelligence artificielle utilisé pour la génération automatique de formulaires dans le module Documentations.
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label>Modèle IA</Label>
            {loading ? (
              <div className="flex items-center gap-2 h-10 text-sm text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" /> Chargement...
              </div>
            ) : (
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger data-testid="ai-model-select">
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
          <Button onClick={handleSave} disabled={saving || loading} data-testid="ai-model-save-btn">
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
