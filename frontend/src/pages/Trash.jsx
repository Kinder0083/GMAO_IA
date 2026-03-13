import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Loader2, Clock, User, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import api from '../services/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const COLLECTION_COLORS = {
  work_orders: 'bg-blue-50 text-blue-700 border-blue-200',
  improvement_requests: 'bg-green-50 text-green-700 border-green-200',
  intervention_requests: 'bg-orange-50 text-orange-700 border-orange-200',
  equipments: 'bg-purple-50 text-purple-700 border-purple-200',
  presqu_accident_items: 'bg-red-50 text-red-700 border-red-200',
  users: 'bg-gray-50 text-gray-700 border-gray-200',
  surveillance_items: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const Trash = () => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [retentionDays, setRetentionDays] = useState(2);
  const [loading, setLoading] = useState(true);
  const [confirmItem, setConfirmItem] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const loadTrash = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/trash');
      setItems(res.data.items || []);
      setRetentionDays(res.data.retention_days || 2);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger la corbeille', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadTrash(); }, [loadTrash]);

  const handleRestore = async (item) => {
    try {
      await api.post(`/trash/${item.collection}/${item.id}/restore`);
      toast({ title: 'Restaure', description: `"${item.name}" a ete restaure avec succes` });
      loadTrash();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de restaurer', variant: 'destructive' });
    }
  };

  const handlePermanentDelete = async (item) => {
    try {
      await api.delete(`/trash/${item.collection}/${item.id}`);
      toast({ title: 'Supprime', description: `"${item.name}" a ete supprime definitivement` });
      loadTrash();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
    }
  };

  const confirmAndExecute = (item, action) => {
    setConfirmItem(item);
    setConfirmAction(action);
  };

  const executeAction = () => {
    if (!confirmItem || !confirmAction) return;
    if (confirmAction === 'restore') handleRestore(confirmItem);
    else handlePermanentDelete(confirmItem);
    setConfirmItem(null);
    setConfirmAction(null);
  };

  const getRemainingTime = (deletedAt) => {
    const deleted = new Date(deletedAt);
    const expiry = new Date(deleted.getTime() + retentionDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diff = expiry - now;
    if (diff <= 0) return 'Expiration imminente';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours >= 24) return `${Math.floor(hours / 24)}j ${hours % 24}h restants`;
    return `${hours}h restantes`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trash2 size={24} />
            Corbeille
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Les elements supprimes sont conserves {retentionDays} jour(s) avant suppression definitive
          </p>
        </div>
        <div className="text-sm text-gray-500 flex items-center gap-1">
          <Package size={14} />
          {items.length} element(s)
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Trash2 size={48} className="text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">La corbeille est vide</p>
            <p className="text-gray-400 text-sm mt-1">Les elements supprimes apparaitront ici</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={`${item.collection}-${item.id}`} className="hover:shadow-md transition-shadow" data-testid={`trash-item-${item.id}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className={`px-2 py-1 rounded-md text-xs font-medium border whitespace-nowrap ${COLLECTION_COLORS[item.collection] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                    {item.collection_label}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {item.numero ? `#${item.numero} - ` : ''}{item.name}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        {item.deleted_by_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(item.deleted_at).toLocaleString('fr-FR')}
                      </span>
                      <span className="text-orange-500 font-medium flex items-center gap-1">
                        <AlertTriangle size={11} />
                        {getRemainingTime(item.deleted_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`restore-${item.id}`}
                    onClick={() => confirmAndExecute(item, 'restore')}
                    className="text-green-600 hover:bg-green-50 hover:text-green-700"
                  >
                    <RotateCcw size={14} className="mr-1" />
                    Restaurer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`perm-delete-${item.id}`}
                    onClick={() => confirmAndExecute(item, 'delete')}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 size={14} className="mr-1" />
                    Supprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmItem} onOpenChange={(open) => { if (!open) setConfirmItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'restore' ? 'Restaurer cet element ?' : 'Supprimer definitivement ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'restore'
                ? `"${confirmItem?.name}" sera restaure et reapparaitra dans sa liste d'origine.`
                : `"${confirmItem?.name}" sera supprime definitivement. Cette action est irreversible.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              className={confirmAction === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
            >
              {confirmAction === 'restore' ? 'Restaurer' : 'Supprimer definitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Trash;
