import React, { useState, useEffect } from 'react';
import { useLocationStateFilter } from '../hooks/useLocationStateFilter';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Plus, Search, Eye, Pencil, Trash2, Wrench, AlertCircle, Calendar, Ban } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Label } from '../components/ui/label';
import InterventionRequestDialog from '../components/InterventionRequests/InterventionRequestDialog';
import InterventionRequestFormDialog from '../components/InterventionRequests/InterventionRequestFormDialog';
import ConvertToWorkOrderDialog from '../components/InterventionRequests/ConvertToWorkOrderDialog';
import RefuseInterventionDialog from '../components/InterventionRequests/RefuseInterventionDialog';
import DeleteConfirmDialog from '../components/Common/DeleteConfirmDialog';
import { interventionRequestsAPI, workOrdersAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { useInterventionRequests } from '../hooks/useInterventionRequests';
import { useNavigate, useSearchParams } from 'react-router-dom';

const InterventionRequests = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [refuseDialogOpen, setRefuseDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Utiliser le hook temps réel
  const { 
    interventionRequests: requests, 
    loading, 
    refresh: refreshRequests 
  } = useInterventionRequests();

  // Handle email action links (?action=convert&id=xxx or ?action=refuse&id=xxx)
  useEffect(() => {
    const action = searchParams.get('action');
    const requestId = searchParams.get('id');
    if (action && requestId && requests.length > 0) {
      const targetRequest = requests.find(r => r.id === requestId);
      if (targetRequest) {
        setSelectedRequest(targetRequest);
        if (action === 'convert' && !targetRequest.work_order_id && !targetRequest.refused) {
          setConvertDialogOpen(true);
        } else if (action === 'refuse' && !targetRequest.refused && !targetRequest.work_order_id) {
          setRefuseDialogOpen(true);
        }
      }
      // Clean up URL params
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, requests]);

  const handleRefreshAndNotify = () => {
    refreshRequests();
    window.dispatchEvent(new CustomEvent('gmao-data-refresh', { detail: { entity: 'intervention_requests' } }));
  };

  const handleDelete = async (id) => {
    setItemToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      await interventionRequestsAPI.delete(itemToDelete);
      toast({
        title: 'Succès',
        description: 'Demande supprimée'
      });
      handleRefreshAndNotify();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer la demande',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const handleWorkOrderClick = (workOrderId) => {
    // Naviguer vers les ordres de travail avec l'ID de l'ordre à ouvrir
    navigate(`/work-orders?open=${workOrderId}`);
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (req.description && req.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPriority = filterPriority === 'ALL' || req.priorite === filterPriority;
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const matchesOverdue = !filterOverdue || (req.date_limite_desiree && new Date(req.date_limite_desiree) < today && req.statut !== 'TERMINE' && req.statut !== 'ANNULE');

    // Filtre chronologique
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const reqDate = new Date(req.created_at || req.date_creation);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (dateFilter === 'today') {
        const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
        matchesDate = reqDate >= now && reqDate <= endOfDay;
      } else if (dateFilter === 'week') {
        const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
        const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6); endOfWeek.setHours(23, 59, 59, 999);
        matchesDate = reqDate >= startOfWeek && reqDate <= endOfWeek;
      } else if (dateFilter === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0); endOfMonth.setHours(23, 59, 59, 999);
        matchesDate = reqDate >= startOfMonth && reqDate <= endOfMonth;
      } else if (dateFilter === 'year') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31); endOfYear.setHours(23, 59, 59, 999);
        matchesDate = reqDate >= startOfYear && reqDate <= endOfYear;
      } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
        const start = new Date(customStartDate);
        const end = new Date(customEndDate); end.setHours(23, 59, 59, 999);
        matchesDate = reqDate >= start && reqDate <= end;
      }
    }

    return matchesSearch && matchesPriority && matchesOverdue && matchesDate;
  });

  // Appliquer le filtre "en retard" depuis la navigation (header)
  useLocationStateFilter({
    filterOverdue: () => setFilterOverdue(true)
  });

  const getPriorityBadge = (priorite) => {
    const badges = {
      'HAUTE': { bg: 'bg-red-100', text: 'text-red-700', label: 'Haute' },
      'MOYENNE': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Moyenne' },
      'BASSE': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Basse' },
      'AUCUNE': { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Normale' }
    };
    const badge = badges[priorite] || badges['AUCUNE'];
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const isOverdue = (dateString, statut) => {
    if (!dateString || statut === 'TERMINE' || statut === 'ANNULE') return false;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return dueDate < today;
  };

  const canConvert = user && (user.role === 'ADMIN' || user.role === 'TECHNICIEN');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Demandes d'intervention</h1>
          <p className="text-gray-600 mt-1">Gérez vos demandes d'intervention</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
          setSelectedRequest(null);
          setFormDialogOpen(true);
        }}>
          <Plus size={20} className="mr-2" />
          Nouvelle demande
        </Button>
      </div>

      {/* Date Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-600 mr-1">Période :</span>
            {[
              { value: 'all', label: 'Toutes' },
              { value: 'today', label: "Aujourd'hui" },
              { value: 'week', label: 'Cette semaine' },
              { value: 'month', label: 'Ce mois' },
              { value: 'year', label: 'Cette année' }
            ].map(({ value, label }) => (
              <Button key={value} variant={dateFilter === value ? 'default' : 'outline'} size="sm"
                data-testid={`date-filter-${value}`}
                onClick={() => { setDateFilter(value); setShowCustomDatePicker(false); }}
                className={dateFilter === value ? 'bg-blue-600 hover:bg-blue-700' : ''}>
                {label}
              </Button>
            ))}
            <Button variant={dateFilter === 'custom' ? 'default' : 'outline'} size="sm"
              data-testid="date-filter-custom"
              onClick={() => { setShowCustomDatePicker(!showCustomDatePicker); if (!showCustomDatePicker) setDateFilter('custom'); }}
              className={dateFilter === 'custom' ? 'bg-blue-600 hover:bg-blue-700' : ''}>
              <Calendar size={14} className="mr-1" /> Personnalisé
            </Button>
            {showCustomDatePicker && (
              <>
                <div className="h-6 w-px bg-gray-300" />
                <div className="flex gap-2 items-center">
                  <Label className="text-sm">Du</Label>
                  <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-36 h-8" />
                  <Label className="text-sm">Au</Label>
                  <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-36 h-8" />
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
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {['ALL', 'HAUTE', 'MOYENNE', 'BASSE', 'AUCUNE'].map(priority => (
                <Button
                  key={priority}
                  variant={filterPriority === priority ? 'default' : 'outline'}
                  onClick={() => setFilterPriority(priority)}
                  size="sm"
                  className={filterPriority === priority ? 'bg-blue-600 hover:bg-blue-700' : ''}
                >
                  {priority === 'ALL' ? 'Toutes' : priority === 'HAUTE' ? 'Haute' : priority === 'MOYENNE' ? 'Moyenne' : priority === 'BASSE' ? 'Basse' : 'Normale'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Chargement...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Aucune demande trouvée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Créé par</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Titre</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Priorité</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Équipement</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date Limite Désirée</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date Création</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Ordre N°</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date Limite Ordre</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => (
                    <tr key={req.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-600">{req.created_by_name || 'N/A'}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 font-medium">{req.titre}</td>
                      <td className="py-3 px-4">{getPriorityBadge(req.priorite)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {req.equipement ? req.equipement.nom : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span className={isOverdue(req.date_limite_desiree, req.statut) ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {formatDate(req.date_limite_desiree)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {formatDate(req.date_creation)}
                      </td>
                      <td className="py-3 px-4">
                        <TooltipProvider>
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setDialogOpen(true);
                                  }}
                                  className="hover:bg-blue-50 hover:text-blue-600"
                                >
                                  <Eye size={16} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Voir les détails</TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setFormDialogOpen(true);
                                  }}
                                  className="hover:bg-green-50 hover:text-green-600"
                                >
                                  <Pencil size={16} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Modifier la demande</TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(req.id)}
                                  className="hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Supprimer la demande</TooltipContent>
                            </Tooltip>
                            
                            {canConvert && !req.work_order_id && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedRequest(req);
                                      setConvertDialogOpen(true);
                                    }}
                                    className="hover:bg-purple-50 hover:text-purple-600"
                                  >
                                    <Wrench size={16} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Convertir en ordre de travail</TooltipContent>
                              </Tooltip>
                            )}
                            
                            {canConvert && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    data-testid={`refuse-btn-${req.id}`}
                                    onClick={() => {
                                      setSelectedRequest(req);
                                      setRefuseDialogOpen(true);
                                    }}
                                    className="hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Ban size={16} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Intervention refusee</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <TooltipProvider>
                        {req.refused ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span 
                                className="text-red-600 font-bold cursor-default"
                                data-testid={`refused-label-${req.id}`}
                              >
                                REFUS
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="font-medium">Motif du refus :</p>
                              <p>{req.refused_reason}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : req.work_order_numero ? (
                          <span 
                            className="text-blue-600 font-medium cursor-pointer hover:underline"
                            onClick={() => handleWorkOrderClick(req.work_order_id)}
                            title="Cliquer pour ouvrir l'ordre de travail"
                          >
                            #{req.work_order_numero}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                        </TooltipProvider>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {req.work_order_date_limite ? (
                          <span className={isOverdue(req.work_order_date_limite, req.work_order_statut) ? 'text-red-600 font-medium' : 'text-gray-600'}>
                            {formatDate(req.work_order_date_limite)}
                          </span>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <InterventionRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        request={selectedRequest}
      />

      <InterventionRequestFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        request={selectedRequest}
        onSuccess={handleRefreshAndNotify}
      />

      <ConvertToWorkOrderDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        request={selectedRequest}
        onSuccess={handleRefreshAndNotify}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Supprimer la demande"
        description="Êtes-vous sûr de vouloir supprimer cette demande d'intervention ?"
      />

      <RefuseInterventionDialog
        open={refuseDialogOpen}
        onOpenChange={setRefuseDialogOpen}
        request={selectedRequest}
        onSuccess={handleRefreshAndNotify}
      />
    </div>
  );
};

export default InterventionRequests;