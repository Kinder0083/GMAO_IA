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
    if (!supported || !('Notification' in window)) return;

    setPermission(Notification.permission);

    // Auto-sync: if permission already granted, register existing subscription with backend
    if (Notification.permission === 'granted' && !subscribedRef.current) {
      const token = localStorage.getItem('token');
      if (!token) return;

      (async () => {
        try {
          const resp = await fetch(`${API_URL}/api/web-push/vapid-key`);
          if (!resp.ok) return;
          const { publicKey } = await resp.json();
          if (!publicKey) return;

          const registration = await navigator.serviceWorker.register('/sw.js');
          await navigator.serviceWorker.ready;

          let subscription = await registration.pushManager.getSubscription();

          // Si l'abonnement existant utilise une clé VAPID différente → forcer un nouvel abonnement
          if (subscription) {
            try {
              const currentKey = subscription.options && subscription.options.applicationServerKey;
              const newKey = urlBase64ToUint8Array(publicKey);
              if (currentKey) {
                const currentArr = new Uint8Array(currentKey);
                if (currentArr.length !== newKey.length || !currentArr.every((v, i) => v === newKey[i])) {
                  await subscription.unsubscribe();
                  subscription = null;
                }
              }
            } catch {
              // Si la comparaison échoue, forcer un nouvel abonnement par sécurité
              try { await subscription.unsubscribe(); } catch(e) {}
              subscription = null;
            }
          }

          if (!subscription) {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
          }

          const browser = navigator.userAgent.includes('Firefox') ? 'firefox' :
            navigator.userAgent.includes('Edg') ? 'edge' :
            navigator.userAgent.includes('Chrome') ? 'chrome' : 'other';

          const syncResp = await fetch(`${API_URL}/api/web-push/subscribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ subscription: subscription.toJSON(), browser })
          });

          if (syncResp.ok) {
            const syncData = await syncResp.json();
            // Si le backend signale que l'endpoint était mort (410/404), forcer un nouveau
            if (syncData.needs_fresh_subscription) {
              try { await subscription.unsubscribe(); } catch(e) {}
              const freshSub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
              });
              await fetch(`${API_URL}/api/web-push/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ subscription: freshSub.toJSON(), browser })
              });
            }
            subscribedRef.current = true;
            setIsSubscribed(true);
          }
        } catch (e) {
          console.warn('[PWA] Auto-sync failed:', e.message);
        }
      })();
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
    const token = localStorage.getItem('token');
    if (!token) return { permissionGranted: false, subscribed: false, error: 'no_token' };

    try {
      // Request permission
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
      }
      setPermission(perm);
      if (perm !== 'granted') return { permissionGranted: false, error: 'permission_denied' };

      // Get VAPID key
      const keyResp = await fetch(`${API_URL}/api/web-push/vapid-key`);
      if (!keyResp.ok) return { permissionGranted: true, subscribed: false, error: 'vapid_key_error' };
      const { publicKey } = await keyResp.json();
      if (!publicKey) return { permissionGranted: true, subscribed: false, error: 'no_vapid_key' };

      // Enregistrer SW et attendre qu'il contrôle la page
      await navigator.serviceWorker.register('/sw.js');
      const swRegistration = await navigator.serviceWorker.ready;

      // Obtenir l'abonnement existant
      let subscription = await swRegistration.pushManager.getSubscription();

      if (subscription) {
        // Vérifier si l'abonnement utilise la même clé VAPID
        try {
          const currentKey = subscription.options?.applicationServerKey;
          const newKey = urlBase64ToUint8Array(publicKey);
          if (currentKey) {
            const currentArr = new Uint8Array(currentKey);
            const keysMatch = currentArr.length === newKey.length && currentArr.every((v, i) => v === newKey[i]);
            if (!keysMatch) {
              // Clés différentes → forcer un nouveau abonnement
              await subscription.unsubscribe();
              subscription = null;
            }
          }
        } catch {
          // En cas d'erreur de comparaison, conserver l'abonnement existant
        }
      }

      if (!subscription) {
        subscription = await swRegistration.pushManager.subscribe({
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

      if (!resp.ok) return { permissionGranted: true, subscribed: false, error: 'backend_error' };

      const respData = await resp.json();

      // Si le backend signale un endpoint mort → forcer un abonnement frais
      if (respData.needs_fresh_subscription) {
        try {
          await subscription.unsubscribe();
          const freshSub = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });
          await fetch(`${API_URL}/api/web-push/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ subscription: freshSub.toJSON(), browser })
          });
        } catch { /* ignorer */ }
      }

      subscribedRef.current = true;
      setIsSubscribed(true);
      return { permissionGranted: true, subscribed: true };
    } catch (e) {
      console.error('[PWA] Push subscription failed:', e.name, e.message);
      return { permissionGranted: true, subscribed: false, error: `${e.name}: ${e.message}` };
    }
  }, []);

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

// Global storage for beforeinstallprompt event
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

    if (window.__pwaInstallEvent) {
      setInstallPrompt(window.__pwaInstallEvent);
      setIsInstalled(false);
    }

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

// ─── Détection plateforme et mode privé ──────────────────────────────────────
async function detectIncognito() {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const { quota } = await navigator.storage.estimate();
      // Chrome incognito limite le quota à ~120 Mo
      if (typeof quota === 'number' && quota < 120 * 1024 * 1024) return true;
    }
  } catch { /* Firefox ou autres */ }
  return false;
}

function detectPlatform() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/.test(ua);
  const isWindows = /Win/.test(navigator.platform || ua);
  const isMac = /Mac/.test(navigator.platform || ua) && !isIOS;
  const isMobile = isIOS || isAndroid || /Mobile/.test(ua);

  // Navigateurs — ordre important (Edge contient "Chrome", Safari contient "Safari")
  const isEdge = /Edg\//.test(ua);
  const isChrome = /Chrome\//.test(ua) && !isEdge && !/OPR\//.test(ua);
  const isChromeIOS = /CriOS\//.test(ua);
  const isSafari = /Safari\//.test(ua) && !isChrome && !isEdge && !isChromeIOS && !/CriOS/.test(ua);
  const isFirefox = /Firefox\//.test(ua) || /FxiOS\//.test(ua);
  const isSamsung = /SamsungBrowser\//.test(ua);
  const isOpera = /OPR\//.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  return {
    isIOS, isAndroid, isWindows, isMac, isMobile,
    isEdge, isChrome, isChromeIOS, isSafari, isFirefox, isSamsung, isOpera,
    isStandalone,
    browserName: isEdge ? 'Edge' : isChrome ? 'Chrome' : isSafari ? 'Safari' : isFirefox ? 'Firefox' : isSamsung ? 'Samsung Internet' : isOpera ? 'Opera' : 'Navigateur',
    osName: isIOS ? 'iOS' : isAndroid ? 'Android' : isWindows ? 'Windows' : isMac ? 'macOS' : 'Bureau',
  };
}

export function usePlatformInstall() {
  const { canInstall, isInstalled, install } = useInstallPrompt();
  const [platform, setPlatform] = useState(null);
  const [isIncognito, setIsIncognito] = useState(false);
  const [incognitoChecked, setIncognitoChecked] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    detectIncognito().then(result => {
      setIsIncognito(result);
      setIncognitoChecked(true);
    });
  }, []);

  // Méthode d'installation recommandée selon la plateforme
  const getInstallMethod = () => {
    if (!platform) return 'loading';
    if (isInstalled) return 'installed';
    if (canInstall) return 'prompt';                     // bouton natif disponible
    if (platform.isIOS && platform.isSafari) return 'ios-safari';
    if (platform.isIOS && platform.isChromeIOS) return 'ios-chrome';
    if (platform.isIOS) return 'ios-other';
    if (platform.isFirefox) return 'firefox';
    if (platform.isAndroid) return 'android-menu';      // pas de prompt = menu
    // Desktop Chrome / Edge sans prompt
    if (platform.isChrome || platform.isEdge) return 'desktop-menu';
    return 'unknown';
  };

  const appUrl = window.location.origin;

  return {
    platform,
    isIncognito,
    incognitoChecked,
    canInstall,
    isInstalled,
    install,
    installMethod: getInstallMethod(),
    appUrl,
  };
}
