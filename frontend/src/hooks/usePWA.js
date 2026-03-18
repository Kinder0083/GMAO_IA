import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const VERIFY_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const VERIFY_KEY = 'pwa_push_verified_at';
const VAPID_VERSION_KEY = 'pwa_vapid_version';

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

function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'firefox';
  if (ua.includes('Edg')) return 'edge';
  if (ua.includes('Chrome')) return 'chrome';
  return 'other';
}

function needsVerification() {
  const last = localStorage.getItem(VERIFY_KEY);
  if (!last) return true;
  return (Date.now() - parseInt(last, 10)) > VERIFY_INTERVAL_MS;
}

async function fetchVapidKey() {
  const resp = await fetch(`${API_URL}/api/web-push/vapid-key`);
  if (!resp.ok) return null;
  const { publicKey } = await resp.json();
  return publicKey || null;
}

async function registerWithBackend(subscription, token) {
  const resp = await fetch(`${API_URL}/api/web-push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      browser: detectBrowser()
    })
  });
  return resp.ok;
}

async function forceResubscribe(registration, token) {
  // Unsubscribe old
  const oldSub = await registration.pushManager.getSubscription();
  if (oldSub) {
    try { await oldSub.unsubscribe(); } catch (e) { /* ignore */ }
  }
  // Get VAPID key
  const publicKey = await fetchVapidKey();
  if (!publicKey) return null;
  // Create new subscription
  const newSub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });
  // Register with backend
  await registerWithBackend(newSub, token);
  // Store VAPID key version
  localStorage.setItem(VAPID_VERSION_KEY, publicKey);
  return newSub;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const syncedRef = useRef(false);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    if (!supported || !('Notification' in window)) return;

    setPermission(Notification.permission);

    const syncWithBackend = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        // Step 0: Check if VAPID key changed (forces re-subscribe)
        const vapidResp = await fetch(`${API_URL}/api/web-push/vapid-key`);
        if (vapidResp.ok) {
          const { publicKey } = await vapidResp.json();
          const storedVapid = localStorage.getItem(VAPID_VERSION_KEY);
          if (publicKey && storedVapid && storedVapid !== publicKey && subscription) {
            // VAPID key changed - old subscription is useless, force re-subscribe
            console.warn('[PWA] VAPID key changed, forcing re-subscribe');
            try { await subscription.unsubscribe(); } catch (e) { /* ignore */ }
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
            localStorage.setItem(VAPID_VERSION_KEY, publicKey);
          } else if (publicKey && !storedVapid) {
            // First time - store the VAPID key for future comparison
            localStorage.setItem(VAPID_VERSION_KEY, publicKey);
          }
        }

        if (!subscription) return; // No browser subscription, nothing to sync

        // Step 1: Always register existing subscription with backend
        const synced = await registerWithBackend(subscription, token);
        if (synced) {
          syncedRef.current = true;
          setIsSubscribed(true);
        }

        // Step 2: Periodically verify subscription health
        if (synced && needsVerification()) {
          try {
            const testResp = await fetch(`${API_URL}/api/web-push/test`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const testResult = await testResp.json();

            if (testResult.sent > 0) {
              // Subscription works - mark verified
              localStorage.setItem(VERIFY_KEY, Date.now().toString());
              console.log('[PWA] Subscription verified OK');
            } else if (testResult.failed > 0) {
              // Subscription expired or VAPID mismatch - force re-subscribe
              console.warn('[PWA] Subscription failed, re-subscribing...');
              const newSub = await forceResubscribe(registration, token);
              if (newSub) {
                localStorage.setItem(VERIFY_KEY, Date.now().toString());
                console.log('[PWA] Re-subscribed successfully');
              }
            }
          } catch (e) {
            console.warn('[PWA] Verification failed:', e.message);
          }
        }
      } catch (e) {
        console.warn('[PWA] Sync failed:', e.message);
      }
    };

    syncWithBackend();
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
    // Step 1: Request permission
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

    const token = localStorage.getItem('token');
    if (!token) return { permissionGranted: true, subscribed: false, error: 'no_token' };

    if (syncedRef.current) return { permissionGranted: true, subscribed: true };

    try {
      const publicKey = await fetchVapidKey();
      if (!publicKey) throw new Error('no_vapid_key');

      const registration = await registerServiceWorker();
      if (!registration) throw new Error('sw_registration_failed');

      await navigator.serviceWorker.ready;

      // Always try to get existing, else create new
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      const ok = await registerWithBackend(subscription, token);
      if (!ok) throw new Error('subscribe_backend_error');

      syncedRef.current = true;
      setIsSubscribed(true);
      localStorage.setItem(VERIFY_KEY, Date.now().toString());
      if (publicKey) localStorage.setItem(VAPID_VERSION_KEY, publicKey);
      return { permissionGranted: true, subscribed: true };
    } catch (e) {
      console.error('[PWA] Push subscription failed:', e.message);
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
      syncedRef.current = false;
      setIsSubscribed(false);
      localStorage.removeItem(VERIFY_KEY);
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
