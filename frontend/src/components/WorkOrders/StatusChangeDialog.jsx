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
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const StatusChangeDialog = ({ open, onOpenChange, currentStatus, onStatusChange, onSkip, workOrderId }) => {
  const [selectedStatus, setSelectedStatus] = useState(currentStatus || 'OUVERT');
  const [attMaterielInfo, setAttMaterielInfo] = useState('');
  const [attDecisionInfo, setAttDecisionInfo] = useState('');

  const statuses = [
    { value: 'OUVERT', label: 'Ouvert' },
    { value: 'EN_COURS', label: 'En cours' },
    { value: 'ATT_MATERIEL', label: 'Att Materiel' },
    { value: 'ATT_DECISION', label: 'Att Decision' },
    { value: 'TERMINE', label: 'Termine' }
  ];

  const handleConfirm = () => {
    if (selectedStatus !== currentStatus) {
      const extraData = {};
      if (selectedStatus === 'ATT_MATERIEL' && attMaterielInfo.trim()) {
        extraData.att_materiel_info = attMaterielInfo.trim();
      }
      if (selectedStatus === 'ATT_DECISION' && attDecisionInfo.trim()) {
        extraData.att_decision_info = attDecisionInfo.trim();
      }
      onStatusChange(selectedStatus, 0, 0, extraData);
    } else {
      onSkip();
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  const handleStatusChange = (value) => {
    setSelectedStatus(value);
    if (value !== 'ATT_MATERIEL') setAttMaterielInfo('');
    if (value !== 'ATT_DECISION') setAttDecisionInfo('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Changer le statut de l'ordre de travail</DialogTitle>
          <DialogDescription>
            Souhaitez-vous mettre a jour le statut de cet ordre de travail avant de fermer ?
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="status">Nouveau statut</Label>
            <Select value={selectedStatus} onValueChange={handleStatusChange}>
              <SelectTrigger id="status" data-testid="wo-status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStatus === 'ATT_MATERIEL' && (
            <div className="space-y-2">
              <Label htmlFor="att-materiel-info">Date de reception ?</Label>
              <Input
                id="att-materiel-info"
                placeholder="Ex: Livraison prevue le 25/03/2026"
                value={attMaterielInfo}
                onChange={(e) => setAttMaterielInfo(e.target.value)}
                data-testid="wo-att-materiel-info"
              />
            </div>
          )}

          {selectedStatus === 'ATT_DECISION' && (
            <div className="space-y-2">
              <Label htmlFor="att-decision-info">En attente de qui ?</Label>
              <Input
                id="att-decision-info"
                placeholder="Ex: Direction technique"
                value={attDecisionInfo}
                onChange={(e) => setAttDecisionInfo(e.target.value)}
                data-testid="wo-att-decision-info"
              />
            </div>
          )}
          
          {selectedStatus === currentStatus && (
            <p className="text-sm text-gray-500">
              Le statut actuel est deja "{statuses.find(s => s.value === currentStatus)?.label}".
            </p>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
          >
            Ne rien changer
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={selectedStatus === currentStatus}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="wo-status-confirm-btn"
          >
            Mettre a jour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StatusChangeDialog;
