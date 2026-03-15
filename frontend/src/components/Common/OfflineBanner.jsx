import React, { useState, useEffect } from 'react';
import useOnlineStatus from '../../hooks/useOnlineStatus';

/**
 * Composant allege : plus de banniere intrusive.
 * Tout l'affichage est gere par OfflineIndicator dans le Header.
 * Ce composant gere uniquement les toasts non-intrusifs pour les evenements ponctuels.
 */
const OfflineBanner = () => {
  const {
    isOnline,
    failedSyncCount,
    syncInProgress,
    syncProgress,
  } = useOnlineStatus();

  const [showSyncResult, setShowSyncResult] = useState(null);

  useEffect(() => {
    const handleSyncComplete = (e) => {
      const { synced, failed } = e.detail;
      if (synced > 0 || failed > 0) {
        setShowSyncResult({ synced, failed });
        setTimeout(() => setShowSyncResult(null), 4000);
      }
    };
    window.addEventListener('sync-complete', handleSyncComplete);
    return () => window.removeEventListener('sync-complete', handleSyncComplete);
  }, []);

  // Petit toast temporaire de resultat de sync (non-intrusif)
  if (showSyncResult && isOnline) {
    return (
      <div
        className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg transition-all duration-300 ${
          showSyncResult.failed > 0
            ? 'bg-amber-500 text-white'
            : 'bg-emerald-500 text-white'
        }`}
        data-testid="sync-result-banner"
      >
        <span>
          {showSyncResult.synced > 0 && `${showSyncResult.synced} synchronise(s)`}
          {showSyncResult.synced > 0 && showSyncResult.failed > 0 && ' | '}
          {showSyncResult.failed > 0 && `${showSyncResult.failed} en echec`}
        </span>
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
