import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLocationStateFilter } from '../hooks/useLocationStateFilter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, Search, Filter, Eye, Pencil, Trash2, Calendar, ArrowUpDown, Paperclip, BookOpen, FileText } from 'lucide-react';
import WorkOrderDialog from '../components/WorkOrders/WorkOrderDialog';
import WorkOrderFormDialog from '../components/WorkOrders/WorkOrderFormDialog';
import DeleteConfirmDialog from '../components/Common/DeleteConfirmDialog';
import ChecklistExecutionDialog from '../components/PreventiveMaintenance/ChecklistExecutionDialog';
import TemplateSelectionDialog from '../components/WorkOrders/TemplateSelectionDialog';
import { LOTOBadge } from '../components/Common/LOTOBadge';
import { useLotoByLinked } from '../hooks/useLotoRealtime';

import { workOrdersAPI, checklistsAPI, workOrderTemplatesAPI } from '../services/api';
import api from '../services/api';
import { useToast } from '../hooks/use-toast';
import { useWorkOrders } from '../hooks/useWorkOrders';
import { usePermissions } from '../hooks/usePermissions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import AvatarInitials from '../components/ui/avatar-initials';
import { formatTimeToHoursMinutes } from '../utils/timeFormat';
import { formatErrorMessage } from '../utils/errorFormatter';

const WorkOrders = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canEdit, canDelete } = usePermissions();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  
  // États pour l'exécution de checklist
  const [checklistExecutionOpen, setChecklistExecutionOpen] = useState(false);
  const [checklistToExecute, setChecklistToExecute] = useState(null);
  const [checklistContext, setChecklistContext] = useState({});
  const [checklistCompletedSuccessfully, setChecklistCompletedSuccessfully] = useState(false);
  
  // États pour les ordres type (templates)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [hasTemplateAccess, setHasTemplateAccess] = useState(false);
  const [templateFormData, setTemplateFormData] = useState(null);
  const lotoByLinked = useLotoByLinked();
  
  // Filtres de date
  const [dateFilter, setDateFilter] = useState('today'); // today, week, month, custom
  const [dateType, setDateType] = useState('creation'); // creation ou echeance
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // Appliquer les filtres depuis la navigation (header notifications)
  useLocationStateFilter({
    filterStatus: (value) => {
      setFilterStatus(value);
      setDateFilter('all');
      setFilterOverdue(false);
    },
    filterOverdue: () => {
      setFilterStatus('ALL');
      setDateFilter('all');
      setFilterOverdue(true);
    },
    openId: async (id) => {
      try {
        const response = await workOrdersAPI.getById(id);
        if (response?.data) {
          setSelectedWorkOrder(response.data);
          setDialogOpen(true);
        }
      } catch (e) {
        // OT non trouvé, on ignore
      }
    }
  });

  // Calculer les paramètres de date pour le hook
  const getDateFilters = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate, endDate;
    
    switch (dateFilter) {
      case 'today':
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay());
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          startDate = new Date(customStartDate);
          endDate = new Date(customEndDate);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
      default:
        return {};
    }
    
    if (startDate && endDate) {
      return {
        date_debut: startDate.toISOString(),
        date_fin: endDate.toISOString(),
        date_type: dateType
      };
    }
    
    return {};
  }, [dateFilter, dateType, customStartDate, customEndDate]);

  // Obtenir les filtres de date actuels
  const dateFilters = getDateFilters();

  // Utiliser le hook temps réel avec les filtres de date
  const { 
    workOrders: allWorkOrders, 
    loading: isLoading, 
    refresh: refreshWorkOrders,
    setWorkOrders: setAllWorkOrders
  } = useWorkOrders({
    ...dateFilters
  });

  useEffect(() => {
    refreshWorkOrders();
    checkTemplateAccess();
  }, [dateFilter, dateType, customStartDate, customEndDate]);

  // Vérifier si l'utilisateur a accès aux ordres type
  const checkTemplateAccess = async () => {
    try {
      const result = await workOrderTemplatesAPI.checkAccess();
      setHasTemplateAccess(result.has_access);
    } catch (error) {
      console.error('Erreur vérification accès templates:', error);
      setHasTemplateAccess(false);
    }
  };

  // Ouvrir le formulaire pré-rempli avec un template
  const handleTemplateSelected = (template) => {
    const today = new Date().toISOString().split('T')[0];
    setTemplateFormData({
      titre: template.nom,
      description: template.description || '',
      categorie: template.categorie || '',
      priorite: template.priorite || 'AUCUNE',
      statut: template.statut_defaut || 'OUVERT',
      equipement_id: template.equipement_id || '',
      temps_estime: template.temps_estime || '',
      date_creation: today,
      template_id: template.id // Pour incrémenter le compteur
    });
    setTemplateDialogOpen(false);
    setFormDialogOpen(true);
  };

  // Gérer l'ouverture automatique d'un ordre via l'URL ?id=xxx ou ?open=xxx
  useEffect(() => {
    const openWorkOrderId = searchParams.get('id') || searchParams.get('open');
    const executeChecklist = searchParams.get('execute_checklist') === 'true';
    
    if (openWorkOrderId) {
      console.log('Tentative d\'ouverture de l\'ordre:', openWorkOrderId, 'execute_checklist:', executeChecklist);
      // Charger l'ordre directement par son ID
      const loadAndOpenWorkOrder = async () => {
        try {
          console.log('Appel API pour l\'ordre:', openWorkOrderId);
          const response = await workOrdersAPI.getById(openWorkOrderId);
          console.log('Réponse API:', response);
          if (response && response.data) {
            const workOrder = response.data;
            setSelectedWorkOrder(workOrder);
            
            // Si execute_checklist=true et qu'il y a une checklist associée
            if (executeChecklist && workOrder.checklist_id) {
              try {
                const checklistResponse = await checklistsAPI.getTemplate(workOrder.checklist_id);
                if (checklistResponse && checklistResponse.data) {
                  setChecklistToExecute(checklistResponse.data);
                  setChecklistContext({
                    equipmentId: workOrder.equipement?.id,
                    equipmentName: workOrder.equipement?.nom || workOrder.titre,
                    workOrderId: workOrder.id
                  });
                  // Marquer comme venant de l'exécution PM pour ne pas ouvrir le formulaire après
                  setChecklistCompletedSuccessfully(true);
                  setChecklistExecutionOpen(true);
                }
              } catch (checklistError) {
                console.error('Erreur chargement checklist:', checklistError);
                // Ne pas ouvrir le formulaire OT - rester sur la liste
              }
            } else if (!executeChecklist) {
              // Ouvrir le formulaire seulement si on n'est pas en mode execution checklist
              setFormDialogOpen(true);
            }
            
            // Retirer les paramètres de l'URL après ouverture
            searchParams.delete('id');
            searchParams.delete('open');
            searchParams.delete('execute_checklist');
            setSearchParams(searchParams);
          } else {
            throw new Error('Pas de données dans la réponse');
          }
        } catch (error) {
          console.error('Erreur complète:', error);
          console.error('Détails erreur:', error.response?.data);
          toast({
            title: 'Erreur',
            description: formatErrorMessage(error, 'Impossible d\'ouvrir l\'ordre de travail'),
            variant: 'destructive'
          });
          // Retirer les paramètres même en cas d'erreur
          searchParams.delete('id');
          searchParams.delete('open');
          searchParams.delete('execute_checklist');
          setSearchParams(searchParams);
        }
      };
      loadAndOpenWorkOrder();
    }
  }, [searchParams]);

  // Plus besoin de loadWorkOrders ni useAutoRefresh !
  // Le hook useWorkOrders gère tout automatiquement
  
  const handleDelete = async (id) => {
    setItemToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      await workOrdersAPI.delete(itemToDelete);
      toast({
        title: 'Succès',
        description: 'Ordre de travail supprimé'
      });
      refreshWorkOrders();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer l\'ordre de travail',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const filteredWorkOrders = allWorkOrders.filter(wo => {
    const matchesSearch = wo.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (wo.numero && wo.numero.toString().includes(searchTerm));
    const matchesStatus = filterStatus === 'ALL' || wo.statut === filterStatus;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    // dateLimite est le champ correct dans la réponse API (pas date_echeance)
    const matchesOverdue = !filterOverdue || (
      wo.dateLimite && new Date(wo.dateLimite) < today && wo.statut !== 'TERMINE'
    );
    return matchesSearch && matchesStatus && matchesOverdue;
  });

  const getStatusBadge = (statut) => {
    const badges = {
      'OUVERT': { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Ouvert' },
      'EN_COURS': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'En cours' },
      'EN_ATTENTE': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'En attente' },
      'TERMINE': { bg: 'bg-green-100', text: 'text-green-700', label: 'Terminé' }
    };
    const badge = badges[statut] || badges['OUVERT'];
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getPriorityBadge = (priorite) => {
    const badges = {
      'HAUTE': { bg: 'bg-red-100', text: 'text-red-700', label: 'Haute' },
      'MOYENNE': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Moyenne' },
      'BASSE': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Basse' },
      'AUCUNE': { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Normale' }
    };
    const badge = badges[priorite] || badges['AUCUNE'];
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
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
    return labels[categorie] || '-';
  };

  const handleViewWorkOrder = (wo) => {
    setSelectedWorkOrder(wo);
    setDialogOpen(true);
  };

  const statuses = [
    { value: 'ALL', label: 'Tous' },
    { value: 'OUVERT', label: 'Ouvert' },
    { value: 'EN_COURS', label: 'En cours' },
    { value: 'EN_ATTENTE', label: 'En attente' },
    { value: 'TERMINE', label: 'Terminé' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Ordres de travail</h1>
          </div>
          <p className="text-gray-600 mt-1">Gérez vos interventions et maintenances</p>
        </div>
        <div className="flex gap-3">
          {/* Bouton Ordres Type (visible pour admins et responsables de service) */}
          {hasTemplateAccess && (
            <Button 
              variant="outline"
              className="border-purple-600 text-purple-600 hover:bg-purple-50"
              onClick={() => navigate('/work-orders/templates')}
            >
              <FileText size={20} className="mr-2" />
              Ordres Type
            </Button>
          )}
          
          {canEdit('workOrders') && (
            <div className="flex flex-col gap-2">
              <Button 
                id="btn-nouvel-ordre"
                data-testid="btn-nouvel-ordre-vierge"
                data-action="creer-ot"
                className="bg-blue-600 hover:bg-blue-700 text-white" 
                onClick={() => {
                  setSelectedWorkOrder(null);
                  setTemplateFormData(null);
                  setFormDialogOpen(true);
                }}
              >
                <Plus size={20} className="mr-2" />
                + Nouvel Ordre (Vierge)
              </Button>
              <Button 
                variant="outline"
                data-testid="btn-nouvel-ordre-modele"
                className="border-blue-600 text-blue-600 hover:bg-blue-50"
                onClick={() => setTemplateDialogOpen(true)}
              >
                <BookOpen size={18} className="mr-2" />
                + Nouvel Ordre (Modèle)
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filtres de date */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Type de tri date */}
            <div className="flex items-center gap-2">
              <Button
                variant={dateType === 'creation' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateType(dateType === 'creation' ? 'echeance' : 'creation')}
                className="gap-2"
              >
                <ArrowUpDown size={16} />
                {dateType === 'creation' ? 'Créé le' : 'Échéance'}
              </Button>
            </div>

            <div className="h-6 w-px bg-gray-300"></div>

            {/* Filtres prédéfinis */}
            <div className="flex gap-2">
              <Button
                variant={dateFilter === 'today' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setDateFilter('today');
                  setShowCustomDatePicker(false);
                }}
                className={dateFilter === 'today' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                Aujourd'hui
              </Button>
              <Button
                variant={dateFilter === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setDateFilter('week');
                  setShowCustomDatePicker(false);
                }}
                className={dateFilter === 'week' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                Cette semaine
              </Button>
              <Button
                variant={dateFilter === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setDateFilter('month');
                  setShowCustomDatePicker(false);
                }}
                className={dateFilter === 'month' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                Ce mois
              </Button>
              <Button
                variant={dateFilter === 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setShowCustomDatePicker(!showCustomDatePicker);
                  if (!showCustomDatePicker) setDateFilter('custom');
                }}
                className={dateFilter === 'custom' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                <Calendar size={16} className="mr-2" />
                Personnalisé
              </Button>
            </div>

            {/* Sélecteur de dates personnalisé */}
            {showCustomDatePicker && (
              <>
                <div className="h-6 w-px bg-gray-300"></div>
                <div className="flex gap-2 items-center">
                  <Label className="text-sm">Du</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-40"
                  />
                  <Label className="text-sm">Au</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-40"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <Input
                  placeholder="Rechercher par titre ou ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Filter size={20} className="text-gray-400 mt-2" />
              <div className="flex gap-2 flex-wrap">
                {statuses.map(status => (
                  <Button
                    key={status.value}
                    variant={filterStatus === status.value ? 'default' : 'outline'}
                    onClick={() => setFilterStatus(status.value)}
                    size="sm"
                    className={filterStatus === status.value ? 'bg-blue-600 hover:bg-blue-700' : ''}
                  >
                    {status.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Work Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des ordres ({filteredWorkOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Chargement...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">ID</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Statut</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Titre</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Priorité</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Catégorie</th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Assigné</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Emplacement</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Équipement</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date limite</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Temps réel</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkOrders.map((wo) => (
                    <tr 
                      key={wo.id} 
                      className="border-b hover:bg-gray-50 transition-colors"
                      data-ai-type="WORK_ORDER"
                      data-ai-id={wo.id}
                      data-ai-name={wo.titre}
                      data-ai-status={wo.statut}
                      data-ai-extra={JSON.stringify({ numero: wo.numero, priorite: wo.priorite, categorie: wo.categorie })}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-900 font-medium">#{wo.numero}</span>
                          {wo.attachments && wo.attachments.length > 0 && (
                            <Paperclip size={14} className="text-gray-500" title={`${wo.attachments.length} pièce(s) jointe(s)`} />
                          )}
                          <LOTOBadge lotoInfo={lotoByLinked[wo.id]} />
                        </div>
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(wo.statut)}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 font-medium">{wo.titre}</td>
                      <td className="py-3 px-4">{getPriorityBadge(wo.priorite)}</td>
                      <td className="py-3 px-4">
                        {wo.categorie ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            {getCategoryLabel(wo.categorie)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {wo.assigneA ? (
                          <div className="flex items-center justify-center">
                            <AvatarInitials 
                              prenom={wo.assigneA.prenom} 
                              nom={wo.assigneA.nom}
                            />
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">{wo.emplacement?.nom || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">{wo.equipement?.nom || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {wo.dateLimite ? new Date(wo.dateLimite).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 font-medium">
                        {wo.tempsReel ? formatTimeToHoursMinutes(wo.tempsReel) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedWorkOrder(wo);
                                    setDialogOpen(true);
                                  }}
                                  className="hover:bg-blue-50 hover:text-blue-600"
                                >
                                  <Eye size={16} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>Voir les détails</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {canEdit('workOrders') && (
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedWorkOrder(wo);
                                      setFormDialogOpen(true);
                                    }}
                                    className="hover:bg-green-50 hover:text-green-600"
                                  >
                                    <Pencil size={16} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>Modifier</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          
                          {/* Bouton Livre - Afficher la checklist associée */}
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span tabIndex={0} className="inline-flex">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!wo.checklist_id}
                                  onClick={async () => {
                                    if (wo.checklist_id) {
                                      try {
                                        const checklistResponse = await checklistsAPI.getTemplate(wo.checklist_id);
                                        if (checklistResponse && checklistResponse.data) {
                                          setChecklistToExecute(checklistResponse.data);
                                          setChecklistContext({
                                            equipmentId: wo.equipement?.id,
                                            equipmentName: wo.equipement?.nom || wo.titre,
                                            workOrderId: wo.id
                                          });
                                          setChecklistExecutionOpen(true);
                                        }
                                      } catch (error) {
                                        toast({
                                          title: 'Erreur',
                                          description: 'Impossible de charger la checklist',
                                          variant: 'destructive'
                                        });
                                      }
                                    }
                                  }}
                                  className={wo.checklist_id 
                                    ? "hover:bg-purple-50 hover:text-purple-600" 
                                    : "opacity-50 cursor-not-allowed"
                                  }
                                >
                                  <BookOpen size={16} />
                                </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{wo.checklist_id ? 'Exécuter la checklist' : 'Aucune checklist associée'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          {canDelete('workOrders') && (
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(wo.id)}
                                    className="hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>Supprimer</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <WorkOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workOrder={selectedWorkOrder}
        onSuccess={refreshWorkOrders}
      />

      <WorkOrderFormDialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);
          if (!open) {
            setTemplateFormData(null); // Reset les données pré-remplies à la fermeture
          }
        }}
        workOrder={selectedWorkOrder}
        prefillData={templateFormData}
        onSuccess={refreshWorkOrders}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Supprimer l'ordre de travail"
        description="Êtes-vous sûr de vouloir supprimer cet ordre de travail ? Cette action est irréversible."
      />

      {/* Dialog d'exécution de checklist pour les OT issus de maintenances préventives */}
      <ChecklistExecutionDialog
        open={checklistExecutionOpen}
        onOpenChange={(open) => {
          setChecklistExecutionOpen(open);
          // N'ouvrir le formulaire OT que si l'utilisateur a annulé (pas si succès)
          if (!open && !checklistCompletedSuccessfully) {
            setFormDialogOpen(true);
          }
          // Reset le flag de succès
          if (!open) {
            setChecklistCompletedSuccessfully(false);
          }
        }}
        template={checklistToExecute}
        equipmentId={checklistContext.equipmentId}
        equipmentName={checklistContext.equipmentName}
        workOrderId={checklistContext.workOrderId}
        onSuccess={() => {
          setChecklistCompletedSuccessfully(true);
          toast({
            title: 'Succès',
            description: 'Checklist exécutée avec succès'
          });
          refreshWorkOrders();
        }}
      />

      {/* Dialog de sélection de template */}
      <TemplateSelectionDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onSelectTemplate={handleTemplateSelected}
      />
    </div>
  );
};

export default WorkOrders;