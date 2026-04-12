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
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar as CalendarPicker } from '../ui/calendar';
import { Calendar, Clock, User, MapPin, Wrench, FileText, MessageSquare, Pencil, Trash2, Check, X, CalendarDays } from 'lucide-react';
import AttachmentsList from './AttachmentsList';
import AttachmentUploader from './AttachmentUploader';
import StatusChangeDialog from './StatusChangeDialog';
import { improvementsAPI, usersAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { usePermissions } from '../../hooks/usePermissions';
import { formatTimeToHoursMinutes } from '../../utils/timeFormat';

const ImprovementDialog = ({ open, onOpenChange, workOrder, onSuccess }) => {
  const { toast } = useToast();
  const { canEdit, canDelete, isAdmin } = usePermissions();
  const canManageTimeEntries = isAdmin() || (canEdit('improvements') && canDelete('improvements'));

  const [refreshAttachments, setRefreshAttachments] = useState(0);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [validating, setValidating] = useState(false);

  // États édition des pointages
  const [editingTimeId, setEditingTimeId] = useState(null);
  const [editingTimeValue, setEditingTimeValue] = useState('');
  const [editingTimeDate, setEditingTimeDate] = useState('');
  const [editingTimeUserId, setEditingTimeUserId] = useState('');
  const [activeUsers, setActiveUsers] = useState([]);

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
      const response = await improvementsAPI.getComments(workOrder.id);
      // S'assurer que c'est un tableau
      const commentsData = Array.isArray(response) ? response : (response?.data || []);
      setComments(commentsData);
    } catch (error) {
      console.error('Erreur lors du chargement des commentaires:', error);
      setComments([]); // Initialiser avec un tableau vide en cas d'erreur
    } finally {
      setLoadingComments(false);
    }
  };

  // Fonction pour valider commentaire + temps + ouvrir dialogue statut
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

      // 1. Enregistrer le commentaire
      await improvementsAPI.addComment(workOrder.id, newComment);

      // 2. Enregistrer le temps passé
      await improvementsAPI.addTimeSpent(workOrder.id, parsed.hours, parsed.minutes);

      // 3. Rafraîchir les données
      if (onSuccess) onSuccess();

      // 4. Réinitialiser les champs
      setNewComment('');
      setTimeInput('');

      toast({
        title: 'Validation réussie',
        description: `Commentaire et temps (${parsed.hours}h${parsed.minutes.toString().padStart(2, '0')}) enregistrés`
      });

      // 5. Ouvrir le dialogue de changement de statut
      setShowStatusDialog(true);

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
    setEditingTimeId(null);
    onOpenChange(false);
  };

  // === Édition / suppression des pointages ===
  const handleEditTimeEntry = async (entry) => {
    setEditingTimeId(entry.id);
    const h = Math.floor(entry.hours);
    const m = Math.round((entry.hours - h) * 60);
    setEditingTimeValue(`${h}h${m.toString().padStart(2, '0')}`);
    setEditingTimeUserId(entry.user_id || '');
    const ts = entry.timestamp || '';
    if (ts) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) setEditingTimeDate(d.toISOString().slice(0, 10));
      else setEditingTimeDate('');
    } else {
      setEditingTimeDate('');
    }
    if (activeUsers.length === 0) {
      try {
        const res = await usersAPI.getAll();
        setActiveUsers((res.data || []).filter(u => (u.statut || 'actif').toLowerCase() !== 'inactif'));
      } catch {}
    }
  };

  const handleSaveTimeEntry = async () => {
    const parsed = parseTimeInput(editingTimeValue);
    if (!parsed || (parsed.hours === 0 && parsed.minutes === 0)) {
      toast({ title: 'Erreur', description: 'Temps invalide', variant: 'destructive' });
      return;
    }
    try {
      const newHours = parsed.hours + parsed.minutes / 60;
      const timestamp = editingTimeDate ? new Date(editingTimeDate + 'T12:00:00').toISOString() : undefined;
      await improvementsAPI.updateTimeEntry(workOrder.id, editingTimeId, newHours, timestamp, editingTimeUserId || undefined);
      toast({ title: 'Succès', description: 'Pointage modifié' });
      setEditingTimeId(null);
      setEditingTimeDate('');
      setEditingTimeUserId('');
      if (onSuccess) onSuccess();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de modifier le pointage', variant: 'destructive' });
    }
  };

  const handleDeleteTimeEntry = async (entryId) => {
    if (!window.confirm('Supprimer ce pointage ?')) return;
    try {
      await improvementsAPI.deleteTimeEntry(workOrder.id, entryId);
      toast({ title: 'Succès', description: 'Pointage supprimé' });
      if (onSuccess) onSuccess();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
    }
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

  useEffect(() => {
    if (open && workOrder) {
      loadComments();
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

  const handleStatusChange = async (newStatus) => {
    try {
      // Mettre à jour le statut
      await improvementsAPI.update(workOrder.id, { statut: newStatus });
      
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

  const handleSkipStatusChange = () => {
    setShowStatusDialog(false);
    onOpenChange(false);
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
          {/* Description */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={18} className="text-gray-600" />
              <h3 className="font-semibold text-gray-900">Description</h3>
            </div>
            <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{workOrder.description}</p>
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

            {/* Assigner à */}
            {workOrder.assigneA && (
              <div className="flex items-start gap-3">
                <User size={18} className="text-purple-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Assigner à</p>
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

          {/* Temps Passé */}
          <Separator className="my-6" />
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock size={20} className="text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Temps Passé</h3>
            </div>

            {/* Historique des pointages avec édition inline */}
            {workOrder.time_entries && workOrder.time_entries.length > 0 && (
              <div className="bg-orange-50 rounded-lg p-3 mb-4 border border-orange-200 space-y-2" data-testid="improvement-time-entries-list">
                <h4 className="text-xs font-semibold text-orange-900 mb-1">Historique des pointages</h4>
                {workOrder.time_entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-sm bg-white rounded px-3 py-1.5 shadow-sm">
                    {editingTimeId === entry.id ? (
                      <div className="flex items-center gap-2 flex-1 flex-wrap">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              data-testid={`edit-impr-time-date-${entry.id}`}
                              className="h-7 text-sm border rounded px-2 bg-white flex items-center gap-1 hover:bg-gray-50 min-w-[130px]"
                            >
                              <CalendarDays size={13} className="text-gray-500" />
                              {editingTimeDate || 'Choisir date'}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={4}>
                            <CalendarPicker
                              mode="single"
                              selected={editingTimeDate ? new Date(editingTimeDate + 'T12:00:00') : undefined}
                              onSelect={(date) => {
                                if (date) {
                                  const y = date.getFullYear();
                                  const mo = String(date.getMonth() + 1).padStart(2, '0');
                                  const d = String(date.getDate()).padStart(2, '0');
                                  setEditingTimeDate(`${y}-${mo}-${d}`);
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <Input
                          data-testid={`edit-impr-time-input-${entry.id}`}
                          type="text"
                          value={editingTimeValue}
                          onChange={(e) => setEditingTimeValue(e.target.value)}
                          className="max-w-[100px] h-7 text-sm"
                          placeholder="Ex: 1h30"
                        />
                        <Select
                          value={editingTimeUserId || 'unchanged'}
                          onValueChange={(val) => setEditingTimeUserId(val === 'unchanged' ? '' : val)}
                        >
                          <SelectTrigger
                            data-testid={`edit-impr-time-user-${entry.id}`}
                            className="h-7 text-sm min-w-[130px] max-w-[180px]"
                          >
                            <SelectValue placeholder="Collaborateur" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unchanged">
                              <span className="text-gray-400 italic">— Inchangé —</span>
                            </SelectItem>
                            {activeUsers.map(u => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.prenom} {u.nom}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          data-testid={`save-impr-time-${entry.id}`}
                          onClick={handleSaveTimeEntry}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Enregistrer"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => { setEditingTimeId(null); setEditingTimeDate(''); setEditingTimeUserId(''); }}
                          className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                          title="Annuler"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-gray-700">
                          <span className="font-semibold">{formatTimeToHoursMinutes(entry.hours)}</span>
                          {' — '}{entry.user_name}
                          <span className="text-xs text-gray-400 ml-2">{formatDate(entry.timestamp)}</span>
                        </span>
                        {canManageTimeEntries && (
                          <div className="flex items-center gap-0.5 ml-2">
                            <button
                              data-testid={`edit-impr-time-${entry.id}`}
                              onClick={() => handleEditTimeEntry(entry)}
                              className="p-1 text-gray-400 hover:text-blue-600 rounded"
                              title="Modifier"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              data-testid={`delete-impr-time-${entry.id}`}
                              onClick={() => handleDeleteTimeEntry(entry.id)}
                              className="p-1 text-gray-400 hover:text-red-600 rounded"
                              title="Supprimer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Zone de saisie du temps - champ unique */}
            <div className="space-y-2">
              <Label>Ajouter un pointage *</Label>
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
              improvementId={workOrder.id}
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

export default ImprovementDialog;