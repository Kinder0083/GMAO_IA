import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, X, Upload, HardDrive, AlertTriangle } from 'lucide-react';
import useOnlineStatus from '../../hooks/useOnlineStatus';

/**
 * Banniere persistante affichee quand l'application est hors ligne
 * ou quand des synchronisations sont en attente/echouees.
 */
const OfflineBanner = () => {
  const {
    isOnline,
    pendingSyncCount,
    failedSyncCount,
    syncInProgress,
    syncProgress,
    storageInfo,
    forceSyncNow
  } = useOnlineStatus();

  const [dismissed, setDismissed] = useState(false);
  const [showSyncResult, setShowSyncResult] = useState(null);
  const [fileQueuedCount, setFileQueuedCount] = useState(0);

  // Reafficer la banniere quand le statut change
  useEffect(() => {
    setDismissed(false);
  }, [isOnline]);

  // Ecouter les evenements de fichiers en queue offline
  useEffect(() => {
    const handleFileQueued = (e) => {
      setFileQueuedCount(prev => prev + (e.detail?.count || 1));
      setDismissed(false);
      // Auto-reset apres 5s
      setTimeout(() => setFileQueuedCount(0), 5000);
    };

    const handleSyncComplete = (e) => {
      const { synced, failed } = e.detail;
      if (synced > 0 || failed > 0) {
        setShowSyncResult({ synced, failed });
        setTimeout(() => setShowSyncResult(null), 4000);
      }
    };

    window.addEventListener('offline-file-queued', handleFileQueued);
    window.addEventListener('sync-complete', handleSyncComplete);
    return () => {
      window.removeEventListener('offline-file-queued', handleFileQueued);
      window.removeEventListener('sync-complete', handleSyncComplete);
    };
  }, []);

  const totalPending = pendingSyncCount + failedSyncCount;

  // Notification de fichier mis en queue
  if (fileQueuedCount > 0 && isOnline) {
    return null; // Ne pas montrer si on est en ligne et que les fichiers sont juste queues
  }

  // Resultat de sync
  if (showSyncResult && isOnline) {
    return (
      <div
        className={`fixed top-0 left-0 right-0 z-[9999] px-4 py-2 text-center text-sm font-medium transition-all duration-300 ${
          showSyncResult.failed > 0
            ? 'bg-amber-500 text-white'
            : 'bg-emerald-500 text-white'
        }`}
        data-testid="sync-result-banner"
      >
        <div className="flex items-center justify-center gap-2">
          <RefreshCw size={14} />
          <span>
            {showSyncResult.synced > 0 && `${showSyncResult.synced} element(s) synchronise(s)`}
            {showSyncResult.synced > 0 && showSyncResult.failed > 0 && ' | '}
            {showSyncResult.failed > 0 && `${showSyncResult.failed} en echec`}
          </span>
        </div>
      </div>
    );
  }

  // Rien a afficher si en ligne, pas de pending, pas de failed
  if (isOnline && totalPending === 0 && !syncInProgress) {
    return null;
  }

  // Bandeau de sync en cours
  if (syncInProgress && syncProgress) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white px-4 py-2"
        data-testid="sync-progress-banner"
      >
        <div className="flex items-center justify-center gap-2 text-sm font-medium">
          <RefreshCw size={14} className="animate-spin" />
          <span>
            Synchronisation {syncProgress.current}/{syncProgress.total}...
          </span>
        </div>
        <div className="mt-1 h-1 bg-blue-400 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (dismissed) return null;

  // Banniere hors ligne
  if (!isOnline) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[9999] bg-gray-900 text-white px-4 py-2.5 shadow-lg"
        data-testid="offline-banner"
      >
        <div className="flex items-center justify-between max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <WifiOff size={16} className="text-red-400" />
              <span className="font-semibold text-sm">Mode hors ligne</span>
            </div>
            <span className="text-xs text-gray-300 hidden sm:inline">
              Les donnees en cache sont disponibles. Les modifications seront synchronisees automatiquement.
            </span>
          </div>
          <div className="flex items-center gap-3">
            {totalPending > 0 && (
              <span className="flex items-center gap-1.5 text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded-full">
                <Upload size={12} />
                {totalPending} en attente
                {storageInfo?.fileCount > 0 && (
                  <span className="flex items-center gap-0.5 ml-1">
                    <HardDrive size={10} />
                    {storageInfo.formattedSize}
                  </span>
                )}
              </span>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              data-testid="dismiss-offline-banner"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Banniere en ligne avec sync en attente (failed items)
  if (failedSyncCount > 0) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[9999] bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2"
        data-testid="sync-failed-banner"
      >
        <div className="flex items-center justify-between max-w-screen-xl mx-auto">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle size={14} />
            <span>{failedSyncCount} synchronisation(s) en echec</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={forceSyncNow}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 text-white rounded-md text-xs font-medium hover:bg-amber-700 transition-colors"
              data-testid="retry-sync-btn"
            >
              <RefreshCw size={12} />
              Reessayer
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 hover:bg-amber-100 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
