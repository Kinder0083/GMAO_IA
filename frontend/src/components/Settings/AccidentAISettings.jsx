import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { GitBranch, Save, RefreshCw } from 'lucide-react';
import api, { accidentAnalysisAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const FALLBACK_MODELS = [
  { provider: 'openai', model: 'gpt-5.2', label: 'OpenAI GPT-5.2' },
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI GPT-4o' },
  { provider: 'google', model: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
];

export default function AccidentAISettings() {
  const { toast } = useToast();
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [selectedModel, setSelectedModel] = useState('openai|gpt-5.2');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/ai/available-models').then(r => r.data?.models).catch(() => null),
      accidentAnalysisAPI.getAIConfig().catch(() => null)
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
      await accidentAnalysisAPI.updateAIConfig({ provider, model });
      toast({ title: 'Sauvegarde', description: `Modele IA : ${models.find(m => `${m.provider}|${m.model}` === selectedModel)?.label}` });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="accident-ai-settings">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-orange-600" />
          Analyse d'Accidents - Modele IA
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">
          Choisissez le modele d'IA utilise pour guider l'analyse des accidents (QQOQCP, 5 Pourquoi, Ishikawa, ALARM).
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label>Modele IA</Label>
            {loading ? (
              <div className="flex items-center gap-2 h-10 text-sm text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" /> Chargement...
              </div>
            ) : (
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger data-testid="accident-ai-model-select">
                  <SelectValue placeholder="Choisir un modele" />
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
          <Button onClick={handleSave} disabled={saving || loading} data-testid="save-accident-ai-config">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
