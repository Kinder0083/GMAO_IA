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
import { useToast } from '../../hooks/use-toast';
import { interventionRequestsAPI, equipmentsAPI, locationsAPI } from '../../services/api';
import api from '../../services/api';
import { validateDateNotPast } from '../../utils/dateValidation';
import { formatErrorMessage } from '../../utils/errorFormatter';
import { Paperclip, Camera, Loader2, X, Eye, Upload } from 'lucide-react';

const InterventionRequestFormDialog = ({ open, onOpenChange, request, onSuccess }) => {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [loading, setLoading] = useState(false);
  const [equipments, setEquipments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [childEquipments, setChildEquipments] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
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
        // Load existing attachments from the request
        if (request.attachments && request.attachments.length > 0) {
          const loadExistingAttachments = async () => {
            const loaded = [];
            for (const att of request.attachments) {
              const item = {
                name: att.original_filename || att.filename,
                size: att.size || 0,
                isExisting: true,
                id: att.id,
                url: att.url,
                mime_type: att.mime_type,
                preview: null
              };
              // Load image preview via authenticated fetch
              if (att.mime_type?.startsWith('image/') && att.url) {
                try {
                  const res = await interventionRequestsAPI.downloadAttachment(request.id, att.id);
                  const blob = new Blob([res.data], { type: att.mime_type });
                  item.preview = URL.createObjectURL(blob);
                } catch (err) {
                  console.warn('Preview load failed for', att.filename, err);
                }
              }
              loaded.push(item);
            }
            setAttachments(loaded);
          };
          loadExistingAttachments();
        } else {
          setAttachments([]);
        }
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
      setPreviewImage(null);
    } else {
      // Cleanup object URLs
      attachments.forEach(att => {
        if (att.preview && !att.isExisting) URL.revokeObjectURL(att.preview);
      });
      setAttachments([]);
      setPreviewImage(null);
    }
  }, [open, request]);

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
      setChildEquipments([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  const parentEquipments = equipments.filter(eq => !eq.parent_id);

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
      size: file.size,
      isExisting: false,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
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
      size: file.size,
      isExisting: false,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleCameraCapture = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const handleRemoveAttachment = async (index) => {
    const att = attachments[index];
    if (att.isExisting && att.id && request) {
      try {
        await api.delete(`/intervention-requests/${request.id}/attachments/${att.id}`);
      } catch (error) {
        console.error('Erreur suppression PJ:', error);
      }
    }
    if (att.preview && !att.isExisting) URL.revokeObjectURL(att.preview);
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (requestId) => {
    const newFiles = attachments.filter(a => !a.isExisting && a.file);
    for (const item of newFiles) {
      try {
        const fd = new FormData();
        fd.append('file', item.file);
        await api.post(`/intervention-requests/${requestId}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } catch (error) {
        console.error('Erreur upload fichier:', error);
        toast({ title: 'Erreur', description: `Echec upload: ${item.name}`, variant: 'destructive' });
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
      const hasNewFiles = attachments.some(a => !a.isExisting);

      if (request) {
        await interventionRequestsAPI.update(request.id, submitData);
        resultId = request.id;
        if (hasNewFiles) await uploadFiles(request.id);
        toast({ title: 'Succes', description: 'Demande modifiee avec succes' });
      } else {
        const response = await interventionRequestsAPI.create(submitData);
        if (response?.data?._offline_queued) {
          // Mode offline : stocker les fichiers en attente pour synchronisation ultérieure
          if (hasNewFiles) {
            const newFiles = attachments.filter(a => !a.isExisting && a.file);
            const fileRefs = [];
            for (const item of newFiles) {
              const fileId = `offline_file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              try {
                const { storeOfflineFile } = await import('../../services/offlineDb');
                await storeOfflineFile(fileId, item.file, {
                  name: item.file.name || item.name,
                  type: item.file.type,
                  size: item.file.size
                });
                fileRefs.push({ fileId, name: item.file.name || item.name, type: item.file.type });
              } catch (e) {
                console.error('[Offline] Erreur stockage fichier:', e);
              }
            }
            if (fileRefs.length > 0) {
              // Attacher les fichiers au dernier item de la syncQueue
              try {
                const { getOfflineDb } = await import('../../services/offlineDb');
                const idb = await getOfflineDb();
                const items = await idb.getAll('syncQueue');
                const lastItem = items[items.length - 1];
                if (lastItem && lastItem.url === '/intervention-requests' && lastItem.method === 'post') {
                  lastItem.pendingFiles = fileRefs;
                  await idb.put('syncQueue', lastItem);
                  console.log('[Offline] ' + fileRefs.length + ' fichier(s) attache(s) a la DI en attente');
                }
              } catch (e) {
                console.error('[Offline] Erreur liaison fichiers:', e);
              }
            }
            toast({ title: 'Mode hors ligne', description: `Demande et ${fileRefs.length} photo(s) enregistrees localement, seront transmises au retour de la connexion.` });
          } else {
            toast({ title: 'Mode hors ligne', description: 'Demande enregistree localement, elle sera transmise au retour de la connexion.' });
          }
        } else {
          resultId = response?.data?.id;
          if (hasNewFiles && resultId) await uploadFiles(resultId);
          toast({ title: 'Succes', description: 'Demande transmise avec succes' });
        }
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
    <>
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
                  <SelectTrigger id="sous_equipement" data-testid="intervention-sous-equipement-select">
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
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des sous-equipements...
              </div>
            )}
          </div>

          {formData.emplacement_id && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Emplacement (auto)</p>
              <p className="text-sm font-medium text-gray-700" data-testid="intervention-emplacement-auto">
                {locations.find(l => l.id === formData.emplacement_id)?.nom || formData.emplacement_id}
              </p>
            </div>
          )}

          {/* Section Fichiers joints - identique aux OT avec miniatures */}
          <div className="space-y-2 pt-4 border-t">
            <Label>
              <Paperclip size={16} className="inline mr-1" />
              Joindre des fichiers
            </Label>
            
            {/* Zone de drag & drop */}
            <div
              data-testid="di-drop-zone"
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
                
                <p className="text-xs text-gray-500 text-center">
                  Glissez-deposez vos fichiers ici ou utilisez les boutons ci-dessus (max 25MB)
                </p>
              </div>
            </div>
            
            {/* Miniatures des photos + liste des fichiers */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-3" data-testid="files-list">
                <p className="text-sm font-medium text-gray-700">
                  {attachments.length} fichier(s) {request ? '' : 'selectionne(s)'} :
                </p>
                
                {/* Grille de miniatures pour les images */}
                {attachments.some(a => a.preview) && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {attachments.map((att, index) => att.preview ? (
                      <div key={index} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-100">
                        <img 
                          src={att.preview} 
                          alt={att.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(att.preview)}
                            className="p-1.5 bg-white rounded-full shadow hover:bg-gray-100"
                            title="Visualiser"
                          >
                            <Eye size={14} className="text-gray-700" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(index)}
                            className="p-1.5 bg-white rounded-full shadow hover:bg-red-50"
                            title="Supprimer"
                          >
                            <X size={14} className="text-red-500" />
                          </button>
                        </div>
                        <p className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
                          {att.name}
                        </p>
                      </div>
                    ) : null)}
                  </div>
                )}
                
                {/* Liste des fichiers non-image */}
                {attachments.filter(a => !a.preview).map((attachment, idx) => {
                  const realIndex = attachments.indexOf(attachment);
                  return (
                    <div key={realIndex} className="flex items-center justify-between p-2 bg-gray-50 rounded">
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
                        data-testid={`remove-file-${realIndex}`}
                        onClick={() => handleRemoveAttachment(realIndex)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        Supprimer
                      </Button>
                    </div>
                  );
                })}
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
                  {attachments.some(a => !a.isExisting) ? 'Envoi en cours...' : 'Transmission...'}
                </>
              ) : (
                request ? 'Modifier' : 'Transmettre'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* Modal de visualisation plein ecran */}
    {previewImage && createPortal(
      <div 
        className="fixed inset-0 bg-black/80 flex items-center justify-center p-4"
        style={{ zIndex: 99999, pointerEvents: 'auto', touchAction: 'auto' }}
        onClick={(e) => { if (e.target === e.currentTarget) setPreviewImage(null); }}
        onTouchEnd={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); setPreviewImage(null); } }}
        data-testid="image-preview-modal"
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
          onClick={(e) => e.stopPropagation()}
        />
      </div>,
      document.body
    )}
    </>
  );
};

export default InterventionRequestFormDialog;
