import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Camera, Upload, X, FileIcon, Image as ImageIcon, Loader2 } from 'lucide-react';

const InterventionRequestFormDialog = ({ open, onOpenChange, request, onSuccess }) => {
  const { toast } = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [loading, setLoading] = useState(false);
  const [equipments, setEquipments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [childEquipments, setChildEquipments] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [files, setFiles] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
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
        // Determine if the current equipment is a parent or child
        const eqId = request.equipement?.id || '';
        setFormData({
          titre: request.titre || '',
          description: request.description || '',
          priorite: request.priorite || 'AUCUNE',
          equipement_id: eqId,
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
        setFiles([]);
      }
      setChildEquipments([]);
    } else {
      // Cleanup camera on close
      stopCamera();
      setFiles([]);
    }
  }, [open, request]);

  // When parent equipment is selected, load children and auto-fill emplacement
  useEffect(() => {
    if (formData.equipement_id && equipments.length > 0) {
      const parentEq = equipments.find(eq => eq.id === formData.equipement_id);
      if (parentEq) {
        // Auto-fill emplacement from parent
        if (parentEq.emplacement?.id) {
          setFormData(prev => ({ ...prev, emplacement_id: parentEq.emplacement.id }));
        } else if (parentEq.emplacement_id) {
          setFormData(prev => ({ ...prev, emplacement_id: parentEq.emplacement_id }));
        }
        // Load children
        if (parentEq.hasChildren) {
          loadChildren(parentEq.id);
        } else {
          setChildEquipments([]);
        }
      }
    } else {
      setChildEquipments([]);
      setFormData(prev => ({ ...prev, emplacement_id: '', sous_equipement_id: '' }));
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

  // Camera functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'acceder a la camera. Verifiez les permissions.',
        variant: 'destructive'
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([blob], `photo_${timestamp}.jpg`, { type: 'image/jpeg' });
        setFiles(prev => [...prev, { file, preview: URL.createObjectURL(blob) }]);
        stopCamera();
        toast({ title: 'Photo capturee', description: 'La photo a ete ajoutee aux pieces jointes.' });
      }
    }, 'image/jpeg', 0.85);
  };

  // Drag and drop handlers
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    addFiles(selectedFiles);
    e.target.value = '';
  };

  const addFiles = (newFiles) => {
    const maxSize = 25 * 1024 * 1024; // 25MB
    const validFiles = newFiles.filter(f => {
      if (f.size > maxSize) {
        toast({ title: 'Fichier trop volumineux', description: `${f.name} depasse 25MB`, variant: 'destructive' });
        return false;
      }
      return true;
    });
    const fileItems = validFiles.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }));
    setFiles(prev => [...prev, ...fileItems]);
  };

  const removeFile = (index) => {
    setFiles(prev => {
      const updated = [...prev];
      if (updated[index].preview) URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
  };

  const uploadFiles = async (requestId) => {
    for (const item of files) {
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
      // Determine the actual equipment_id to send
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
        // Upload new files if any
        if (files.length > 0) {
          await uploadFiles(request.id);
        }
        toast({ title: 'Succes', description: 'Demande modifiee avec succes' });
      } else {
        const response = await interventionRequestsAPI.create(submitData);
        resultId = response?.data?.id;
        // Upload files after creation
        if (files.length > 0 && resultId) {
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
    <Dialog open={open} onOpenChange={(val) => { if (!val) stopCamera(); onOpenChange(val); }}>
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

            {/* Sous-equipement (visible seulement si le parent a des enfants) */}
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

            {/* Loading indicator for children */}
            {loadingChildren && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des sous-equipements...
              </div>
            )}
          </div>

          {/* Emplacement auto-rempli (affiche en lecture seule si rempli) */}
          {formData.emplacement_id && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Emplacement (auto)</p>
              <p className="text-sm font-medium text-gray-700" data-testid="intervention-emplacement-auto">
                {locations.find(l => l.id === formData.emplacement_id)?.nom || formData.emplacement_id}
              </p>
            </div>
          )}

          {/* Section Pieces jointes */}
          <div className="space-y-3">
            <Label>Pieces jointes</Label>
            
            {/* Camera view */}
            {cameraOpen && (
              <div className="relative bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full max-h-[250px] object-contain"
                />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                  <Button
                    type="button"
                    data-testid="capture-photo-btn"
                    onClick={capturePhoto}
                    className="bg-white text-gray-900 hover:bg-gray-100 rounded-full h-12 w-12 p-0"
                  >
                    <Camera size={20} />
                  </Button>
                  <Button
                    type="button"
                    data-testid="cancel-camera-btn"
                    onClick={stopCamera}
                    variant="destructive"
                    className="rounded-full h-12 w-12 p-0"
                  >
                    <X size={20} />
                  </Button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="open-camera-btn"
                onClick={startCamera}
                disabled={cameraOpen}
                className="gap-2"
              >
                <Camera size={16} />
                Prendre une photo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="browse-files-btn"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload size={16} />
                Parcourir
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Drag and drop zone */}
            <div
              data-testid="dropzone"
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400 bg-gray-50'
              }`}
            >
              <Upload className="mx-auto h-6 w-6 text-gray-400 mb-1" />
              <p className="text-sm text-gray-500">
                Glissez-deposez des fichiers ici ou cliquez pour parcourir
              </p>
              <p className="text-xs text-gray-400 mt-1">Max 25 Mo par fichier</p>
            </div>

            {/* Files list */}
            {files.length > 0 && (
              <div className="space-y-2" data-testid="files-list">
                {files.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 bg-white border rounded-lg p-2"
                  >
                    {item.preview ? (
                      <img src={item.preview} alt="" className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                        <FileIcon size={18} className="text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-testid={`remove-file-${index}`}
                      onClick={() => removeFile(index)}
                      className="h-8 w-8 text-gray-400 hover:text-red-500"
                    >
                      <X size={16} />
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
                  {files.length > 0 ? 'Envoi en cours...' : 'Transmission...'}
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
