import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { User, Mail, Phone, Lock, Bell, Globe, Info, HelpCircle, Download, BellRing } from 'lucide-react';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import ChangePasswordDialog from '../components/Common/ChangePasswordDialog';
import SupportRequestDialog from '../components/Common/SupportRequestDialog';
import { GuidedTourSettings, ChangelogAdmin } from '../components/Settings';
import { authAPI } from '../services/api';
import api from '../services/api';
import { formatErrorMessage } from '../utils/errorFormatter';
import { usePushNotifications, useInstallPrompt } from '../hooks/usePWA';

const Settings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [responsableInfo, setResponsableInfo] = useState(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const { permission, isSubscribed, isSupported, subscribe, testNotification, unsubscribe } = usePushNotifications();
  const { canInstall, isInstalled, install } = useInstallPrompt();
  const [settings, setSettings] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    service: '',
    responsable_hierarchique_id: '',
    notifications: true,
    emailNotifications: true,
    smsNotifications: false,
    language: 'fr'
  });
  const [users, setUsers] = useState([]);

  useEffect(() => {
    loadUserProfile();
    loadUsers();
  }, []);

  // Charger le responsable de service quand le service change
  useEffect(() => {
    if (settings.service) {
      loadServiceManager(settings.service);
    } else {
      setResponsableInfo(null);
    }
  }, [settings.service]);

  const loadServiceManager = async (service) => {
    try {
      const response = await api.get(`/users/service-manager/${encodeURIComponent(service)}`);
      setResponsableInfo(response.data);
    } catch (error) {
      // Pas de responsable trouvé pour ce service
      setResponsableInfo(null);
    }
  };

  const loadUserProfile = async () => {
    try {
      setLoading(true);
      const response = await authAPI.getMe();
      const user = response.data;
      
      setSettings({
        nom: user.nom || '',
        prenom: user.prenom || '',
        email: user.email || '',
        telephone: user.telephone || '',
        service: user.service || '',
        responsable_hierarchique_id: user.responsable_hierarchique_id || '',
        notifications: true,
        emailNotifications: true,
        smsNotifications: false,
        language: 'fr'
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger votre profil',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await authAPI.getUsers();
      setUsers(response.data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Envoyer uniquement les champs du profil (pas notifications et language)
      const profileData = {
        nom: settings.nom,
        prenom: settings.prenom,
        email: settings.email,
        telephone: settings.telephone,
        service: settings.service,
        responsable_hierarchique_id: settings.responsable_hierarchique_id || null
      };

      await authAPI.updateProfile(profileData);
      
      // Mettre à jour le localStorage
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({
        ...user,
        ...profileData
      }));

      toast({
        title: 'Succès',
        description: 'Vos modifications ont été enregistrées avec succès'
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Impossible d\'enregistrer les modifications'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-600 mt-1">Gérez vos préférences et paramètres de compte</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Settings */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User size={20} className="text-blue-600" />
                Profil utilisateur
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prenom">Prénom</Label>
                    <Input
                      id="prenom"
                      value={settings.prenom}
                      onChange={(e) => setSettings({ ...settings, prenom: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nom">Nom</Label>
                    <Input
                      id="nom"
                      value={settings.nom}
                      onChange={(e) => setSettings({ ...settings, nom: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      id="email"
                      type="email"
                      value={settings.email}
                      onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telephone">Téléphone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      id="telephone"
                      value={settings.telephone}
                      onChange={(e) => setSettings({ ...settings, telephone: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="service">Service</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info size={14} className="text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Ce champ est défini par un administrateur</p>
                          <p className="text-xs text-gray-400">dans votre profil utilisateur</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="service"
                    value={settings.service || 'Non défini'}
                    disabled
                    className="bg-gray-50 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500">
                    Contactez un administrateur pour modifier votre service
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="responsable">Responsable Hiérarchique (N+1)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info size={14} className="text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Déterminé automatiquement selon votre service</p>
                          <p className="text-xs text-gray-400">via Gestion des rôles → Responsables de service</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="responsable"
                    value={responsableInfo 
                      ? `${responsableInfo.prenom || ''} ${responsableInfo.nom || ''}`.trim() || 'Non défini'
                      : settings.service 
                        ? 'Aucun responsable assigné pour ce service'
                        : 'Service non défini'
                    }
                    disabled
                    className="bg-gray-50 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500">
                    Votre N+1 recevra vos demandes d'amélioration et d'achat pour validation
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock size={20} className="text-blue-600" />
                Sécurité
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setChangePasswordDialogOpen(true)}
                >
                  Changer le mot de passe
                </Button>
                <Button variant="outline" className="w-full justify-start" disabled>
                  Activer l'authentification à deux facteurs
                </Button>
                <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700" disabled>
                  Désactiver le compte
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe size={20} className="text-blue-600" />
                Langue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="language">Langue de l'interface</Label>
                <select
                  id="language"
                  value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download size={20} className="text-blue-600" />
                Application
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={!isSupported || notifLoading}
                  onClick={async () => {
                    setNotifLoading(true);
                    try {
                      if (permission === 'granted' && isSubscribed) {
                        // Test existing subscription
                        const testResult = await testNotification();
                        if (testResult?.sent > 0) {
                          toast({ title: 'Notification envoyee', description: 'Vous devriez la recevoir dans quelques secondes.' });
                        } else {
                          // Subscription expired - force re-subscribe
                          toast({ title: 'Renouvellement en cours...', description: 'L\'abonnement a expire, renouvellement automatique.' });
                          await unsubscribe();
                          const result = await subscribe();
                          if (result?.subscribed) {
                            toast({ title: 'Notifications renouvelees', description: 'Votre abonnement a ete renouvele avec succes.' });
                          } else {
                            toast({ title: 'Erreur de renouvellement', description: result?.error || 'Reessayez plus tard.', variant: 'destructive' });
                          }
                        }
                      } else {
                        const result = await subscribe();
                        if (result.permissionGranted) {
                          toast({ title: 'Notifications activees', description: result.subscribed ? 'Vous recevrez les notifications push.' : 'Permission accordee.' });
                        } else {
                          toast({ title: 'Permission refusee', description: 'Activez les notifications dans les parametres de votre navigateur.', variant: 'destructive' });
                        }
                      }
                    } catch {
                      toast({ title: 'Erreur', variant: 'destructive' });
                    } finally {
                      setNotifLoading(false);
                    }
                  }}
                  data-testid="enable-notifications-btn"
                >
                  <BellRing className="h-4 w-4 mr-2 flex-shrink-0" />
                  {notifLoading ? 'En cours...' : permission === 'granted' ? (isSubscribed ? 'Tester les notifications' : 'Reactiver les notifications') : 'Activer les notifications'}
                </Button>
                <p className="text-xs text-gray-500 mt-1">
                  {!isSupported
                    ? 'Notifications non supportees par ce navigateur'
                    : permission === 'granted'
                      ? isSubscribed
                        ? 'Cliquez pour tester ou forcer le renouvellement si besoin'
                        : 'L\'abonnement push necessite une reactivation'
                      : permission === 'denied'
                        ? 'Bloquees - reactivez-les dans les parametres du navigateur'
                        : 'Recevez des alertes en temps reel'}
                </p>
              </div>
              <div>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={isInstalled}
                  onClick={async () => {
                    if (canInstall) {
                      const accepted = await install();
                      if (accepted) {
                        toast({ title: 'Application installee', description: 'FSAO Iris est maintenant disponible sur votre appareil.' });
                      }
                    } else {
                      toast({
                        title: 'Installation manuelle',
                        description: 'Utilisez le menu de votre navigateur (3 points) puis "Installer l\'application" ou "Ajouter a l\'ecran d\'accueil".',
                      });
                    }
                  }}
                  data-testid="install-app-btn"
                >
                  <Download className="h-4 w-4 mr-2 flex-shrink-0" />
                  {isInstalled ? 'Application installee' : 'Installer l\'application'}
                </Button>
                <p className="text-xs text-gray-500 mt-1">
                  {isInstalled
                    ? 'L\'application est installee sur cet appareil'
                    : canInstall
                      ? 'Installez l\'application pour un acces rapide'
                      : 'Via le menu du navigateur : "Installer l\'application"'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-blue-900 mb-2">Besoin d'aide ?</h3>
              <p className="text-sm text-blue-700 mb-4">
                Contactez le support pour toute question ou problème
              </p>
              <Button 
                variant="outline" 
                className="w-full border-blue-600 text-blue-600 hover:bg-blue-100"
                onClick={() => setSupportDialogOpen(true)}
              >
                <HelpCircle className="h-4 w-4 mr-2" />
                Centre d'aide
              </Button>
            </CardContent>
          </Card>

          {/* Visite guidée */}
          <GuidedTourSettings />
        </div>
      </div>

      {/* Changelog Admin (visible uniquement pour les admins) */}
      {JSON.parse(localStorage.getItem('user') || '{}').role === 'ADMIN' && (
        <ChangelogAdmin />
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          className="bg-blue-600 hover:bg-blue-700 text-white px-8"
          disabled={saving}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
        </Button>
      </div>

      {/* Change Password Dialog */}
      <ChangePasswordDialog 
        open={changePasswordDialogOpen}
        onOpenChange={setChangePasswordDialogOpen}
      />

      {/* Support Request Dialog */}
      <SupportRequestDialog
        open={supportDialogOpen}
        onOpenChange={setSupportDialogOpen}
      />
    </div>
  );
};

export default Settings;