import { useState, useEffect, useCallback } from 'react';
import connectivity from '../services/connectivityManager';

/**
 * Hook pour surveiller le statut en ligne/hors ligne de l'application.
 * Utilise le ConnectivityManager (détection réelle) au lieu de navigator.onLine.
 */
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(connectivity.isOnline);
  const [lastOnlineAt, setLastOnlineAt] = useState(
    connectivity.isOnline ? new Date().toISOString() : localStorage.getItem('gmao_last_online') || null
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
    if (!connectivity.isOnline) return { error: 'Pas de connexion' };
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
    // S'abonner au ConnectivityManager pour les changements réels
    const unsubscribe = connectivity.subscribe((online) => {
      setIsOnline(online);
      if (online) {
        const now = new Date().toISOString();
        setLastOnlineAt(now);
        localStorage.setItem('gmao_last_online', now);
        updateCounts();
      }
    });

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

    window.addEventListener('sync-queue-updated', handleSyncUpdate);
    window.addEventListener('sync-progress', handleSyncProgress);
    window.addEventListener('sync-complete', handleSyncComplete);

    updateCounts();

    return () => {
      unsubscribe();
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
