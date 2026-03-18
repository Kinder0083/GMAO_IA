import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Plus, Search, Users as UsersIcon, Mail, Phone, Trash2, Settings, UserPlus, Edit, Shield, Wifi, WifiOff, BellRing, Monitor } from 'lucide-react';
import UserProfileDialog from '../components/Common/UserProfileDialog';
import InviteMemberDialog from '../components/Common/InviteMemberDialog';
import CreateMemberDialog from '../components/Common/CreateMemberDialog';
import EditUserDialog from '../components/Common/EditUserDialog';
import PermissionsManagementDialog from '../components/Common/PermissionsManagementDialog';
import DeleteConfirmDialog from '../components/Common/DeleteConfirmDialog';
import UserHeaderSettingsDialog from '../components/Users/UserHeaderSettingsDialog';
import { usersAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { formatErrorMessage } from '../utils/errorFormatter';
import { useRealtimeData } from '../hooks/useRealtimeData';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import api from '../services/api';

const People = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [pushTestLoading, setPushTestLoading] = useState(null);
  const [headerSettingsOpen, setHeaderSettingsOpen] = useState(false);
  const [headerSettingsUser, setHeaderSettingsUser] = useState(null);

  const handleTestPushNotification = async (user) => {
    setPushTestLoading(user.id);
    try {
      const response = await api.post(`/push-notifications/test/${user.id}`);
      const data = response.data;
      const parts = [];
      if (data.expo?.sent) parts.push(`Expo: ${data.expo.tokens} appareil(s)`);
      if (data.web_push?.sent && data.web_push?.delivered > 0) parts.push(`Web Push: ${data.web_push.delivered} envoyee(s)`);
      if (data.web_push?.failed > 0) parts.push(`Web Push: ${data.web_push.failed} echouee(s)`);
      if (!data.expo?.sent && !data.web_push?.sent) parts.push('Aucun canal actif');
      toast({
        title: parts.length > 0 && (data.expo?.sent || data.web_push?.delivered > 0) ? 'Notification envoyee' : 'Attention',
        description: `${user.prenom} ${user.nom}: ${parts.join(' | ')}`,
        variant: (data.expo?.sent || data.web_push?.delivered > 0) ? 'default' : 'destructive',
      });
    } catch (error) {
      const msg = error.response?.data?.detail || 'Erreur lors de l\'envoi';
      toast({
        title: 'Echec',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setPushTestLoading(null);
    }
  };

  // Fonction pour charger les utilisateurs depuis l'API
  const fetchUsers = useCallback(async () => {
    try {
      const response = await usersAPI.getAll();
      return response?.data || [];
    } catch (error) {
      console.error('[People] Erreur chargement utilisateurs:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les utilisateurs',
        variant: 'destructive'
      });
      return [];
    }
  }, [toast]);

  // Hook temps réel WebSocket pour les utilisateurs
  const {
    data: users,
    loading,
    wsConnected,
    refresh: loadUsers
  } = useRealtimeData('users', fetchUsers, {
    enableWebSocket: true,
    fallbackPolling: true,
    pollingInterval: 60000, // 60s polling de secours
  });

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setCurrentUser(user);
  };

  const isAdmin = () => {
    return currentUser?.role === 'ADMIN';
  };

  const filteredUsers = users.filter(user => {
    // Masquer le compte de secours pour tous sauf l'admin
    if (user.email === 'buenogy@gmail.com' && currentUser?.role !== 'ADMIN') {
      return false;
    }
    
    const matchesSearch = user.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'ALL' || user.role === filterRole;
    return matchesSearch && matchesRole;
  });

  // Comptabiliser uniquement les membres qui ne sont pas le compte de secours
  const activeUsersCount = users.filter(u => u.email !== 'buenogy@gmail.com').length;

  const getRoleBadge = (role) => {
    const badges = {
      'ADMIN': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Administrateur' },
      'DIRECTEUR': { bg: 'bg-red-100', text: 'text-red-700', label: 'Directeur' },
      'QHSE': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'QHSE' },
      'RSP_PROD': { bg: 'bg-green-100', text: 'text-green-700', label: 'RSP Prod.' },
      'PROD': { bg: 'bg-green-100', text: 'text-green-600', label: 'Prod.' },
      'INDUS': { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Indus.' },
      'LOGISTIQUE': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Logistique' },
      'LABO': { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Labo.' },
      'ADV': { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'ADV' },
      'TECHNICIEN': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Technicien' },
      'VISUALISEUR': { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Visualiseur' }
    };
    const badge = badges[role] || badges['VISUALISEUR'];
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const handleViewProfile = (user) => {
    setSelectedUser(user);
    setProfileDialogOpen(true);
  };

  const handleContact = (user) => {
    window.location.href = `mailto:${user.email}`;
  };

  const handleDeleteClick = (user) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await usersAPI.delete(selectedUser.id);
      toast({
        title: 'Succès',
        description: 'Le membre a été supprimé avec succès'
      });
      loadUsers();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Impossible de supprimer le membre'),
        variant: 'destructive'
      });
    }
  };

  const handleManagePermissions = (user) => {
    setSelectedUser(user);
    setPermissionsDialogOpen(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setEditDialogOpen(true);
  };

  const roles = [
    { value: 'ALL', label: 'Tous', count: activeUsersCount },
    { value: 'ADMIN', label: 'Administrateurs', count: users.filter(u => u.role === 'ADMIN' && u.email !== 'buenogy@gmail.com').length },
    { value: 'DIRECTEUR', label: 'Directeurs', count: users.filter(u => u.role === 'DIRECTEUR' && u.email !== 'buenogy@gmail.com').length },
    { value: 'QHSE', label: 'QHSE', count: users.filter(u => u.role === 'QHSE' && u.email !== 'buenogy@gmail.com').length },
    { value: 'RSP_PROD', label: 'RSP Prod.', count: users.filter(u => u.role === 'RSP_PROD' && u.email !== 'buenogy@gmail.com').length },
    { value: 'PROD', label: 'Prod.', count: users.filter(u => u.role === 'PROD' && u.email !== 'buenogy@gmail.com').length },
    { value: 'INDUS', label: 'Indus.', count: users.filter(u => u.role === 'INDUS' && u.email !== 'buenogy@gmail.com').length },
    { value: 'LOGISTIQUE', label: 'Logistique', count: users.filter(u => u.role === 'LOGISTIQUE' && u.email !== 'buenogy@gmail.com').length },
    { value: 'LABO', label: 'Labo.', count: users.filter(u => u.role === 'LABO' && u.email !== 'buenogy@gmail.com').length },
    { value: 'ADV', label: 'ADV', count: users.filter(u => u.role === 'ADV' && u.email !== 'buenogy@gmail.com').length },
    { value: 'TECHNICIEN', label: 'Techniciens', count: users.filter(u => u.role === 'TECHNICIEN' && u.email !== 'buenogy@gmail.com').length },
    { value: 'VISUALISEUR', label: 'Visualiseurs', count: users.filter(u => u.role === 'VISUALISEUR' && u.email !== 'buenogy@gmail.com').length }
  ];

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Utilisateurs</h1>
            <p className="text-gray-600 mt-1">Gérez les membres de votre équipe</p>
          </div>
          {/* Indicateur de connexion temps réel */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                wsConnected 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {wsConnected ? (
                  <Wifi size={14} className="text-green-600" />
                ) : (
                  <WifiOff size={14} className="text-gray-500" />
                )}
                <span>{wsConnected ? 'Temps réel' : 'Hors ligne'}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
              <p className="font-medium">{wsConnected ? 'Synchronisation active' : 'Mode hors ligne'}</p>
              <p className="text-xs text-gray-300 mt-1">
                {wsConnected 
                  ? 'Les modifications sont synchronisées en temps réel' 
                  : 'Actualisation automatique toutes les 60 secondes'}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        {isAdmin() && (
          <div className="flex gap-3">
            <Button 
              variant="outline"
              className="border-purple-600 text-purple-600 hover:bg-purple-50" 
              onClick={() => navigate('/people/roles')}
            >
              <Shield size={20} className="mr-2" />
              Gestion des rôles
            </Button>
            <Button 
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50" 
              onClick={() => setInviteDialogOpen(true)}
            >
              <Mail size={20} className="mr-2" />
              Inviter un membre
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              onClick={() => setCreateDialogOpen(true)}
            >
              <UserPlus size={20} className="mr-2" />
              Créer un membre
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {roles.map((role, index) => {
          const colors = ['blue', 'purple', 'green', 'gray'];
          const color = colors[index % colors.length];
          return (
            <Card key={role.value} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setFilterRole(role.value)}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{role.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{role.count}</p>
                  </div>
                  <div className={`bg-${color}-100 p-3 rounded-xl`}>
                    <UsersIcon size={24} className={`text-${color}-600`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <Input
                  placeholder="Rechercher par nom ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {roles.map(role => (
                <Button
                  key={role.value}
                  variant={filterRole === role.value ? 'default' : 'outline'}
                  onClick={() => setFilterRole(role.value)}
                  size="sm"
                  className={filterRole === role.value ? 'bg-blue-600 hover:bg-blue-700' : ''}
                >
                  {role.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-8">
            <p className="text-gray-500">Chargement...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="col-span-full text-center py-8">
            <p className="text-gray-500">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          filteredUsers.map((user) => (
            <Card key={user.id} className="hover:shadow-xl transition-all duration-300 relative">
              <CardContent className="pt-6">
                {/* Bouton test notification push - Admin uniquement */}
                {isAdmin() && (
                  <div className="absolute top-3 right-3">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`push-test-btn-${user.id}`}
                            className="h-8 w-8 text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                            disabled={pushTestLoading === user.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestPushNotification(user);
                            }}
                          >
                            <BellRing size={16} className={pushTestLoading === user.id ? 'animate-pulse' : ''} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Tester la notification push</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
                <div className="flex flex-col items-center text-center">
                  {/* Avatar */}
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center mb-4 shadow-lg">
                    <span className="text-white text-2xl font-bold">
                      {user.prenom[0]}{user.nom[0]}
                    </span>
                  </div>

                  {/* Name */}
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {user.prenom} {user.nom}
                  </h3>

                  {/* Role Badge */}
                  <div className="mb-4">
                    {getRoleBadge(user.role)}
                  </div>

                  {/* Service */}
                  {user.service && (
                    <div className="mb-3 w-full">
                      <div className="bg-blue-50 px-3 py-2 rounded-lg">
                        <p className="text-xs text-gray-600">Service</p>
                        <p className="text-sm font-semibold text-blue-700">{user.service}</p>
                      </div>
                    </div>
                  )}

                  {/* Contact Info */}
                  <div className="space-y-2 w-full">
                    <div className="flex items-center gap-2 text-sm text-gray-600 justify-center">
                      <Mail size={16} />
                      <span className="truncate">{user.email}</span>
                    </div>
                    {user.telephone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 justify-center">
                        <Phone size={16} />
                        <span>{user.telephone}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-6 w-full">
                    <Button 
                      variant="outline" 
                      className="flex-1 hover:bg-blue-50 hover:text-blue-600"
                      onClick={() => handleViewProfile(user)}
                    >
                      Voir profil
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 hover:bg-gray-100"
                      onClick={() => handleContact(user)}
                    >
                      Contacter
                    </Button>
                  </div>

                  {/* Admin Actions */}
                  {isAdmin() && user.id !== currentUser?.id && (
                    <div className="flex gap-2 mt-2 w-full">
                      <Button 
                        variant="outline" 
                        className="flex-1 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
                        onClick={() => handleEditUser(user)}
                      >
                        <Edit size={16} className="mr-2" />
                        Modifier
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300"
                        onClick={() => handleManagePermissions(user)}
                      >
                        <Settings size={16} className="mr-2" />
                        Permissions
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
                        onClick={() => { setHeaderSettingsUser(user); setHeaderSettingsOpen(true); }}
                        data-testid={`btn-header-settings-${user.id}`}
                      >
                        <Monitor size={16} className="mr-2" />
                        Headers
                      </Button>
                      <Button 
                        variant="outline" 
                        className="hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                        onClick={() => handleDeleteClick(user)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <UserProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        user={selectedUser}
      />

      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onSuccess={loadUsers}
      />

      <CreateMemberDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={loadUsers}
      />

      <EditUserDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        user={selectedUser}
        onSuccess={loadUsers}
      />

      <PermissionsManagementDialog
        open={permissionsDialogOpen}
        onOpenChange={setPermissionsDialogOpen}
        user={selectedUser}
        onSuccess={loadUsers}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        title="Supprimer le membre"
        description={`Êtes-vous sûr de vouloir supprimer ${selectedUser?.prenom} ${selectedUser?.nom} ? Cette action est irréversible.`}
      />

      <UserHeaderSettingsDialog
        open={headerSettingsOpen}
        onOpenChange={setHeaderSettingsOpen}
        user={headerSettingsUser}
      />
    </div>
    </TooltipProvider>
  );
};

export default People;