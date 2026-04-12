import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { User, Mail, Phone, Lock, Bell, BellOff, Globe, Info, HelpCircle, Download, BellRing, CheckCircle, AlertTriangle, Monitor, Smartphone, Chrome, ExternalLink, Copy, RefreshCw } from 'lucide-react';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import ChangePasswordDialog from '../components/Common/ChangePasswordDialog';
import SupportRequestDialog from '../components/Common/SupportRequestDialog';
import { GuidedTourSettings, ChangelogAdmin } from '../components/Settings';
import { authAPI } from '../services/api';
import api from '../services/api';
import { formatErrorMessage } from '../utils/errorFormatter';
import { usePushNotifications, usePlatformInstall } from '../hooks/usePWA';

const Settings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changePasswordDialogOpen, setChangePasswordDialogOpen] = useState(false);
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [responsableInfo, setResponsableInfo] = useState(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const { permission, isSubscribed, isSupported, subscribe, testNotification, unsubscribe } = usePushNotifications();
  const { platform, isIncognito, incognitoChecked, canInstall, isInstalled, install, installMethod, appUrl } = usePlatformInstall();
  const [copySuccess, setCopySuccess] = useState(false);
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
                {/* Statut actuel */}
                <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-gray-50 border">
                  {!isSupported ? (
                    <><AlertTriangle size={16} className="text-gray-400" /><span className="text-sm text-gray-500">Non supporté par ce navigateur</span></>
                  ) : permission === 'denied' ? (
                    <><AlertTriangle size={16} className="text-red-500" /><span className="text-sm text-red-600 font-medium">Notifications bloquées dans le navigateur</span></>
                  ) : permission === 'granted' && isSubscribed ? (
                    <><CheckCircle size={16} className="text-green-500" /><span className="text-sm text-green-700 font-medium">Notifications push actives sur cet appareil</span></>
                  ) : (
                    <><BellRing size={16} className="text-gray-400" /><span className="text-sm text-gray-600">Notifications non activées</span></>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={permission === 'granted' && isSubscribed ? 'outline' : 'default'}
                    className="flex-1 justify-center"
                    disabled={!isSupported || permission === 'denied' || notifLoading}
                    onClick={async () => {
                      setNotifLoading(true);
                      try {
                        if (permission === 'granted' && isSubscribed) {
                          // Test existing subscription
                          const testResult = await testNotification();
                          if (testResult?.sent > 0) {
                            toast({ title: 'Notification de test envoyée', description: 'Vous devriez la recevoir dans quelques secondes.' });
                          } else {
                            // Subscription expired - force re-subscribe with proper cleanup
                            toast({ title: 'Renouvellement en cours...', description: 'Désabonnement puis réabonnement en cours.' });
                            try {
                              await unsubscribe();
                            } catch {}
                            // Délai important : laisse le navigateur finaliser le désabonnement
                            // avec le service push (FCM/Mozilla) avant de créer un nouvel abonnement
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            const result = await subscribe();
                            if (result?.subscribed) {
                              toast({ title: 'Abonnement renouvelé', description: 'Vous recevrez à nouveau les notifications.' });
                            } else if (result?.error === 'needs_page_refresh') {
                              toast({ 
                                title: 'Action requise', 
                                description: 'Votre ancien abonnement a été supprimé. Rafraîchissez la page (F5) puis cliquez à nouveau sur "Activer les notifications".',
                                variant: 'destructive' 
                              });
                            } else {
                              toast({ 
                                title: 'Rafraîchissement requis', 
                                description: 'Veuillez rafraîchir la page (F5) et cliquer à nouveau sur "Activer les notifications".',
                                variant: 'destructive' 
                              });
                            }
                          }
                        } else {
                          const result = await subscribe();
                          if (result.subscribed) {
                            toast({ title: 'Notifications activées', description: 'Vous recevrez désormais les notifications push sur cet appareil.' });
                          } else if (result.permissionGranted) {
                            let errMsg;
                            const err = result.error || '';
                            if (err.includes('needs_page_refresh')) {
                              errMsg = 'Votre ancien abonnement expiré a été supprimé. Veuillez rafraîchir la page (F5) puis cliquer à nouveau sur "Activer les notifications".';
                            } else if (err.includes('vapid') || err.includes('VAPID')) {
                              errMsg = 'Le serveur n\'a pas de clés VAPID configurées. Contactez l\'administrateur.';
                            } else if (err.includes('Registration failed') || err.includes('AbortError')) {
                              errMsg = 'Le service push de votre navigateur a refusé l\'abonnement. Solutions : 1) Rafraîchissez la page (F5) et réessayez. 2) Désactivez votre VPN si actif. 3) Vérifiez que les notifications système sont activées pour ce navigateur dans les paramètres de votre appareil. 4) Essayez sur un autre navigateur (Chrome recommandé).';
                            } else if (err.includes('backend_error')) {
                              errMsg = 'Erreur serveur lors de l\'enregistrement. Réessayez dans quelques instants.';
                            } else {
                              errMsg = `Activation impossible : ${err || 'erreur inconnue'}`;
                            }
                            toast({ title: 'Activation échouée', description: errMsg, variant: 'destructive' });
                          } else {
                            toast({ title: 'Permission refusée', description: 'Activez les notifications dans les paramètres de votre navigateur.', variant: 'destructive' });
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
                    {notifLoading ? 'En cours...' : permission === 'granted' && isSubscribed ? 'Envoyer une notification test' : 'Activer les notifications'}
                  </Button>

                  {/* Bouton désactiver si abonné */}
                  {permission === 'granted' && isSubscribed && (
                    <Button
                      variant="ghost"
                      className="text-gray-400 hover:text-red-500 hover:bg-red-50 px-3"
                      disabled={notifLoading}
                      onClick={async () => {
                        setNotifLoading(true);
                        try {
                          await unsubscribe();
                          toast({ title: 'Notifications désactivées', description: 'Vous ne recevrez plus de notifications push sur cet appareil.' });
                        } catch {
                          toast({ title: 'Erreur', variant: 'destructive' });
                        } finally {
                          setNotifLoading(false);
                        }
                      }}
                      data-testid="disable-notifications-btn"
                    >
                      <BellOff className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  {permission === 'denied'
                    ? 'Pour activer : ouvrez les paramètres de votre navigateur → Autorisations → Notifications'
                    : permission === 'granted' && isSubscribed
                      ? 'Cliquez sur "Envoyer une notification test" pour vérifier que tout fonctionne'
                      : 'Activez pour recevoir les alertes de consignes, OT assignés et pannes même quand l\'app est fermée'}
                </p>

                {/* Bouton de réinitialisation — visible uniquement si les notifications sont bloquées */}
                {isSupported && permission !== 'denied' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs text-gray-400 hover:text-amber-600 hover:bg-amber-50 gap-1.5"
                    disabled={notifLoading}
                    data-testid="reset-push-subscription-btn"
                    onClick={async () => {
                      setNotifLoading(true);
                      try {
                        // Supprimer l'abonnement côté navigateur ET backend
                        await unsubscribe();
                        toast({
                          title: 'Abonnement supprimé',
                          description: 'Rafraîchissez la page (F5) puis cliquez "Activer les notifications" pour créer un abonnement frais.',
                        });
                      } catch {
                        toast({ title: 'Rafraîchissez la page (F5) puis réessayez', variant: 'destructive' });
                      } finally {
                        setNotifLoading(false);
                      }
                    }}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Réinitialiser l'abonnement push
                  </Button>
                )}

                {/* ── Info notifications selon la plateforme ────────────── */}
                {isSupported && (() => {
                  const ua = navigator.userAgent || '';
                  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
                  const isAndroid = /Android/.test(ua);
                  if (!isIOS && !isAndroid) return null;
                  return (
                    <div
                      className={`mt-3 rounded-md border px-3 py-2.5 flex items-start gap-2.5 text-xs ${isIOS ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
                      data-testid="platform-push-info"
                    >
                      <Info size={14} className="mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        {isAndroid && (
                          <>
                            <p className="font-semibold">Android — notifications en veille</p>
                            <p>Si vous ne recevez pas les notifications quand l'écran est éteint, autorisez Chrome à fonctionner en arrière-plan sans restriction :</p>
                            <p className="font-mono bg-amber-100 rounded px-1.5 py-0.5 text-amber-900 text-[11px]">Paramètres → Applications → Chrome → Batterie → Non restreint</p>
                          </>
                        )}
                        {isIOS && (
                          <>
                            <p className="font-semibold">iOS — conditions requises</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              <li>iOS 16.4 minimum requis pour les notifications PWA.</li>
                              <li>L'application doit être <strong>installée sur l'écran d'accueil</strong> depuis Safari (pas un simple onglet).</li>
                              <li>Aucun réglage de batterie nécessaire — Apple gère la file d'attente nativement.</li>
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div>
                {/* ── Panneau d'installation contextuel ────────────────── */}
                <div className="rounded-lg border bg-gray-50 p-3 space-y-3" data-testid="pwa-install-panel">

                  {/* En-tête statut */}
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {installMethod === 'installed' ? (
                      <><CheckCircle size={16} className="text-green-600" /><span className="text-green-700">Application installée sur cet appareil</span></>
                    ) : installMethod === 'prompt' ? (
                      <><Download size={16} className="text-blue-600" /><span className="text-blue-700">Installation disponible</span></>
                    ) : (
                      <><Monitor size={16} className="text-gray-600" /><span className="text-gray-700">Guide d'installation — {platform?.osName} · {platform?.browserName}</span></>
                    )}
                  </div>

                  {/* Alerte mode privé */}
                  {incognitoChecked && isIncognito && installMethod !== 'installed' && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">Mode navigation privée détecté</p>
                        <p>Le bouton d'installation automatique est bloqué par votre navigateur en mode privé. Utilisez la méthode manuelle ci-dessous ou ouvrez l'application dans une fenêtre normale pour activer l'installation en un clic.</p>
                        <button
                          className="mt-1 underline font-semibold"
                          onClick={() => window.open(appUrl, '_blank', 'noopener')}
                        >
                          Ouvrir dans une fenêtre normale →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CAS A : bouton natif disponible */}
                  {installMethod === 'prompt' && (
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={async () => {
                        const accepted = await install();
                        if (accepted) toast({ title: 'Application installée', description: 'FSAO Iris est maintenant disponible sur votre appareil.' });
                      }}
                      data-testid="install-app-btn"
                    >
                      <Download size={16} className="mr-2" />
                      Installer FSAO Iris
                    </Button>
                  )}

                  {/* CAS B : déjà installée */}
                  {installMethod === 'installed' && (
                    <p className="text-xs text-green-700">✓ L'application est accessible depuis votre écran d'accueil ou bureau.</p>
                  )}

                  {/* CAS C : iOS Safari — Partager → Écran d'accueil */}
                  {(installMethod === 'ios-safari') && (
                    <ol className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>Touchez l'icône <strong>Partager</strong> <span className="inline-block border rounded px-1 text-blue-600">↑</span> en bas de Safari</li>
                      <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>Faites défiler et touchez <strong>"Sur l'écran d'accueil"</strong> <span className="inline-block border rounded px-1">＋</span></li>
                      <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>Touchez <strong>"Ajouter"</strong> en haut à droite pour confirmer</li>
                    </ol>
                  )}

                  {/* CAS D : iOS Chrome → ouvrir dans Safari */}
                  {installMethod === 'ios-chrome' && (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-700">Chrome sur iOS ne permet pas l'installation. Ouvrez l'application dans <strong>Safari</strong> :</p>
                      <ol className="space-y-2 text-sm text-gray-700">
                        <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>Copiez l'adresse ci-dessous</li>
                        <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>Ouvrez <strong>Safari</strong> et collez l'adresse</li>
                        <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>Touchez <strong>Partager ↑ → Sur l'écran d'accueil</strong></li>
                      </ol>
                      <div className="flex gap-2 items-center mt-1">
                        <code className="flex-1 text-xs bg-white border rounded px-2 py-1 truncate">{appUrl}</code>
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { navigator.clipboard.writeText(appUrl); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); }}>
                          {copySuccess ? <CheckCircle size={12} className="text-green-600" /> : <Copy size={12} />}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* CAS E : Android ou Desktop — menu navigateur */}
                  {(installMethod === 'desktop-menu' || installMethod === 'android-menu') && (
                    <div className="space-y-2">
                      {isIncognito && (
                        <p className="text-xs text-amber-700 font-medium">↓ Méthode disponible même en mode privé :</p>
                      )}
                      <ol className="space-y-2 text-sm text-gray-700">
                        <li className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                          {installMethod === 'android-menu'
                            ? <>Regardez la <strong>barre d'adresse</strong> : une icône <span className="border rounded px-1 font-bold">⊕</span> ou <span className="border rounded px-1">↓</span> peut apparaître à droite</>
                            : <>Regardez la <strong>barre d'adresse</strong> à droite : cherchez l'icône <span className="border rounded px-1 font-bold">⊕</span> (Installer)</>
                          }
                        </li>
                        <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>Si absent, cliquez sur le <strong>menu ⋮</strong> (3 points en haut à droite)</li>
                        <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>Sélectionnez <strong>"Installer l'application"</strong> ou <strong>"Ajouter à l'écran d'accueil"</strong></li>
                      </ol>
                      {/* Tentative de forcer l'ouverture hors mode privé */}
                      {isIncognito && (
                        <Button variant="outline" size="sm" className="w-full mt-1 text-xs" onClick={() => window.open(appUrl, '_blank', 'noopener')}>
                          <ExternalLink size={12} className="mr-1" /> Ouvrir dans une fenêtre normale
                        </Button>
                      )}
                    </div>
                  )}

                  {/* CAS F : Firefox */}
                  {installMethod === 'firefox' && (
                    <div className="space-y-2 text-sm text-gray-700">
                      <p className="text-amber-700 font-medium flex items-center gap-1"><AlertTriangle size={14} /> Firefox ne supporte pas l'installation de PWA.</p>
                      <p>Pour installer FSAO Iris, utilisez :</p>
                      <div className="flex gap-2">
                        <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer" className="flex-1">
                          <Button variant="outline" size="sm" className="w-full text-xs"><ExternalLink size={12} className="mr-1" />Google Chrome</Button>
                        </a>
                        <a href="https://www.microsoft.com/edge/" target="_blank" rel="noopener noreferrer" className="flex-1">
                          <Button variant="outline" size="sm" className="w-full text-xs"><ExternalLink size={12} className="mr-1" />Microsoft Edge</Button>
                        </a>
                      </div>
                      <div className="mt-1">
                        <p className="text-xs text-gray-500 mb-1">Ou copiez l'adresse :</p>
                        <div className="flex gap-2 items-center">
                          <code className="flex-1 text-xs bg-white border rounded px-2 py-1 truncate">{appUrl}</code>
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { navigator.clipboard.writeText(appUrl); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); }}>
                            {copySuccess ? <CheckCircle size={12} className="text-green-600" /> : <Copy size={12} />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CAS G : Inconnu */}
                  {installMethod === 'unknown' && (
                    <div className="space-y-1 text-sm text-gray-700">
                      <p>Utilisez le menu de votre navigateur pour trouver l'option <strong>"Installer l'application"</strong> ou <strong>"Ajouter à l'écran d'accueil"</strong>.</p>
                      <div className="flex gap-2 items-center mt-2">
                        <code className="flex-1 text-xs bg-white border rounded px-2 py-1 truncate">{appUrl}</code>
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { navigator.clipboard.writeText(appUrl); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); }}>
                          {copySuccess ? <CheckCircle size={12} className="text-green-600" /> : <Copy size={12} />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
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