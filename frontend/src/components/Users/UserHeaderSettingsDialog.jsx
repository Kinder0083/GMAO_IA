import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, Monitor, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { HEADER_ICONS_REGISTRY } from '../Personnalisation/HeaderOrganizationSection';
import { usersAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const UserHeaderSettingsDialog = ({ open, onOpenChange, user }) => {
  const { toast } = useToast();
  const [visibility, setVisibility] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user?.id) {
      loadVisibility();
    }
  }, [open, user?.id]);

  const loadVisibility = async () => {
    setLoading(true);
    try {
      const res = await usersAPI.getHeaderVisibility(user.id);
      setVisibility(res.data || {});
    } catch {
      setVisibility({});
    } finally {
      setLoading(false);
    }
  };

  const toggleIcon = (iconId) => {
    setVisibility(prev => ({ ...prev, [iconId]: !prev[iconId] }));
  };

  const toggleAll = (value) => {
    const newVisibility = {};
    HEADER_ICONS_REGISTRY.forEach(icon => {
      newVisibility[icon.id] = value;
    });
    setVisibility(newVisibility);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await usersAPI.updateHeaderVisibility(user.id, visibility);
      toast({ title: 'Enregistré', description: `Icônes header mises à jour pour ${user.prenom || ''} ${user.nom || ''}` });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Erreur', description: "Impossible d'enregistrer", variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = HEADER_ICONS_REGISTRY.filter(i => visibility[i.id]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="header-settings-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-blue-600" />
            Icônes header — {user?.prenom} {user?.nom}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">
            {enabledCount}/{HEADER_ICONS_REGISTRY.length} actives
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toggleAll(true)} data-testid="btn-enable-all">
              <ToggleRight size={14} className="mr-1" /> Tout activer
            </Button>
            <Button variant="outline" size="sm" onClick={() => toggleAll(false)} data-testid="btn-disable-all">
              <ToggleLeft size={14} className="mr-1" /> Tout masquer
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {['left', 'right'].map(zone => (
              <div key={zone}>
                <p className="text-xs font-semibold text-gray-400 uppercase mt-3 mb-2 px-1">
                  Zone {zone === 'left' ? 'gauche' : 'droite'}
                </p>
                {HEADER_ICONS_REGISTRY.filter(i => i.zone === zone).map(icon => {
                  const IconComp = icon.icon;
                  const isEnabled = !!visibility[icon.id];
                  return (
                    <div
                      key={icon.id}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${isEnabled ? 'bg-blue-50' : 'bg-gray-50'}`}
                      data-testid={`header-toggle-${icon.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${isEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-400'}`}>
                          <IconComp size={16} />
                        </div>
                        <span className={`text-sm font-medium ${isEnabled ? 'text-gray-900' : 'text-gray-400'}`}>
                          {icon.label}
                        </span>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleIcon(icon.id)}
                        data-testid={`switch-${icon.id}`}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700" data-testid="btn-save-header-settings">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserHeaderSettingsDialog;
