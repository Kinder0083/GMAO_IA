import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Sparkles, Save } from 'lucide-react';
import { documentationsAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const AI_MODELS = [
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI GPT-4o (Recommandé)' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI GPT-4o Mini (Rapide)' },
  { provider: 'google', model: 'gemini-2.0-flash', label: 'Google Gemini 2.0 Flash' },
  { provider: 'google', model: 'gemini-2.5-pro-preview-05-06', label: 'Google Gemini 2.5 Pro' },
  { provider: 'anthropic', model: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
];

export default function FormAIModelSettings() {
  const { toast } = useToast();
  const [selectedModel, setSelectedModel] = useState('openai|gpt-4o');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    documentationsAPI.getAIModelConfig?.().then(config => {
      if (config?.provider && config?.model) {
        setSelectedModel(`${config.provider}|${config.model}`);
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const [provider, model] = selectedModel.split('|');
      await documentationsAPI.updateAIModelConfig({ provider, model });
      toast({ title: 'Sauvegardé', description: `Modèle IA : ${AI_MODELS.find(m => `${m.provider}|${m.model}` === selectedModel)?.label}` });
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
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger data-testid="ai-model-select">
                <SelectValue />
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
          <Button onClick={handleSave} disabled={saving} data-testid="ai-model-save-btn">
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
