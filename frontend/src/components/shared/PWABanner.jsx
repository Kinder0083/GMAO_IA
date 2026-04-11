import React, { useEffect, useState, useRef } from 'react';
import { X, Download, Bell, BellOff } from 'lucide-react';
import { Button } from '../ui/button';
import { usePushNotifications, useInstallPrompt } from '../../hooks/usePWA';
import { useToast } from '../../hooks/use-toast';

const DISMISS_INSTALL_KEY = 'pwa_install_dismissed_at';
const DISMISS_NOTIF_KEY = 'pwa_notif_dismissed_at';
const DISMISS_RESUBSCRIBE_KEY = 'pwa_resubscribe_dismissed_at';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const RESUBSCRIBE_DISMISS_MS = 24 * 60 * 60 * 1000;   // 24h seulement (plus urgent)

function wasDismissedRecently(key, duration = DISMISS_DURATION_MS) {
  const val = localStorage.getItem(key);
  if (!val) return false;
  return (Date.now() - parseInt(val, 10)) < duration;
}

const PWABanner = () => {
  const { canInstall, isInstalled, install } = useInstallPrompt();
  const { permission, isSubscribed, isSupported, subscribe, testNotification } = usePushNotifications();
  const { toast } = useToast();
  const [installDismissed, setInstallDismissed] = useState(() => wasDismissedRecently(DISMISS_INSTALL_KEY));
  const [notifDismissed, setNotifDismissed] = useState(() => wasDismissedRecently(DISMISS_NOTIF_KEY));
  const [resubscribeDismissed, setResubscribeDismissed] = useState(() => wasDismissedRecently(DISMISS_RESUBSCRIBE_KEY, RESUBSCRIBE_DISMISS_MS));
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [showResubscribeBanner, setShowResubscribeBanner] = useState(false);
  const [resubscribing, setResubscribing] = useState(false);
  const syncDoneRef = useRef(false);

  // Auto-subscribe on login if permission already granted (silently, en arrière-plan)
  useEffect(() => {
    if (isSupported && permission === 'granted' && !isSubscribed) {
      subscribe().then(() => { syncDoneRef.current = true; });
    } else if (permission === 'granted' && isSubscribed) {
      syncDoneRef.current = true;
    }
  }, [isSupported, permission, isSubscribed, subscribe]);

  // Après 4s : si permission accordée mais toujours pas abonné → bannière de réabonnement
  useEffect(() => {
    if (!isSupported || resubscribeDismissed) return;
    if (permission !== 'granted') return;
    // Attendre que la tentative auto-subscribe ait eu le temps de s'exécuter
    const timer = setTimeout(() => {
      if (!isSubscribed) {
        setShowResubscribeBanner(true);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [isSupported, permission, isSubscribed, resubscribeDismissed]);

  // Masquer la bannière réabonnement dès que l'abonnement est rétabli
  useEffect(() => {
    if (isSubscribed) setShowResubscribeBanner(false);
  }, [isSubscribed]);

  // Show notification banner after delay, only if not dismissed and not already granted
  useEffect(() => {
    if (isSupported && permission === 'default' && !isSubscribed && !notifDismissed) {
      const timer = setTimeout(() => setShowNotifBanner(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, permission, isSubscribed, notifDismissed]);

  const dismissInstall = () => {
    localStorage.setItem(DISMISS_INSTALL_KEY, Date.now().toString());
    setInstallDismissed(true);
  };

  const dismissNotif = () => {
    localStorage.setItem(DISMISS_NOTIF_KEY, Date.now().toString());
    setNotifDismissed(true);
    setShowNotifBanner(false);
  };

  const dismissResubscribe = () => {
    localStorage.setItem(DISMISS_RESUBSCRIBE_KEY, Date.now().toString());
    setResubscribeDismissed(true);
    setShowResubscribeBanner(false);
  };

  const handleInstall = async () => {
    const accepted = await install();
    if (accepted) {
      toast({ title: 'Application installee', description: 'FSAO Iris a ete ajoutee a votre ecran d\'accueil' });
    }
  };

  const handleEnableNotifications = async () => {
    const result = await subscribe();
    setShowNotifBanner(false);
    if (result?.permissionGranted) {
      localStorage.setItem(DISMISS_NOTIF_KEY, Date.now().toString());
      setNotifDismissed(true);
      if (result?.subscribed) {
        toast({ title: 'Notifications activees', description: 'Vous recevrez les alertes en temps reel' });
        const testResult = await testNotification();
        if (testResult?.sent > 0) {
          toast({ title: 'Test envoye', description: 'Vous devriez recevoir une notification de test dans quelques secondes' });
        }
      } else {
        toast({ title: 'Permission accordee', description: `Abonnement push incomplet (${result?.error || 'inconnu'}). Verifiez la console pour les details.`, variant: 'destructive' });
      }
    } else {
      localStorage.setItem(DISMISS_NOTIF_KEY, Date.now().toString());
      setNotifDismissed(true);
      toast({ title: 'Notifications refusees', description: 'Verifiez les permissions du site dans les parametres du navigateur > Parametres du site > Notifications', variant: 'destructive' });
    }
  };

  const handleResubscribe = async () => {
    setResubscribing(true);
    try {
      const result = await subscribe();
      if (result?.subscribed) {
        setShowResubscribeBanner(false);
        toast({ title: 'Notifications reactiveees', description: 'Vous recevrez a nouveau les alertes en temps reel' });
        const testResult = await testNotification();
        if (testResult?.sent > 0) {
          toast({ description: 'Notification de test envoyee !' });
        }
      } else {
        toast({ title: 'Echec du reabonnement', description: result?.error || 'Reessayez dans Parametres > Notifications', variant: 'destructive' });
      }
    } finally {
      setResubscribing(false);
    }
  };

  // Install banner - seulement si non installé, possibilité d'installer, et pas rejeté récemment
  if (canInstall && !isInstalled && !installDismissed) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 p-4 animate-in slide-in-from-bottom-4" data-testid="pwa-install-banner">
        <div className="flex items-start gap-3">
          <div className="bg-blue-600 rounded-lg p-2 flex-shrink-0">
            <Download size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Installer FSAO Iris</p>
            <p className="text-xs text-slate-400 mt-0.5">Acces rapide depuis votre ecran d'accueil + notifications</p>
          </div>
          <button onClick={dismissInstall} className="text-slate-500 hover:text-white p-1 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button onClick={handleInstall} size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" data-testid="pwa-install-btn">
            Installer
          </Button>
          <Button onClick={dismissInstall} size="sm" variant="ghost" className="text-slate-400 hover:text-white">
            Plus tard
          </Button>
        </div>
      </div>
    );
  }

  // Bannière de REABONNEMENT : permission accordée mais abonnement inactif/expiré
  if (showResubscribeBanner && isSupported && permission === 'granted' && !isSubscribed && !resubscribeDismissed) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-amber-900 text-white rounded-xl shadow-2xl border border-amber-700 p-4 animate-in slide-in-from-bottom-4" data-testid="pwa-resubscribe-banner">
        <div className="flex items-start gap-3">
          <div className="bg-amber-600 rounded-lg p-2 flex-shrink-0">
            <BellOff size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Notifications desactivees</p>
            <p className="text-xs text-amber-300 mt-0.5">Votre abonnement a expire. Reactiver pour recevoir les alertes.</p>
          </div>
          <button onClick={dismissResubscribe} className="text-amber-400 hover:text-white p-1 flex-shrink-0" data-testid="pwa-resubscribe-dismiss">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            onClick={handleResubscribe}
            disabled={resubscribing}
            size="sm"
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
            data-testid="pwa-resubscribe-btn"
          >
            {resubscribing ? 'Reactivation...' : 'Reactiver les notifications'}
          </Button>
          <Button onClick={dismissResubscribe} size="sm" variant="ghost" className="text-amber-300 hover:text-white">
            Plus tard
          </Button>
        </div>
      </div>
    );
  }

  // Notification permission banner - seulement si pas encore accordé et pas rejeté récemment
  if (showNotifBanner && isSupported && permission === 'default' && !notifDismissed) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 p-4 animate-in slide-in-from-bottom-4" data-testid="pwa-notif-banner">
        <div className="flex items-start gap-3">
          <div className="bg-amber-600 rounded-lg p-2 flex-shrink-0">
            <Bell size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Activer les notifications</p>
            <p className="text-xs text-slate-400 mt-0.5">Recevez les alertes OT, pannes et messages en temps reel</p>
          </div>
          <button onClick={dismissNotif} className="text-slate-500 hover:text-white p-1 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button onClick={handleEnableNotifications} size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" data-testid="pwa-enable-notif-btn">
            Activer
          </Button>
          <Button onClick={dismissNotif} size="sm" variant="ghost" className="text-slate-400 hover:text-white">
            Non merci
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

export default PWABanner;
