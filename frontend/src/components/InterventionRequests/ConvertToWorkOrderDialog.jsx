import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useToast } from '../../hooks/use-toast';
import { interventionRequestsAPI, usersAPI } from '../../services/api';
import AssigneeSelector from '../AssigneeSelector';
import { formatErrorMessage } from '../../utils/errorFormatter';

const ConvertToWorkOrderDialog = ({ open, onOpenChange, request, onSuccess }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeType, setAssigneeType] = useState(null);
  const [assigneeService, setAssigneeService] = useState(null);
  const [dateLimite, setDateLimite] = useState('');
  const [tempsEstime, setTempsEstime] = useState('');

  useEffect(() => {
    if (open) {
      loadUsers();
      setAssigneeId('');
      setAssigneeType(null);
      setAssigneeService(null);
      setTempsEstime('');
      // Pré-remplir avec la date limite désirée si disponible
      if (request?.date_limite_desiree) {
        setDateLimite(request.date_limite_desiree.split('T')[0]);
      } else {
        setDateLimite('');
      }
    }
  }, [open, request]);

  const loadUsers = async () => {
    try {
      const response = await usersAPI.getActive();
      setUsers(response.data.filter(u => u.role === 'TECHNICIEN' || u.role === 'ADMIN'));
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  const handleConvert = async () => {
    if (!request) return;
    
    setLoading(true);
    try {
      await interventionRequestsAPI.convertToWorkOrder(
        request.id, 
        assigneeId || null,
        dateLimite || null,
        assigneeType || null,
        assigneeService || null,
        tempsEstime ? parseFloat(tempsEstime) : null
      );
      toast({
        title: 'Succès',
        description: 'Demande convertie en ordre de travail'
      });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Impossible de convertir la demande'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convertir en ordre de travail</DialogTitle>
          <DialogDescription>
            Créer un ordre de travail à partir de cette demande d'intervention
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              <strong>Demande :</strong> {request.titre}
            </p>
          </div>

          <div className="space-y-2">
            <AssigneeSelector
              value={assigneeType === 'service' && assigneeService 
                ? `service:${assigneeService}` 
                : (assigneeId || '')}
              onChange={(val, type, serviceName) => {
                setAssigneeId(type === 'service' ? '' : val);
                setAssigneeType(type);
                setAssigneeService(serviceName);
              }}
              dataTestId="convert-wo-assignee-selector"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateLimite">Date limite</Label>
            <Input
              id="dateLimite"
              type="date"
              value={dateLimite}
              onChange={(e) => setDateLimite(e.target.value)}
              data-testid="convert-wo-date-limite"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tempsEstime">Duree de realisation estimee (heures)</Label>
            <Input
              id="tempsEstime"
              type="number"
              min="0"
              step="0.5"
              placeholder="Ex: 2.5"
              value={tempsEstime}
              onChange={(e) => setTempsEstime(e.target.value)}
              data-testid="convert-wo-temps-estime"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleConvert}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? 'Conversion...' : 'Convertir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertToWorkOrderDialog;