import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { ImageIcon, Save } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import api from '../../services/api';

const ImageCompressionSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    enabled: true,
    max_resolution: 1200,
    quality: 80,
    output_format: 'jpeg'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const response = await api.get('/settings/image-compression');
      setSettings(response.data);
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.put('/settings/image-compression', settings);
      setSettings(response.data);
      toast({ title: 'Paramètres enregistrés', description: 'La compression d\'images a été mise à jour.' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder les paramètres.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ImageIcon className="h-5 w-5 text-teal-600" />
          Compression des images
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-gray-500">
          Les images uploadées sont automatiquement redimensionnées et compressées de manière transparente pour économiser l'espace disque.
        </p>

        {/* Toggle activation */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Compression automatique</Label>
            <p className="text-xs text-gray-500">Active la compression sur toutes les images uploadées</p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Resolution max */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-sm font-medium">Résolution maximale</Label>
                <span className="text-sm font-bold text-teal-600">{settings.max_resolution} px</span>
              </div>
              <Slider
                value={[settings.max_resolution]}
                onValueChange={([val]) => setSettings(prev => ({ ...prev, max_resolution: val }))}
                min={400}
                max={3000}
                step={100}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>400px</span>
                <span>1200px (recommandé)</span>
                <span>3000px</span>
              </div>
            </div>

            {/* Quality */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-sm font-medium">Qualité de compression</Label>
                <span className="text-sm font-bold text-teal-600">{settings.quality}%</span>
              </div>
              <Slider
                value={[settings.quality]}
                onValueChange={([val]) => setSettings(prev => ({ ...prev, quality: val }))}
                min={30}
                max={100}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>30% (très compressé)</span>
                <span>80% (recommandé)</span>
                <span>100% (original)</span>
              </div>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Format de sortie</Label>
              <Select
                value={settings.output_format}
                onValueChange={(val) => setSettings(prev => ({ ...prev, output_format: val }))}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jpeg">JPEG (recommandé)</SelectItem>
                  <SelectItem value="webp">WebP (plus compact)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ImageCompressionSettings;
