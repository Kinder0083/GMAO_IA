import React from 'react';
import { Wifi, WifiOff, RefreshCw, HardDrive, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import useOnlineStatus from '../../hooks/useOnlineStatus';

const OfflineIndicator = () => {
  const {
    isOnline,
    lastSyncAt,
    pendingSyncCount,
    failedSyncCount,
    syncInProgress,
    storageInfo,
    forceSyncNow
  } = useOnlineStatus();

  const formatTime = (isoStr) => {
    if (!isoStr) return 'Jamais';
    const d = new Date(isoStr);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const totalPending = pendingSyncCount + failedSyncCount;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all duration-300 cursor-pointer ${
            !isOnline
              ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
              : syncInProgress
                ? 'bg-blue-50 text-blue-600 border border-blue-200'
                : failedSyncCount > 0
                  ? 'bg-amber-50 text-amber-600 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          }`}
          data-testid="offline-indicator"
          onClick={isOnline && totalPending > 0 ? forceSyncNow : undefined}
        >
          {!isOnline ? (
            <WifiOff size={13} />
          ) : syncInProgress ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <Wifi size={13} />
          )}
          <span className="hidden sm:inline">
            {!isOnline ? 'Hors ligne' : syncInProgress ? 'Sync...' : 'En ligne'}
          </span>
          {totalPending > 0 && (
            <span
              className={`flex items-center gap-0.5 ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                failedSyncCount > 0
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
              data-testid="pending-sync-count"
            >
              {failedSyncCount > 0 ? <AlertTriangle size={9} /> : <RefreshCw size={9} />}
              {totalPending}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2.5 rounded-lg shadow-lg max-w-xs">
        {isOnline ? (
          <div className="space-y-1.5">
            <p className="font-medium text-emerald-400">Connecte</p>
            {syncInProgress ? (
              <p className="text-xs text-blue-300">Synchronisation en cours...</p>
            ) : pendingSyncCount > 0 ? (
              <p className="text-xs text-amber-300">
                {pendingSyncCount} modification{pendingSyncCount > 1 ? 's' : ''} en attente
                <br />
                <span className="text-gray-400">Cliquez pour synchroniser</span>
              </p>
            ) : (
              <p className="text-xs text-gray-300">Toutes les donnees sont synchronisees</p>
            )}
            {failedSyncCount > 0 && (
              <p className="text-xs text-red-400">
                {failedSyncCount} synchronisation{failedSyncCount > 1 ? 's' : ''} en echec
              </p>
            )}
            {lastSyncAt && (
              <p className="text-xs text-gray-400">Derniere sync : {formatTime(lastSyncAt)}</p>
            )}
            {storageInfo && storageInfo.fileCount > 0 && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <HardDrive size={10} />
                {storageInfo.fileCount} fichier{storageInfo.fileCount > 1 ? 's' : ''} ({storageInfo.formattedSize})
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="font-medium text-red-400">Hors ligne</p>
            <p className="text-xs text-gray-300">Les donnees en cache sont disponibles en lecture</p>
            <p className="text-xs text-gray-300">Les modifications seront synchronisees au retour en ligne</p>
            {totalPending > 0 && (
              <p className="text-xs text-amber-400">
                {totalPending} modification{totalPending > 1 ? 's' : ''} en attente de synchronisation
              </p>
            )}
            {storageInfo && storageInfo.fileCount > 0 && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <HardDrive size={10} />
                {storageInfo.fileCount} fichier{storageInfo.fileCount > 1 ? 's' : ''} stocke{storageInfo.fileCount > 1 ? 's' : ''} localement ({storageInfo.formattedSize})
              </p>
            )}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export default OfflineIndicator;
