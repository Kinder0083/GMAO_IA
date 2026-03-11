import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Loader2, Ban } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import api from '../../services/api';

const RefuseInterventionDialog = ({ open, onOpenChange, request, onSuccess }) => {
  const { toast } = useToast();
  const [motif, setMotif] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!motif.trim()) {
      toast({ title: 'Erreur', description: 'Le motif du refus est obligatoire', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await api.post(`/intervention-requests/${request.id}/refuse`, { motif: motif.trim() });
      toast({ title: 'Intervention refusee', description: 'Le demandeur sera notifie par email.' });
      setMotif('');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de refuser la demande',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) setMotif(''); onOpenChange(val); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600" data-testid="refuse-dialog-title">
            <Ban size={20} />
            Refuser l'intervention
          </DialogTitle>
          <DialogDescription>
            {request?.titre}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="motif">Motif du refus *</Label>
            <Textarea
              id="motif"
              data-testid="refuse-motif-input"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Saisissez le motif du refus..."
              rows={4}
              required
            />
          </div>

          <p className="text-sm text-gray-500">
            Un email sera envoye au demandeur pour l'informer du refus.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={loading || !motif.trim()}
              className="bg-red-600 hover:bg-red-700"
              data-testid="refuse-confirm-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Envoi...
                </>
              ) : (
                'Confirmer le refus'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RefuseInterventionDialog;
