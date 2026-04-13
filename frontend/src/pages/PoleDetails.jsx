import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import {
  ArrowLeft, Plus, Upload, FileText, Download, Trash2, Edit, File,
  FileSpreadsheet, FileImage, FileVideo, Printer, Eye, Shield, 
  ChevronDown, ChevronRight, Search, FolderOpen, ClipboardList
} from 'lucide-react';
import { documentationsAPI, autorisationsAPI, rolesAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { formatErrorMessage } from '../utils/errorFormatter';
import api from '../services/api';
import CustomFormFiller from '../components/CustomFormFiller';
import BonDeTravailPrintDialog from '../components/BonDeTravailPrintDialog';

const FILE_ICONS = {
  'application/pdf': FileText,
  'application/msword': FileText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
  'application/vnd.ms-excel': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
  'image/': FileImage,
  'video/': FileVideo
};

function PoleDetails() {
  const { poleId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const fileInputRef = useRef(null);

  const [pole, setPole] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [bonsTravail, setBonsTravail] = useState([]);
  const [autorisations, setAutorisations] = useState([]);
  const [customForms, setCustomForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [serviceResponsables, setServiceResponsables] = useState([]);
  
  // États pour l'arborescence
  const [expandedSections, setExpandedSections] = useState({
    documents: false,
    bons_travail: false,
    autorisations: false,
    custom_forms: false
  });
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog pour ajouter un formulaire
  const [openFormDialog, setOpenFormDialog] = useState(false);
  const [formTemplates, setFormTemplates] = useState([]);
  const [selectedFormType, setSelectedFormType] = useState('');
  
  // Dialog pour formulaire personnalisé
  const [showCustomFormFiller, setShowCustomFormFiller] = useState(false);
  const [selectedCustomTemplate, setSelectedCustomTemplate] = useState(null);
  const [editingCustomForm, setEditingCustomForm] = useState(null);
  
  // Dialog Bon de Travail MAINT/FE/004 V2
  const [showBonTravailDialog, setShowBonTravailDialog] = useState(false);
  const [editBonData, setEditBonData] = useState(null);
  
  // Dialog pour ajouter un document
  const [openDocDialog, setOpenDocDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docFormData, setDocFormData] = useState({
    titre: '',
    description: ''
  });
  const [selectedFile, setSelectedFile] = useState(null);

  // Charger l'utilisateur actuel
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [poleId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [poleData, documentsData, bonsTravailData, autorisationsData, responsablesData, customFormsData] = await Promise.all([
        documentationsAPI.getPole(poleId),
        documentationsAPI.getDocuments({ pole_id: poleId }),
        documentationsAPI.getBonsTravail({ pole_id: poleId }),
        autorisationsAPI.getAll(poleId).catch(() => []),
        rolesAPI.getServiceResponsables().catch(() => []),
        api.get(`/documentations/custom-forms?pole_id=${poleId}`).then(r => r.data).catch(() => [])
      ]);
      setPole(poleData);
      setDocuments(documentsData);
      setBonsTravail(bonsTravailData);
      setAutorisations(autorisationsData);
      setServiceResponsables(responsablesData);
      setCustomForms(customFormsData);
      
      // Charger les templates de formulaires
      try {
        const templatesRes = await api.get('/documentations/form-templates');
        setFormTemplates(templatesRes.data || []);
      } catch {
        // Templates par défaut si l'API n'existe pas
        setFormTemplates([
          { id: 'default-bon-travail', nom: 'Bon de travail', type: 'BON_TRAVAIL' },
          { id: 'default-autorisation', nom: 'Autorisation particulière', type: 'AUTORISATION' }
        ]);
      }
    } catch (error) {
      console.error('Erreur chargement:', error);
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Erreur lors du chargement'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Vérifier si l'utilisateur peut modifier un formulaire
  const canEdit = (item) => {
    if (!currentUser) return false;
    // Admin peut tout modifier
    if (currentUser.role === 'ADMIN') return true;
    // Créateur peut modifier
    if (item.created_by === currentUser.id) return true;
    // Responsable de service peut modifier
    const poleService = pole?.pole;
    const responsable = serviceResponsables.find(r => r.service === poleService);
    if (responsable && responsable.user_id === currentUser.id) return true;
    return false;
  };

  const isAdmin = () => currentUser?.role === 'ADMIN';

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Filtrer les éléments selon la recherche
  const filteredDocuments = useMemo(() => {
    if (!searchTerm) return documents;
    return documents.filter(d => 
      d.titre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.fichier_nom?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [documents, searchTerm]);

  const filteredBons = useMemo(() => {
    if (!searchTerm) return bonsTravail;
    return bonsTravail.filter(b => 
      b.titre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.entreprise?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [bonsTravail, searchTerm]);

  const filteredAutorisations = useMemo(() => {
    if (!searchTerm) return autorisations;
    return autorisations.filter(a => 
      a.titre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.numero?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [autorisations, searchTerm]);

  const filteredCustomForms = useMemo(() => {
    if (!searchTerm) return customForms;
    return customForms.filter(f => 
      f.titre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.template_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [customForms, searchTerm]);

  // Grouper les formulaires personnalisés par template
  const groupedCustomForms = useMemo(() => {
    const grouped = {};
    filteredCustomForms.forEach(form => {
      const templateId = form.template_id;
      if (!grouped[templateId]) {
        grouped[templateId] = {
          templateId,
          templateName: form.template_name || 'Formulaire personnalisé',
          forms: []
        };
      }
      grouped[templateId].forms.push(form);
    });
    return Object.values(grouped);
  }, [filteredCustomForms]);

  // Handlers pour les formulaires
  const handleAddForm = () => {
    setSelectedFormType('');
    setOpenFormDialog(true);
  };

  const handleSelectFormType = () => {
    if (!selectedFormType) {
      toast({
        title: 'Attention',
        description: 'Veuillez sélectionner un type de formulaire',
        variant: 'destructive'
      });
      return;
    }
    
    setOpenFormDialog(false);
    
    // Vérifier si c'est un template personnalisé
    const template = formTemplates.find(t => t.id === selectedFormType);
    
    if (template && template.type === 'CUSTOM') {
      // Ouvrir le CustomFormFiller
      setSelectedCustomTemplate(template);
      setEditingCustomForm(null);
      setShowCustomFormFiller(true);
    } else if (selectedFormType === 'BON_TRAVAIL' || template?.type === 'BON_TRAVAIL') {
      setEditBonData(null);
      setShowBonTravailDialog(true);
    } else if (selectedFormType === 'AUTORISATION' || template?.type === 'AUTORISATION') {
      navigate('/autorisations-particulieres/new', { state: { fromPoleId: poleId } });
    }
  };

  const handleEditCustomForm = async (form) => {
    // Trouver le template
    const template = formTemplates.find(t => t.id === form.template_id);
    if (template) {
      setSelectedCustomTemplate(template);
      setEditingCustomForm(form);
      setShowCustomFormFiller(true);
    }
  };

  const handleDeleteCustomForm = (formId) => {
    confirm({
      title: 'Supprimer le formulaire',
      description: 'Êtes-vous sûr de vouloir supprimer ce formulaire ?',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await api.delete(`/documentations/custom-forms/${formId}`);
          toast({ title: 'Succès', description: 'Formulaire supprimé' });
          loadData();
        } catch (error) {
          toast({
            title: 'Erreur',
            description: formatErrorMessage(error, 'Erreur lors de la suppression'),
            variant: 'destructive'
          });
        }
      }
    });
  };

  const handlePrintCustomForm = (formId) => {
    const token = localStorage.getItem('token');
    const baseUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    const printUrl = `${baseUrl}/api/documentations/custom-forms/${formId}/pdf?token=${token}`;
    const printWindow = window.open(printUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => printWindow.print();
    }
  };

  // Handlers pour les documents
  const handleAddDocument = () => {
    setDocFormData({ titre: '', description: '' });
    setSelectedFile(null);
    setOpenDocDialog(true);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      if (!docFormData.titre) {
        setDocFormData(prev => ({ ...prev, titre: file.name.replace(/\.[^/.]+$/, '') }));
      }
    }
  };

  const handleSubmitDocument = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast({
        title: 'Attention',
        description: 'Veuillez sélectionner un fichier',
        variant: 'destructive'
      });
      return;
    }

    try {
      setUploading(true);
      
      // Créer d'abord le document
      const docData = {
        titre: docFormData.titre || selectedFile.name,
        description: docFormData.description,
        type_document: 'PIECE_JOINTE',
        pole_id: poleId
      };
      
      const newDoc = await documentationsAPI.createDocument(docData);
      
      // Uploader le fichier
      await documentationsAPI.uploadFile(newDoc.id, selectedFile);
      
      toast({ title: 'Succès', description: 'Document ajouté' });
      setOpenDocDialog(false);
      loadData();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Erreur lors de l\'ajout'),
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = (docId) => {
    confirm({
      title: 'Supprimer le document',
      description: 'Êtes-vous sûr de vouloir supprimer ce document ?',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await documentationsAPI.deleteDocument(docId);
          toast({ title: 'Succès', description: 'Document supprimé' });
          loadData();
        } catch (error) {
          toast({
            title: 'Erreur',
            description: formatErrorMessage(error, 'Erreur lors de la suppression'),
            variant: 'destructive'
          });
        }
      }
    });
  };

  const handleDeleteBon = (bonId) => {
    confirm({
      title: 'Supprimer le bon de travail',
      description: 'Êtes-vous sûr de vouloir supprimer ce bon de travail ?',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await documentationsAPI.deleteBonTravail(bonId);
          toast({ title: 'Succès', description: 'Bon de travail supprimé' });
          loadData();
        } catch (error) {
          toast({
            title: 'Erreur',
            description: formatErrorMessage(error, 'Erreur lors de la suppression'),
            variant: 'destructive'
          });
        }
      }
    });
  };

  const handleDeleteAutorisation = (autoId) => {
    confirm({
      title: 'Supprimer l\'autorisation',
      description: 'Êtes-vous sûr de vouloir supprimer cette autorisation ?',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await autorisationsAPI.delete(autoId);
          toast({ title: 'Succès', description: 'Autorisation supprimée' });
          loadData();
        } catch (error) {
          toast({
            title: 'Erreur',
            description: formatErrorMessage(error, 'Erreur lors de la suppression'),
            variant: 'destructive'
          });
        }
      }
    });
  };

  const handlePrint = (type, id) => {
    const token = localStorage.getItem('token');
    const baseUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    let printUrl = '';
    
    if (type === 'bon') {
      printUrl = `${baseUrl}/api/documentations/bons-travail/${id}/pdf?token=${token}`;
    } else if (type === 'autorisation') {
      printUrl = `${baseUrl}/api/autorisations/${id}/pdf?token=${token}`;
    } else if (type === 'document') {
      printUrl = `${baseUrl}/api/documentations/documents/${id}/view?token=${token}`;
    }
    
    const printWindow = window.open(printUrl, '_blank');
    if (printWindow && type !== 'document') {
      printWindow.onload = () => printWindow.print();
    }
  };

  const getFileIcon = (fileType) => {
    if (!fileType) return File;
    for (const [type, Icon] of Object.entries(FILE_ICONS)) {
      if (fileType.startsWith(type)) return Icon;
    }
    return File;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Chargement...</p>
      </div>
    );
  }

  if (!pole) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Pôle non trouvé</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <Button variant="ghost" onClick={() => navigate('/documentations')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux pôles
        </Button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{pole.nom}</h1>
            <p className="text-gray-500">{pole.description || 'Pôle de service'}</p>
            {pole.responsable && (
              <p className="text-sm text-gray-600 mt-1">
                Responsable : <span className="font-medium">{pole.responsable}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddDocument} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Ajouter document
            </Button>
            <Button onClick={handleAddForm} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              Ajouter formulaire
            </Button>
          </div>
        </div>
      </div>

      {/* Barre de recherche */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher un document ou formulaire..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Arborescence */}
      <Card>
        <CardContent className="p-0">
          {/* Section Documents */}
          <div className="border-b">
            <button
              onClick={() => toggleSection('documents')}
              className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
            >
              {expandedSections.documents ? (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-500" />
              )}
              <div className="p-2 bg-green-100 rounded-lg">
                <FolderOpen className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <span className="font-semibold">Documents</span>
                <Badge variant="secondary" className="ml-2">
                  {filteredDocuments.length}
                </Badge>
              </div>
            </button>
            
            {expandedSections.documents && (
              <div className="bg-gray-50 border-t">
                {filteredDocuments.length === 0 ? (
                  <div className="p-4 pl-16 text-sm text-gray-500">
                    Aucun document dans ce pôle
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredDocuments.map((doc) => {
                      const FileIcon = getFileIcon(doc.fichier_type);
                      return (
                        <div
                          key={doc.id}
                          className="flex items-center gap-3 p-3 pl-16 hover:bg-gray-100 transition-colors"
                        >
                          <FileIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {doc.fichier_nom || doc.titre || 'Document sans nom'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(doc.fichier_taille)}
                              {doc.created_at && ` • ${new Date(doc.created_at).toLocaleDateString('fr-FR')}`}
                            </p>
                          </div>
                          <TooltipProvider delayDuration={300}>
                            <div className="flex gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handlePrint('document', doc.id)}
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">Ouvrir le document</p>
                                  <p className="text-xs text-gray-300">Télécharger ou imprimer ce fichier</p>
                                </TooltipContent>
                              </Tooltip>
                              {canEdit(doc) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteDocument(doc.id)}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-medium">Supprimer le document</p>
                                    <p className="text-xs text-gray-300">Cette action est irréversible</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TooltipProvider>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section Bons de travail */}
          <div className="border-b">
            <button
              onClick={() => toggleSection('bons_travail')}
              className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
            >
              {expandedSections.bons_travail ? (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-500" />
              )}
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <span className="font-semibold">Bons de travail</span>
                <Badge variant="secondary" className="ml-2">
                  {filteredBons.length}
                </Badge>
              </div>
            </button>
            
            {expandedSections.bons_travail && (
              <div className="bg-blue-50 border-t">
                {filteredBons.length === 0 ? (
                  <div className="p-4 pl-16 text-sm text-gray-500">
                    Aucun bon de travail dans ce pôle
                  </div>
                ) : (
                  <div className="divide-y divide-blue-200">
                    {filteredBons.map((bon) => (
                      <div
                        key={bon.id}
                        className="flex items-center gap-3 p-3 pl-16 hover:bg-blue-100 transition-colors"
                      >
                        <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {bon.titre || 'Bon de travail'}
                          </p>
                          <p className="text-xs text-gray-600">
                            {bon.entreprise && `${bon.entreprise} • `}
                            {bon.created_at ? new Date(bon.created_at).toLocaleDateString('fr-FR') : ''}
                          </p>
                        </div>
                        <TooltipProvider delayDuration={300}>
                          <div className="flex gap-1">
                            {canEdit(bon) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const prefill = bon.form_data || {
                                        localisation: bon.localisation_ligne || '',
                                        description: bon.description_travaux || '',
                                        intervenants: bon.nom_intervenants || '',
                                      };
                                      setEditBonData({ id: bon.id, ...prefill });
                                      setShowBonTravailDialog(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">Modifier le bon</p>
                                  <p className="text-xs text-gray-300">Éditer les informations du bon de travail</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePrint('bon', bon.id)}
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">Imprimer</p>
                                <p className="text-xs text-gray-300">Générer un PDF du bon de travail</p>
                              </TooltipContent>
                            </Tooltip>
                            {canEdit(bon) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteBon(bon.id)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">Supprimer</p>
                                  <p className="text-xs text-gray-300">Cette action est irréversible</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section Autorisations particulières */}
          <div>
            <button
              onClick={() => toggleSection('autorisations')}
              className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
            >
              {expandedSections.autorisations ? (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-500" />
              )}
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Shield className="h-5 w-5 text-yellow-600" />
              </div>
              <div className="flex-1">
                <span className="font-semibold">Autorisations particulières</span>
                <Badge variant="secondary" className="ml-2">
                  {filteredAutorisations.length}
                </Badge>
              </div>
            </button>
            
            {expandedSections.autorisations && (
              <div className="bg-yellow-50 border-t">
                {filteredAutorisations.length === 0 ? (
                  <div className="p-4 pl-16 text-sm text-gray-500">
                    Aucune autorisation dans ce pôle
                  </div>
                ) : (
                  <div className="divide-y divide-yellow-200">
                    {filteredAutorisations.map((auto) => (
                      <div
                        key={auto.id}
                        className="flex items-center gap-3 p-3 pl-16 hover:bg-yellow-100 transition-colors"
                      >
                        <Shield className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {auto.numero ? `${auto.numero} - ` : ''}{auto.titre || 'Autorisation particulière'}
                          </p>
                          <p className="text-xs text-gray-600">
                            {auto.type_autorisation && `${auto.type_autorisation} • `}
                            {auto.created_at ? new Date(auto.created_at).toLocaleDateString('fr-FR') : ''}
                          </p>
                        </div>
                        <TooltipProvider delayDuration={300}>
                          <div className="flex gap-1">
                            {canEdit(auto) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => navigate(`/autorisations-particulieres/edit/${auto.id}`)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">Modifier l'autorisation</p>
                                  <p className="text-xs text-gray-300">Éditer les détails de l'autorisation</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePrint('autorisation', auto.id)}
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">Imprimer</p>
                                <p className="text-xs text-gray-300">Générer un PDF de l'autorisation</p>
                              </TooltipContent>
                            </Tooltip>
                            {canEdit(auto) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteAutorisation(auto.id)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">Supprimer</p>
                                  <p className="text-xs text-gray-300">Cette action est irréversible</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section Formulaires personnalisés */}
          {groupedCustomForms.length > 0 && groupedCustomForms.map((group) => (
            <div key={group.templateId} className="border-t">
              <button
                onClick={() => toggleSection(`custom_${group.templateId}`)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                {expandedSections[`custom_${group.templateId}`] ? (
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-500" />
                )}
                <div className="p-2 bg-purple-100 rounded-lg">
                  <ClipboardList className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <span className="font-semibold">{group.templateName}</span>
                  <Badge variant="secondary" className="ml-2">
                    {group.forms.length}
                  </Badge>
                </div>
              </button>
              
              {expandedSections[`custom_${group.templateId}`] && (
                <div className="bg-purple-50 border-t">
                  <div className="divide-y divide-purple-200">
                    {group.forms.map((form) => (
                      <div
                        key={form.id}
                        className="flex items-center gap-3 p-3 pl-16 hover:bg-purple-100 transition-colors"
                      >
                        <ClipboardList className="h-5 w-5 text-purple-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {form.titre || 'Formulaire sans titre'}
                          </p>
                          <p className="text-xs text-gray-600">
                            {form.status === 'VALIDE' ? '✓ Validé' : '⏳ Brouillon'} • 
                            {form.created_at ? new Date(form.created_at).toLocaleDateString('fr-FR') : ''}
                            {form.created_by_name && ` • ${form.created_by_name}`}
                          </p>
                        </div>
                        <TooltipProvider delayDuration={300}>
                          <div className="flex gap-1">
                            {canEdit(form) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditCustomForm(form)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">Modifier le formulaire</p>
                                  <p className="text-xs text-gray-300">Éditer les champs du formulaire</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePrintCustomForm(form.id)}
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">Imprimer</p>
                                <p className="text-xs text-gray-300">Générer un PDF du formulaire</p>
                              </TooltipContent>
                            </Tooltip>
                            {canEdit(form) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteCustomForm(form.id)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">Supprimer</p>
                                  <p className="text-xs text-gray-300">Cette action est irréversible</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dialog: Ajouter un formulaire */}
      <Dialog open={openFormDialog} onOpenChange={setOpenFormDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              Ajouter un formulaire
            </DialogTitle>
            <DialogDescription>
              Sélectionnez le type de formulaire à remplir
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Label>Type de formulaire</Label>
            <Select value={selectedFormType} onValueChange={setSelectedFormType}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un type de formulaire" />
              </SelectTrigger>
              <SelectContent>
                {/* Formulaires système */}
                <SelectItem value="BON_TRAVAIL">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    Bon de travail
                  </div>
                </SelectItem>
                <SelectItem value="AUTORISATION">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-yellow-600" />
                    Autorisation particulière
                  </div>
                </SelectItem>
                
                {/* Formulaires personnalisés */}
                {formTemplates.filter(t => t.type === 'CUSTOM' && t.actif !== false).map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-purple-600" />
                      {template.nom}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Afficher description selon le type sélectionné */}
            {selectedFormType && (
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                {selectedFormType === 'BON_TRAVAIL' && (
                  <>
                    <p className="font-medium text-gray-900 mb-1">Bon de travail</p>
                    <p>Formulaire pour documenter les travaux de maintenance réalisés par une entreprise externe.</p>
                  </>
                )}
                {selectedFormType === 'AUTORISATION' && (
                  <>
                    <p className="font-medium text-gray-900 mb-1">Autorisation particulière</p>
                    <p>Formulaire pour les autorisations de travaux spéciaux (travaux en hauteur, espace confiné, etc.)</p>
                  </>
                )}
                {selectedFormType !== 'BON_TRAVAIL' && selectedFormType !== 'AUTORISATION' && (() => {
                  const template = formTemplates.find(t => t.id === selectedFormType);
                  if (template) {
                    return (
                      <>
                        <p className="font-medium text-gray-900 mb-1">{template.nom}</p>
                        <p>{template.description || 'Formulaire personnalisé'}</p>
                        {template.fields && template.fields.length > 0 && (
                          <p className="text-xs text-gray-500 mt-2">
                            {template.fields.length} champ(s) à remplir
                          </p>
                        )}
                      </>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenFormDialog(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleSelectFormType}
              disabled={!selectedFormType}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Créer le formulaire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ajouter un document */}
      <Dialog open={openDocDialog} onOpenChange={setOpenDocDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-green-600" />
              Ajouter un document
            </DialogTitle>
            <DialogDescription>
              Uploadez un fichier dans ce pôle
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmitDocument} className="space-y-4">
            <div>
              <Label>Fichier *</Label>
              <div 
                className={`mt-2 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  selectedFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <File className="h-6 w-6 text-green-600" />
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="text-sm text-gray-500">
                      ({formatFileSize(selectedFile.size)})
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600">Cliquez pour sélectionner un fichier</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, Images...</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            
            <div>
              <Label>Titre</Label>
              <Input
                value={docFormData.titre}
                onChange={(e) => setDocFormData({ ...docFormData, titre: e.target.value })}
                placeholder="Titre du document (optionnel)"
              />
            </div>
            
            <div>
              <Label>Description</Label>
              <Textarea
                value={docFormData.description}
                onChange={(e) => setDocFormData({ ...docFormData, description: e.target.value })}
                placeholder="Description (optionnel)"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDocDialog(false)}>
                Annuler
              </Button>
              <Button 
                type="submit"
                disabled={!selectedFile || uploading}
                className="bg-green-600 hover:bg-green-700"
              >
                {uploading ? 'Upload en cours...' : 'Ajouter'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Custom Form Filler */}
      <CustomFormFiller
        open={showCustomFormFiller}
        onOpenChange={setShowCustomFormFiller}
        template={selectedCustomTemplate}
        poleId={poleId}
        existingForm={editingCustomForm}
        onSaved={() => loadData()}
      />

      {/* Dialog Bon de Travail MAINT/FE/004 V2 */}
      <BonDeTravailPrintDialog
        open={showBonTravailDialog}
        onClose={() => { setShowBonTravailDialog(false); setEditBonData(null); }}
        poleId={poleId}
        prefillData={editBonData}
        onSaved={() => { setShowBonTravailDialog(false); setEditBonData(null); loadData(); }}
      />

      <ConfirmDialog />
    </div>
  );
}

export default PoleDetails;
