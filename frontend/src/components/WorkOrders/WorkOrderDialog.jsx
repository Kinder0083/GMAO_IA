import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Calendar, Clock, User, MapPin, Wrench, FileText, MessageSquare, Send, Plus, Package, X } from 'lucide-react';
import AttachmentsList from './AttachmentsList';
import AttachmentUploader from './AttachmentUploader';
import StatusChangeDialog from './StatusChangeDialog';
import AIDiagnosticPanel from './AIDiagnosticPanel';
import AISummaryPanel from './AISummaryPanel';
import { commentsAPI, workOrdersAPI, inventoryAPI, equipmentsAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { usePermissions } from '../../hooks/usePermissions';
import { formatTimeToHoursMinutes } from '../../utils/timeFormat';

const WorkOrderDialog = ({ open, onOpenChange, workOrder, onSuccess }) => {
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const [refreshAttachments, setRefreshAttachments] = useState(0);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [timeInput, setTimeInput] = useState(''); // Nouveau champ unique pour le temps
  const [addingTime, setAddingTime] = useState(false);
  const [validating, setValidating] = useState(false);
  
  // États pour les pièces utilisées
  const [partsUsed, setPartsUsed] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [equipmentsList, setEquipmentsList] = useState([]);

  // Fonction pour parser le temps saisi dans différents formats
  const parseTimeInput = (input) => {
    if (!input || input.trim() === '') return null;
    
    const trimmed = input.trim();
    
    // Format décimal: 1.5 ou 1,5 -> 1h30
    if (/^[\d]+[.,][\d]+$/.test(trimmed)) {
      const decimal = parseFloat(trimmed.replace(',', '.'));
      const hours = Math.floor(decimal);
      const minutes = Math.round((decimal - hours) * 60);
      return { hours, minutes };
    }
    
    // Format HH:MM ou H:MM: 01:30 ou 1:30
    if (/^[\d]{1,2}:[\d]{1,2}$/.test(trimmed)) {
      const [hours, minutes] = trimmed.split(':').map(Number);
      if (minutes >= 0 && minutes < 60) {
        return { hours, minutes };
      }
    }
    
    // Format XhYY ou XhY: 1h30 ou 1h5
    if (/^[\d]{1,3}h[\d]{0,2}$/i.test(trimmed)) {
      const match = trimmed.match(/^([\d]{1,3})h([\d]{0,2})$/i);
      if (match) {
        const hours = parseInt(match[1]) || 0;
        const minutes = match[2] ? parseInt(match[2]) : 0;
        if (minutes >= 0 && minutes < 60) {
          return { hours, minutes };
        }
      }
    }
    
    // Format heures seules: 2 -> 2h00
    if (/^[\d]+$/.test(trimmed)) {
      const hours = parseInt(trimmed);
      return { hours, minutes: 0 };
    }
    
    return null;
  };

  const loadComments = async () => {
    if (!workOrder) return;
    try {
      setLoadingComments(true);
      const response = await commentsAPI.getWorkOrderComments(workOrder.id);
      setComments(response.comments || []);
    } catch (error) {
      console.error('Erreur lors du chargement des commentaires:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim() || !workOrder) return;
    
    try {
      setSendingComment(true);
      
      // Filtrer pour ne garder que les pièces valides
      const validParts = partsUsed.filter(part => 
        part.inventory_item_id || (part.custom_part_name && part.custom_part_name.trim() !== '')
      );
      
      const cleanedParts = validParts.map(part => {
        const cleanPart = {
          inventory_item_id: part.inventory_item_id || null,
          inventory_item_name: part.inventory_item_name || null,
          custom_part_name: part.custom_part_name || null,
          quantity: part.quantity || 0
        };
        
        // N'ajouter les champs "Prélevé Sur" que s'ils sont remplis
        if (part.source_equipment_id || (part.custom_source && part.custom_source.trim() !== '')) {
          cleanPart.source_equipment_id = part.source_equipment_id || null;
          cleanPart.source_equipment_name = part.source_equipment_name || null;
          cleanPart.custom_source = part.custom_source || null;
        }
        
        return cleanPart;
      });
      
      // Envoyer commentaire avec les pièces utilisées valides
      await commentsAPI.addWorkOrderComment(workOrder.id, {
        text: newComment,
        parts_used: cleanedParts
      });
      setNewComment('');
      setPartsUsed([]); // Réinitialiser les pièces
      await loadComments();
      
      toast({
        title: 'Succès',
        description: 'Commentaire ajouté avec succès'
      });
    } catch (error) {
      console.error('Erreur lors de l\'ajout du commentaire:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'ajout du commentaire',
        variant: 'destructive'
      });
    } finally {
      setSendingComment(false);
    }
  };

  const addPartUsed = () => {
    setPartsUsed([...partsUsed, {
      id: Date.now().toString(),
      inventory_item_id: null,
      inventory_item_name: null,
      custom_part_name: '',
      quantity: 1,
      source_equipment_id: null,
      source_equipment_name: null,
      custom_source: ''
    }]);
  };

  const removePartUsed = (id) => {
    setPartsUsed(partsUsed.filter(p => p.id !== id));
  };

  const updatePartUsed = (id, field, value) => {
    setPartsUsed(partsUsed.map(part => 
      part.id === id ? { ...part, [field]: value } : part
    ));
  };

  const handleAddTime = async () => {
    const parsed = parseTimeInput(timeInput);

    if (!parsed || (parsed.hours === 0 && parsed.minutes === 0)) {
      toast({
        title: 'Erreur',
        description: 'Veuillez saisir un temps valide (ex: 1:30, 1h30, 1.5)',
        variant: 'destructive'
      });
      return false;
    }

    try {
      setAddingTime(true);
      await workOrdersAPI.addTimeSpent(workOrder.id, parsed.hours, parsed.minutes);
      
      toast({
        title: 'Temps ajouté',
        description: `${parsed.hours}h${parsed.minutes.toString().padStart(2, '0')}min ajouté avec succès`
      });

      setTimeInput('');
      return true;
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'ajouter le temps',
        variant: 'destructive'
      });
      return false;
    } finally {
      setAddingTime(false);
    }
  };

  // Nouvelle fonction pour valider commentaire + temps + ouvrir dialogue statut
  const handleValidate = async () => {
    // Vérifier que le commentaire est rempli
    if (!newComment.trim()) {
      toast({
        title: 'Commentaire requis',
        description: 'Veuillez saisir un commentaire avant de valider',
        variant: 'destructive'
      });
      return;
    }

    // Vérifier que le temps est rempli et valide
    const parsed = parseTimeInput(timeInput);
    if (!parsed || (parsed.hours === 0 && parsed.minutes === 0)) {
      toast({
        title: 'Temps requis',
        description: 'Veuillez saisir un temps valide (ex: 1:30, 1h30, 1.5)',
        variant: 'destructive'
      });
      return;
    }

    try {
      setValidating(true);

      // 1. Enregistrer le commentaire (avec les pièces si présentes)
      const validParts = partsUsed.filter(part => 
        part.inventory_item_id || (part.custom_part_name && part.custom_part_name.trim() !== '')
      );
      
      const cleanedParts = validParts.map(part => {
        const cleanPart = {
          inventory_item_id: part.inventory_item_id || null,
          inventory_item_name: part.inventory_item_name || null,
          custom_part_name: part.custom_part_name || null,
          quantity: part.quantity || 0
        };
        
        if (part.source_equipment_id || (part.custom_source && part.custom_source.trim() !== '')) {
          cleanPart.source_equipment_id = part.source_equipment_id || null;
          cleanPart.source_equipment_name = part.source_equipment_name || null;
          cleanPart.custom_source = part.custom_source || null;
        }
        
        return cleanPart;
      });

      await commentsAPI.addWorkOrderComment(workOrder.id, {
        text: newComment,
        parts_used: cleanedParts
      });

      // 2. Enregistrer le temps passé
      await workOrdersAPI.addTimeSpent(workOrder.id, parsed.hours, parsed.minutes);

      // 3. Rafraîchir les données
      if (onSuccess) onSuccess();

      // 4. Réinitialiser les champs
      setNewComment('');
      setTimeInput('');
      setPartsUsed([]);

      toast({
        title: 'Validation réussie',
        description: `Commentaire et temps (${parsed.hours}h${parsed.minutes.toString().padStart(2, '0')}) enregistrés`
      });

      // 5. Ouvrir le dialogue de changement de statut seulement si l'utilisateur a le droit d'édition
      if (canEdit('workOrders')) {
        setShowStatusDialog(true);
      } else {
        onOpenChange(false);
      }

    } catch (error) {
      console.error('Erreur lors de la validation:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la validation',
        variant: 'destructive'
      });
    } finally {
      setValidating(false);
    }
  };

  // Fonction pour annuler et fermer la fenêtre
  const handleCancel = () => {
    setNewComment('');
    setTimeInput('');
    setPartsUsed([]);
    onOpenChange(false);
  };

  const handleUploadComplete = () => {
    setRefreshAttachments(prev => prev + 1);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return formatter.format(date);
  };

  const formatCreationDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  const loadInventoryAndEquipments = async () => {
    try {
      const [inventoryResponse, equipmentsResponse] = await Promise.all([
        inventoryAPI.getAll(),
        equipmentsAPI.getAll()
      ]);
      setInventoryItems(inventoryResponse.data || []);
      setEquipmentsList(equipmentsResponse.data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    }
  };

  useEffect(() => {
    if (open && workOrder) {
      loadComments();
      loadInventoryAndEquipments();
      setIsClosing(false);
    }
  }, [open, workOrder]);

  const handleDialogClose = (isOpen) => {
    if (!isOpen && !isClosing) {
      // L'utilisateur veut fermer le dialog, montrer le dialog de changement de statut
      setShowStatusDialog(true);
      setIsClosing(true);
    }
  };

  const handleStatusChange = async (newStatus, hours = 0, minutes = 0) => {
    try {
      // Soumettre les pièces utilisées si présentes (AVANT le changement de statut)
      if (partsUsed.length > 0) {
        // Filtrer pour ne garder que les pièces qui ont une sélection ou un nom personnalisé
        const validParts = partsUsed.filter(part => 
          part.inventory_item_id || (part.custom_part_name && part.custom_part_name.trim() !== '')
        );
        
        if (validParts.length > 0) {
          // Nettoyer les données avant envoi
          const cleanedParts = validParts.map(part => {
            const cleanPart = {
              inventory_item_id: part.inventory_item_id || null,
              inventory_item_name: part.inventory_item_name || null,
              custom_part_name: part.custom_part_name || null,
              quantity: part.quantity || 0
            };
            
            // N'ajouter les champs "Prélevé Sur" que s'ils sont remplis
            if (part.source_equipment_id || (part.custom_source && part.custom_source.trim() !== '')) {
              cleanPart.source_equipment_id = part.source_equipment_id || null;
              cleanPart.source_equipment_name = part.source_equipment_name || null;
              cleanPart.custom_source = part.custom_source || null;
            }
            
            return cleanPart;
          });
          
          console.log('Envoi des pièces:', cleanedParts); // Debug
          
          // Enregistrer les pièces SANS créer de commentaire
          await workOrdersAPI.addWorkOrderParts(workOrder.id, cleanedParts);
          
          // Déclencher l'événement pour mettre à jour le badge inventaire dans le header
          window.dispatchEvent(new Event('inventoryItemUpdated'));
          
          toast({
            title: 'Pièces enregistrées',
            description: `${cleanedParts.length} pièce(s) utilisée(s) enregistrée(s)`
          });
        }
        setPartsUsed([]); // Réinitialiser
      }

      // Ajouter le temps si renseigné
      if (hours > 0 || minutes > 0) {
        await workOrdersAPI.addTimeSpent(workOrder.id, hours, minutes);
      }

      // Mettre à jour le statut
      await workOrdersAPI.update(workOrder.id, { statut: newStatus });
      
      toast({
        title: 'Succès',
        description: 'Le statut a été mis à jour'
      });
      setShowStatusDialog(false);
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le statut',
        variant: 'destructive'
      });
    }
  };

  const handleSkipStatusChange = async () => {
    try {
      // Soumettre les pièces utilisées si présentes (même si on skip le changement de statut)
      if (partsUsed.length > 0) {
        // Filtrer pour ne garder que les pièces valides
        const validParts = partsUsed.filter(part => 
          part.inventory_item_id || (part.custom_part_name && part.custom_part_name.trim() !== '')
        );
        
        if (validParts.length > 0) {
          const cleanedParts = validParts.map(part => {
            const cleanPart = {
              inventory_item_id: part.inventory_item_id || null,
              inventory_item_name: part.inventory_item_name || null,
              custom_part_name: part.custom_part_name || null,
              quantity: part.quantity || 0
            };
            
            // N'ajouter les champs "Prélevé Sur" que s'ils sont remplis
            if (part.source_equipment_id || (part.custom_source && part.custom_source.trim() !== '')) {
              cleanPart.source_equipment_id = part.source_equipment_id || null;
              cleanPart.source_equipment_name = part.source_equipment_name || null;
              cleanPart.custom_source = part.custom_source || null;
            }
            
            return cleanPart;
          });
          
          // Enregistrer les pièces SANS créer de commentaire
          await workOrdersAPI.addWorkOrderParts(workOrder.id, cleanedParts);
          toast({
            title: 'Pièces enregistrées',
            description: `${cleanedParts.length} pièce(s) utilisée(s) enregistrée(s)`
          });
          if (onSuccess) onSuccess(); // Rafraîchir les données
        }
        setPartsUsed([]); // Réinitialiser
      }
      
      setShowStatusDialog(false);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'enregistrer les pièces',
        variant: 'destructive'
      });
    }
  };

  if (!workOrder) return null;

  const getStatusBadge = (statut) => {
    const badges = {
      'OUVERT': { variant: 'secondary', label: 'Ouvert' },
      'EN_COURS': { variant: 'default', label: 'En cours' },
      'EN_ATTENTE': { variant: 'outline', label: 'En attente' },
      'TERMINE': { variant: 'success', label: 'Terminé' }
    };
    const badge = badges[statut] || badges['OUVERT'];
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  const getPriorityBadge = (priorite) => {
    const badges = {
      'HAUTE': { variant: 'destructive', label: 'Haute' },
      'MOYENNE': { variant: 'default', label: 'Moyenne' },
      'BASSE': { variant: 'secondary', label: 'Basse' },
      'AUCUNE': { variant: 'outline', label: 'Normale' }
    };
    const badge = badges[priorite] || badges['AUCUNE'];
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  const getCategoryLabel = (categorie) => {
    const labels = {
      'CHANGEMENT_FORMAT': 'Changement de Format',
      'TRAVAUX_PREVENTIFS': 'Travaux Préventifs',
      'TRAVAUX_CURATIF': 'Travaux Curatif',
      'TRAVAUX_DIVERS': 'Travaux Divers',
      'FORMATION': 'Formation',
      'REGLAGE': 'Réglage'
    };
    return labels[categorie] || categorie;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl">{workOrder.titre}</DialogTitle>
            <div className="flex gap-2">
              {getStatusBadge(workOrder.statut)}
              {getPriorityBadge(workOrder.priorite)}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Catégorie */}
          {workOrder.categorie && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-blue-600">
                  {getCategoryLabel(workOrder.categorie)}
                </Badge>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={18} className="text-gray-600" />
              <h3 className="font-semibold text-gray-900">Description</h3>
            </div>
            <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{workOrder.description}</p>
          </div>

          {/* IA Panels */}
          <div className="flex flex-wrap gap-2">
            <AIDiagnosticPanel workOrderId={workOrder.id} />
            <AISummaryPanel workOrderId={workOrder.id} />
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Créé le */}
            <div className="flex items-start gap-3 md:col-span-2">
              <Calendar size={18} className="text-blue-600 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Créé le</p>
                <p className="font-medium text-gray-900">
                  {formatCreationDate(workOrder.dateCreation)} par {workOrder.createdByName || 'Utilisateur inconnu'}
                </p>
              </div>
            </div>

            {/* Date limite */}
            <div className="flex items-start gap-3">
              <Calendar size={18} className="text-red-600 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Date limite</p>
                <p className="font-medium text-gray-900">{workOrder.dateLimite}</p>
              </div>
            </div>

            {/* Temps estimé */}
            <div className="flex items-start gap-3">
              <Clock size={18} className="text-green-600 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Temps estimé</p>
                <p className="font-medium text-gray-900">{workOrder.tempsEstime}h</p>
              </div>
            </div>

            {/* Temps réel */}
            <div className="flex items-start gap-3">
              <Clock size={18} className="text-orange-600 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Temps réel</p>
                <p className="font-medium text-gray-900">
                  {workOrder.tempsReel ? formatTimeToHoursMinutes(workOrder.tempsReel) : 'Non démarré'}
                </p>
              </div>
            </div>

            {/* Assigné à */}
            {workOrder.assigneA && (
              <div className="flex items-start gap-3">
                <User size={18} className="text-purple-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Assigné à</p>
                  <p className="font-medium text-gray-900">
                    {workOrder.assigneA.prenom} {workOrder.assigneA.nom}
                  </p>
                  <p className="text-xs text-gray-500">{workOrder.assigneA.email}</p>
                </div>
              </div>
            )}

            {/* Emplacement */}
            {workOrder.emplacement && (
              <div className="flex items-start gap-3">
                <MapPin size={18} className="text-indigo-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Emplacement</p>
                  <p className="font-medium text-gray-900">{workOrder.emplacement.nom}</p>
                </div>
              </div>
            )}

            {/* Équipement */}
            {workOrder.equipement && (
              <div className="flex items-start gap-3 md:col-span-2">
                <Wrench size={18} className="text-amber-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Équipement</p>
                  <p className="font-medium text-gray-900">{workOrder.equipement.nom}</p>
                </div>
              </div>
            )}
          </div>

          {/* Rapport Détaillé */}
          <Separator className="my-6" />
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={20} className="text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Rapport Détaillé</h3>
            </div>
            
            {/* Liste des commentaires */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-64 overflow-y-auto space-y-3">
              {loadingComments ? (
                <p className="text-center text-gray-500">Chargement...</p>
              ) : comments.length === 0 ? (
                <p className="text-center text-gray-500 py-4">Aucun commentaire pour le moment</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-sm text-gray-900">{comment.user_name}</span>
                      <span className="text-xs text-gray-500">{formatDate(comment.timestamp)}</span>
                    </div>
                    <p className="text-gray-700 text-sm whitespace-pre-wrap">{comment.text}</p>
                  </div>
                ))
              )}
            </div>

            {/* Zone de saisie du commentaire */}
            <div className="space-y-2">
              <Label>Commentaire *</Label>
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Décrivez l'intervention réalisée..."
                className="resize-none"
                rows={3}
              />
            </div>
          </div>

          {/* Pièces utilisées - Formulaire d'ajout */}
          <Separator className="my-6" />
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package size={20} className="text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Ajouter des Pièces</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addPartUsed}
                className="text-sm"
              >
                <Plus size={16} className="mr-1" />
                Ajouter une pièce
              </Button>
            </div>

            {/* Historique des pièces utilisées */}
            {workOrder.parts_used && workOrder.parts_used.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="text-xs font-semibold text-blue-900 mb-2">Historique des pièces utilisées</h4>
                <div className="space-y-1">
                  {workOrder.parts_used.map((part, index) => (
                    <div key={part.id || index} className="text-xs text-gray-700">
                      <span className="font-bold">{part.quantity}</span> {part.inventory_item_name || part.custom_part_name} - {part.timestamp ? formatDate(part.timestamp) : 'Date inconnue'}{part.user_name && ` par ${part.user_name}`}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {partsUsed.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                Aucune pièce ajoutée. Cliquez sur &quot;Ajouter une pièce&quot; pour commencer.
              </p>
            ) : (
              <div className="space-y-3">
                {partsUsed.map((part) => (
                  <div key={part.id} className="border rounded-lg p-4 bg-gray-50 relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePartUsed(part.id)}
                      className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-red-100"
                    >
                      <X size={14} />
                    </Button>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Pièce */}
                      <div className="space-y-2">
                        <Label>Pièce *</Label>
                        <Select
                          value={part.inventory_item_id || 'custom'}
                          onValueChange={(value) => {
                            if (value === 'custom') {
                              // Texte libre : réinitialiser les champs inventaire
                              setPartsUsed(partsUsed.map(p => 
                                p.id === part.id 
                                  ? { ...p, inventory_item_id: null, inventory_item_name: null } 
                                  : p
                              ));
                            } else {
                              // Pièce d'inventaire : mettre à jour tous les champs en une fois
                              const item = inventoryItems.find(i => i.id === value);
                              setPartsUsed(partsUsed.map(p => 
                                p.id === part.id 
                                  ? { 
                                      ...p, 
                                      inventory_item_id: value,
                                      inventory_item_name: item?.nom || '',
                                      custom_part_name: ''
                                    } 
                                  : p
                              ));
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner une pièce" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">Texte libre (pièce externe)</SelectItem>
                            {inventoryItems.map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.nom} ({item.reference})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        {!part.inventory_item_id && (
                          <Input
                            placeholder="Nom de la pièce externe"
                            value={part.custom_part_name}
                            onChange={(e) => updatePartUsed(part.id, 'custom_part_name', e.target.value)}
                            className="mt-2"
                          />
                        )}
                      </div>

                      {/* Quantité */}
                      <div className="space-y-2">
                        <Label>Quantité utilisée *</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={part.quantity}
                          onChange={(e) => updatePartUsed(part.id, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                      </div>

                      {/* Prélevée Sur */}
                      <div className="space-y-2 md:col-span-2">
                        <Label>Prélevée Sur</Label>
                        <Select
                          value={part.source_equipment_id || 'custom'}
                          onValueChange={(value) => {
                            if (value === 'custom') {
                              // Texte libre
                              setPartsUsed(partsUsed.map(p => 
                                p.id === part.id 
                                  ? { ...p, source_equipment_id: null, source_equipment_name: null } 
                                  : p
                              ));
                            } else {
                              // Équipement sélectionné
                              const equip = equipmentsList.find(e => e.id === value);
                              setPartsUsed(partsUsed.map(p => 
                                p.id === part.id 
                                  ? { 
                                      ...p, 
                                      source_equipment_id: value,
                                      source_equipment_name: equip?.nom || '',
                                      custom_source: ''
                                    } 
                                  : p
                              ));
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner un équipement" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">Texte libre (équipement non enregistré)</SelectItem>
                            {equipmentsList.map(equip => (
                              <SelectItem key={equip.id} value={equip.id}>
                                {equip.nom}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {!part.source_equipment_id && (
                          <Input
                            placeholder="Source personnalisée"
                            value={part.custom_source}
                            onChange={(e) => updatePartUsed(part.id, 'custom_source', e.target.value)}
                            className="mt-2"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Temps Passé */}
          <Separator className="my-6" />
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock size={20} className="text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Temps Passé</h3>
            </div>

            {/* Zone de saisie du temps - champ unique */}
            <div className="space-y-2">
              <Label>Temps passé sur cette intervention *</Label>
              <Input
                type="text"
                placeholder="Ex: 1:30, 1h30, 1.5"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="max-w-[200px]"
              />
              <p className="text-xs text-gray-500">
                Formats acceptés : 01:30, 1:30, 1h30, 1.5 (décimal)
              </p>
            </div>
          </div>

          {/* Boutons Valider / Annuler */}
          <Separator className="my-6" />
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={validating}
            >
              Annuler
            </Button>
            <Button
              onClick={handleValidate}
              disabled={validating || !newComment.trim() || !timeInput.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {validating ? 'Validation...' : 'Valider'}
            </Button>
          </div>

          {/* Pièces jointes */}
          <Separator className="my-6" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Pièces jointes</h3>
            
            <div className="mb-4">
              <AttachmentUploader 
                workOrderId={workOrder.id} 
                onUploadComplete={handleUploadComplete}
              />
            </div>

            <AttachmentsList 
              workOrderId={workOrder.id}
              refreshTrigger={refreshAttachments}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <StatusChangeDialog
      open={showStatusDialog}
      onOpenChange={setShowStatusDialog}
      currentStatus={workOrder.statut}
      workOrderId={workOrder.id}
      onStatusChange={handleStatusChange}
      onSkip={handleSkipStatusChange}
    />
    </>
  );
};

export default WorkOrderDialog;