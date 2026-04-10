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
import { preventiveMaintenanceAPI, equipmentsAPI, usersAPI } from '../../services/api';
import { formatErrorMessage } from '../../utils/errorFormatter';
import AssigneeSelector from '../AssigneeSelector';
import { ClipboardCheck, CheckCircle, Paperclip } from 'lucide-react';
import AttachmentUploader from '../shared/AttachmentUploader';
import AttachmentsList from '../shared/AttachmentsList';

const PreventiveMaintenanceFormDialog = ({ open, onOpenChange, maintenance, onSuccess, checklists = [] }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [equipments, setEquipments] = useState([]);
  const [users, setUsers] = useState([]);
  const [attachmentRefresh, setAttachmentRefresh] = useState(0);
  const [formData, setFormData] = useState({
    titre: '',
    equipement_id: '',
    frequence: 'MENSUEL',
    prochaineMaintenance: '',
    assigne_a_id: '',
    duree: '',
    statut: 'ACTIF',
    checklist_template_id: ''
  });

  useEffect(() => {
    if (open) {
      loadData();
      if (maintenance) {
        setFormData({
          titre: maintenance.titre || '',
          equipement_id: maintenance.equipement?.id || '',
          frequence: maintenance.frequence || 'MENSUEL',
          prochaineMaintenance: maintenance.prochaineMaintenance?.split('T')[0] || '',
          assigne_a_id: maintenance.assigneA?.id || maintenance.assigne_a_id || '',
          assigne_type: maintenance.assigne_type || null,
          assigne_service: maintenance.assigne_service || null,
          duree: maintenance.duree || '',
          statut: maintenance.statut || 'ACTIF',
          checklist_template_id: maintenance.checklist_template_id || ''
        });
      } else {
        setFormData({
          titre: '',
          equipement_id: '',
          frequence: 'MENSUEL',
          prochaineMaintenance: '',
          assigne_a_id: '',
          duree: '',
          statut: 'ACTIF',
          checklist_template_id: ''
        });
      }
    }
  }, [open, maintenance]);

  const loadData = async () => {
    try {
      const [equipRes, userRes] = await Promise.all([
        equipmentsAPI.getAll(),
        usersAPI.getActive()      ]);
      setEquipments(equipRes.data);
      setUsers(userRes.data);
    } catch (error) {
      console.error('Erreur de chargement:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = {
        ...formData,
        duree: parseFloat(formData.duree),
        prochaineMaintenance: new Date(formData.prochaineMaintenance).toISOString(),
        checklist_template_id: formData.checklist_template_id && formData.checklist_template_id !== 'none' ? formData.checklist_template_id : null
      };

      if (maintenance) {
        await preventiveMaintenanceAPI.update(maintenance.id, submitData);
        toast({
          title: 'Succès',
          description: 'Maintenance préventive modifiée avec succès'
        });
      } else {
        await preventiveMaintenanceAPI.create(submitData);
        toast({
          title: 'Succès',
          description: 'Maintenance préventive créée avec succès'
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Une erreur est survenue'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Filtrer les checklists par équipement sélectionné (si applicable)
  const availableChecklists = checklists.filter(cl => 
    cl.is_template && (
      cl.equipment_ids?.length === 0 || 
      !formData.equipement_id ||
      cl.equipment_ids?.includes(formData.equipement_id)
    )
  );

  const selectedChecklist = checklists.find(cl => cl.id === formData.checklist_template_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{maintenance ? 'Modifier' : 'Nouvelle'} maintenance préventive</DialogTitle>
          <DialogDescription>
            Remplissez les informations de la maintenance préventive
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titre">Titre *</Label>
            <Input
              id="titre"
              value={formData.titre}
              onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="equipement_id">Équipement *</Label>
            <Select value={formData.equipement_id} onValueChange={(value) => setFormData({ ...formData, equipement_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un équipement" />
              </SelectTrigger>
              <SelectContent>
                {equipments.map(eq => (
                  <SelectItem key={eq.id} value={eq.id}>{eq.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="frequence">Fréquence *</Label>
              <Select value={formData.frequence} onValueChange={(value) => setFormData({ ...formData, frequence: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HEBDOMADAIRE">Hebdomadaire</SelectItem>
                  <SelectItem value="MENSUEL">Mensuel</SelectItem>
                  <SelectItem value="TRIMESTRIEL">Trimestriel</SelectItem>
                  <SelectItem value="ANNUEL">Annuel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="statut">Statut</Label>
              <Select value={formData.statut} onValueChange={(value) => setFormData({ ...formData, statut: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIF">Actif</SelectItem>
                  <SelectItem value="INACTIF">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <AssigneeSelector
              value={formData.assigne_type === 'service' && formData.assigne_service 
                ? `service:${formData.assigne_service}` 
                : (formData.assigne_a_id || '')}
              onChange={(val, type, serviceName) => setFormData({
                ...formData,
                assigne_a_id: type === 'service' ? '' : val,
                assigne_type: type,
                assigne_service: serviceName
              })}
              required
              dataTestId="pm-assignee-selector"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prochaineMaintenance">Prochaine maintenance *</Label>
              <Input
                id="prochaineMaintenance"
                type="date"
                value={formData.prochaineMaintenance}
                onChange={(e) => setFormData({ ...formData, prochaineMaintenance: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duree">Durée estimée (heures) *</Label>
              <Input
                id="duree"
                type="number"
                step="0.5"
                value={formData.duree}
                onChange={(e) => setFormData({ ...formData, duree: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Sélection de checklist */}
          <div className="space-y-2 p-4 bg-green-50 rounded-lg border border-green-200">
            <Label htmlFor="checklist_template_id" className="flex items-center gap-2">
              <ClipboardCheck size={18} className="text-green-600" />
              Checklist de contrôle (optionnel)
            </Label>
            <Select 
              value={formData.checklist_template_id} 
              onValueChange={(value) => setFormData({ ...formData, checklist_template_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une checklist..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune checklist</SelectItem>
                {availableChecklists.map(cl => (
                  <SelectItem key={cl.id} value={cl.id}>
                    {cl.name} ({cl.items?.length || 0} items)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedChecklist && (
              <div className="mt-2 p-3 bg-white rounded border">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Aperçu : {selectedChecklist.name}
                </p>
                <div className="space-y-1">
                  {selectedChecklist.items?.slice(0, 3).map((item, index) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle size={14} className="text-green-500" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                  {selectedChecklist.items?.length > 3 && (
                    <p className="text-xs text-gray-400 mt-1">
                      + {selectedChecklist.items.length - 3} autres items...
                    </p>
                  )}
                </div>
              </div>
            )}
            
            {checklists.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Aucune checklist disponible. Créez-en une depuis l&apos;onglet Checklists.
              </p>
            )}
          </div>

          {/* Section Pièces jointes */}
          <div className="space-y-2 p-4 bg-gray-50 rounded-lg border">
            <Label className="flex items-center gap-2">
              <Paperclip size={16} />
              Pièces jointes
            </Label>
            
            {maintenance ? (
              <div className="space-y-3">
                <AttachmentUploader
                  itemId={maintenance?.id}
                  uploadFunction={preventiveMaintenanceAPI.uploadAttachment}
                  onUploadComplete={() => {
                    setAttachmentRefresh(prev => prev + 1);
                    onSuccess();
                  }}
                  entityLabel="la maintenance préventive"
                />
                
                <AttachmentsList
                  itemId={maintenance?.id}
                  getAttachmentsFunction={preventiveMaintenanceAPI.getAttachments}
                  downloadFunction={preventiveMaintenanceAPI.downloadAttachment}
                  deleteFunction={preventiveMaintenanceAPI.deleteAttachment}
                  refreshTrigger={attachmentRefresh}
                  canDelete={true}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Créez d&apos;abord la maintenance préventive pour ajouter des pièces jointes
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700" data-testid="submit-preventive-maintenance-btn">
              {loading ? 'Enregistrement...' : maintenance ? 'Modifier' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PreventiveMaintenanceFormDialog;
