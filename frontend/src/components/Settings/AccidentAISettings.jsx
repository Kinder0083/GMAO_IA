import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { GitBranch, Save } from 'lucide-react';
import { accidentAnalysisAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const AI_MODELS = [
  { provider: 'openai', model: 'gpt-5.2', label: 'OpenAI GPT-5.2 (Par defaut)' },
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI GPT-4o' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI GPT-4o Mini (Rapide)' },
  { provider: 'google', model: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
  { provider: 'google', model: 'gemini-2.5-pro-preview-05-06', label: 'Google Gemini 2.5 Pro' },
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
];

export default function AccidentAISettings() {
  const { toast } = useToast();
  const [selectedModel, setSelectedModel] = useState('openai|gpt-5.2');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    accidentAnalysisAPI.getAIConfig().then(config => {
      if (config?.provider && config?.model) {
        setSelectedModel(`${config.provider}|${config.model}`);
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const [provider, model] = selectedModel.split('|');
      await accidentAnalysisAPI.updateAIConfig({ provider, model });
      toast({ title: 'Sauvegarde', description: `Modele IA : ${AI_MODELS.find(m => `${m.provider}|${m.model}` === selectedModel)?.label}` });
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
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger data-testid="accident-ai-model-select">
                <SelectValue placeholder="Choisir un modele" />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map(m => (
                  <SelectItem key={`${m.provider}|${m.model}`} value={`${m.provider}|${m.model}`}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} disabled={saving} data-testid="save-accident-ai-config">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
