import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { Paperclip, Camera, X, Eye, Upload, RefreshCw } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { workOrdersAPI, equipmentsAPI, locationsAPI, usersAPI, workOrderTemplatesAPI } from '../../services/api';
import api from '../../services/api';
import AssigneeSelector from '../AssigneeSelector';
import StatusChangeDialog from './StatusChangeDialog';
import { validateDateNotPast } from '../../utils/dateValidation';
import { formatErrorMessage } from '../../utils/errorFormatter';

const WorkOrderFormDialog = ({ open, onOpenChange, workOrder, prefillData, onSuccess }) => {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [loading, setLoading] = useState(false);
  const [equipments, setEquipments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    statut: 'OUVERT',
    priorite: 'AUCUNE',
    categorie: '',
    equipement_id: '',
    sous_equipement_id: '',
    assigne_a_id: '',
    emplacement_id: '',
    dateLimite: '',
    tempsEstime: ''
  });
  const [templateId, setTemplateId] = useState(null); // Pour incrémenter le compteur
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [savedWorkOrderId, setSavedWorkOrderId] = useState(null);
  const [savedWorkOrderStatus, setSavedWorkOrderStatus] = useState(null);
  const [childEquipments, setChildEquipments] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  // Utiliser une ref au lieu d'un state pour une mise à jour synchrone
  const submitSuccessfulRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    if (open) {
      loadData();
      setIsClosing(false);
      setPreviewImage(null);
      submitSuccessfulRef.current = false; // Reset le flag à l'ouverture
      if (workOrder) {
        // Mode édition d'un OT existant
        // Déterminer si l'équipement est un parent ou un enfant
        const eqId = workOrder.equipement?.id || '';
        let parentId = eqId;
        let sousEqId = '';

        // Si l'équipement a un parent_id, c'est un sous-équipement
        if (workOrder.equipement?.parent_id) {
          parentId = workOrder.equipement.parent_id;
          sousEqId = eqId;
        }

        setFormData({
          titre: workOrder.titre || '',
          description: workOrder.description || '',
          statut: workOrder.statut || 'OUVERT',
          priorite: workOrder.priorite || 'AUCUNE',
          categorie: workOrder.categorie || '',
          equipement_id: parentId,
          sous_equipement_id: sousEqId,
          assigne_a_id: workOrder.assigneA?.id || workOrder.assigne_a_id || '',
          assigne_type: workOrder.assigne_type || null,
          assigne_service: workOrder.assigne_service || null,
          emplacement_id: workOrder.emplacement?.id || '',
          dateLimite: workOrder.dateLimite?.split('T')[0] || '',
          tempsEstime: workOrder.tempsEstime || ''
        });
        setSavedWorkOrderId(workOrder.id);
        setSavedWorkOrderStatus(workOrder.statut);
        setTemplateId(null);

        // Load existing attachments with previews
        if (workOrder.attachments && workOrder.attachments.length > 0) {
          setAttachments([]); // Reset avant chargement async
          const loadExisting = async () => {
            const loaded = [];
            for (const att of workOrder.attachments) {
              if (cancelled) return;
              const item = {
                name: att.original_filename || att.filename || att.nom || 'fichier',
                size: att.size || att.taille || 0,
                isExisting: true,
                id: att.id || String(att._id || ''),
                mime_type: att.mime_type || att.type,
                preview: null
              };
              if (item.mime_type?.startsWith('image/')) {
                try {
                  const res = await workOrdersAPI.downloadAttachment(workOrder.id, item.id);
                  if (!cancelled) {
                    const blob = new Blob([res.data], { type: item.mime_type });
                    item.preview = URL.createObjectURL(blob);
                  }
                } catch (err) {
                  console.warn('Preview load failed:', att.filename || att.nom);
                }
              }
              loaded.push(item);
            }
            if (!cancelled) {
              setAttachments(loaded);
            }
          };
          loadExisting();
        } else {
          setAttachments([]);
        }
      } else if (prefillData) {
        // Mode création avec données pré-remplies (depuis un template)
        const today = new Date().toISOString().split('T')[0];
        // Convertir le temps estimé du template en format numérique
        let tempsEstime = '0.5'; // Défaut 30 min
        if (prefillData.temps_estime) {
          // Tenter de parser le format "2h", "2h30", "30min", etc.
          const tempsStr = prefillData.temps_estime.toLowerCase().trim();
          const hoursMatch = tempsStr.match(/(\d+(?:\.\d+)?)\s*h/);
          const minsMatch = tempsStr.match(/(\d+)\s*(?:min|m)/);
          let hours = 0;
          if (hoursMatch) hours += parseFloat(hoursMatch[1]);
          if (minsMatch) hours += parseInt(minsMatch[1]) / 60;
          if (hours > 0) tempsEstime = hours.toString();
        }
        setFormData({
          titre: prefillData.titre || '',
          description: prefillData.description || '',
          statut: prefillData.statut || 'OUVERT',
          priorite: prefillData.priorite || 'AUCUNE',
          categorie: prefillData.categorie || '',
          equipement_id: prefillData.equipement_id || '',
          sous_equipement_id: '',
          assigne_a_id: '',
          emplacement_id: '', // Sera auto-rempli par le useEffect si équipement présent
          dateLimite: today,
          tempsEstime: tempsEstime
        });
        setAttachments([]);
        setSavedWorkOrderId(null);
        setSavedWorkOrderStatus(null);
        setTemplateId(prefillData.template_id || null);
      } else {
        // Mode création vide - avec date du jour et temps estimé par défaut (0.5h = 30 min)
        const today = new Date().toISOString().split('T')[0];
        setFormData({
          titre: '',
          description: '',
          statut: 'OUVERT',
          priorite: 'AUCUNE',
          categorie: '',
          equipement_id: '',
          sous_equipement_id: '',
          assigne_a_id: '',
          emplacement_id: '',
          dateLimite: today,
          tempsEstime: '0.5'
        });
        setAttachments([]);
        setSavedWorkOrderId(null);
        setSavedWorkOrderStatus(null);
        setTemplateId(null);
      }
    } else {
      // Cleanup : révoquer les blob URLs et réinitialiser
      attachments.forEach(att => {
        if (att?.preview) URL.revokeObjectURL(att.preview);
      });
      setAttachments([]);
      setPreviewImage(null);
    }

    return () => { cancelled = true; };
  }, [open, workOrder, prefillData]);

  // Auto-remplir l'emplacement et charger les sous-équipements
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

  const loadChildren = async (parentId) => {
    setLoadingChildren(true);
    try {
      const response = await equipmentsAPI.getChildren(parentId);
      setChildEquipments(response.data || []);
    } catch (error) {
      console.error('Erreur chargement sous-equipements:', error);
      setChildEquipments([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  const parentEquipments = equipments.filter(eq => !eq.parent_id && eq.nom);

  const loadData = async () => {
    try {
      const [equipRes, locRes, userRes] = await Promise.all([
        equipmentsAPI.getParents(),
        locationsAPI.getAll(),
        usersAPI.getActive()      ]);
      setEquipments(equipRes.data);
      setLocations(locRes.data);
      setUsers(userRes.data); // Tous les membres, quel que soit leur rôle
    } catch (error) {
      console.error('Erreur de chargement:', error);
    }
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    const newAttachments = files.map(file => ({
      file,
      name: file.name,
      size: file.size,
      isExisting: false,
      mime_type: file.type,
      preview: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
    event.target.value = '';
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    const newAttachments = files.map(file => ({
      file,
      name: file.name,
      size: file.size,
      isExisting: false,
      mime_type: file.type,
      preview: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleCameraCapture = () => {
    // Déclencher l'input file avec capture="environment" pour ouvrir la caméra
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const handleRemoveAttachment = (index) => {
    const att = attachments[index];
    if (att?.preview) URL.revokeObjectURL(att.preview);
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleDialogClose = (isOpen) => {
    if (!isOpen && !isClosing && !loading) {
      // Si on vient d'une soumission réussie (création), fermer directement sans dialogue
      if (submitSuccessfulRef.current) {
        submitSuccessfulRef.current = false;
        return; // Ne rien faire, le parent a déjà été notifié
      }
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
    if (savedWorkOrderId) {
      try {
        await workOrdersAPI.update(savedWorkOrderId, { statut: newStatus });
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
    
    // Validation de la date limite (pas dans le passé sauf pour admin)
    if (formData.dateLimite) {
      const dateValidation = validateDateNotPast(formData.dateLimite, user);
      if (!dateValidation.valid) {
        toast({
          title: 'Erreur',
          description: dateValidation.message,
          variant: 'destructive'
        });
        return;
      }
    }
    
    setLoading(true);

    try {
      const actualEquipementId = formData.sous_equipement_id || formData.equipement_id || null;
      const submitData = {
        ...formData,
        tempsEstime: formData.tempsEstime ? parseFloat(formData.tempsEstime) : null,
        dateLimite: formData.dateLimite ? new Date(formData.dateLimite).toISOString() : null,
        equipement_id: actualEquipementId,
        assigne_a_id: formData.assigne_a_id || null,
        emplacement_id: formData.emplacement_id || null
      };
      delete submitData.sous_equipement_id;

      if (workOrder) {
        await workOrdersAPI.update(workOrder.id, submitData);
        
        // Upload des NOUVEAUX fichiers uniquement (pas les existants)
        const newAttachments = attachments.filter(a => !a.isExisting && a.file);
        if (newAttachments.length > 0) {
          for (const attachment of newAttachments) {
            try {
              await workOrdersAPI.uploadAttachment(workOrder.id, attachment.file);
            } catch (err) {
              console.error('Erreur upload fichier:', err);
            }
          }
        }
        
        toast({
          title: 'Succès',
          description: 'Ordre de travail modifié avec succès'
        });
        
        // Émettre un événement pour rafraîchir les notifications instantanément
        window.dispatchEvent(new Event('workOrderUpdated'));
        
        // Mettre à jour le statut pour le dialog de changement
        setSavedWorkOrderId(workOrder.id);
        setSavedWorkOrderStatus(submitData.statut);
      } else {
        const response = await workOrdersAPI.create(submitData);
        const newWorkOrderId = response.data.id;
        
        // Incrémenter le compteur d'utilisation du template si utilisé
        if (templateId) {
          try {
            await workOrderTemplatesAPI.incrementUsage(templateId);
          } catch (err) {
            console.error('Erreur incrémentation compteur template:', err);
          }
        }
        
        // Upload des fichiers si présents
        if (attachments.length > 0) {
          for (const attachment of attachments) {
            try {
              await workOrdersAPI.uploadAttachment(newWorkOrderId, attachment.file);
            } catch (err) {
              console.error('Erreur upload fichier:', err);
            }
          }
        }
        
        toast({
          title: 'Succès',
          description: 'Ordre de travail créé avec succès'
        });
        
        // Émettre un événement pour rafraîchir les notifications instantanément
        window.dispatchEvent(new Event('workOrderCreated'));
        
        // Marquer comme création réussie AVANT d'appeler onOpenChange (ref = synchrone)
        submitSuccessfulRef.current = true;
      }

      // Attendre que le rafraîchissement soit terminé avant de fermer
      // onSuccess peut être async (refreshWorkOrders)
      await onSuccess();
      
      // Afficher le dialog de changement de statut uniquement pour la modification d'un OT existant
      if (workOrder) {
        setShowStatusDialog(true);
      } else {
        // Pour une création, le flag submitSuccessfulRef est déjà true
        // handleDialogClose ignorera la logique du dialogue de statut
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Erreur création/modification ordre de travail:', error);
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Une erreur est survenue lors de l\'enregistrement'),
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
          <DialogTitle>{workOrder ? 'Modifier' : 'Nouvel'} ordre de travail</DialogTitle>
          <DialogDescription>
            Remplissez les informations de l'ordre de travail
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" data-testid="work-order-form">
          <div className="space-y-2">
            <Label htmlFor="titre">Titre *</Label>
            <Input
              id="titre"
              data-testid="input-titre-ot"
              value={formData.titre}
              onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
              required
              placeholder="Entrez le titre de l'ordre de travail"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              data-testid="input-description-ot"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              required
              placeholder="Décrivez l'intervention à réaliser"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="statut">Statut</Label>
              <Select value={formData.statut} onValueChange={(value) => setFormData({ ...formData, statut: value })}>
                <SelectTrigger data-testid="select-statut-ot">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUVERT">Ouvert</SelectItem>
                  <SelectItem value="EN_COURS">En cours</SelectItem>
                  <SelectItem value="ATT_MATERIEL">Att Materiel</SelectItem>
                  <SelectItem value="ATT_DECISION">Att Decision</SelectItem>
                  <SelectItem value="TERMINE">Terminé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priorite">Priorité</Label>
              <Select value={formData.priorite} onValueChange={(value) => setFormData({ ...formData, priorite: value })}>
                <SelectTrigger data-testid="select-priorite-ot">
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
            <Label htmlFor="categorie">Catégorie</Label>
            <Select value={formData.categorie} onValueChange={(value) => setFormData({ ...formData, categorie: value })}>
              <SelectTrigger data-testid="select-categorie-ot">
                <SelectValue placeholder="Sélectionner une catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CHANGEMENT_FORMAT">Changement de Format</SelectItem>
                <SelectItem value="TRAVAUX_PREVENTIFS">Travaux Préventifs</SelectItem>
                <SelectItem value="TRAVAUX_CURATIF">Travaux Curatif</SelectItem>
                <SelectItem value="TRAVAUX_DIVERS">Travaux Divers</SelectItem>
                <SelectItem value="FORMATION">Formation</SelectItem>
                <SelectItem value="REGLAGE">Réglage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="equipement_id">Equipement</Label>
            <Select
              value={formData.equipement_id || "none"}
              onValueChange={(value) => setFormData({ ...formData, equipement_id: value === "none" ? "" : value, sous_equipement_id: '' })}
            >
              <SelectTrigger data-testid="wo-equipement-select">
                <SelectValue placeholder="Selectionner un equipement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {parentEquipments.map(eq => (
                  <SelectItem key={eq.id} value={eq.id}>{eq.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.equipement_id && childEquipments.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="sous_equipement">Sous-equipement</Label>
              <Select
                value={formData.sous_equipement_id || "none"}
                onValueChange={(value) => setFormData({ ...formData, sous_equipement_id: value === "none" ? "" : value })}
              >
                <SelectTrigger data-testid="wo-sous-equipement-select">
                  <SelectValue placeholder="Selectionner un sous-equipement" />
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

          {loadingChildren && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Chargement des sous-equipements...
            </div>
          )}

          <div className="space-y-2">
            <AssigneeSelector
              value={formData.assigne_type === 'service' && formData.assigne_service 
                ? `service:${formData.assigne_service}` 
                : (formData.assigne_a_id || '')}
              onChange={(val, type, serviceName) => setFormData({
                ...formData,
                assigne_a_id: val === '' ? '' : (type === 'service' ? '' : val),
                assigne_type: type,
                assigne_service: serviceName
              })}
              dataTestId="wo-assignee-selector"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="emplacement_id">Emplacement</Label>
            <Select value={formData.emplacement_id} onValueChange={(value) => setFormData({ ...formData, emplacement_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un emplacement" />
              </SelectTrigger>
              <SelectContent>
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

          {/* Section Fichiers joints */}
          <div className="space-y-2 pt-4 border-t">
            <Label>
              <Paperclip size={16} className="inline mr-1" />
              Joindre des fichiers
            </Label>
            
            {/* Zone de drag & drop */}
            <div
              data-testid="wo-drop-zone"
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`relative rounded-lg border-2 border-dashed transition-colors duration-200 ${
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
            >
              {isDragging && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-blue-50/90">
                  <Upload size={32} className="text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-blue-600">Deposez vos fichiers ici</p>
                </div>
              )}
              <div className="p-3 space-y-2">
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
                
                <p className="text-xs text-gray-500 text-center">
                  Glissez-deposez vos fichiers ici ou utilisez les boutons ci-dessus (max 25MB)
                </p>
              </div>
            </div>
            
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  {attachments.length} fichier(s) :
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {attachments.map((attachment, index) => (
                    <div key={index} className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                      {attachment.preview ? (
                        <div className="aspect-square relative">
                          <img
                            src={attachment.preview}
                            alt={attachment.name}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewImage(attachment.preview)}
                            className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center"
                          >
                            <Eye size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                          </button>
                        </div>
                      ) : (
                        <div className="aspect-square flex items-center justify-center">
                          <Paperclip size={24} className="text-gray-400" />
                        </div>
                      )}
                      <div className="p-1.5 flex items-center justify-between gap-1">
                        <span className="text-xs text-gray-600 truncate flex-1">{attachment.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAttachment(index)}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                      {attachment.isExisting && (
                        <div className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                          Existant
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700" data-testid="btn-submit-ot">
              {loading ? 'Enregistrement...' : workOrder ? 'Modifier' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <StatusChangeDialog
      open={showStatusDialog}
      onOpenChange={setShowStatusDialog}
      currentStatus={savedWorkOrderStatus || (workOrder ? workOrder.statut : 'OUVERT')}
      onStatusChange={handleStatusChange}
      onSkip={handleSkipStatusChange}
    />

    {/* Lightbox preview plein écran */}
    {previewImage && createPortal(
      <div
        className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
        style={{ zIndex: 99999, pointerEvents: 'auto', touchAction: 'auto' }}
        onClick={(e) => { if (e.target === e.currentTarget) setPreviewImage(null); }}
        onTouchEnd={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); setPreviewImage(null); } }}
      >
        <button
          className="absolute top-4 right-4 p-3 bg-white/20 rounded-full hover:bg-white/40 transition-colors"
          style={{ zIndex: 100000, pointerEvents: 'auto', touchAction: 'manipulation' }}
          onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}
          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewImage(null); }}
        >
          <X size={24} className="text-white" />
        </button>
        <img
          src={previewImage}
          alt="Preview"
          className="max-w-full max-h-full object-contain rounded-lg"
          onClick={e => e.stopPropagation()}
        />
      </div>,
      document.body
    )}
    </>
  );
};

export default WorkOrderFormDialog;