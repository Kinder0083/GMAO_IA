import React from 'react';
import { Wifi, WifiOff, HardDrive, AlertTriangle } from 'lucide-react';
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

  // Determiner l'etat et le style
  const getState = () => {
    if (!isOnline) return { color: 'bg-red-50 text-red-600 border-red-200', label: 'Hors ligne', icon: <WifiOff size={13} /> };
    if (syncInProgress) return { color: 'bg-orange-50 text-orange-600 border-orange-200', label: 'Synchro', icon: <Wifi size={13} className="animate-pulse" /> };
    if (failedSyncCount > 0) return { color: 'bg-amber-50 text-amber-600 border-amber-200', label: 'En ligne', icon: <Wifi size={13} /> };
    return { color: 'bg-emerald-50 text-emerald-600 border-emerald-200', label: 'En ligne', icon: <Wifi size={13} /> };
  };

  const state = getState();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all duration-300 cursor-pointer border ${state.color}`}
          data-testid="offline-indicator"
          onClick={isOnline && totalPending > 0 ? forceSyncNow : undefined}
        >
          {state.icon}
          <span className="hidden sm:inline">{state.label}</span>
          {totalPending > 0 && (
            <span
              className={`flex items-center gap-0.5 ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                failedSyncCount > 0
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
              data-testid="pending-sync-count"
            >
              <AlertTriangle size={9} />
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
              <p className="text-xs text-orange-300">Synchronisation en cours...</p>
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
            <p className="text-xs text-gray-300">Les donnees en cache sont disponibles</p>
            <p className="text-xs text-gray-300">Synchronisation automatique au retour en ligne</p>
            {totalPending > 0 && (
              <p className="text-xs text-amber-400">
                {totalPending} modification{totalPending > 1 ? 's' : ''} en attente
              </p>
            )}
            {storageInfo && storageInfo.fileCount > 0 && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <HardDrive size={10} />
                {storageInfo.fileCount} fichier{storageInfo.fileCount > 1 ? 's' : ''} ({storageInfo.formattedSize})
              </p>
            )}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export default OfflineIndicator;
