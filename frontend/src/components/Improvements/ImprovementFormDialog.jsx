import React, { useState, useEffect, useRef } from 'react';
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
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Paperclip, Camera, RefreshCw } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { improvementsAPI, equipmentsAPI, locationsAPI, usersAPI } from '../../services/api';
import StatusChangeDialog from './StatusChangeDialog';
import AssigneeSelector from '../AssigneeSelector';
import { formatErrorMessage } from '../../utils/errorFormatter';
import EtapesRealisationField from '../EtapesRealisation/EtapesRealisationField';

const ImprovementFormDialog = ({ open, onOpenChange, workOrder, onSuccess }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [equipments, setEquipments] = useState([]);
  const [childEquipments, setChildEquipments] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    statut: 'OUVERT',
    priorite: 'AUCUNE',
    equipement_id: '',
    sous_equipement_id: '',
    assigne_a_id: '',
    emplacement_id: '',
    dateLimite: '',
    tempsEstime: ''
  });
  const [attachments, setAttachments] = useState([]);
  const [etapes, setEtapes] = useState([]);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [savedImprovementId, setSavedImprovementId] = useState(null);
  const [savedImprovementStatus, setSavedImprovementStatus] = useState(null);

  useEffect(() => {
    if (open) {
      loadData();
      setIsClosing(false);
      setChildEquipments([]);
      if (workOrder) {
        // Détecter si l'équipement stocké est un sous-équipement (a un parent_id)
        const eqId = workOrder.equipement?.id || workOrder.equipement_id || '';
        let parentEqId = eqId;
        let sousEqId = '';
        if (workOrder.equipement?.parent_id) {
          parentEqId = workOrder.equipement.parent_id;
          sousEqId = eqId;
        }
        setFormData({
          titre: workOrder.titre || '',
          description: workOrder.description || '',
          statut: workOrder.statut || 'OUVERT',
          priorite: workOrder.priorite || 'AUCUNE',
          equipement_id: parentEqId,
          sous_equipement_id: sousEqId,
          assigne_a_id: workOrder.assigneA?.id || workOrder.assigne_a_id || '',
          assigne_type: workOrder.assigne_type || null,
          assigne_service: workOrder.assigne_service || null,
          emplacement_id: workOrder.emplacement?.id || '',
          dateLimite: workOrder.dateLimite?.split('T')[0] || '',
          tempsEstime: workOrder.tempsEstime || ''
        });
        setSavedImprovementId(workOrder.id);
        setSavedImprovementStatus(workOrder.statut);
        setEtapes(workOrder.etapes_realisation || []);
      } else {
        setFormData({
          titre: '',
          description: '',
          statut: 'OUVERT',
          priorite: 'AUCUNE',
          equipement_id: '',
          sous_equipement_id: '',
          assigne_a_id: '',
          emplacement_id: '',
          dateLimite: '',
          tempsEstime: ''
        });
        setAttachments([]);
        setSavedImprovementId(null);
        setSavedImprovementStatus(null);
        setEtapes([]);
      }
    }
  }, [open, workOrder]);

  // Auto-remplir l'emplacement et charger les sous-équipements quand l'équipement change
  useEffect(() => {
    if (formData.equipement_id && equipments.length > 0) {
      const parentEq = equipments.find(eq => eq.id === formData.equipement_id);
      if (parentEq) {
        if (parentEq.emplacement_id && formData.emplacement_id !== parentEq.emplacement_id) {
          setFormData(prev => ({ ...prev, emplacement_id: parentEq.emplacement_id }));
        }
        loadChildren(parentEq.id);
      }
    } else if (!formData.equipement_id) {
      setChildEquipments([]);
    }
  }, [formData.equipement_id, equipments]);

  const loadData = async () => {
    try {
      const [equipRes, locRes, userRes] = await Promise.all([
        equipmentsAPI.getParents(),
        locationsAPI.getAll(),
        usersAPI.getActive()      ]);
      setEquipments(equipRes.data);
      setLocations(locRes.data);
      setUsers(userRes.data);
    } catch (error) {
      console.error('Erreur de chargement:', error);
    }
  };

  const loadChildren = async (parentId) => {
    setLoadingChildren(true);
    try {
      const response = await equipmentsAPI.getChildren(parentId);
      setChildEquipments(response.data || []);
    } catch (error) {
      console.error('Erreur chargement sous-équipements:', error);
      setChildEquipments([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    const newAttachments = files.map(file => ({
      file,
      name: file.name,
      size: file.size
    }));
    setAttachments([...attachments, ...newAttachments]);
    event.target.value = ''; // Reset input
  };

  const handleCameraCapture = () => {
    // Déclencher l'input file avec capture="environment" pour ouvrir la caméra
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const handleRemoveAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleDialogClose = (isOpen) => {
    if (!isOpen && !isClosing && !loading) {
      // L'utilisateur veut fermer sans sauvegarder
      // Dans le cas du formulaire, on ouvre le dialog de statut seulement si on modifie un ordre existant
      if (workOrder) {
        setShowStatusDialog(true);
        setIsClosing(true);
      } else {
        onOpenChange(false);
      }
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (savedImprovementId) {
      try {
        await improvementsAPI.update(savedImprovementId, { statut: newStatus });
        toast({
          title: 'Succès',
          description: 'Le statut a été mis à jour'
        });
      } catch (error) {
        toast({
          title: 'Erreur',
          description: 'Impossible de mettre à jour le statut',
          variant: 'destructive'
        });
      }
    }
    setShowStatusDialog(false);
    onOpenChange(false);
  };

  const handleSkipStatusChange = () => {
    setShowStatusDialog(false);
    onOpenChange(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const actualEquipementId = formData.sous_equipement_id || formData.equipement_id || null;
      const submitData = {
        ...formData,
        tempsEstime: formData.tempsEstime ? parseFloat(formData.tempsEstime) : null,
        dateLimite: formData.dateLimite ? new Date(formData.dateLimite).toISOString() : null,
        equipement_id: actualEquipementId,
        assigne_a_id: formData.assigne_a_id || null,
        emplacement_id: formData.emplacement_id || null,
        etapes_realisation: etapes
      };
      delete submitData.sous_equipement_id;

      if (workOrder) {
        await improvementsAPI.update(workOrder.id, submitData);
        
        // Upload des fichiers si présents
        if (attachments.length > 0) {
          for (const attachment of attachments) {
            try {
              await improvementsAPI.uploadAttachment(workOrder.id, attachment.file);
            } catch (err) {
              console.error('Erreur upload fichier:', err);
            }
          }
        }
        
        toast({
          title: 'Succès',
          description: 'Amélioration modifié avec succès'
        });
        
        // Émettre un événement pour rafraîchir les notifications instantanément
        window.dispatchEvent(new Event('workOrderUpdated'));
        
        // Mettre à jour le statut pour le dialog de changement
        setSavedImprovementId(workOrder.id);
        setSavedImprovementStatus(submitData.statut);
      } else {
        const response = await improvementsAPI.create(submitData);
        const newImprovement = response.data;
        const newImprovementId = newImprovement.id;
        
        // Upload des fichiers si présents
        if (attachments.length > 0 && newImprovementId) {
          for (const attachment of attachments) {
            try {
              await improvementsAPI.uploadAttachment(newImprovementId, attachment.file);
            } catch (err) {
              console.error('Erreur upload fichier:', err);
            }
          }
        }
        
        toast({
          title: 'Succès',
          description: 'Amélioration créé avec succès'
        });
        
        // Émettre un événement pour rafraîchir les notifications instantanément
        window.dispatchEvent(new Event('workOrderCreated'));
        
        // Fermer le formulaire et rafraîchir la liste
        onSuccess();
        onOpenChange(false);
        return; // Sortir pour éviter d'ouvrir le dialog de statut
      }

      onSuccess();
      // Ne pas fermer directement, afficher le dialog de changement de statut pour les modifications
      setShowStatusDialog(true);
    } catch (error) {
      console.error('Erreur création/modification amélioration:', error);
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Une erreur est survenue'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workOrder ? 'Modifier' : 'Nouvel'} amélioration</DialogTitle>
          <DialogDescription>
            Remplissez les informations de l'amélioration
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
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="statut">Statut</Label>
              <Select value={formData.statut} onValueChange={(value) => setFormData({ ...formData, statut: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUVERT">Ouvert</SelectItem>
                  <SelectItem value="EN_COURS">En cours</SelectItem>
                  <SelectItem value="EN_ATTENTE">En attente</SelectItem>
                  <SelectItem value="TERMINE">Terminé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priorite">Priorité</Label>
              <Select value={formData.priorite} onValueChange={(value) => setFormData({ ...formData, priorite: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HAUTE">Haute</SelectItem>
                  <SelectItem value="MOYENNE">Moyenne</SelectItem>
                  <SelectItem value="BASSE">Basse</SelectItem>
                  <SelectItem value="AUCUNE">Normale</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="equipement_id">Équipement</Label>
            <Select
              value={formData.equipement_id || "none"}
              onValueChange={(value) => setFormData({ ...formData, equipement_id: value === "none" ? "" : value, sous_equipement_id: '' })}
            >
              <SelectTrigger data-testid="improvement-equipement-select">
                <SelectValue placeholder="Sélectionner un équipement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {equipments.map(eq => (
                  <SelectItem key={eq.id} value={eq.id}>{eq.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadingChildren && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Chargement des sous-équipements...
            </div>
          )}

          {!loadingChildren && formData.equipement_id && childEquipments.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="sous_equipement">Sous-équipement</Label>
              <Select
                value={formData.sous_equipement_id || "none"}
                onValueChange={(value) => setFormData({ ...formData, sous_equipement_id: value === "none" ? "" : value })}
              >
                <SelectTrigger data-testid="improvement-sous-equipement-select">
                  <SelectValue placeholder="Sélectionner un sous-équipement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {childEquipments.map(eq => (
                    <SelectItem key={eq.id} value={eq.id}>{eq.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
              dataTestId="improvement-assignee-selector"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="emplacement_id">
              Emplacement
              {formData.emplacement_id && formData.equipement_id && (
                <span className="text-xs text-green-600 ml-2 font-normal">(rempli automatiquement)</span>
              )}
            </Label>
            <Select value={formData.emplacement_id || "none"} onValueChange={(value) => setFormData({ ...formData, emplacement_id: value === "none" ? "" : value })}>
              <SelectTrigger data-testid="improvement-emplacement-select">
                <SelectValue placeholder="Sélectionner un emplacement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {locations.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateLimite">Date limite</Label>
              <Input
                id="dateLimite"
                type="date"
                value={formData.dateLimite}
                onChange={(e) => setFormData({ ...formData, dateLimite: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tempsEstime">Temps estimé (heures)</Label>
              <Input
                id="tempsEstime"
                type="number"
                step="0.5"
                value={formData.tempsEstime}
                onChange={(e) => setFormData({ ...formData, tempsEstime: e.target.value })}
              />
            </div>
          </div>

          {/* Section Étapes de réalisation */}
          <EtapesRealisationField
            value={etapes}
            onChange={setEtapes}
            equipmentId={formData.sous_equipement_id || formData.equipement_id || null}
          />

          {/* Section Fichiers joints */}
          <div className="space-y-2 pt-4 border-t">
            <Label>
              <Paperclip size={16} className="inline mr-1" />
              Joindre des fichiers
            </Label>
            
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
              >
                <Paperclip size={16} className="mr-2" />
                Parcourir
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={handleCameraCapture}
                className="flex-1"
              >
                <Camera size={16} className="mr-2" />
                Appareil photo
              </Button>
            </div>
            
            <p className="text-xs text-gray-500">
              Formats acceptés : images, vidéos, documents (max 25MB par fichier)
            </p>
            
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  {attachments.length} fichier(s) sélectionné(s) :
                </p>
                {attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <Paperclip size={14} className="text-gray-500" />
                      <span className="text-sm text-gray-700">{attachment.name}</span>
                      <span className="text-xs text-gray-500">
                        ({(attachment.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAttachment(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Supprimer
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              if (workOrder) {
                setShowStatusDialog(true);
                setIsClosing(true);
              } else {
                onOpenChange(false);
              }
            }}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? 'Enregistrement...' : workOrder ? 'Modifier' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <StatusChangeDialog
      open={showStatusDialog}
      onOpenChange={setShowStatusDialog}
      currentStatus={savedImprovementStatus || (workOrder ? workOrder.statut : 'OUVERT')}
      onStatusChange={handleStatusChange}
      onSkip={handleSkipStatusChange}
    />
    </>
  );
};

export default ImprovementFormDialog;