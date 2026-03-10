import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { equipmentsAPI, workOrdersAPI, preventiveMaintenanceAPI, usersAPI, demandesArretAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { Calendar, Clock, ChevronRight, ChevronDown, AlertTriangle, AlertCircle, Minus, Paperclip, X, Upload, FileIcon, Loader2 } from 'lucide-react';

const DemandeArretDialog = ({ open, onOpenChange, onSuccess }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [equipments, setEquipments] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [preventiveMaintenances, setPreventiveMaintenances] = useState([]);
  const [users, setUsers] = useState([]);
  const [rspProdUser, setRspProdUser] = useState(null);
  const [expandedEquipments, setExpandedEquipments] = useState(new Set());
  const fileInputRef = useRef(null);
  
  // Fichiers sélectionnés (avant upload)
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [formData, setFormData] = useState({
    date_debut: '',
    date_fin: '',
    periode_debut: 'JOURNEE_COMPLETE',
    periode_fin: 'JOURNEE_COMPLETE',
    equipement_ids: [],
    work_order_id: null,
    maintenance_preventive_id: null,
    commentaire: '',
    destinataire_id: '',
    priorite: 'NORMALE'
  });

  // Organiser les équipements en hiérarchie
  const { parentEquipments, childrenByParent } = useMemo(() => {
    const parents = equipments.filter(eq => !eq.parent_id);
    const childrenMap = {};
    
    equipments.forEach(eq => {
      if (eq.parent_id) {
        if (!childrenMap[eq.parent_id]) {
          childrenMap[eq.parent_id] = [];
        }
        childrenMap[eq.parent_id].push(eq);
      }
    });
    
    return { parentEquipments: parents, childrenByParent: childrenMap };
  }, [equipments]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    try {
      const eqResponse = await equipmentsAPI.getAll();
      setEquipments(eqResponse.data || []);

      const woResponse = await workOrdersAPI.getAll();
      setWorkOrders(woResponse.data || []);

      const pmResponse = await preventiveMaintenanceAPI.getAll();
      setPreventiveMaintenances(pmResponse.data || []);

      const usersResponse = await usersAPI.getAll();
      setUsers(usersResponse.data || []);

      const rspProd = (usersResponse.data || []).find(user => user.role === 'RSP_PROD');
      if (rspProd) {
        setRspProdUser(rspProd);
        setFormData(prev => ({ ...prev, destinataire_id: rspProd.id }));
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les données',
        variant: 'destructive'
      });
    }
  };

  const handleEquipmentToggle = (equipmentId) => {
    setFormData(prev => ({
      ...prev,
      equipement_ids: prev.equipement_ids.includes(equipmentId)
        ? prev.equipement_ids.filter(id => id !== equipmentId)
        : [...prev.equipement_ids, equipmentId]
    }));
  };

  const toggleExpand = (equipmentId) => {
    setExpandedEquipments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(equipmentId)) {
        newSet.delete(equipmentId);
      } else {
        newSet.add(equipmentId);
      }
      return newSet;
    });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    
    const validFiles = files.filter(file => {
      if (file.size > MAX_SIZE) {
        toast({
          title: 'Fichier trop volumineux',
          description: `${file.name} dépasse la limite de 10MB`,
          variant: 'destructive'
        });
        return false;
      }
      return true;
    });
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
    
    // Reset input pour permettre de sélectionner le même fichier à nouveau
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.date_debut || !formData.date_fin) {
      toast({
        title: 'Erreur',
        description: 'Veuillez renseigner les dates de début et de fin',
        variant: 'destructive'
      });
      return;
    }

    if (formData.equipement_ids.length === 0) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner au moins un équipement',
        variant: 'destructive'
      });
      return;
    }

    if (!formData.destinataire_id) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner un destinataire',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      // 1. Créer la demande
      const demande = await demandesArretAPI.create({
        date_debut: formData.date_debut,
        date_fin: formData.date_fin,
        periode_debut: formData.periode_debut,
        periode_fin: formData.periode_fin,
        equipement_ids: formData.equipement_ids,
        work_order_id: formData.work_order_id,
        maintenance_preventive_id: formData.maintenance_preventive_id,
        commentaire: formData.commentaire,
        destinataire_id: formData.destinataire_id,
        priorite: formData.priorite
      });
      
      // 2. Uploader les pièces jointes si présentes
      if (selectedFiles.length > 0 && demande.id) {
        setUploadingFiles(true);
        let uploadSuccess = 0;
        let uploadFailed = 0;
        
        for (const file of selectedFiles) {
          try {
            await demandesArretAPI.uploadAttachment(demande.id, file);
            uploadSuccess++;
          } catch (uploadError) {
            console.error('Erreur upload fichier:', uploadError);
            uploadFailed++;
          }
        }
        
        if (uploadFailed > 0) {
          toast({
            title: 'Attention',
            description: `${uploadSuccess} fichier(s) uploadé(s), ${uploadFailed} échec(s)`,
            variant: 'destructive'
          });
        }
      }
      
      // Message différent selon auto-approbation ou envoi normal
      const isAutoApproved = demande.statut === 'APPROUVEE';
      toast({
        title: isAutoApproved ? 'Demande auto-approuvée' : 'Demande envoyée',
        description: isAutoApproved 
          ? 'La maintenance a été directement inscrite au planning (vous êtes le destinataire)'
          : 'Demande d\'arrêt envoyée avec succès'
      });
      
      // Reset le formulaire
      setFormData({
        date_debut: '',
        date_fin: '',
        periode_debut: 'JOURNEE_COMPLETE',
        periode_fin: 'JOURNEE_COMPLETE',
        equipement_ids: [],
        work_order_id: null,
        maintenance_preventive_id: null,
        commentaire: '',
        destinataire_id: rspProdUser?.id || '',
        priorite: 'NORMALE'
      });
      setSelectedFiles([]);
      
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Erreur création demande:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'envoi de la demande',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
      setUploadingFiles(false);
    }
  };

  const getPriorityBadge = (priority) => {
    const badges = {
      'URGENTE': { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
      'NORMALE': { bg: 'bg-blue-100', text: 'text-blue-700', icon: Minus },
      'BASSE': { bg: 'bg-gray-100', text: 'text-gray-700', icon: AlertCircle }
    };
    return badges[priority] || badges['NORMALE'];
  };

  // Composant pour afficher un équipement avec ses enfants
  const EquipmentItem = ({ equipment, isChild = false }) => {
    const hasChildren = childrenByParent[equipment.id]?.length > 0;
    const isExpanded = expandedEquipments.has(equipment.id);
    const isSelected = formData.equipement_ids.includes(equipment.id);

    return (
      <>
        <div 
          className={`flex items-center space-x-2 p-2 hover:bg-gray-50 rounded ${isChild ? 'ml-6' : ''}`}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(equipment.id)}
              className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </button>
          ) : (
            <div className="w-5 flex-shrink-0" />
          )}
          
          <Checkbox
            id={`eq-${equipment.id}`}
            checked={isSelected}
            onCheckedChange={() => handleEquipmentToggle(equipment.id)}
          />
          <label htmlFor={`eq-${equipment.id}`} className={`text-sm cursor-pointer flex-1 ${isChild ? 'text-gray-600' : ''}`}>
            <span className={isChild ? '' : 'font-medium'}>{equipment.name || equipment.nom}</span>
            {(equipment.category || equipment.categorie) && (
              <span className="text-gray-500 ml-2">• {equipment.category || equipment.categorie}</span>
            )}
          </label>
        </div>
        
        {/* Enfants si développé */}
        {hasChildren && isExpanded && (
          childrenByParent[equipment.id].map(child => (
            <EquipmentItem key={child.id} equipment={child} isChild={true} />
          ))
        )}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Demande d'Arrêt pour Maintenance</DialogTitle>
          <DialogDescription>
            Remplissez le formulaire pour demander l'arrêt d'un ou plusieurs équipements pour maintenance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
            {/* Priorité */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Priorité de la demande *
                </h3>
                <RadioGroup
                  value={formData.priorite}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, priorite: value }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="URGENTE" id="priorite_urgente" />
                    <label htmlFor="priorite_urgente" className="text-sm cursor-pointer flex items-center gap-1">
                      <Badge className="bg-red-100 text-red-700">Urgente</Badge>
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="NORMALE" id="priorite_normale" />
                    <label htmlFor="priorite_normale" className="text-sm cursor-pointer flex items-center gap-1">
                      <Badge className="bg-blue-100 text-blue-700">Normale</Badge>
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="BASSE" id="priorite_basse" />
                    <label htmlFor="priorite_basse" className="text-sm cursor-pointer flex items-center gap-1">
                      <Badge className="bg-gray-100 text-gray-700">Basse</Badge>
                    </label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Période d'arrêt */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Période d'Arrêt Demandée *
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="date_debut">Date de début *</Label>
                    <Input
                      id="date_debut"
                      type="date"
                      value={formData.date_debut}
                      onChange={(e) => setFormData(prev => ({ ...prev, date_debut: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="date_fin">Date de fin *</Label>
                    <Input
                      id="date_fin"
                      type="date"
                      value={formData.date_fin}
                      onChange={(e) => setFormData(prev => ({ ...prev, date_fin: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Période début</Label>
                    <RadioGroup
                      value={formData.periode_debut}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, periode_debut: value }))}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="JOURNEE_COMPLETE" id="debut_journee" />
                        <label htmlFor="debut_journee" className="text-sm cursor-pointer">Journée complète</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="MATIN" id="debut_matin" />
                        <label htmlFor="debut_matin" className="text-sm cursor-pointer">Matin (8h-12h)</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="APRES_MIDI" id="debut_aprem" />
                        <label htmlFor="debut_aprem" className="text-sm cursor-pointer">Après-midi (13h-17h)</label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div>
                    <Label>Période fin</Label>
                    <RadioGroup
                      value={formData.periode_fin}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, periode_fin: value }))}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="JOURNEE_COMPLETE" id="fin_journee" />
                        <label htmlFor="fin_journee" className="text-sm cursor-pointer">Journée complète</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="MATIN" id="fin_matin" />
                        <label htmlFor="fin_matin" className="text-sm cursor-pointer">Matin (8h-12h)</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="APRES_MIDI" id="fin_aprem" />
                        <label htmlFor="fin_aprem" className="text-sm cursor-pointer">Après-midi (13h-17h)</label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Équipements avec hiérarchie */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3">Équipements concernés *</h3>
                <div className="max-h-60 overflow-y-auto space-y-1 border rounded p-3">
                  {parentEquipments.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucun équipement disponible</p>
                  ) : (
                    parentEquipments.map((equipment) => (
                      <EquipmentItem key={equipment.id} equipment={equipment} isChild={false} />
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {formData.equipement_ids.length} équipement(s) sélectionné(s)
                </p>
              </CardContent>
            </Card>

            {/* Ordre de travail / Maintenance préventive */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-semibold">Lier à un document (optionnel)</h3>
                
                <div>
                  <Label htmlFor="work_order">Ordre de Travail</Label>
                  <Select
                    value={formData.work_order_id || 'none'}
                    onValueChange={(value) => setFormData(prev => ({
                      ...prev,
                      work_order_id: value === 'none' ? null : value,
                      maintenance_preventive_id: null
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un ordre de travail" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {workOrders.filter(wo => wo.id && wo.id !== '').map(wo => (
                        <SelectItem key={wo.id} value={wo.id}>
                          {wo.title || wo.titre || `Ordre ${wo.order_number || wo.numero}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="maintenance_preventive">Maintenance Préventive</Label>
                  <Select
                    value={formData.maintenance_preventive_id || 'none'}
                    onValueChange={(value) => setFormData(prev => ({
                      ...prev,
                      maintenance_preventive_id: value === 'none' ? null : value,
                      work_order_id: null
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une maintenance préventive" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      {preventiveMaintenances.filter(pm => pm.id && pm.id !== '').map(pm => (
                        <SelectItem key={pm.id} value={pm.id}>
                          {pm.title || pm.titre || pm.name || pm.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Pièces jointes */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Pièces jointes (optionnel)
                </h3>
                
                <div className="space-y-3">
                  <div 
                    className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600">Cliquez ou glissez des fichiers ici</p>
                    <p className="text-xs text-gray-400 mt-1">Maximum 10MB par fichier</p>
                  </div>
                  
                  <Input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
                  />
                  
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2 mt-3">
                      <p className="text-sm font-medium text-gray-700">
                        {selectedFiles.length} fichier(s) sélectionné(s)
                      </p>
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span className="text-sm truncate">{file.name}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              ({formatFileSize(file.size)})
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Commentaire */}
            <div>
              <Label htmlFor="commentaire">Commentaire</Label>
              <Textarea
                id="commentaire"
                placeholder="Ajoutez des détails sur la demande d'arrêt..."
                value={formData.commentaire}
                onChange={(e) => setFormData(prev => ({ ...prev, commentaire: e.target.value }))}
                rows={4}
              />
            </div>

            {/* Destinataire */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3">Destinataire de la demande *</h3>
                <Select
                  value={formData.destinataire_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, destinataire_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner le destinataire" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.filter(user => user.id && user.id !== '').map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.first_name || user.prenom} {user.last_name || user.nom} 
                        {user.role === 'RSP_PROD' && ' (Resp. Production - Par défaut)'}
                        {user.email && ` - ${user.email}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rspProdUser && (
                  <p className="text-xs text-gray-500 mt-2">
                    Par défaut : {rspProdUser.first_name || rspProdUser.prenom} {rspProdUser.last_name || rspProdUser.nom} (Responsable Production)
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading || uploadingFiles}>
              {uploadingFiles ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Upload des fichiers...
                </>
              ) : loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Envoi...
                </>
              ) : (
                'Envoyer la demande'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DemandeArretDialog;
