import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Download, Filter, Search, User, FileText, RotateCcw } from 'lucide-react';
import { auditAPI } from '../services/api';
import api from '../services/api';
import { useToast } from '../hooks/use-toast';
import OfflineDisabled from '../components/Common/OfflineDisabled';

const Journal = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: 'all',
    entity_type: 'all',
    user_id: '',
    search: ''
  });
  const [pagination, setPagination] = useState({
    skip: 0,
    limit: 50,
    total: 0
  });

  // Mapping audit entity_type -> collection MongoDB pour la restauration
  const entityToCollection = {
    'WORK_ORDER': 'work_orders',
    'work_orders': 'work_orders',
    'IMPROVEMENT_REQUEST': 'improvement_requests',
    'IMPROVEMENT': 'improvement_requests',
    'improvement_requests': 'improvement_requests',
    'INTERVENTION_REQUEST': 'intervention_requests',
    'intervention_requests': 'intervention_requests',
    'EQUIPMENT': 'equipments',
    'equipments': 'equipments',
    'PRESQU_ACCIDENT': 'presqu_accident_items',
    'presqu_accident_items': 'presqu_accident_items',
    'USER': 'users',
    'users': 'users',
    'SURVEILLANCE': 'surveillance_items',
    'surveillance_items': 'surveillance_items',
  };

  const handleRestore = async (log) => {
    const collection = entityToCollection[log.entity_type];
    if (!collection || !log.entity_id) {
      toast({ title: 'Erreur', description: 'Impossible de restaurer cet element', variant: 'destructive' });
      return;
    }
    try {
      await api.post(`/trash/${collection}/${log.entity_id}/restore`);
      toast({ title: 'Restaure', description: `"${log.entity_name || ''}" a ete restaure avec succes` });
    } catch (err) {
      const msg = err.response?.data?.detail || 'Impossible de restaurer (element peut-etre deja restaure ou purge)';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    }
  };

  const actionTypes = {
    CREATE: { label: 'Création', color: 'bg-green-500' },
    UPDATE: { label: 'Modification', color: 'bg-blue-500' },
    DELETE: { label: 'Suppression', color: 'bg-red-500' },
    LOGIN: { label: 'Connexion', color: 'bg-purple-500' },
    LOGOUT: { label: 'Déconnexion', color: 'bg-gray-500' },
    COPY: { label: 'Copie', color: 'bg-teal-500' },
    MOVE: { label: 'Déplacement', color: 'bg-amber-500' },
    SHARE: { label: 'Partage', color: 'bg-indigo-500' },
    PERMISSION_CHANGE: { label: 'Permission', color: 'bg-orange-500' }
  };

  const entityTypes = {
    USER: 'Utilisateur',
    WORK_ORDER: 'Ordre de travail',
    EQUIPMENT: 'Équipement',
    LOCATION: 'Zone',
    VENDOR: 'Fournisseur',
    INVENTORY: 'Inventaire',
    PREVENTIVE_MAINTENANCE: 'Maintenance préventive',
    PURCHASE_HISTORY: 'Historique d\'achat',
    LOTO: 'Consignation LOTO',
    DOCUMENTATION: 'Documentation',
    IMPROVEMENT: 'Amélioration',
    IMPROVEMENT_REQUEST: 'Demande d\'amélioration',
    PRESQU_ACCIDENT: 'Presqu\'accident',
    SETTINGS: 'Paramètres',
    DEMANDE_ARRET: 'Demande d\'arrêt',
    WHITEBOARD: 'Tableau blanc',
    SURVEILLANCE: 'Surveillance'
  };

  useEffect(() => {
    fetchLogs();
  }, [pagination.skip, filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        skip: pagination.skip,
        limit: pagination.limit,
        ...(filters.action && filters.action !== 'all' && { action: filters.action }),
        ...(filters.entity_type && filters.entity_type !== 'all' && { entity_type: filters.entity_type }),
        ...(filters.user_id && { user_id: filters.user_id })
      };

      const response = await auditAPI.getAuditLogs(params);
      setLogs(response?.logs || []);
      setPagination(prev => ({ ...prev, total: response?.total || 0 }));
    } catch (error) {
      console.error('Erreur lors du chargement des logs:', error);
      // En cas d'erreur réseau/API, afficher une liste vide au lieu d'un message d'erreur bloquant
      setLogs([]);
      setPagination(prev => ({ ...prev, total: 0 }));
      const statusCode = error?.response?.status;
      if (statusCode === 403) {
        toast({
          title: 'Accès refusé',
          description: 'Vous n\'avez pas les droits pour accéder au journal d\'audit',
          variant: 'destructive'
        });
      } else if (statusCode === 401) {
        // Le intercepteur axios gère déjà la redirection
      } else {
        toast({
          title: 'Avertissement',
          description: 'Impossible de charger le journal. Les données seront disponibles lors de la prochaine connexion.',
          variant: 'destructive'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const params = {
        format,
        ...(filters.action && filters.action !== 'all' && { action: filters.action }),
        ...(filters.entity_type && filters.entity_type !== 'all' && { entity_type: filters.entity_type }),
        ...(filters.user_id && { user_id: filters.user_id })
      };

      await auditAPI.exportAuditLogs(params);
      toast({
        title: 'Succès',
        description: `Export ${format.toUpperCase()} réussi`
      });
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'export',
        variant: 'destructive'
      });
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    
    // Utiliser Intl.DateTimeFormat pour gérer correctement le fuseau horaire
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

  const handleNextPage = () => {
    if (pagination.skip + pagination.limit < pagination.total) {
      setPagination(prev => ({ ...prev, skip: prev.skip + prev.limit }));
    }
  };

  const handlePrevPage = () => {
    if (pagination.skip > 0) {
      setPagination(prev => ({ ...prev, skip: Math.max(0, prev.skip - prev.limit) }));
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Journal d'Audit</h1>
          <p className="text-gray-500 mt-1">Historique complet de toutes les actions dans le système</p>
        </div>
        <div className="flex gap-2">
          <OfflineDisabled message="Export necessite une connexion">
          <Button onClick={() => handleExport('csv')} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          </OfflineDisabled>
          <OfflineDisabled message="Export necessite une connexion">
          <Button onClick={() => handleExport('excel')} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
          </OfflineDisabled>
        </div>
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select
              value={filters.action || "all"}
              onValueChange={(value) => setFilters(prev => ({ ...prev, action: value === "all" ? "" : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Type d'action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les actions</SelectItem>
                {Object.keys(actionTypes).map(action => (
                  <SelectItem key={action} value={action}>
                    {actionTypes[action].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.entity_type || "all"}
              onValueChange={(value) => setFilters(prev => ({ ...prev, entity_type: value === "all" ? "" : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Type d'entité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les entités</SelectItem>
                {Object.keys(entityTypes).map(entity => (
                  <SelectItem key={entity} value={entity}>
                    {entityTypes[entity]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              onClick={fetchLogs}
              className="w-full"
            >
              <Search className="w-4 h-4 mr-2" />
              Appliquer les filtres
            </Button>

            <Button 
              onClick={() => setFilters({ action: 'all', entity_type: 'all', user_id: '', search: '' })}
              variant="outline"
              className="w-full"
            >
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tableau des logs */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <FileText className="w-16 h-16 mb-4" />
              <p>Aucun log trouvé</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Heure</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entité</TableHead>
                    <TableHead>Détails</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {formatDate(log.timestamp)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="font-medium">{log.user_name}</div>
                            <div className="text-xs text-gray-500">{log.user_email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${actionTypes[log.action]?.color || 'bg-gray-500'} text-white`}>
                          {actionTypes[log.action]?.label || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {entityTypes[log.entity_type] || log.entity_type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {log.entity_name || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 flex-1">
                            {log.details || '-'}
                          </span>
                          {log.action === 'DELETE' && entityToCollection[log.entity_type] && log.entity_id && (
                            <button
                              onClick={() => handleRestore(log)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors whitespace-nowrap"
                              data-testid={`journal-restore-${log.entity_id}`}
                              title="Restaurer depuis la corbeille"
                            >
                              <RotateCcw size={12} />
                              Restaurer
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex justify-between items-center p-4 border-t">
                <div className="text-sm text-gray-500">
                  Affichage de {pagination.skip + 1} à {Math.min(pagination.skip + pagination.limit, pagination.total)} sur {pagination.total} logs
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handlePrevPage}
                    disabled={pagination.skip === 0}
                    variant="outline"
                    size="sm"
                  >
                    Précédent
                  </Button>
                  <Button
                    onClick={handleNextPage}
                    disabled={pagination.skip + pagination.limit >= pagination.total}
                    variant="outline"
                    size="sm"
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Journal;
