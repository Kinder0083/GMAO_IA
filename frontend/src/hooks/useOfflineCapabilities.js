import { useMemo } from 'react';
import useOnlineStatus from './useOnlineStatus';

/**
 * Hook qui retourne les fonctionnalites disponibles selon le statut en ligne/hors ligne.
 * Permet aux composants de desactiver visuellement les features non-disponibles offline.
 */
export const useOfflineCapabilities = () => {
  const { isOnline } = useOnlineStatus();

  const capabilities = useMemo(() => ({
    // Toujours disponible (cache IndexedDB)
    canViewCachedData: true,
    canNavigate: true,

    // Disponible offline (stocke dans IndexedDB, sync au retour)
    canCreateItems: true,
    canEditItems: true,
    canDeleteItems: true,
    canTakePhotos: true,
    canUploadFiles: true, // Stocke dans IndexedDB en attendant sync

    // Requiert internet
    canUseAI: isOnline,
    canUseChat: isOnline,
    canSendEmails: isOnline,
    canExportReports: isOnline,
    canUseRealtime: isOnline,
    canLogin: isOnline,
    canRegister: isOnline,

    // Statut
    isOnline
  }), [isOnline]);

  return capabilities;
};

export default useOfflineCapabilities;
