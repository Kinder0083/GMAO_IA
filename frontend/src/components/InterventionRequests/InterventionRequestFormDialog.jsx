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
import { useToast } from '../../hooks/use-toast';
import { interventionRequestsAPI, equipmentsAPI, locationsAPI } from '../../services/api';
import api from '../../services/api';
import { validateDateNotPast } from '../../utils/dateValidation';
import { formatErrorMessage } from '../../utils/errorFormatter';
import { Paperclip, Camera, Loader2 } from 'lucide-react';

const InterventionRequestFormDialog = ({ open, onOpenChange, request, onSuccess }) => {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [loading, setLoading] = useState(false);
  const [equipments, setEquipments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [childEquipments, setChildEquipments] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    priorite: 'AUCUNE',
    equipement_id: '',
    sous_equipement_id: '',
    emplacement_id: '',
    date_limite_desiree: ''
  });

  useEffect(() => {
    if (open) {
      loadData();
      if (request) {
        setFormData({
          titre: request.titre || '',
          description: request.description || '',
          priorite: request.priorite || 'AUCUNE',
          equipement_id: request.equipement?.id || '',
          sous_equipement_id: '',
          emplacement_id: request.emplacement?.id || '',
          date_limite_desiree: request.date_limite_desiree?.split('T')[0] || ''
        });
      } else {
        setFormData({
          titre: '',
          description: '',
          priorite: 'AUCUNE',
          equipement_id: '',
          sous_equipement_id: '',
          emplacement_id: '',
          date_limite_desiree: ''
        });
        setAttachments([]);
      }
      setChildEquipments([]);
    } else {
      setAttachments([]);
    }
  }, [open, request]);

  // When parent equipment is selected, load children and auto-fill emplacement
  useEffect(() => {
    if (formData.equipement_id && equipments.length > 0) {
      const parentEq = equipments.find(eq => eq.id === formData.equipement_id);
      if (parentEq) {
        if (parentEq.emplacement_id && formData.emplacement_id !== parentEq.emplacement_id) {
          setFormData(prev => ({ ...prev, emplacement_id: parentEq.emplacement_id }));
        }
        if (parentEq.hasChildren) {
          loadChildren(parentEq.id);
        } else {
          setChildEquipments([]);
        }
      }
    } else if (!formData.equipement_id) {
      setChildEquipments([]);
    }
  }, [formData.equipement_id, equipments]);

  const loadData = async () => {
    try {
      const [eqRes, locRes] = await Promise.all([
        equipmentsAPI.getAll(),
        locationsAPI.getAll()
      ]);
      setEquipments(eqRes.data);
      setLocations(locRes.data);
    } catch (error) {
      console.error('Erreur chargement donnees:', error);
    }
  };

  const loadChildren = async (parentId) => {
    setLoadingChildren(true);
    try {
      const response = await api.get(`/equipments/${parentId}/children`);
      setChildEquipments(response.data || []);
    } catch (error) {
      console.error('Erreur chargement sous-equipements:', error);
      setChildEquipments([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  // Get only parent equipments (no parent_id)
  const parentEquipments = equipments.filter(eq => !eq.parent_id);

  // File handlers - identical to WorkOrderFormDialog
  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    const maxSize = 25 * 1024 * 1024;
    const validFiles = files.filter(f => {
      if (f.size > maxSize) {
        toast({ title: 'Fichier trop volumineux', description: `${f.name} depasse 25MB`, variant: 'destructive' });
        return false;
      }
      return true;
    });
    const newAttachments = validFiles.map(file => ({
      file,
      name: file.name,
      size: file.size
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
    event.target.value = '';
  };

  const handleCameraCapture = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const handleRemoveAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (requestId) => {
    for (const item of attachments) {
      try {
        const fd = new FormData();
        fd.append('file', item.file);
        await api.post(`/intervention-requests/${requestId}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } catch (error) {
        console.error('Erreur upload fichier:', error);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.date_limite_desiree) {
      const dateValidation = validateDateNotPast(formData.date_limite_desiree, user);
      if (!dateValidation.valid) {
        toast({ title: 'Erreur', description: dateValidation.message, variant: 'destructive' });
        return;
      }
    }
    
    setLoading(true);

    try {
      const actualEquipementId = formData.sous_equipement_id || formData.equipement_id || null;

      const submitData = {
        titre: formData.titre,
        description: formData.description,
        priorite: formData.priorite,
        equipement_id: actualEquipementId,
        emplacement_id: formData.emplacement_id || null,
        date_limite_desiree: formData.date_limite_desiree ? new Date(formData.date_limite_desiree).toISOString() : null
      };

      let resultId = null;

      if (request) {
        await interventionRequestsAPI.update(request.id, submitData);
        resultId = request.id;
        if (attachments.length > 0) {
          await uploadFiles(request.id);
        }
        toast({ title: 'Succes', description: 'Demande modifiee avec succes' });
      } else {
        const response = await interventionRequestsAPI.create(submitData);
        resultId = response?.data?.id;
        if (attachments.length > 0 && resultId) {
          await uploadFiles(resultId);
        }
        toast({ title: 'Succes', description: 'Demande transmise avec succes' });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="intervention-form-title">
            {request ? 'Modifier' : 'Nouvelle'} demande d'intervention
          </DialogTitle>
          <DialogDescription>
            Remplissez les informations de la demande
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titre">Titre *</Label>
            <Input
              id="titre"
              data-testid="intervention-titre-input"
              value={formData.titre}
              onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
              placeholder="Titre de la demande"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              data-testid="intervention-description-input"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Decrivez la demande..."
              rows={4}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priorite">Priorite</Label>
              <Select value={formData.priorite} onValueChange={(value) => setFormData({ ...formData, priorite: value })}>
                <SelectTrigger id="priorite" data-testid="intervention-priorite-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUCUNE">Normale</SelectItem>
                  <SelectItem value="BASSE">Basse</SelectItem>
                  <SelectItem value="MOYENNE">Moyenne</SelectItem>
                  <SelectItem value="HAUTE">Haute</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date_limite_desiree">Date Limite Desiree</Label>
              <Input
                id="date_limite_desiree"
                data-testid="intervention-date-input"
                type="date"
                value={formData.date_limite_desiree}
                onChange={(e) => setFormData({ ...formData, date_limite_desiree: e.target.value })}
              />
            </div>

            {/* Equipement parent */}
            <div className="space-y-2">
              <Label htmlFor="equipement">Equipement</Label>
              <Select
                value={formData.equipement_id || "none"}
                onValueChange={(value) => setFormData({ ...formData, equipement_id: value === "none" ? "" : value, sous_equipement_id: '' })}
              >
                <SelectTrigger id="equipement" data-testid="intervention-equipement-select">
                  <SelectValue placeholder="Selectionner un equipement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {parentEquipments.map(eq => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sous-equipement */}
            {formData.equipement_id && childEquipments.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="sous_equipement">Sous-equipement</Label>
                <Select
                  value={formData.sous_equipement_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, sous_equipement_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger id="sous_equipement" data-testid="intervention-sous-equipement-select">
                    <SelectValue placeholder="Selectionner un sous-equipement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {childEquipments.map(eq => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {loadingChildren && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des sous-equipements...
              </div>
            )}
          </div>

          {/* Emplacement auto-rempli (lecture seule si rempli) */}
          {formData.emplacement_id && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Emplacement (auto)</p>
              <p className="text-sm font-medium text-gray-700" data-testid="intervention-emplacement-auto">
                {locations.find(l => l.id === formData.emplacement_id)?.nom || formData.emplacement_id}
              </p>
            </div>
          )}

          {/* Section Fichiers joints - identique aux OT */}
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
                data-testid="browse-files-btn"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
              >
                <Paperclip size={16} className="mr-2" />
                Parcourir
              </Button>
              
              <Button
                type="button"
                variant="outline"
                data-testid="open-camera-btn"
                onClick={handleCameraCapture}
                className="flex-1"
              >
                <Camera size={16} className="mr-2" />
                Appareil photo
              </Button>
            </div>
            
            <p className="text-xs text-gray-500">
              Formats acceptes : images, videos, documents (max 25MB par fichier)
            </p>
            
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2" data-testid="files-list">
                <p className="text-sm font-medium text-gray-700">
                  {attachments.length} fichier(s) selectionne(s) :
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
                      data-testid={`remove-file-${index}`}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700" data-testid="intervention-submit-btn">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {attachments.length > 0 ? 'Envoi en cours...' : 'Transmission...'}
                </>
              ) : (
                request ? 'Modifier' : 'Transmettre'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InterventionRequestFormDialog;
