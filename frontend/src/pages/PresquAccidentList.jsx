import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Plus, Download, Upload, AlertTriangle, Search, Filter, Edit, Trash2, Paperclip, ClipboardCheck, X, Eye, Wifi, WifiOff, RefreshCw, ChevronDown, ChevronUp, Wrench, Brain, Loader2, FileSpreadsheet, CheckCircle, Camera, Image } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { presquAccidentAPI, usersAPI, rolesAPI, equipmentsAPI } from '../services/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { usePresquAccident } from '../hooks/usePresquAccident';
import AttachmentUploader from '../components/shared/AttachmentUploader';
import AttachmentsList from '../components/shared/AttachmentsList';
import AIRootCauseAnalyzer from '../components/AIRootCauseAnalyzer';
import AISimilarIncidents from '../components/AISimilarIncidents';

function PresquAccidentList() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const importInputRef = useRef(null);
  const createFileInputRef = useRef(null);
  const createCameraInputRef = useRef(null);
  const [filteredItems, setFilteredItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [openForm, setOpenForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [attachmentRefresh, setAttachmentRefresh] = useState(0);
  const [users, setUsers] = useState([]);
  const [serviceResponsables, setServiceResponsables] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [openRCA, setOpenRCA] = useState(false);
  const [rcaItem, setRcaItem] = useState(null);
  
  // Dialog de traitement/réponse
  const [openTraitement, setOpenTraitement] = useState(false);
  const [traitementItem, setTraitementItem] = useState(null);
  const [traitementData, setTraitementData] = useState({
    actions_preventions: '',
    responsable_action: '',
    date_echeance_action: '',
    commentaire_traitement: '',
    status: 'A_TRAITER',
    severite_traitement: '',
    recurrence: ''
  });
  
  // Dialog de prévisualisation des pièces jointes
  const [openPreview, setOpenPreview] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewAttachments, setPreviewAttachments] = useState([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  
  // Fichiers pour upload direct à la création
  const [pendingFiles, setPendingFiles] = useState([]);
  
  // Utiliser le hook temps réel
  const { items, loading, wsConnected, refresh: loadItems } = usePresquAccident();
  
  const [filters, setFilters] = useState({
    service: 'all',
    status: 'all',
    priorite: 'all',
    periode: '24h',
    dateDebut: '',
    dateFin: '',
    search: ''
  });

  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    date_incident: new Date().toISOString().split('T')[0],
    lieu: '',
    service: 'AUTRE',
    categorie_incident: '',
    equipement_id: '',
    equipement_nom: '',
    declarant: '',
    personnes_impliquees: '',
    temoins: '',
    responsable_id: '',
    contexte_cause: '',
    mesures_immediates: '',
    severite: 'MOYEN',
    type_lesion_potentielle: '',
    facteurs_contributifs: [],
    conditions_incident: '',
    actions_proposees: ''
  });

  // AI Extraction state
  const [openExtract, setOpenExtract] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedItems, setExtractedItems] = useState([]);
  const [selectedExtracted, setSelectedExtracted] = useState([]);
  const [importing, setImporting] = useState(false);
  const extractFileRef = useRef(null);

  // === AI Extraction handlers ===
  const handleExtractFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setExtractedItems([]);
    setSelectedExtracted([]);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/presqu-accident/ai/extract`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd
      });
      if (res.ok) {
        const data = await res.json();
        setExtractedItems(data.items || []);
        setSelectedExtracted(data.items?.map((_, i) => i) || []);
        toast({ title: `${data.count} presqu'accidents extraits` });
      } else {
        const err = await res.json();
        toast({ title: 'Erreur extraction', description: err.detail, variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    }
    setExtracting(false);
    if (extractFileRef.current) extractFileRef.current.value = '';
  };

  const toggleExtractedItem = (index) => {
    setSelectedExtracted(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleImportExtracted = async () => {
    const toImport = selectedExtracted.map(i => extractedItems[i]).filter(Boolean);
    if (toImport.length === 0) return;
    setImporting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/presqu-accident/import-bulk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: toImport })
      });
      if (res.ok) {
        const data = await res.json();
        toast({
          title: `Import termine`,
          description: `${data.created} cree(s)${data.errors > 0 ? `, ${data.errors} erreur(s)` : ''}`,
          variant: data.errors > 0 ? 'destructive' : 'default'
        });
      } else {
        const err = await res.json();
        toast({ title: 'Erreur import', description: err.detail, variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    }
    setImporting(false);
    setOpenExtract(false);
    setExtractedItems([]);
    loadData();
  };

  useEffect(() => {
    loadData();
    loadUsers();
    loadServiceResponsables();
    loadEquipments();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [items, filters]);

  const loadData = async () => {
    try {
      const statsData = await presquAccidentAPI.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await usersAPI.getAll();
      setUsers(response.data || []);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  const loadServiceResponsables = async () => {
    try {
      const responsables = await rolesAPI.getServiceResponsables();
      setServiceResponsables(responsables || []);
    } catch (error) {
      console.error('Erreur chargement responsables de service:', error);
    }
  };

  const loadEquipments = async () => {
    try {
      const response = await equipmentsAPI.getAll();
      setEquipments(response.data || []);
    } catch (error) {
      console.error('Erreur chargement équipements:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...items];
    
    // Filtre par service
    if (filters.service && filters.service !== 'all') {
      filtered = filtered.filter(i => i.service === filters.service);
    }
    
    // Filtre par statut
    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(i => i.status === filters.status);
    }
    
    // Filtre par priorité calculée
    if (filters.priorite && filters.priorite !== 'all') {
      filtered = filtered.filter(i => i.priorite === filters.priorite);
    }
    
    // Filtre par période/date
    if (filters.periode && filters.periode !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      let dateDebut, dateFin;
      
      switch (filters.periode) {
        case '24h':
          // J-1 et J (hier et aujourd'hui)
          dateDebut = new Date(today);
          dateDebut.setDate(dateDebut.getDate() - 1);
          dateFin = new Date(today);
          dateFin.setDate(dateFin.getDate() + 1);
          break;
        case 'semaine':
          // Cette semaine (lundi à dimanche)
          const dayOfWeek = today.getDay();
          const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          dateDebut = new Date(today);
          dateDebut.setDate(today.getDate() - diffToMonday);
          dateFin = new Date(dateDebut);
          dateFin.setDate(dateDebut.getDate() + 7);
          break;
        case 'mois':
          // Ce mois
          dateDebut = new Date(today.getFullYear(), today.getMonth(), 1);
          dateFin = new Date(today.getFullYear(), today.getMonth() + 1, 1);
          break;
        case 'annee':
          // Cette année
          dateDebut = new Date(today.getFullYear(), 0, 1);
          dateFin = new Date(today.getFullYear() + 1, 0, 1);
          break;
        case 'personnalise':
          // Dates personnalisées
          if (filters.dateDebut) {
            dateDebut = new Date(filters.dateDebut);
          }
          if (filters.dateFin) {
            dateFin = new Date(filters.dateFin);
            dateFin.setDate(dateFin.getDate() + 1); // Inclure la date de fin
          }
          break;
        default:
          break;
      }
      
      if (dateDebut || dateFin) {
        filtered = filtered.filter(i => {
          const itemDate = new Date(i.date_incident);
          if (dateDebut && itemDate < dateDebut) return false;
          if (dateFin && itemDate >= dateFin) return false;
          return true;
        });
      }
    }
    
    // Filtre par recherche
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(i => 
        i.titre?.toLowerCase().includes(searchLower) ||
        i.description?.toLowerCase().includes(searchLower) ||
        i.numero?.toLowerCase().includes(searchLower)
      );
    }
    
    setFilteredItems(filtered);
  };

  const resetForm = () => {
    setSelectedItem(null);
    setFormData({
      titre: '',
      description: '',
      date_incident: new Date().toISOString().split('T')[0],
      lieu: '',
      service: 'AUTRE',
      categorie_incident: '',
      equipement_id: '',
      equipement_nom: '',
      declarant: '',
      personnes_impliquees: '',
      temoins: '',
      responsable_id: '',
      contexte_cause: '',
      mesures_immediates: '',
      severite: 'MOYEN',
      type_lesion_potentielle: '',
      facteurs_contributifs: [],
      conditions_incident: '',
      actions_proposees: ''
    });
    setPendingFiles([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedItem) {
        // Mise à jour (sans les champs de traitement)
        const updateData = {
          titre: formData.titre,
          description: formData.description,
          date_incident: formData.date_incident,
          lieu: formData.lieu,
          service: formData.service,
          categorie_incident: formData.categorie_incident || null,
          equipement_id: formData.equipement_id || null,
          equipement_nom: formData.equipement_nom || null,
          declarant: formData.declarant,
          personnes_impliquees: formData.personnes_impliquees,
          temoins: formData.temoins,
          responsable_id: formData.responsable_id,
          contexte_cause: formData.contexte_cause,
          mesures_immediates: formData.mesures_immediates,
          severite: formData.severite,
          type_lesion_potentielle: formData.type_lesion_potentielle || null,
          facteurs_contributifs: formData.facteurs_contributifs,
          conditions_incident: formData.conditions_incident,
          actions_proposees: formData.actions_proposees
        };
        await presquAccidentAPI.update(selectedItem.id, updateData);
        toast({ title: 'Succès', description: 'Presqu\'accident mis à jour' });
      } else {
        // Création
        const response = await presquAccidentAPI.create(formData);
        const newItemId = response.data?.id;
        
        // Upload des fichiers en attente
        if (pendingFiles.length > 0 && newItemId) {
          for (const file of pendingFiles) {
            try {
              await presquAccidentAPI.uploadAttachment(newItemId, file);
            } catch (uploadError) {
              console.error('Erreur upload fichier:', uploadError);
            }
          }
        }
        
        toast({ title: 'Succès', description: 'Presqu\'accident créé avec succès' });
      }
      setOpenForm(false);
      resetForm();
      loadItems();
      loadData();
    } catch (error) {
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.detail || 'Une erreur est survenue', 
        variant: 'destructive' 
      });
    }
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setFormData({
      titre: item.titre || '',
      description: item.description || '',
      date_incident: item.date_incident?.split('T')[0] || '',
      lieu: item.lieu || '',
      service: item.service || 'AUTRE',
      categorie_incident: item.categorie_incident || '',
      equipement_id: item.equipement_id || '',
      equipement_nom: item.equipement_nom || '',
      declarant: item.declarant || '',
      personnes_impliquees: item.personnes_impliquees || '',
      temoins: item.temoins || '',
      responsable_id: item.responsable_id || '',
      contexte_cause: item.contexte_cause || '',
      mesures_immediates: item.mesures_immediates || '',
      severite: item.severite || 'MOYEN',
      type_lesion_potentielle: item.type_lesion_potentielle || '',
      facteurs_contributifs: item.facteurs_contributifs || [],
      conditions_incident: item.conditions_incident || '',
      actions_proposees: item.actions_proposees || ''
    });
    setPendingFiles([]);
    setOpenForm(true);
  };

  const handleDelete = async (item) => {
    confirm({
      title: 'Supprimer le presqu\'accident',
      message: `Êtes-vous sûr de vouloir supprimer "${item.titre}" ?`,
      description: `Êtes-vous sûr de vouloir supprimer "${item.titre}" ?`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await presquAccidentAPI.delete(item.id);
          toast({ title: 'Succès', description: 'Presqu\'accident supprimé' });
          loadItems();
          loadData();
        } catch (error) {
          toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
        }
      }
    });
  };

  // Ouvrir le dialogue de traitement
  const handleOpenTraitement = (item) => {
    setTraitementItem(item);
    setTraitementData({
      actions_preventions: item.actions_preventions || '',
      responsable_action: item.responsable_action || '',
      date_echeance_action: item.date_echeance_action?.split('T')[0] || '',
      commentaire_traitement: item.commentaire_traitement || item.commentaire || '',
      status: item.status || 'A_TRAITER',
      severite_traitement: item.severite_traitement || '',
      recurrence: item.recurrence || ''
    });
    setOpenTraitement(true);
  };

  // Soumettre le traitement
  const handleSubmitTraitement = async () => {
    // Validation des champs obligatoires
    if (!traitementData.severite_traitement || !traitementData.recurrence) {
      toast({ 
        title: 'Erreur', 
        description: 'Veuillez sélectionner la sévérité et la récurrence', 
        variant: 'destructive' 
      });
      return;
    }
    
    try {
      await presquAccidentAPI.update(traitementItem.id, {
        ...traitementData,
        traite_le: new Date().toISOString()
      });
      toast({ title: 'Succès', description: 'Traitement enregistré' });
      setOpenTraitement(false);
      loadItems();
      loadData();
    } catch (error) {
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.detail || 'Une erreur est survenue', 
        variant: 'destructive' 
      });
    }
  };

  // Prévisualiser les pièces jointes
  const handlePreviewAttachments = async (item) => {
    setPreviewItem(item);
    try {
      const response = await presquAccidentAPI.getAttachments(item.id);
      setPreviewAttachments(response.data || []);
      setCurrentPreviewIndex(0);
      setOpenPreview(true);
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de charger les pièces jointes', variant: 'destructive' });
    }
  };

  // Vérifier si l'utilisateur peut modifier le traitement (responsable de service)
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const currentUserId = currentUser.id;
  const currentUserRole = currentUser.role;
  
  const canEditTraitement = () => {
    // Admin peut toujours modifier
    if (currentUserRole === 'ADMIN') return true;
    
    // Vérifier si l'utilisateur est un responsable de service (n'importe quel service)
    const isServiceResponsable = serviceResponsables.some(r => r.user_id === currentUserId);
    return isServiceResponsable;
  };

  // Calculer la priorité à partir de la sévérité et récurrence
  const calculatePriority = (severite, recurrence) => {
    if (!severite || !recurrence) return null;
    const score = parseInt(severite) * parseInt(recurrence);
    
    if (score >= 1 && score <= 4) {
      return { label: 'Faible', score, color: 'bg-green-100 text-green-800 border-green-300' };
    } else if (score >= 5 && score <= 8) {
      return { label: 'Moyenne', score, color: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
    } else if (score >= 9 && score <= 12) {
      return { label: 'Élevée', score, color: 'bg-orange-100 text-orange-800 border-orange-300' };
    } else if (score >= 13 && score <= 16) {
      return { label: 'Critique', score, color: 'bg-red-100 text-red-800 border-red-300' };
    }
    return null;
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      A_TRAITER: { label: 'À traiter', className: 'bg-red-100 text-red-800 border border-red-300' },
      EN_COURS: { label: 'En cours', className: 'bg-orange-100 text-orange-800 border border-orange-300' },
      TERMINE: { label: 'Terminé', className: 'bg-green-100 text-green-800 border border-green-300' },
      RISQUE_RESIDUEL: { label: 'Risque résiduel', className: 'bg-sky-100 text-sky-800 border border-sky-300' }
    };
    const config = statusConfig[status] || statusConfig.A_TRAITER;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>{config.label}</span>;
  };

  // Badge de priorité calculée (affiché seulement après validation du traitement)
  const getPriorityBadge = (item) => {
    // Afficher seulement si la priorité a été calculée (traitement validé)
    if (!item.priorite || !item.priorite_score) return null;
    
    const priorityConfig = {
      'Faible': { className: 'bg-green-100 text-green-800 border border-green-300' },
      'Moyenne': { className: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
      'Élevée': { className: 'bg-orange-100 text-orange-800 border border-orange-300' },
      'Critique': { className: 'bg-red-100 text-red-800 border border-red-300' }
    };
    
    const config = priorityConfig[item.priorite] || priorityConfig['Moyenne'];
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
        {item.priorite} ({item.priorite_score})
      </span>
    );
  };

  const getSeveriteBadge = (severite) => {
    const config = {
      FAIBLE: { label: 'Faible', className: 'bg-green-100 text-green-800' },
      MOYEN: { label: 'Moyen', className: 'bg-yellow-100 text-yellow-800' },
      ELEVE: { label: 'Élevé', className: 'bg-orange-100 text-orange-800' },
      CRITIQUE: { label: 'Critique', className: 'bg-red-100 text-red-800' }
    };
    const c = config[severite] || config.MOYEN;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.className}`}>{c.label}</span>;
  };

  const hasAttachments = (item) => {
    return (item.attachments && item.attachments.length > 0) || 
           (item.attachments_traitement && item.attachments_traitement.length > 0) ||
           item.piece_jointe_url;
  };

  // Gestion des fichiers en attente pour la création
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setPendingFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const handleCameraCapture = (e) => {
    const files = Array.from(e.target.files);
    setPendingFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const removePendingFile = (index) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6 p-6">
      <ConfirmDialog />
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Presqu'accidents</h1>
            {/* Indicateur de synchronisation temps réel */}
            <div 
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                wsConnected 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-amber-100 text-amber-700'
              }`}
              title={wsConnected ? 'Synchronisation temps réel active' : 'Mode polling (rafraîchissement automatique toutes les 10s)'}
            >
              {wsConnected ? (
                <>
                  <Wifi size={12} />
                  <span>Temps réel</span>
                </>
              ) : (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Sync auto</span>
                </>
              )}
            </div>
          </div>
          <p className="text-gray-500">Gestion et suivi des presqu'accidents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => importInputRef.current?.click()}>
            <Upload size={16} className="mr-2" />
            Importer
          </Button>
          <input
            type="file"
            ref={importInputRef}
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={async (e) => {
              const file = e.target.files[0];
              if (file) {
                try {
                  await presquAccidentAPI.import(file);
                  toast({ title: 'Succès', description: 'Import réussi' });
                  loadItems();
                  loadData();
                } catch (error) {
                  toast({ title: 'Erreur', description: 'Erreur lors de l\'import', variant: 'destructive' });
                }
              }
            }}
          />
          <Button variant="outline" onClick={async () => {
            try {
              const blob = await presquAccidentAPI.export();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'presqu_accidents.xlsx';
              a.click();
            } catch (error) {
              toast({ title: 'Erreur', description: 'Erreur lors de l\'export', variant: 'destructive' });
            }
          }}>
            <Download size={16} className="mr-2" />
            Exporter
          </Button>
          <Button onClick={() => { resetForm(); setOpenForm(true); }}>
            <Plus size={16} className="mr-2" />
            Nouveau
          </Button>
          <Button variant="outline" onClick={() => { setExtractedItems([]); setSelectedExtracted([]); setOpenExtract(true); }}
            data-testid="extraction-ia-btn" className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100">
            <Brain size={16} className="mr-2" />
            Extraction IA
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && stats.global && (
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.global.total || 0}</div>
              <div className="text-sm text-gray-500">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">{stats.global.a_traiter || 0}</div>
              <div className="text-sm text-gray-500">À traiter</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-yellow-600">{stats.global.en_cours || 0}</div>
              <div className="text-sm text-gray-500">En cours</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{stats.global.termine || 0}</div>
              <div className="text-sm text-gray-500">Terminés</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">{stats.global.risque_residuel || 0}</div>
              <div className="text-sm text-gray-500">Risque résiduel</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  placeholder="Rechercher par titre, description ou numéro..."
                  className="pl-10"
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                />
              </div>
            </div>
            
            {/* Filtre Période */}
            <Select value={filters.periode} onValueChange={(value) => setFilters({...filters, periode: value})}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les dates</SelectItem>
                <SelectItem value="24h">24H (J-1 et J)</SelectItem>
                <SelectItem value="semaine">Cette semaine</SelectItem>
                <SelectItem value="mois">Ce mois</SelectItem>
                <SelectItem value="annee">Cette année</SelectItem>
                <SelectItem value="personnalise">Date personnalisée</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Dates personnalisées */}
            {filters.periode === 'personnalise' && (
              <>
                <Input
                  type="date"
                  className="w-40"
                  value={filters.dateDebut}
                  onChange={(e) => setFilters({...filters, dateDebut: e.target.value})}
                  placeholder="Date début"
                />
                <Input
                  type="date"
                  className="w-40"
                  value={filters.dateFin}
                  onChange={(e) => setFilters({...filters, dateFin: e.target.value})}
                  placeholder="Date fin"
                />
              </>
            )}
            
            {/* Filtre Statut */}
            <Select value={filters.status} onValueChange={(value) => setFilters({...filters, status: value})}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="A_TRAITER">À traiter</SelectItem>
                <SelectItem value="EN_COURS">En cours</SelectItem>
                <SelectItem value="TERMINE">Terminé</SelectItem>
                <SelectItem value="RISQUE_RESIDUEL">Risque résiduel</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Filtre Service */}
            <Select value={filters.service} onValueChange={(value) => setFilters({...filters, service: value})}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous services</SelectItem>
                <SelectItem value="ADV">ADV</SelectItem>
                <SelectItem value="LOGISTIQUE">Logistique</SelectItem>
                <SelectItem value="PRODUCTION">Production</SelectItem>
                <SelectItem value="QHSE">QHSE</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="LABO">Labo</SelectItem>
                <SelectItem value="INDUS">Indus</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Filtre Priorité */}
            <Select value={filters.priorite} onValueChange={(value) => setFilters({...filters, priorite: value})}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes priorités</SelectItem>
                <SelectItem value="Faible">Faible</SelectItem>
                <SelectItem value="Moyenne">Moyenne</SelectItem>
                <SelectItem value="Élevée">Élevée</SelectItem>
                <SelectItem value="Critique">Critique</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Bouton Réinitialiser */}
            {(filters.search || filters.status !== 'all' || filters.service !== 'all' || filters.priorite !== 'all' || filters.periode !== '24h') && (
              <Button variant="ghost" size="sm" onClick={() => setFilters({ 
                service: 'all', 
                status: 'all', 
                priorite: 'all', 
                periode: '24h',
                dateDebut: '',
                dateFin: '',
                search: '' 
              })}>
                <X size={16} className="mr-1" />
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle size={20} />
            Liste des presqu'accidents ({filteredItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Chargement...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Aucun presqu'accident trouvé</div>
            ) : (
              filteredItems.map((item) => (
                <div key={item.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      {/* Numéro/ID à gauche */}
                      <div className="bg-gray-100 px-3 py-2 rounded-lg text-center min-w-[80px]">
                        <div className="text-xs text-gray-500">N°</div>
                        <div className="font-bold text-sm">{item.numero || '-'}</div>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{item.titre}</h3>
                          {getStatusBadge(item.status)}
                          {getPriorityBadge(item)}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>📅 {new Date(item.date_incident).toLocaleDateString('fr-FR')}</span>
                          <span>📍 {item.lieu}</span>
                          <span>🏢 {item.service}</span>
                          {item.categorie_incident && <Badge variant="outline" className="text-[10px]">{item.categorie_incident.replace(/_/g, ' ')}</Badge>}
                          {item.equipement_nom && <span>⚙️ {item.equipement_nom}</span>}
                          {item.declarant && <span>👤 {item.declarant}</span>}
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions à droite */}
                    <div className="flex items-center gap-1">
                      {/* Icône Trombone pour pièces jointes */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={hasAttachments(item) ? "text-blue-600 hover:text-blue-700" : "text-gray-300 cursor-default"}
                        onClick={() => hasAttachments(item) && handlePreviewAttachments(item)}
                        disabled={!hasAttachments(item)}
                        title={hasAttachments(item) ? "Voir les pièces jointes" : "Aucune pièce jointe"}
                      >
                        <Paperclip size={18} />
                      </Button>
                      
                      {/* Bouton Traitement (ClipboardCheck) */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        onClick={() => handleOpenTraitement(item)}
                        title={canEditTraitement() ? "Traiter le presqu'accident" : "Voir le traitement"}
                      >
                        <ClipboardCheck size={18} />
                      </Button>
                      
                      {/* Modifier */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => handleEdit(item)}
                        title="Modifier"
                      >
                        <Edit size={18} />
                      </Button>
                      
                      {/* Supprimer */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(item)}
                        title="Supprimer"
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog Création/Modification */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedItem ? 'Modifier' : 'Nouveau'} Presqu'accident</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Section 1 : Identification */}
            <fieldset className="border rounded-lg p-4 space-y-3">
              <legend className="text-sm font-semibold text-gray-700 px-2">Identification</legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Titre de l'incident *</Label>
                  <Input
                    data-testid="pa-titre"
                    value={formData.titre}
                    onChange={(e) => setFormData({...formData, titre: e.target.value})}
                    placeholder="Ex: Risque de chute depuis la plateforme"
                    required
                  />
                </div>
                <div>
                  <Label>Date de l'incident *</Label>
                  <Input
                    type="date"
                    data-testid="pa-date"
                    value={formData.date_incident}
                    onChange={(e) => setFormData({...formData, date_incident: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Lieu *</Label>
                  <Input
                    data-testid="pa-lieu"
                    value={formData.lieu}
                    onChange={(e) => setFormData({...formData, lieu: e.target.value})}
                    placeholder="Ex: Atelier B2, Zone de stockage"
                    required
                  />
                </div>
                <div>
                  <Label>Service *</Label>
                  <Select value={formData.service} onValueChange={(value) => setFormData({...formData, service: value})}>
                    <SelectTrigger data-testid="pa-service">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADV">ADV</SelectItem>
                      <SelectItem value="LOGISTIQUE">Logistique</SelectItem>
                      <SelectItem value="PRODUCTION">Production</SelectItem>
                      <SelectItem value="QHSE">QHSE</SelectItem>
                      <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                      <SelectItem value="LABO">Labo</SelectItem>
                      <SelectItem value="INDUS">Indus</SelectItem>
                      <SelectItem value="AUTRE">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type d'incident</Label>
                  <Select value={formData.categorie_incident} onValueChange={(value) => setFormData({...formData, categorie_incident: value})}>
                    <SelectTrigger data-testid="pa-categorie">
                      <SelectValue placeholder="Sélectionner..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CHUTE_PERSONNE">Chute de personne</SelectItem>
                      <SelectItem value="CHUTE_OBJET">Chute d'objet</SelectItem>
                      <SelectItem value="BRULURE">Brulure</SelectItem>
                      <SelectItem value="COINCEMENT">Coincement / Ecrasement</SelectItem>
                      <SelectItem value="COUPURE">Coupure</SelectItem>
                      <SelectItem value="COLLISION">Collision / Heurt</SelectItem>
                      <SelectItem value="EXPOSITION_CHIMIQUE">Exposition chimique</SelectItem>
                      <SelectItem value="ELECTRIQUE">Risque electrique</SelectItem>
                      <SelectItem value="ERGONOMIQUE">Ergonomique / TMS</SelectItem>
                      <SelectItem value="PROJECTION">Projection</SelectItem>
                      <SelectItem value="INCENDIE_EXPLOSION">Incendie / Explosion</SelectItem>
                      <SelectItem value="AUTRE">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </fieldset>

            {/* Section 2 : Description de l'incident */}
            <fieldset className="border rounded-lg p-4 space-y-3">
              <legend className="text-sm font-semibold text-gray-700 px-2">Description de l'incident</legend>
              <div>
                <Label>Que s'est-il passe ? *</Label>
                <Textarea
                  data-testid="pa-description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={3}
                  placeholder="Decrivez les circonstances de l'incident..."
                  required
                />
              </div>
              <div>
                <Label>Contexte / Cause probable</Label>
                <Textarea
                  data-testid="pa-contexte"
                  value={formData.contexte_cause}
                  onChange={(e) => setFormData({...formData, contexte_cause: e.target.value})}
                  rows={2}
                  placeholder="Pourquoi est-ce arrive ? Quelles conditions ?"
                />
              </div>
              <div>
                <Label>Mesures immediates prises</Label>
                <Textarea
                  data-testid="pa-mesures-immediates"
                  value={formData.mesures_immediates}
                  onChange={(e) => setFormData({...formData, mesures_immediates: e.target.value})}
                  rows={2}
                  placeholder="Qu'avez-vous fait sur le moment pour securiser la zone ?"
                />
              </div>

              {/* Detection IA d'incidents similaires */}
              {!selectedItem && (
                <AISimilarIncidents
                  titre={formData.titre}
                  description={formData.description}
                  lieu={formData.lieu}
                  service={formData.service}
                  categorie_incident={formData.categorie_incident}
                />
              )}
            </fieldset>

            {/* Section 3 : Personnes concernees */}
            <fieldset className="border rounded-lg p-4 space-y-3">
              <legend className="text-sm font-semibold text-gray-700 px-2">Personnes concernees</legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Declarant</Label>
                  <Input
                    data-testid="pa-declarant"
                    value={formData.declarant}
                    onChange={(e) => setFormData({...formData, declarant: e.target.value})}
                    placeholder="Qui declare l'incident ?"
                  />
                </div>
                <div>
                  <Label>Personnes impliquees</Label>
                  <Input
                    data-testid="pa-personnes"
                    value={formData.personnes_impliquees}
                    onChange={(e) => setFormData({...formData, personnes_impliquees: e.target.value})}
                    placeholder="Noms separes par des virgules"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Temoins</Label>
                  <Input
                    data-testid="pa-temoins"
                    value={formData.temoins}
                    onChange={(e) => setFormData({...formData, temoins: e.target.value})}
                    placeholder="Noms des personnes ayant assiste a l'incident"
                  />
                </div>
              </div>
            </fieldset>

            {/* Section 4 : Evaluation du risque */}
            <fieldset className="border rounded-lg p-4 space-y-3">
              <legend className="text-sm font-semibold text-gray-700 px-2">Evaluation du risque</legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Gravite estimee</Label>
                  <Select value={formData.severite} onValueChange={(value) => setFormData({...formData, severite: value})}>
                    <SelectTrigger data-testid="pa-severite">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FAIBLE">Faible - Pas de blessure probable</SelectItem>
                      <SelectItem value="MOYEN">Moyen - Blessure legere possible</SelectItem>
                      <SelectItem value="ELEVE">Eleve - Blessure grave possible</SelectItem>
                      <SelectItem value="CRITIQUE">Critique - Risque vital</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type de lesion potentielle</Label>
                  <Select value={formData.type_lesion_potentielle} onValueChange={(value) => setFormData({...formData, type_lesion_potentielle: value})}>
                    <SelectTrigger data-testid="pa-lesion">
                      <SelectValue placeholder="Qu'aurait-il pu se passer ?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FRACTURE">Fracture</SelectItem>
                      <SelectItem value="BRULURE">Brulure</SelectItem>
                      <SelectItem value="COUPURE">Coupure</SelectItem>
                      <SelectItem value="CONTUSION">Contusion / Hematome</SelectItem>
                      <SelectItem value="ENTORSE">Entorse / Foulure</SelectItem>
                      <SelectItem value="INTOXICATION">Intoxication</SelectItem>
                      <SelectItem value="IRRITATION">Irritation (peau, yeux)</SelectItem>
                      <SelectItem value="ELECTRISATION">Electrisation</SelectItem>
                      <SelectItem value="ECRASEMENT">Ecrasement</SelectItem>
                      <SelectItem value="DOULEUR_MUSCULAIRE">Douleur musculaire / TMS</SelectItem>
                      <SelectItem value="AUCUNE">Aucune lesion probable</SelectItem>
                      <SelectItem value="AUTRE">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Facteurs contributifs</Label>
                  <div className="flex flex-wrap gap-2 mt-1" data-testid="pa-facteurs">
                    {[
                      { value: 'HUMAIN', label: 'Facteur humain', desc: 'Fatigue, inattention, formation...' },
                      { value: 'MATERIEL', label: 'Facteur materiel', desc: 'Equipement defaillant, EPI...' },
                      { value: 'ORGANISATIONNEL', label: 'Facteur organisationnel', desc: 'Procedure, planification...' },
                      { value: 'ENVIRONNEMENTAL', label: 'Facteur environnemental', desc: 'Eclairage, bruit, sol...' }
                    ].map(f => {
                      const isSelected = formData.facteurs_contributifs.includes(f.value);
                      return (
                        <button
                          key={f.value}
                          type="button"
                          title={f.desc}
                          className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            isSelected
                              ? 'bg-blue-100 border-blue-400 text-blue-800 font-medium'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              facteurs_contributifs: isSelected
                                ? prev.facteurs_contributifs.filter(v => v !== f.value)
                                : [...prev.facteurs_contributifs, f.value]
                            }));
                          }}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Cliquez pour selectionner un ou plusieurs facteurs</p>
                </div>
                <div className="col-span-2">
                  <Label>Conditions au moment de l'incident</Label>
                  <Input
                    data-testid="pa-conditions"
                    value={formData.conditions_incident}
                    onChange={(e) => setFormData({...formData, conditions_incident: e.target.value})}
                    placeholder="Ex: Poste de nuit, sol mouille, forte chaleur, charge de travail elevee..."
                  />
                </div>
              </div>
            </fieldset>

            {/* Section 5 : Equipement concerne */}
            <fieldset className="border rounded-lg p-4 space-y-3">
              <legend className="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
                <Wrench size={14} />
                Equipement concerne
              </legend>
              <div>
                <Label>Equipement lie (optionnel)</Label>
                <Select
                  value={formData.equipement_id}
                  onValueChange={(value) => {
                    const eq = equipments.find(e => (e.id || e._id) === value);
                    setFormData({
                      ...formData,
                      equipement_id: value,
                      equipement_nom: eq?.nom || ''
                    });
                  }}
                >
                  <SelectTrigger data-testid="pa-equipement">
                    <SelectValue placeholder="Aucun equipement selectionne" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {equipments.map(eq => (
                      <SelectItem key={eq.id || eq._id} value={eq.id || eq._id}>
                        {eq.nom} {eq.categorie ? `(${eq.categorie})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Associez un equipement de la FSAO si l'incident est lie a une machine ou installation</p>
              </div>
            </fieldset>

            {/* Section 6 : Actions proposees */}
            <fieldset className="border rounded-lg p-4 space-y-3">
              <legend className="text-sm font-semibold text-gray-700 px-2">Actions proposees</legend>
              <div>
                <Label>Quelles actions suggerez-vous ?</Label>
                <Textarea
                  data-testid="pa-actions"
                  value={formData.actions_proposees}
                  onChange={(e) => setFormData({...formData, actions_proposees: e.target.value})}
                  rows={2}
                  placeholder="Proposez des actions pour eviter que cela se reproduise..."
                />
              </div>
            </fieldset>

            {/* Section 7 : Pieces jointes */}
            <fieldset className="border rounded-lg p-4 space-y-3">
              <legend className="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
                <Paperclip size={14} />
                Pieces jointes
              </legend>
              {selectedItem ? (
                <div className="space-y-4">
                  <AttachmentUploader
                    itemId={selectedItem?.id}
                    uploadFunction={presquAccidentAPI.uploadAttachment}
                    onUploadComplete={() => {
                      setAttachmentRefresh(prev => prev + 1);
                      loadItems();
                    }}
                    entityLabel="le presqu'accident"
                  />
                  <AttachmentsList
                    itemId={selectedItem?.id}
                    getAttachmentsFunction={presquAccidentAPI.getAttachments}
                    downloadFunction={presquAccidentAPI.downloadAttachment}
                    deleteFunction={presquAccidentAPI.deleteAttachment}
                    refreshTrigger={attachmentRefresh}
                    canDelete={true}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Boutons Camera + Fichier */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => createCameraInputRef.current?.click()}
                      className="gap-2"
                      data-testid="create-camera-btn"
                    >
                      <Camera size={16} />
                      Photo
                    </Button>
                    <input
                      ref={createCameraInputRef}
                      type="file"
                      accept="image/*,video/*"
                      capture="environment"
                      multiple
                      onChange={handleCameraCapture}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => createFileInputRef.current?.click()}
                      className="gap-2"
                      data-testid="create-file-btn"
                    >
                      <Plus size={16} />
                      Fichier
                    </Button>
                    <input
                      ref={createFileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                  <p className="text-xs text-gray-500">Photos, documents... pour illustrer l'incident</p>

                  {/* Grille de preview des fichiers en attente */}
                  {pendingFiles.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm">Fichiers selectionnes ({pendingFiles.length}) :</Label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {pendingFiles.map((file, index) => {
                          const isImage = file.type.startsWith('image/');
                          const isVideo = file.type.startsWith('video/');
                          return (
                            <div
                              key={index}
                              className="relative group aspect-square rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-50"
                              data-testid={`pending-file-${index}`}
                            >
                              {isImage ? (
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt={file.name}
                                  className="w-full h-full object-cover"
                                  onLoad={(e) => URL.revokeObjectURL(e.target.src)}
                                />
                              ) : isVideo ? (
                                <div className="flex flex-col items-center justify-center h-full bg-purple-50">
                                  <Eye size={20} className="text-purple-500" />
                                  <span className="text-[10px] text-purple-600 font-semibold mt-1">Video</span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center h-full">
                                  <Paperclip size={20} className="text-gray-400" />
                                  <span className="text-[10px] text-gray-500 mt-1 px-1 truncate max-w-full">
                                    {file.name.split('.').pop()?.toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate">
                                {file.name}
                              </div>
                              <button
                                type="button"
                                onClick={() => removePendingFile(index)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`remove-pending-${index}`}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </fieldset>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>
                Annuler
              </Button>
              <Button type="submit" data-testid="submit-presqu-accident-btn">
                {selectedItem ? 'Mettre a jour' : 'Declarer l\'incident'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Traitement/Réponse */}
      <Dialog open={openTraitement} onOpenChange={setOpenTraitement}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck size={20} className="text-purple-600" />
              Traitement du presqu'accident
            </DialogTitle>
          </DialogHeader>
          
          {traitementItem && (
            <div className="space-y-4">
              {/* Résumé de l'incident */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{traitementItem.numero}</span>
                    <span className="text-gray-600">-</span>
                    <span>{traitementItem.titre}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-purple-300 text-purple-700 hover:bg-purple-50"
                    data-testid="open-rca-btn"
                    onClick={() => { setRcaItem(traitementItem); setOpenRCA(true); }}
                  >
                    <Brain size={14} className="mr-1" /> Analyser avec IA
                  </Button>
                </div>
                <p className="text-sm text-gray-600">{traitementItem.description}</p>
              </div>

              {/* Formulaire de traitement */}
              <div className="space-y-4">
                {/* Évaluation des risques */}
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <h4 className="font-medium text-gray-900 mb-4">Évaluation des risques</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Sévérité *</Label>
                      <Select 
                        value={traitementData.severite_traitement} 
                        onValueChange={(value) => setTraitementData({...traitementData, severite_traitement: value})}
                        disabled={!canEditTraitement()}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1: Mineur</SelectItem>
                          <SelectItem value="2">2: Modéré</SelectItem>
                          <SelectItem value="3">3: Grave</SelectItem>
                          <SelectItem value="4">4: Très grave</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Récurrence *</Label>
                      <Select 
                        value={traitementData.recurrence} 
                        onValueChange={(value) => setTraitementData({...traitementData, recurrence: value})}
                        disabled={!canEditTraitement()}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1: Très rare</SelectItem>
                          <SelectItem value="2">2: Rare</SelectItem>
                          <SelectItem value="3">3: Fréquent</SelectItem>
                          <SelectItem value="4">4: Très fréquent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priorité (calculée)</Label>
                      {(() => {
                        const priority = calculatePriority(traitementData.severite_traitement, traitementData.recurrence);
                        if (priority) {
                          return (
                            <div className={`mt-2 px-4 py-2 rounded-lg border-2 text-center font-semibold ${priority.color}`}>
                              {priority.label} ({priority.score})
                            </div>
                          );
                        }
                        return (
                          <div className="mt-2 px-4 py-2 rounded-lg border-2 border-gray-200 bg-gray-100 text-gray-500 text-center">
                            --
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Statut *</Label>
                  <Select 
                    value={traitementData.status} 
                    onValueChange={(value) => setTraitementData({...traitementData, status: value})}
                    disabled={!canEditTraitement()}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A_TRAITER">À traiter</SelectItem>
                      <SelectItem value="EN_COURS">En cours</SelectItem>
                      <SelectItem value="TERMINE">Terminé</SelectItem>
                      <SelectItem value="RISQUE_RESIDUEL">Risque résiduel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Actions de prévention</Label>
                  <Textarea 
                    value={traitementData.actions_preventions} 
                    onChange={(e) => setTraitementData({...traitementData, actions_preventions: e.target.value})}
                    rows={3}
                    disabled={!canEditTraitement()}
                    placeholder="Décrivez les actions de prévention mises en place..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Responsable de l'action</Label>
                    <Input 
                      value={traitementData.responsable_action} 
                      onChange={(e) => setTraitementData({...traitementData, responsable_action: e.target.value})}
                      disabled={!canEditTraitement()}
                    />
                  </div>
                  <div>
                    <Label>Date d'échéance</Label>
                    <Input 
                      type="date"
                      value={traitementData.date_echeance_action} 
                      onChange={(e) => setTraitementData({...traitementData, date_echeance_action: e.target.value})}
                      disabled={!canEditTraitement()}
                    />
                  </div>
                </div>

                <div>
                  <Label>Commentaire</Label>
                  <Textarea 
                    value={traitementData.commentaire_traitement} 
                    onChange={(e) => setTraitementData({...traitementData, commentaire_traitement: e.target.value})}
                    rows={2}
                    disabled={!canEditTraitement()}
                  />
                </div>

                {/* Pièces jointes du traitement */}
                <div className="pt-4 border-t">
                  <Label className="flex items-center gap-2 mb-3">
                    <Paperclip size={16} />
                    Pièces jointes du traitement
                  </Label>
                  
                  {canEditTraitement() ? (
                    <div className="space-y-4">
                      <AttachmentUploader
                        itemId={traitementItem?.id}
                        uploadFunction={presquAccidentAPI.uploadAttachment}
                        onUploadComplete={() => {
                          setAttachmentRefresh(prev => prev + 1);
                          loadItems();
                        }}
                        entityLabel="le traitement"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Seuls les responsables de service peuvent ajouter des pièces jointes
                    </p>
                  )}
                  
                  <AttachmentsList
                    itemId={traitementItem?.id}
                    getAttachmentsFunction={presquAccidentAPI.getAttachments}
                    downloadFunction={presquAccidentAPI.downloadAttachment}
                    deleteFunction={presquAccidentAPI.deleteAttachment}
                    refreshTrigger={attachmentRefresh}
                    canDelete={canEditTraitement()}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenTraitement(false)}>
                  {canEditTraitement() ? 'Annuler' : 'Fermer'}
                </Button>
                {canEditTraitement() && (
                  <Button onClick={handleSubmitTraitement}>
                    Valider le traitement
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Prévisualisation des pièces jointes */}
      <Dialog open={openPreview} onOpenChange={setOpenPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip size={20} />
              Pièces jointes - {previewItem?.numero}
            </DialogTitle>
          </DialogHeader>
          
          {previewAttachments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Aucune pièce jointe
            </div>
          ) : (
            <div className="space-y-4">
              {/* Navigation */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {currentPreviewIndex + 1} / {previewAttachments.length}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPreviewIndex === 0}
                    onClick={() => setCurrentPreviewIndex(prev => prev - 1)}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPreviewIndex === previewAttachments.length - 1}
                    onClick={() => setCurrentPreviewIndex(prev => prev + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
              
              {/* Prévisualisation */}
              <div className="border rounded-lg p-4 min-h-[400px] flex items-center justify-center bg-gray-50">
                {previewAttachments[currentPreviewIndex] && (() => {
                  const att = previewAttachments[currentPreviewIndex];
                  const isImage = att.content_type?.startsWith('image/') || 
                                  /\.(jpg|jpeg|png|gif|webp)$/i.test(att.filename);
                  const isPdf = att.content_type === 'application/pdf' || 
                                /\.pdf$/i.test(att.filename);
                  
                  const fileUrl = `${process.env.REACT_APP_BACKEND_URL || ''}/api/presqu-accident/items/${previewItem?.id}/attachments/${att.id}/download`;
                  
                  if (isImage) {
                    return (
                      <img 
                        src={fileUrl} 
                        alt={att.filename}
                        className="max-h-[500px] max-w-full object-contain"
                      />
                    );
                  } else if (isPdf) {
                    return (
                      <iframe
                        src={fileUrl}
                        className="w-full h-[500px]"
                        title={att.filename}
                      />
                    );
                  } else {
                    return (
                      <div className="text-center">
                        <Paperclip size={48} className="mx-auto text-gray-400 mb-4" />
                        <p className="font-medium">{att.filename}</p>
                        <p className="text-sm text-gray-500 mb-4">
                          Ce type de fichier ne peut pas être prévisualisé
                        </p>
                        <Button asChild>
                          <a href={fileUrl} download={att.filename}>
                            <Download size={16} className="mr-2" />
                            Télécharger
                          </a>
                        </Button>
                      </div>
                    );
                  }
                })()}
              </div>
              
              {/* Nom du fichier */}
              <div className="text-center text-sm text-gray-600">
                {previewAttachments[currentPreviewIndex]?.filename}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog IA Analyse Causes Racines */}
      <AIRootCauseAnalyzer
        item={rcaItem}
        open={openRCA}
        onClose={() => { setOpenRCA(false); setRcaItem(null); }}
        onApplyEvaluation={(sev, rec) => {
          setTraitementData(prev => ({
            ...prev,
            severite_traitement: sev,
            recurrence: rec
          }));
          setOpenRCA(false);
          toast({ title: "Evaluation appliquee", description: `Severite: ${sev}, Recurrence: ${rec}` });
        }}
      />

      {/* Dialog Extraction IA */}
      <Dialog open={openExtract} onOpenChange={setOpenExtract}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              Extraction IA - Presqu'accidents
            </DialogTitle>
          </DialogHeader>

          {extractedItems.length === 0 ? (
            <div className="space-y-4 py-4">
              <p className="text-sm text-gray-600">
                Importez un fichier contenant des presqu'accidents.
                L'IA analysera le fichier et extraira automatiquement les donnees.
              </p>
              <div className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-purple-200 rounded-lg bg-purple-50/50">
                <FileSpreadsheet className="w-12 h-12 text-purple-400" />
                <input
                  type="file"
                  ref={extractFileRef}
                  accept=".xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleExtractFile}
                  className="hidden"
                  data-testid="extract-file-input"
                />
                <Button
                  onClick={() => extractFileRef.current?.click()}
                  disabled={extracting}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="select-extract-file-btn"
                >
                  {extracting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyse en cours...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> Choisir un fichier</>
                  )}
                </Button>
                <span className="text-xs text-gray-400">Excel (.xls, .xlsx), PDF, Images (png, jpg)</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-purple-700">{extractedItems.length}</span> presqu'accident(s) trouves.
                  <span className="ml-2 text-gray-500">{selectedExtracted.length} selectionne(s)</span>
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="text-xs"
                    onClick={() => setSelectedExtracted(extractedItems.map((_, i) => i))}>
                    Tout selectionner
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs"
                    onClick={() => setSelectedExtracted([])}>
                    Tout deselectionner
                  </Button>
                </div>
              </div>

              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                {extractedItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedExtracted.includes(idx)
                        ? 'bg-purple-50 border-purple-300'
                        : 'bg-gray-50 border-gray-200 opacity-60'
                    }`}
                    onClick={() => toggleExtractedItem(idx)}
                    data-testid={`extracted-item-${idx}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedExtracted.includes(idx)}
                        onChange={() => toggleExtractedItem(idx)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{item.titre}</div>
                        <div className="text-xs text-gray-500 flex flex-wrap gap-2 mt-1">
                          {item.date_incident && <span>{item.date_incident}</span>}
                          {item.lieu && <span>Lieu: {item.lieu}</span>}
                          {item.service && <Badge variant="outline" className="text-xs py-0">{item.service}</Badge>}
                          {item.personnes_impliquees && <span>Personnes: {item.personnes_impliquees}</span>}
                          {item.status && item.status !== 'A_TRAITER' && <Badge variant="secondary" className="text-xs py-0">{item.status}</Badge>}
                        </div>
                        {item.description && (
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.description}</p>
                        )}
                        {(item.conditions_incident || item.mesures_immediates || item.actions_proposees) && (
                          <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3">
                            {item.conditions_incident && <span>Conditions: {item.conditions_incident}</span>}
                            {item.mesures_immediates && <span>Mesures: {item.mesures_immediates.substring(0, 80)}{item.mesures_immediates.length > 80 ? '...' : ''}</span>}
                            {item.actions_proposees && <span>Actions: {item.actions_proposees.substring(0, 80)}{item.actions_proposees.length > 80 ? '...' : ''}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter className="flex gap-2 pt-3">
                <Button variant="outline" onClick={() => { setExtractedItems([]); }} data-testid="extract-new-file-btn">
                  <Upload className="w-4 h-4 mr-2" /> Autre fichier
                </Button>
                <Button
                  onClick={handleImportExtracted}
                  disabled={importing || selectedExtracted.length === 0}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="import-extracted-btn"
                >
                  {importing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Import en cours...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" /> Importer {selectedExtracted.length} presqu'accident(s)</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PresquAccidentList;
