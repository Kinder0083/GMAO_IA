import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription 
} from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2, 
  Shield, 
  Users, 
  Settings,
  Save,
  Lock,
  UserCheck,
  Building
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { useToast } from '../hooks/use-toast';
import { rolesAPI } from '../services/api';
import api from '../services/api';

// Liste des modules avec leur libellé
const MODULES = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'interventionRequests', label: 'Demandes d\'intervention' },
  { key: 'workOrders', label: 'Ordres de travail' },
  { key: 'improvementRequests', label: 'Demandes d\'amélioration' },
  { key: 'improvements', label: 'Améliorations' },
  { key: 'preventiveMaintenance', label: 'Maintenance préventive' },
  { key: 'planningMprev', label: 'Planning M.Prev.' },
  { key: 'assets', label: 'Équipements' },
  { key: 'inventory', label: 'Inventaire' },
  { key: 'locations', label: 'Zones' },
  { key: 'meters', label: 'Compteurs' },
  { key: 'surveillance', label: 'Plan de surveillance' },
  { key: 'surveillanceRapport', label: 'Rapport surveillance' },
  { key: 'presquaccident', label: 'Presqu\'accident' },
  { key: 'presquaccidentRapport', label: 'Rapport P.accident' },
  { key: 'documentations', label: 'Documentations' },
  { key: 'vendors', label: 'Fournisseurs' },
  { key: 'reports', label: 'Rapports' },
  { key: 'people', label: 'Utilisateurs' },
  { key: 'planning', label: 'Planning' },
  { key: 'purchaseHistory', label: 'Historique achats' },
  { key: 'purchaseRequests', label: 'Demandes d\'achat' },
  { key: 'importExport', label: 'Import/Export' },
  { key: 'journal', label: 'Journal d\'audit' },
  { key: 'settings', label: 'Paramètres' },
  { key: 'personalization', label: 'Personnalisation' },
  { key: 'chatLive', label: 'Chat Live' },
  { key: 'sensors', label: 'Capteurs' },
  { key: 'iotDashboard', label: 'Dashboard IoT' },
  { key: 'serviceDashboard', label: 'Dashboard Service' },
  { key: 'mqttLogs', label: 'Logs MQTT' },
  { key: 'whiteboard', label: 'Tableau d\'affichage' },
  { key: 'achat', label: 'Gestion achats' },
  { key: 'timeTracking', label: 'Pointage horaire' },
  { key: 'cameras', label: 'Caméras' },
  { key: 'analyticsChecklists', label: 'Analytics Checklists' },
  { key: 'mes', label: 'M.E.S. - Suivi de production' },
  { key: 'mesReports', label: 'Rapports M.E.S.' },
  { key: 'weeklyReports', label: 'Rapports Hebdomadaires' },
  { key: 'demandesArret', label: 'Demandes d\'arrêt' },
  { key: 'consignes', label: 'Consignes' },
  { key: 'consignationsLoto', label: 'Consignations LOTO' },
  { key: 'autorisationsParticulieres', label: 'Autorisations Particulières' },
  { key: 'training', label: 'Formation' },
  { key: 'contrats', label: 'Contrats' },
  { key: 'aiDashboard', label: 'Tableau de bord IA' },
  { key: 'aiAutomations', label: 'Automatisations IA' },
  { key: 'aiWidgets', label: 'Widgets IA (Adria)' },
];

// Couleurs disponibles pour les badges
const BADGE_COLORS = [
  { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Violet' },
  { bg: 'bg-red-100', text: 'text-red-700', label: 'Rouge' },
  { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Jaune' },
  { bg: 'bg-green-100', text: 'text-green-700', label: 'Vert' },
  { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Bleu' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Indigo' },
  { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Rose' },
  { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Orange' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Cyan' },
  { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Turquoise' },
  { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Gris' },
  { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Ardoise' }
];

const SERVICES = [
  'ADV',
  'LOGISTIQUE', 
  'PRODUCTION',
  'QHSE',
  'MAINTENANCE',
  'LABO',
  'INDUS',
  'DIRECTION',
  'AUTRE'
];

const RolesManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [roles, setRoles] = useState([]);
  const [serviceResponsables, setServiceResponsables] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [activeTab, setActiveTab] = useState('roles');
  
  // État du formulaire de rôle
  const [formData, setFormData] = useState({
    code: '',
    label: '',
    description: '',
    color_bg: 'bg-gray-100',
    color_text: 'text-gray-700',
    permissions: {}
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Charger chaque ressource séparément pour mieux identifier les erreurs
      let rolesData = [];
      let responsablesData = [];
      let usersData = [];
      
      // Charger les rôles
      try {
        rolesData = await rolesAPI.getAll();
      } catch (error) {
        console.error('Erreur chargement rôles:', error);
        toast({
          title: 'Erreur partielle',
          description: 'Impossible de charger les rôles',
          variant: 'destructive'
        });
      }
      
      // Charger les responsables de service
      try {
        responsablesData = await rolesAPI.getServiceResponsables();
      } catch (error) {
        console.error('Erreur chargement responsables:', error);
        // Non bloquant - on continue
      }
      
      // Charger les utilisateurs
      try {
        const response = await api.get('/users');
        const data = response.data;
        // Gérer différents formats de réponse API
        if (Array.isArray(data)) {
          usersData = data;
        } else if (data && Array.isArray(data.data)) {
          usersData = data.data;
        } else if (data && Array.isArray(data.users)) {
          usersData = data.users;
        } else {
          console.warn('Format de réponse utilisateurs inattendu:', data);
          usersData = [];
        }
        console.log(`${usersData.length} utilisateurs chargés pour la gestion des rôles`);
      } catch (error) {
        console.error('Erreur chargement utilisateurs:', error);
        // Non bloquant - on continue
      }
      
      setRoles(rolesData || []);
      setServiceResponsables(responsablesData || []);
      setUsers(usersData || []);
      
    } catch (error) {
      console.error('Erreur chargement:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les données',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = () => {
    setSelectedRole(null);
    setFormData({
      code: '',
      label: '',
      description: '',
      color_bg: 'bg-gray-100',
      color_text: 'text-gray-700',
      permissions: getDefaultPermissions()
    });
    setDialogOpen(true);
  };

  const handleEditRole = (role) => {
    setSelectedRole(role);
    setFormData({
      code: role.code,
      label: role.label,
      description: role.description || '',
      color_bg: role.color_bg,
      color_text: role.color_text,
      permissions: role.permissions || getDefaultPermissions()
    });
    setDialogOpen(true);
  };

  const handleDeleteClick = (role) => {
    setRoleToDelete(role);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await rolesAPI.delete(roleToDelete.id);
      toast({
        title: 'Succès',
        description: 'Rôle supprimé avec succès'
      });
      loadData();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error.response?.data?.detail || 'Impossible de supprimer le rôle',
        variant: 'destructive'
      });
    } finally {
      setDeleteDialogOpen(false);
      setRoleToDelete(null);
    }
  };

  const handleSaveRole = async () => {
    try {
      if (!formData.code || !formData.label) {
        toast({
          title: 'Erreur',
          description: 'Le code et le libellé sont obligatoires',
          variant: 'destructive'
        });
        return;
      }

      if (selectedRole) {
        // Mise à jour
        await rolesAPI.update(selectedRole.id, {
          label: formData.label,
          description: formData.description,
          color_bg: formData.color_bg,
          color_text: formData.color_text,
          permissions: formData.permissions
        });
        toast({
          title: 'Succès',
          description: 'Rôle mis à jour avec succès'
        });
      } else {
        // Création
        await rolesAPI.create(formData);
        toast({
          title: 'Succès',
          description: 'Rôle créé avec succès'
        });
      }
      
      setDialogOpen(false);
      loadData();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error.response?.data?.detail || 'Erreur lors de la sauvegarde',
        variant: 'destructive'
      });
    }
  };

  const handleSetServiceResponsable = async (service, userId) => {
    try {
      if (userId === 'none') {
        await rolesAPI.removeServiceResponsable(service);
        toast({
          title: 'Succès',
          description: `Responsable ${service} supprimé`
        });
      } else {
        await rolesAPI.setServiceResponsable({ service, user_id: userId });
        toast({
          title: 'Succès',
          description: `Responsable ${service} défini`
        });
      }
      loadData();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de définir le responsable',
        variant: 'destructive'
      });
    }
  };

  const getDefaultPermissions = () => {
    const permissions = {};
    MODULES.forEach(m => {
      permissions[m.key] = { view: false, edit: false, delete: false };
    });
    return permissions;
  };

  const togglePermission = (moduleKey, permType) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [moduleKey]: {
          ...prev.permissions[moduleKey],
          [permType]: !prev.permissions[moduleKey]?.[permType]
        }
      }
    }));
  };

  const setAllPermissions = (value) => {
    const newPermissions = {};
    MODULES.forEach(m => {
      newPermissions[m.key] = { view: value, edit: value, delete: value };
    });
    setFormData(prev => ({ ...prev, permissions: newPermissions }));
  };

  const getResponsableForService = (service) => {
    return serviceResponsables.find(r => r.service === service);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/people')}>
            <ArrowLeft size={20} className="mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des rôles</h1>
            <p className="text-gray-600 mt-1">Gérez les rôles et leurs permissions par défaut</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <Shield size={16} />
            Rôles
          </TabsTrigger>
          <TabsTrigger value="responsables" className="flex items-center gap-2">
            <UserCheck size={16} />
            Responsables de service
          </TabsTrigger>
        </TabsList>

        {/* Tab Rôles */}
        <TabsContent value="roles" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={handleCreateRole} className="bg-blue-600 hover:bg-blue-700">
              <Plus size={20} className="mr-2" />
              Nouveau rôle
            </Button>
          </div>

          {/* Liste des rôles */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <Card key={role.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${role.color_bg}`}>
                        <Shield size={20} className={role.color_text} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{role.label}</h3>
                        <p className="text-xs text-gray-500">{role.code}</p>
                      </div>
                    </div>
                    {role.is_system && (
                      <Badge variant="outline" className="text-xs">
                        <Lock size={12} className="mr-1" />
                        Système
                      </Badge>
                    )}
                  </div>
                  
                  {role.description && (
                    <p className="text-sm text-gray-600 mb-4">{role.description}</p>
                  )}
                  
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${role.color_bg} ${role.color_text}`}>
                      Aperçu badge
                    </span>
                  </div>

                  <TooltipProvider delayDuration={300}>
                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => handleEditRole(role)}
                          >
                            <Edit size={16} className="mr-1" />
                            Modifier
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">Modifier ce rôle</p>
                          <p className="text-xs text-gray-300">Éditer les permissions et paramètres</p>
                        </TooltipContent>
                      </Tooltip>
                      {!role.is_system && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteClick(role)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">Supprimer ce rôle</p>
                            <p className="text-xs text-gray-300">Les utilisateurs avec ce rôle seront affectés</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab Responsables de service */}
        <TabsContent value="responsables" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building size={20} />
                Responsables par service
              </CardTitle>
              <p className="text-sm text-gray-500">
                Définissez un responsable pour chaque service. Ces responsables auront accès à des fonctions spécifiques de supervision.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {SERVICES.map((service) => {
                  const responsable = getResponsableForService(service);
                  return (
                    <div key={service} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-100 rounded-lg">
                          <UserCheck size={20} className="text-teal-700" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{service}</h4>
                          {responsable ? (
                            <p className="text-sm text-gray-600">{responsable.user_name}</p>
                          ) : (
                            <p className="text-sm text-gray-400">Non assigné</p>
                          )}
                        </div>
                      </div>
                      <Select
                        value={responsable?.user_id || 'none'}
                        onValueChange={(value) => handleSetServiceResponsable(service, value)}
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Sélectionner un responsable" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Non assigné</SelectItem>
                          {users.map(user => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.prenom} {user.nom}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog création/modification de rôle */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedRole ? `Modifier le rôle: ${selectedRole.label}` : 'Nouveau rôle'}
            </DialogTitle>
            <DialogDescription>
              {selectedRole?.is_system 
                ? 'Ce rôle système ne peut pas être supprimé mais ses permissions peuvent être modifiées.'
                : 'Configurez le rôle et ses permissions par défaut.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Informations de base */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Code du rôle *</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="Ex: RSP_QUALITE"
                  disabled={selectedRole?.is_system}
                />
                <p className="text-xs text-gray-500 mt-1">Identifiant unique en majuscules</p>
              </div>
              <div>
                <Label>Libellé *</Label>
                <Input
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Ex: Responsable Qualité"
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description du rôle..."
                rows={2}
              />
            </div>

            {/* Couleur du badge */}
            <div>
              <Label>Couleur du badge</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {BADGE_COLORS.map((color) => (
                  <button
                    key={color.bg}
                    type="button"
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${color.bg} ${color.text} ${
                      formData.color_bg === color.bg ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                    }`}
                    onClick={() => setFormData({ ...formData, color_bg: color.bg, color_text: color.text })}
                  >
                    {color.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Label className="text-lg">Permissions par défaut</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAllPermissions(true)}>
                    Tout autoriser
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAllPermissions(false)}>
                    Tout refuser
                  </Button>
                </div>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Module</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-700 w-24">Voir</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-700 w-24">Éditer</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-700 w-24">Supprimer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {MODULES.map((module) => (
                      <tr key={module.key} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{module.label}</td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            checked={formData.permissions[module.key]?.view || false}
                            onCheckedChange={() => togglePermission(module.key, 'view')}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            checked={formData.permissions[module.key]?.edit || false}
                            onCheckedChange={() => togglePermission(module.key, 'edit')}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            checked={formData.permissions[module.key]?.delete || false}
                            onCheckedChange={() => togglePermission(module.key, 'delete')}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveRole} className="bg-blue-600 hover:bg-blue-700">
              <Save size={16} className="mr-2" />
              {selectedRole ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation de suppression */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le rôle</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer le rôle "{roleToDelete?.label}" ? 
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RolesManagement;
