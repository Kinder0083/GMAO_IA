import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, UserCheck, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useToast } from '../../hooks/use-toast';
import { BACKEND_URL } from '../../utils/config';

/**
 * OrphanReassignDialog
 * ====================
 * Permet à l'admin de réassigner en masse les pointages orphelins d'un OT
 * ou d'une amélioration vers un utilisateur actif, sans avoir à ouvrir le
 * document complet.
 *
 * Props :
 *  - open : bool
 *  - onClose : () => void
 *  - doc : { collection, doc_uuid, doc_id, numero, titre, type_label, entries: [...] }
 *  - onReassigned : () => void (déclenche un re-scan après succès)
 */
const OrphanReassignDialog = ({ open, onClose, doc, onReassigned }) => {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const loadUsers = useCallback(() => {
    setSelectedUserId('');
    setLoading(true);
    axios
      .get(`${BACKEND_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const filtered = (res.data || []).filter(
          (u) =>
            (u.statut || '').toLowerCase() !== 'inactif' &&
            !u.deleted_at &&
            (u.id || u._id)
        );
        filtered.sort((a, b) => {
          const na = `${a.prenom || ''} ${a.nom || ''}`.trim();
          const nb = `${b.prenom || ''} ${b.nom || ''}`.trim();
          return na.localeCompare(nb);
        });
        setUsers(filtered);
      })
      .catch(() =>
        toast({
          title: 'Erreur',
          description: 'Impossible de charger la liste des utilisateurs.',
          variant: 'destructive',
        })
      )
      .finally(() => setLoading(false));
  }, [token, toast]);

  useEffect(() => {
    if (open) loadUsers();
  }, [open, loadUsers]);

  if (!doc) return null;

  const isWorkOrder = doc.collection === 'work_orders';
  const isImprovement = doc.collection === 'improvements';
  const supported = isWorkOrder || isImprovement;
  const baseUrl = isWorkOrder
    ? `/api/work-orders/${doc.doc_uuid}/time-entries`
    : `/api/improvements/${doc.doc_uuid}/time-entries`;

  const handleReassign = async () => {
    if (!selectedUserId) {
      toast({
        title: 'Sélection requise',
        description: 'Veuillez choisir un utilisateur.',
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    let success = 0;
    let failed = 0;
    const reqHeaders = { Authorization: `Bearer ${token}` };
    for (const entry of doc.entries) {
      try {
        const payload = {
          hours: entry.hours,
          user_id: selectedUserId,
        };
        if (entry.timestamp) payload.timestamp = entry.timestamp;
        await axios.put(`${BACKEND_URL}${baseUrl}/${entry.entry_id}`, payload, { headers: reqHeaders });
        success += 1;
      } catch {
        failed += 1;
      }
    }
    setSubmitting(false);

    if (failed === 0) {
      toast({
        title: 'Réassignation effectuée',
        description: `${success} pointage${success > 1 ? 's' : ''} réassigné${success > 1 ? 's' : ''}.`,
      });
      onReassigned?.();
      onClose();
    } else if (success === 0) {
      toast({
        title: 'Échec',
        description: `Aucun pointage n'a pu être réassigné (${failed} erreur${failed > 1 ? 's' : ''}).`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Réassignation partielle',
        description: `${success} OK · ${failed} échec${failed > 1 ? 's' : ''}.`,
        variant: 'destructive',
      });
      onReassigned?.();
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" data-testid="orphan-reassign-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-sky-600" />
            Réassigner les pointages orphelins
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-gray-900">{doc.type_label}</span>
            {' — '}
            <span className="font-mono text-amber-700">{doc.numero || doc.doc_uuid}</span>
            {' '}
            <span className="text-gray-700">{doc.titre}</span>
          </DialogDescription>
        </DialogHeader>

        {!supported && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <AlertTriangle size={16} />
            <span>
              La réassignation automatique n&apos;est pas supportée pour ce type de document.
              Veuillez ouvrir le document manuellement.
            </span>
          </div>
        )}

        {supported && (
          <div className="space-y-4">
            {/* Liste des entries à réassigner */}
            <div>
              <p className="text-sm font-medium mb-2">
                {doc.entries.length} pointage{doc.entries.length > 1 ? 's' : ''} à réassigner :
              </p>
              <div className="rounded-lg border bg-gray-50 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr className="text-left">
                      <th className="py-1.5 px-2">Date</th>
                      <th className="py-1.5 px-2">Heures</th>
                      <th className="py-1.5 px-2">Utilisateur actuel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.entries.map((e) => (
                      <tr key={e.entry_id} className="border-t border-gray-200">
                        <td className="py-1 px-2">{formatDate(e.timestamp)}</td>
                        <td className="py-1 px-2 font-medium">{(e.hours || 0).toFixed(1)}h</td>
                        <td className="py-1 px-2 text-amber-700">{e.user_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Select nouveau user */}
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Réassigner à :
              </label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={loading}>
                <SelectTrigger data-testid="orphan-reassign-user-select">
                  <SelectValue placeholder={loading ? 'Chargement…' : 'Choisir un utilisateur actif…'} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => {
                    const id = u.id || u._id;
                    const name = `${u.prenom || ''} ${u.nom || ''}`.trim() || u.email || id;
                    return (
                      <SelectItem key={id} value={id} data-testid={`reassign-user-${id}`}>
                        {name}
                        {u.service ? <span className="text-gray-500 text-xs ml-2">— {u.service}</span> : null}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting} data-testid="orphan-reassign-cancel-btn">
            Annuler
          </Button>
          <Button
            onClick={handleReassign}
            disabled={!supported || !selectedUserId || submitting || loading}
            data-testid="orphan-reassign-confirm-btn"
          >
            {submitting && <Loader2 size={14} className="animate-spin mr-1" />}
            Réassigner {doc.entries.length} pointage{doc.entries.length > 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrphanReassignDialog;
