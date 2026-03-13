import { useState, useEffect, useCallback } from 'react';

/**
 * Hook pour surveiller le statut en ligne/hors ligne de l'application.
 * Retourne : isOnline, lastOnlineAt, lastSyncAt, pendingSyncCount, failedSyncCount,
 *            syncInProgress, storageInfo, forceSyncNow
 */
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastOnlineAt, setLastOnlineAt] = useState(
    navigator.onLine ? new Date().toISOString() : localStorage.getItem('gmao_last_online') || null
  );
  const [lastSyncAt, setLastSyncAt] = useState(localStorage.getItem('gmao_last_sync') || null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [storageInfo, setStorageInfo] = useState(null);

  const updateCounts = useCallback(async () => {
    try {
      const { getStorageUsage } = await import('../services/offlineDb');
      const usage = await getStorageUsage();
      setPendingSyncCount(usage.pendingCount);
      setFailedSyncCount(usage.failedCount);
      setStorageInfo(usage);
    } catch {
      setPendingSyncCount(0);
      setFailedSyncCount(0);
    }
  }, []);

  const forceSyncNow = useCallback(async () => {
    if (!navigator.onLine) return { error: 'Pas de connexion' };
    try {
      const { forceSyncNow: sync } = await import('../services/offlineSync');
      setSyncInProgress(true);
      const result = await sync();
      setSyncInProgress(false);
      if (result.synced > 0) {
        setLastSyncAt(new Date().toISOString());
      }
      await updateCounts();
      return result;
    } catch (e) {
      setSyncInProgress(false);
      return { error: e.message };
    }
  }, [updateCounts]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const now = new Date().toISOString();
      setLastOnlineAt(now);
      localStorage.setItem('gmao_last_online', now);
      updateCounts();
      window.dispatchEvent(new Event('app-online'));
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleSyncUpdate = () => updateCounts();

    const handleSyncProgress = (e) => {
      const detail = e.detail;
      if (detail.done) {
        setSyncInProgress(false);
        setSyncProgress(null);
      } else {
        setSyncInProgress(true);
        setSyncProgress(detail);
      }
    };

    const handleSyncComplete = (e) => {
      setSyncInProgress(false);
      setSyncProgress(null);
      const { synced } = e.detail;
      if (synced > 0) {
        setLastSyncAt(new Date().toISOString());
      }
      updateCounts();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-queue-updated', handleSyncUpdate);
    window.addEventListener('sync-progress', handleSyncProgress);
    window.addEventListener('sync-complete', handleSyncComplete);

    updateCounts();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync-queue-updated', handleSyncUpdate);
      window.removeEventListener('sync-progress', handleSyncProgress);
      window.removeEventListener('sync-complete', handleSyncComplete);
    };
  }, [updateCounts]);

  return {
    isOnline,
    lastOnlineAt,
    lastSyncAt,
    pendingSyncCount,
    failedSyncCount,
    syncInProgress,
    syncProgress,
    storageInfo,
    forceSyncNow
  };
};

export default useOnlineStatus;
