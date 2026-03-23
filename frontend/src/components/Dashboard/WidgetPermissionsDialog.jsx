import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Shield, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const WidgetPermissionsDialog = ({ open, onOpenChange, widgetId, widgetLabel, currentAllowed = [], onSaved }) => {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [allowedIds, setAllowedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/users');
        const allUsers = (res.data || []).filter(u => u.actif !== false);
        setUsers(allUsers);

        // Initialiser : admins toujours cochés + utilisateurs déjà autorisés
        const initial = new Set(currentAllowed);
        allUsers.forEach(u => {
          if (u.role === 'ADMIN' || u.role === 'Administrateur') {
            initial.add(u.id);
          }
        });
        setAllowedIds(initial);
      } catch (err) {
        console.error('Erreur chargement utilisateurs:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, currentAllowed]);

  const toggleUser = (userId) => {
    setAllowedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/user-preferences/widget-permissions/${widgetId}`, {
        allowed_user_ids: Array.from(allowedIds)
      });
      toast({ title: 'Permissions mises à jour' });
      if (onSaved) onSaved(widgetId, Array.from(allowedIds));
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const admins = users.filter(u => u.role === 'ADMIN' || u.role === 'Administrateur');
  const nonAdmins = users.filter(u => u.role !== 'ADMIN' && u.role !== 'Administrateur');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col" data-testid="widget-permissions-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-blue-600" />
            Visibilité — {widgetLabel}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {admins.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Administrateurs (toujours visible)</p>
                {admins.map(u => (
                  <label key={u.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-gray-50 opacity-60 cursor-not-allowed">
                    <Checkbox checked={true} disabled />
                    <span className="text-sm text-gray-600">{u.prenom} {u.nom}</span>
                  </label>
                ))}
              </div>
            )}

            {nonAdmins.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Utilisateurs</p>
                {nonAdmins.map(u => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer"
                    data-testid={`widget-perm-user-${u.id}`}
                  >
                    <Checkbox
                      checked={allowedIds.has(u.id)}
                      onCheckedChange={() => toggleUser(u.id)}
                    />
                    <span className="text-sm">{u.prenom} {u.nom}</span>
                    <span className="text-xs text-gray-400 ml-auto">{u.role}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} data-testid="save-widget-permissions">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WidgetPermissionsDialog;
