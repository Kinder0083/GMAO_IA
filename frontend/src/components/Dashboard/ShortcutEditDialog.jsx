import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Upload, RotateCcw, ArrowUp, ArrowDown } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { ICON_SIZES } from './SortableShortcut';

const ShortcutEditDialog = ({ shortcut, open, onClose, onSave }) => {
  const [config, setConfig] = useState({
    name: shortcut?.name || '',
    iconSize: shortcut?.iconSize || 'medium',
    labelPosition: shortcut?.labelPosition || 'below',
    customIconUrl: shortcut?.customIconUrl || null,
    target: shortcut?.target || '',
  });
  const fileInputRef = useRef(null);

  const handleIconUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 128;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        setConfig(prev => ({ ...prev, customIconUrl: canvas.toDataURL('image/png') }));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const resetIcon = () => setConfig(prev => ({ ...prev, customIconUrl: null }));

  const handleSave = () => {
    onSave({
      ...shortcut,
      name: config.name.trim() || shortcut.name,
      iconSize: config.iconSize,
      labelPosition: config.labelPosition,
      customIconUrl: config.customIconUrl,
      target: config.target.trim() || shortcut.target,
    });
    onClose();
  };

  const sizeConfig = ICON_SIZES[config.iconSize] || ICON_SIZES.medium;
  const IconComp = LucideIcons[shortcut?.icon];
  const previewIcon = config.customIconUrl
    ? <img src={config.customIconUrl} alt="" className="object-cover rounded" style={{ width: sizeConfig.icon, height: sizeConfig.icon }} />
    : IconComp
      ? <IconComp size={sizeConfig.icon} className="text-blue-600" />
      : <LucideIcons.ExternalLink size={sizeConfig.icon} className="text-gray-500" />;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" data-testid="shortcut-edit-dialog">
        <DialogHeader>
          <DialogTitle>Modifier le raccourci</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Nom</Label>
            <Input
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              data-testid="shortcut-edit-name"
            />
          </div>

          {/* Target */}
          {shortcut?.targetType === 'url' && (
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Input
                value={config.target}
                onChange={(e) => setConfig(prev => ({ ...prev, target: e.target.value }))}
                data-testid="shortcut-edit-target"
              />
            </div>
          )}

          {/* Icon Size */}
          <div className="space-y-1.5">
            <Label>Taille de l'icone</Label>
            <Select value={config.iconSize} onValueChange={(v) => setConfig(prev => ({ ...prev, iconSize: v }))}>
              <SelectTrigger data-testid="shortcut-edit-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Petit</SelectItem>
                <SelectItem value="medium">Moyen</SelectItem>
                <SelectItem value="large">Grand</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Label Position */}
          <div className="space-y-1.5">
            <Label>Position du texte</Label>
            <div className="flex gap-2">
              <Button
                variant={config.labelPosition === 'above' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-1"
                onClick={() => setConfig(prev => ({ ...prev, labelPosition: 'above' }))}
              >
                <ArrowUp className="h-3 w-3" /> Au-dessus
              </Button>
              <Button
                variant={config.labelPosition === 'below' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-1"
                onClick={() => setConfig(prev => ({ ...prev, labelPosition: 'below' }))}
              >
                <ArrowDown className="h-3 w-3" /> En-dessous
              </Button>
            </div>
          </div>

          {/* Custom Icon */}
          <div className="space-y-1.5">
            <Label>Icone personnalisee</Label>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3 w-3" /> Charger une image
              </Button>
              {config.customIconUrl && (
                <Button variant="ghost" size="sm" className="gap-1 text-red-600" onClick={resetIcon}>
                  <RotateCcw className="h-3 w-3" /> Icone par defaut
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 bg-gray-50 rounded-lg flex flex-col items-center gap-1">
            <p className="text-xs text-gray-400 mb-2">Apercu :</p>
            <div className="flex flex-col items-center" style={{ width: sizeConfig.card }}>
              {config.labelPosition === 'above' && (
                <span className={`${sizeConfig.text} text-gray-700 font-medium text-center py-0.5`}>{config.name || shortcut?.name}</span>
              )}
              <div className="flex items-center justify-center" style={{ width: sizeConfig.card, height: sizeConfig.card }}>
                {previewIcon}
              </div>
              {config.labelPosition === 'below' && (
                <span className={`${sizeConfig.text} text-gray-700 font-medium text-center py-0.5`}>{config.name || shortcut?.name}</span>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} data-testid="shortcut-edit-save">Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShortcutEditDialog;
