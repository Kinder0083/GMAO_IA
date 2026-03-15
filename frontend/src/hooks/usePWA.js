import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const subscribedRef = useRef(false);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    if (supported && 'Notification' in window) {
      setPermission(Notification.permission);
      // Vérifier si un abonnement push existe déjà
      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(subscription => {
          if (subscription) {
            subscribedRef.current = true;
            setIsSubscribed(true);
          }
        }).catch(() => {});
      }).catch(() => {});
    }
  }, []);

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      return registration;
    } catch (e) {
      console.error('[PWA] SW registration failed:', e);
      return null;
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (subscribedRef.current) return { permissionGranted: true, subscribed: true };

    // Etape 1 : demander la permission en premier (avant tout le reste)
    let perm = Notification.permission;
    if (perm === 'default') {
      try {
        perm = await Notification.requestPermission();
      } catch (e) {
        return { permissionGranted: false, error: 'permission_request_failed' };
      }
    }
    setPermission(perm);
    if (perm !== 'granted') {
      return { permissionGranted: false, error: 'permission_denied' };
    }

    // Etape 2 : abonnement push (optionnel, la permission est deja accordee)
    const token = localStorage.getItem('token');
    if (!token) return { permissionGranted: true, subscribed: false, error: 'no_token' };

    try {
      const keyResp = await fetch(`${API_URL}/api/web-push/vapid-key`);
      if (!keyResp.ok) throw new Error(`vapid_key_error_${keyResp.status}`);
      const { publicKey } = await keyResp.json();
      if (!publicKey) throw new Error('no_vapid_key');

      const registration = await registerServiceWorker();
      if (!registration) throw new Error('sw_registration_failed');

      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      const browser = navigator.userAgent.includes('Firefox') ? 'firefox' :
                      navigator.userAgent.includes('Edg') ? 'edge' :
                      navigator.userAgent.includes('Chrome') ? 'chrome' : 'other';

      const resp = await fetch(`${API_URL}/api/web-push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subscription: subscription.toJSON(), browser })
      });
      if (!resp.ok) throw new Error(`subscribe_backend_error_${resp.status}`);

      subscribedRef.current = true;
      setIsSubscribed(true);
      return { permissionGranted: true, subscribed: true };
    } catch (e) {
      console.error('[PWA] Push subscription failed:', e.message);
      // La permission est accordee meme si l'abonnement push a echoue
      return { permissionGranted: true, subscribed: false, error: e.message };
    }
  }, [registerServiceWorker]);

  const unsubscribe = useCallback(async () => {
    const token = localStorage.getItem('token');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await fetch(`${API_URL}/api/web-push/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
      }
      subscribedRef.current = false;
      setIsSubscribed(false);
    } catch (e) {
      console.error('[PWA] Unsubscribe failed:', e);
    }
  }, []);

  const testNotification = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const resp = await fetch(`${API_URL}/api/web-push/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await resp.json();
    } catch (e) {
      console.error('[PWA] Test notification failed:', e);
      return { error: e.message };
    }
  }, []);

  return { permission, isSubscribed, isSupported, subscribe, unsubscribe, testNotification };
}

// Stockage global de l'evenement beforeinstallprompt
// L'evenement ne se declenche qu'une fois au chargement ; on le stocke pour
// que tout composant monte apres puisse y acceder.
if (!window.__pwaInstallEvent) {
  window.__pwaInstallEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__pwaInstallEvent = e;
    window.dispatchEvent(new Event('pwa-install-available'));
  });
  window.addEventListener('appinstalled', () => {
    window.__pwaInstallEvent = null;
    window.dispatchEvent(new Event('pwa-app-installed'));
  });
}

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(() => window.__pwaInstallEvent);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Verifier si deja installe
    const checkInstalled = async () => {
      try {
        if ('getInstalledRelatedApps' in navigator) {
          const apps = await navigator.getInstalledRelatedApps();
          if (apps.length > 0) {
            setIsInstalled(true);
          }
        }
      } catch {}
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        setIsInstalled(true);
      }
    };
    checkInstalled();

    // Si l'evenement a deja ete capture avant le mount de ce hook
    if (window.__pwaInstallEvent) {
      setInstallPrompt(window.__pwaInstallEvent);
      setIsInstalled(false);
    }

    // Ecouter les nouveaux evenements via le relay global
    const onAvailable = () => {
      setInstallPrompt(window.__pwaInstallEvent);
      setIsInstalled(false);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('pwa-install-available', onAvailable);
    window.addEventListener('pwa-app-installed', onInstalled);

    return () => {
      window.removeEventListener('pwa-install-available', onAvailable);
      window.removeEventListener('pwa-app-installed', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const prompt = installPrompt || window.__pwaInstallEvent;
    if (!prompt) return false;
    prompt.prompt();
    const result = await prompt.userChoice;
    window.__pwaInstallEvent = null;
    setInstallPrompt(null);
    if (result.outcome === 'accepted') {
      setIsInstalled(true);
    }
    return result.outcome === 'accepted';
  }, [installPrompt]);

  return { canInstall: (!!installPrompt || !!window.__pwaInstallEvent) && !isInstalled, isInstalled, install };
}
