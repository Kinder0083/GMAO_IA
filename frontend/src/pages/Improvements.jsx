import React, { useState, useEffect } from 'react';
import { useLocationStateFilter } from '../hooks/useLocationStateFilter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, Search, Filter, Eye, Pencil, Trash2, Calendar, ArrowUpDown, Paperclip } from 'lucide-react';
import ImprovementDialog from '../components/Improvements/ImprovementDialog';
import ImprovementFormDialog from '../components/Improvements/ImprovementFormDialog';
import DeleteConfirmDialog from '../components/Common/DeleteConfirmDialog';
import { LOTOBadge } from '../components/Common/LOTOBadge';
import { useLotoByLinked } from '../hooks/useLotoRealtime';
import { improvementsAPI } from '../services/api';
import api from '../services/api';
import { useToast } from '../hooks/use-toast';
import { useImprovements } from '../hooks/useImprovements';
import { useSearchParams } from 'react-router-dom';
import AvatarInitials from '../components/ui/avatar-initials';
import { formatTimeToHoursMinutes } from '../utils/timeFormat';
import { formatErrorMessage } from '../utils/errorFormatter';

const Improvements = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedImprovement, setSelectedImprovement] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const lotoByLinked = useLotoByLinked();
  
  // Filtres de date
  const [dateFilter, setDateFilter] = useState('today'); // today, week, month, custom
  const [dateType, setDateType] = useState('creation'); // creation ou echeance
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // Utiliser le hook temps réel
  const { 
    improvements, 
    loading, 
    refresh: refreshImprovements 
  } = useImprovements();

  // Appliquer le filtre "en retard" depuis la navigation (header)
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
    }
  });

  // Gérer l'ouverture automatique d'un ordre via l'URL ?open=id (modification) ou ?view=id (visualisation)
  useEffect(() => {
    const viewImprovementId = searchParams.get('view');
    const openImprovementId = searchParams.get('open');

    // Mode visualisation : ouvre le dialog "details" (equivalent icone oeil)
    if (viewImprovementId) {
      const loadAndViewImprovement = async () => {
        try {
          const response = await improvementsAPI.getById(viewImprovementId);
          if (response && response.data) {
            setSelectedImprovement(response.data);
            setDialogOpen(true);
          }
        } catch (error) {
          toast({
            title: 'Erreur',
            description: formatErrorMessage(error, "Impossible d'ouvrir l'amélioration"),
            variant: 'destructive'
          });
        } finally {
          searchParams.delete('view');
          setSearchParams(searchParams);
        }
      };
      loadAndViewImprovement();
      return;
    }

    if (openImprovementId) {
      console.log('Tentative d\'ouverture de l\'ordre:', openImprovementId);
      // Charger l'ordre directement par son ID
      const loadAndOpenImprovement = async () => {
        try {
          console.log('Appel API pour l\'ordre:', openImprovementId);
          const response = await improvementsAPI.getById(openImprovementId);
          console.log('Réponse API:', response);
          if (response && response.data) {
            setSelectedImprovement(response.data);
            setFormDialogOpen(true);
            // Retirer le paramètre de l'URL après ouverture
            searchParams.delete('open');
            setSearchParams(searchParams);
          } else {
            throw new Error('Pas de données dans la réponse');
          }
        } catch (error) {
          console.error('Erreur complète:', error);
          console.error('Détails erreur:', error.response?.data);
          toast({
            title: 'Erreur',
            description: formatErrorMessage(error, 'Impossible d\'ouvrir l\'amélioration'),
            variant: 'destructive'
          });
          // Retirer le paramètre même en cas d'erreur
          searchParams.delete('open');
          setSearchParams(searchParams);
        }
      };
      loadAndOpenImprovement();
    }
  }, [searchParams]);

  const getDateRange = () => {
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
  };

  const handleDelete = async (id) => {
    setItemToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      await improvementsAPI.delete(itemToDelete);
      toast({
        title: 'Succès',
        description: 'Amélioration supprimé'
      });
      refreshImprovements();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer l\'amélioration',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const filteredImprovements = improvements.filter(wo => {
    const matchesSearch = wo.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (wo.numero && wo.numero.toString().includes(searchTerm));
    const matchesStatus = filterStatus === 'ALL' || wo.statut === filterStatus;
    const today = new Date(); today.setHours(23, 59, 59, 999);
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

  const handleViewImprovement = (wo) => {
    setSelectedImprovement(wo);
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
          <h1 className="text-3xl font-bold text-gray-900">Améliorations</h1>
          <p className="text-gray-600 mt-1">Gérez vos interventions et maintenances</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
          setSelectedImprovement(null);
          setFormDialogOpen(true);
        }}>
          <Plus size={20} className="mr-2" />
          Nouvel ordre
        </Button>
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
          <CardTitle>Liste des ordres ({filteredImprovements.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
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
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Assigné</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Emplacement</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Équipement</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date limite</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Temps réel</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredImprovements.map((wo) => (
                    <tr key={wo.id} className="border-b hover:bg-gray-50 transition-colors">
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
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {wo.emplacement ? wo.emplacement.nom : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {wo.equipement ? wo.equipement.nom : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {wo.dateLimite ? new Date(wo.dateLimite).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 font-medium">
                        {wo.tempsReel ? formatTimeToHoursMinutes(wo.tempsReel) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedImprovement(wo);
                              setDialogOpen(true);
                            }}
                            className="hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Eye size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedImprovement(wo);
                              setFormDialogOpen(true);
                            }}
                            className="hover:bg-green-50 hover:text-green-600"
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(wo.id)}
                            className="hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </Button>
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

      <ImprovementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workOrder={selectedImprovement}
        onSuccess={refreshImprovements}
      />

      <ImprovementFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        workOrder={selectedImprovement}
        onSuccess={refreshImprovements}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Supprimer l'amélioration"
        description="Êtes-vous sûr de vouloir supprimer cet amélioration ? Cette action est irréversible."
      />
    </div>
  );
};

export default Improvements;