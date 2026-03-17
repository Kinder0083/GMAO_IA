import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocationStateFilter } from '../hooks/useLocationStateFilter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../components/ui/dialog';
import { Plus, Calendar, Clock, CheckCircle, LayoutGrid, Grid, Trash2, ClipboardCheck, Pencil, Play, History, BookOpen, Sparkles } from 'lucide-react';
import PreventiveMaintenanceFormDialog from '../components/PreventiveMaintenance/PreventiveMaintenanceFormDialog';
import ChecklistFormDialog from '../components/PreventiveMaintenance/ChecklistFormDialog';
import ChecklistExecutionDialog from '../components/PreventiveMaintenance/ChecklistExecutionDialog';
import ChecklistHistoryView from '../components/PreventiveMaintenance/ChecklistHistoryView';
import AIMaintenanceGenerator from '../components/AIMaintenanceGenerator';
import { LOTOBadge } from '../components/Common/LOTOBadge';
import { useLotoByLinked } from '../hooks/useLotoRealtime';
import { preventiveMaintenanceAPI, workOrdersAPI, checklistsAPI, equipmentsAPI } from '../services/api';
import api from '../services/api';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { usePreventiveMaintenance } from '../hooks/usePreventiveMaintenance';

const PreventiveMaintenance = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [selectedMaintenance, setSelectedMaintenance] = useState(null);
  const [viewMode, setViewMode] = useState('tree');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [maintenanceToDelete, setMaintenanceToDelete] = useState(null);
  
  // Dialog pour le changement de statut équipement lors de l'exécution
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [maintenanceToExecute, setMaintenanceToExecute] = useState(null);
  const [executingMaintenance, setExecutingMaintenance] = useState(false);
  
  // États pour les checklists
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [loadingChecklists, setLoadingChecklists] = useState(false);
  
  // États pour l'exécution et l'historique des checklists
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const lotoByLinked = useLotoByLinked();
  const [aiMaintenanceOpen, setAiMaintenanceOpen] = useState(false);
  const [checklistToExecute, setChecklistToExecute] = useState(null);
  const [executionContext, setExecutionContext] = useState({});

  // Utiliser le hook temps réel
  const { 
    maintenance, 
    loading, 
    refresh: refreshMaintenance 
  } = usePreventiveMaintenance();

  // Vérifier les permissions
  const canDelete = user?.permissions?.preventiveMaintenance?.delete === true;
  const canEdit = user?.permissions?.preventiveMaintenance?.edit === true;

  // Fonction pour afficher le badge de statut
  const getStatusBadge = (statut) => {
    const statusConfig = {
      'ACTIF': { label: 'Actif', className: 'bg-green-100 text-green-800' },
      'INACTIF': { label: 'Inactif', className: 'bg-gray-100 text-gray-800' },
      'SUSPENDU': { label: 'Suspendu', className: 'bg-yellow-100 text-yellow-800' }
    };
    
    const config = statusConfig[statut] || statusConfig['INACTIF'];
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  useEffect(() => {
    loadChecklists();
  }, []);

  // Appliquer le filtre "en retard" depuis la navigation (header)
  useLocationStateFilter({
    filterOverdue: () => setFilterOverdue(true)
  });

  const loadChecklists = async () => {
    try {
      setLoadingChecklists(true);
      const response = await checklistsAPI.getTemplates();
      setChecklists(response.data);
    } catch (error) {
      console.error('Erreur chargement checklists:', error);
    } finally {
      setLoadingChecklists(false);
    }
  };

  const handleDelete = async () => {
    if (!maintenanceToDelete) return;

    try {
      await preventiveMaintenanceAPI.delete(maintenanceToDelete.id);
      toast({
        title: 'Succès',
        description: 'Maintenance préventive supprimée'
      });
      setDeleteDialogOpen(false);
      setMaintenanceToDelete(null);
      refreshMaintenance();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer la maintenance préventive',
        variant: 'destructive'
      });
    }
  };

  const handleExecuteChecklist = async (checklist) => {
    // Trouver le template de checklist
    const template = checklists.find(c => c.id === checklist.id);
    if (!template) {
      toast({
        title: 'Erreur',
        description: 'Template de checklist introuvable',
        variant: 'destructive'
      });
      return;
    }
    
    setChecklistToExecute(template);
    setExecutionContext({
      equipmentId: null,
      equipmentName: checklist.name
    });
    setExecutionDialogOpen(true);
  };

  const handleViewHistory = () => {
    setHistoryDialogOpen(true);
  };

  // Ouvre le dialog de confirmation pour l'exécution
  const handleExecuteNow = (pm) => {
    setMaintenanceToExecute(pm);
    setExecuteDialogOpen(true);
  };

  // Exécute la maintenance préventive (crée l'OT automatiquement)
  const executeMaintenanceWithStatus = async (changeEquipmentStatus) => {
    if (!maintenanceToExecute) return;
    
    const pm = maintenanceToExecute;
    setExecutingMaintenance(true);
    
    try {
      // 1. Changer le statut de l'équipement si demandé
      if (changeEquipmentStatus && pm.equipement?.id) {
        try {
          await equipmentsAPI.updateStatus(pm.equipement.id, 'EN_MAINTENANCE');
          toast({
            title: 'Équipement mis en maintenance',
            description: `${pm.equipement.nom} est maintenant en maintenance`
          });
        } catch (error) {
          console.error('Erreur changement statut équipement:', error);
          // On continue quand même
        }
      }
      
      // 2. Créer l'ordre de travail automatiquement
      const workOrderData = {
        titre: `PM-${pm.titre}`,
        description: `Maintenance préventive: ${pm.titre}\nFréquence: ${pm.frequence}\nDurée estimée: ${pm.duree}h`,
        statut: 'EN_COURS',
        priorite: 'MOYENNE',
        equipement_id: pm.equipement?.id,
        assigne_a_id: pm.assigneA?.id,
        tempsEstime: pm.duree,
        dateLimite: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        preventive_maintenance_id: pm.id,
        checklist_id: pm.checklist_template_id || null
      };
      
      const response = await workOrdersAPI.create(workOrderData);
      const createdWO = response.data;
      
      setExecuteDialogOpen(false);
      setMaintenanceToExecute(null);
      
      // 3. Vérifier si une checklist est associée
      if (pm.checklist_template_id) {
        toast({
          title: 'Ordre de travail créé',
          description: `OT "${createdWO.titre || workOrderData.titre}" créé. Redirection vers la checklist...`
        });
        
        // Rediriger vers l'OT avec la checklist
        setTimeout(() => {
          navigate(`/work-orders?id=${createdWO.id || createdWO._id}&execute_checklist=true`);
        }, 1000);
      } else {
        toast({
          title: 'Ordre de travail créé',
          description: `OT "${createdWO.titre || workOrderData.titre}" créé avec succès. Aucune checklist associée.`
        });
        
        // Rediriger vers l'OT
        setTimeout(() => {
          navigate(`/work-orders?id=${createdWO.id || createdWO._id}`);
        }, 1000);
      }
      
    } catch (error) {
      console.error('Erreur création OT:', error);
      toast({
        title: 'Erreur',
        description: error.response?.data?.detail || 'Impossible de créer l\'ordre de travail',
        variant: 'destructive'
      });
    } finally {
      setExecutingMaintenance(false);
    }
  };

  // Ouvre le formulaire de modification de la checklist associée
  const handleEditChecklist = (pm) => {
    if (!pm.checklist_template_id) {
      toast({
        title: 'Aucune checklist',
        description: 'Cette maintenance préventive n\'a pas de checklist associée',
        variant: 'default'
      });
      return;
    }
    
    const template = checklists.find(c => c.id === pm.checklist_template_id);
    if (template) {
      setSelectedChecklist(template);
      setChecklistDialogOpen(true);
    } else {
      toast({
        title: 'Erreur',
        description: 'Template de checklist introuvable',
        variant: 'destructive'
      });
    }
  };

  const getFrequencyBadge = (frequency) => {
    const badges = {
      'HEBDOMADAIRE': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Hebdomadaire' },
      'MENSUEL': { bg: 'bg-green-100', text: 'text-green-700', label: 'Mensuel' },
      'TRIMESTRIEL': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Trimestriel' },
      'ANNUEL': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Annuel' }
    };
    const badge = badges[frequency] || badges['MENSUEL'];
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const upcomingMaintenance = maintenance.filter(m => m.statut === 'ACTIF');
  
  // Calculer les maintenances à venir cette semaine
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingThisWeek = upcomingMaintenance.filter(m => {
    const nextMaintDate = new Date(m.prochaineMaintenance);
    return nextMaintDate >= now && nextMaintDate <= nextWeek;
  }).length;

  // Calculer les maintenances complétées ce mois
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const completedThisMonth = maintenance.filter(m => {
    if (m.derniereMaintenance) {
      const lastMaintDate = new Date(m.derniereMaintenance);
      return lastMaintDate >= startOfMonth && lastMaintDate <= endOfMonth;
    }
    return false;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Maintenance Préventive</h1>
          <p className="text-gray-600 mt-1">Planifiez et suivez vos maintenances programmées</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 border rounded-lg p-1">
            <Button
              variant={viewMode === 'tree' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('tree')}
              className={viewMode === 'tree' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              data-testid="view-tree-btn"
            >
              <Grid size={16} className="mr-1" />
              Arborescence
            </Button>
            <Button
              variant={viewMode === 'card' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('card')}
              className={viewMode === 'card' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              data-testid="view-card-btn"
            >
              <LayoutGrid size={16} className="mr-1" />
              Carte
            </Button>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => setAiMaintenanceOpen(true)}
              data-testid="ai-maintenance-generator-btn"
            >
              <Sparkles size={20} className="mr-2 text-purple-600" />
              Générer avec IA
            </Button>
            <Button 
              variant="outline" 
              className="border-purple-500 text-purple-600 hover:bg-purple-50"
              onClick={() => navigate('/preventive-maintenance/checklists')}
              data-testid="manage-checklists-btn"
            >
              <ClipboardCheck size={20} className="mr-2" />
              Gérer les Checklists
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
              setSelectedMaintenance(null);
              setFormDialogOpen(true);
            }} data-testid="new-maintenance-btn">
              <Plus size={20} className="mr-2" />
              Nouvelle planification
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Maintenances actives</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{upcomingMaintenance.length}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-xl">
                <Calendar size={24} className="text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Prochainement</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{upcomingThisWeek}</p>
                <p className="text-xs text-gray-500 mt-1">Cette semaine</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-xl">
                <Clock size={24} className="text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Complétées ce mois</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{completedThisMonth}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-xl">
                <CheckCircle size={24} className="text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Maintenance Cards ou Arborescence */}
      {viewMode === 'card' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-500">Chargement...</p>
            </div>
          ) : maintenance.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-500">Aucune maintenance préventive trouvée</p>
            </div>
          ) : (
            maintenance.map((item) => (
            <Card key={item.id} className="hover:shadow-xl transition-all duration-300">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl mb-2">{item.titre}</CardTitle>
                      <LOTOBadge lotoInfo={lotoByLinked[item.id]} size="md" />
                    </div>
                    {getFrequencyBadge(item.frequence)}
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    {item.statut}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Equipment */}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Équipement</p>
                    <p className="font-medium text-gray-900">{item.equipement?.nom || '-'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Next Maintenance */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar size={16} className="text-blue-600" />
                        <p className="text-xs text-gray-600">Prochaine maintenance</p>
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.prochaineMaintenance ? new Date(item.prochaineMaintenance).toLocaleDateString('fr-FR') : '-'}
                      </p>
                    </div>

                    {/* Last Maintenance */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle size={16} className="text-green-600" />
                        <p className="text-xs text-gray-600">Dernière maintenance</p>
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.derniereMaintenance ? new Date(item.derniereMaintenance).toLocaleDateString('fr-FR') : 'Jamais'}
                      </p>
                    </div>
                  </div>

                  {/* Assigned To */}
                  {item.assigneA && (
                    <div>
                      <p className="text-xs text-gray-600 mb-2">Assigner à</p>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-medium">
                            {item.assigneA.prenom[0]}{item.assigneA.nom[0]}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {item.assigneA.prenom} {item.assigneA.nom}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Duration */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Clock size={16} className="text-gray-500" />
                    <span className="text-sm text-gray-700">Durée estimée: <span className="font-medium">{item.duree}h</span></span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="hover:bg-green-50 hover:text-green-600"
                      onClick={() => handleExecuteNow(item)}
                      title="Exécuter"
                      data-testid={`execute-btn-${item.id}`}
                    >
                      <Play size={16} />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="hover:bg-blue-50 hover:text-blue-600"
                      onClick={() => {
                        setSelectedMaintenance(item);
                        setFormDialogOpen(true);
                      }}
                      title="Modifier"
                      data-testid={`edit-btn-${item.id}`}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className={item.checklist_template_id ? "hover:bg-purple-50 hover:text-purple-600" : "opacity-50 cursor-not-allowed"}
                      onClick={() => handleEditChecklist(item)}
                      disabled={!item.checklist_template_id}
                      title={item.checklist_template_id ? "Modifier la checklist" : "Aucune checklist associée"}
                      data-testid={`checklist-btn-${item.id}`}
                    >
                      <BookOpen size={16} />
                    </Button>
                    {canDelete && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="hover:bg-red-50 hover:text-red-600 ml-auto"
                        onClick={() => {
                          setMaintenanceToDelete(item);
                          setDeleteDialogOpen(true);
                        }}
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      ) : viewMode === 'tree' ? (
        /* Vue Arborescence - Groupée par fréquence */
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Chargement...</p>
              </div>
            ) : maintenance.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Aucune maintenance préventive trouvée</p>
              </div>
            ) : (
              <div className="space-y-6">
                {['QUOTIDIEN', 'HEBDOMADAIRE', 'MENSUEL', 'TRIMESTRIEL', 'ANNUEL'].map((freq) => {
                  const items = maintenance.filter(m => m.frequence === freq);
                  if (items.length === 0) return null;
                  
                  const freqLabels = {
                    'QUOTIDIEN': 'Quotidien',
                    'HEBDOMADAIRE': 'Hebdomadaire',
                    'MENSUEL': 'Mensuel',
                    'TRIMESTRIEL': 'Trimestriel',
                    'ANNUEL': 'Annuel'
                  };
                  
                  return (
                    <div key={freq} className="border rounded-lg p-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Calendar size={20} className="text-blue-600" />
                        {freqLabels[freq]} ({items.length})
                      </h3>
                      <div className="space-y-3 pl-6">
                        {items.map((item) => (
                          <div key={item.id} className="border-l-4 border-blue-500 pl-4 py-2 bg-gray-50 rounded-r-lg hover:bg-gray-100 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-semibold text-gray-900">{item.titre}</p>
                                <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                  <span>Équipement: {item.equipement?.nom || 'Non assigné'}</span>
                                  <span>Prochaine: {new Date(item.prochaineMaintenance).toLocaleDateString()}</span>
                                  {getStatusBadge(item.statut)}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleExecuteNow(item)}
                                  className="hover:bg-green-50 hover:text-green-600"
                                  title="Exécuter"
                                >
                                  <Play size={16} />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMaintenance(item);
                                    setFormDialogOpen(true);
                                  }}
                                  className="hover:bg-blue-50 hover:text-blue-600"
                                  title="Modifier"
                                >
                                  <Pencil size={16} />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditChecklist(item)}
                                  disabled={!item.checklist_template_id}
                                  className={item.checklist_template_id ? "hover:bg-purple-50 hover:text-purple-600" : "opacity-50 cursor-not-allowed"}
                                  title={item.checklist_template_id ? "Modifier la checklist" : "Aucune checklist associée"}
                                >
                                  <BookOpen size={16} />
                                </Button>
                                {canDelete && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setMaintenanceToDelete(item);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="hover:bg-red-50 hover:text-red-600"
                                    title="Supprimer"
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Dialog d'exécution avec choix du statut équipement */}
      <Dialog open={executeDialogOpen} onOpenChange={setExecuteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="text-green-600" size={20} />
              Exécuter la maintenance
            </DialogTitle>
            <DialogDescription>
              {maintenanceToExecute && (
                <>
                  <p className="font-medium text-gray-900 mt-2">{maintenanceToExecute.titre}</p>
                  {maintenanceToExecute.equipement && (
                    <p className="text-sm text-gray-600 mt-1">
                      Équipement: {maintenanceToExecute.equipement.nom}
                    </p>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-gray-700 mb-4">
              Un ordre de travail va être créé automatiquement avec le statut "En cours".
            </p>
            {maintenanceToExecute?.equipement && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm font-medium text-yellow-800">
                  Voulez-vous mettre l'équipement "{maintenanceToExecute.equipement.nom}" en statut "En maintenance" ?
                </p>
                <p className="text-xs text-yellow-600 mt-1">
                  Cela mettra à jour le planning des équipements.
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setExecuteDialogOpen(false)} disabled={executingMaintenance}>
              Annuler
            </Button>
            {maintenanceToExecute?.equipement ? (
              <>
                <Button 
                  variant="outline"
                  onClick={() => executeMaintenanceWithStatus(false)}
                  disabled={executingMaintenance}
                >
                  {executingMaintenance ? 'Création...' : 'Non, garder le statut'}
                </Button>
                <Button 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => executeMaintenanceWithStatus(true)}
                  disabled={executingMaintenance}
                >
                  {executingMaintenance ? 'Création...' : 'Oui, mettre en maintenance'}
                </Button>
              </>
            ) : (
              <Button 
                className="bg-green-600 hover:bg-green-700"
                onClick={() => executeMaintenanceWithStatus(false)}
                disabled={executingMaintenance}
              >
                {executingMaintenance ? 'Création...' : 'Créer l\'OT'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PreventiveMaintenanceFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        maintenance={selectedMaintenance}
        onSuccess={refreshMaintenance}
        checklists={checklists}
      />

      <ChecklistFormDialog
        open={checklistDialogOpen}
        onOpenChange={setChecklistDialogOpen}
        checklist={selectedChecklist}
        onSuccess={loadChecklists}
      />

      {/* Dialog de confirmation de suppression */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer la maintenance préventive "{maintenanceToDelete?.titre}" ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog d'exécution de checklist */}
      <ChecklistExecutionDialog
        open={executionDialogOpen}
        onOpenChange={setExecutionDialogOpen}
        template={checklistToExecute}
        equipmentId={executionContext.equipmentId}
        equipmentName={executionContext.equipmentName}
        onSuccess={() => {
          loadChecklists();
          toast({
            title: 'Succès',
            description: 'Checklist exécutée avec succès'
          });
        }}
      />

      {/* Dialog de l'historique des checklists */}
      <ChecklistHistoryView
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog />
      <AIMaintenanceGenerator
        open={aiMaintenanceOpen}
        onClose={(shouldRefresh) => {
          setAiMaintenanceOpen(false);
          if (shouldRefresh) loadChecklists();
        }}
      />
    </div>
  );
};

export default PreventiveMaintenance;