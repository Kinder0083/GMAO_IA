import { getPendingSyncItems, removeSyncItem, incrementRetry, getOfflineFile, removeOfflineFile, removeFilesForSyncItem } from './offlineDb';
import connectivity from './connectivityManager';
import api from './api';

let isSyncing = false;

/**
 * Reconstruit un FormData a partir des references de fichiers stockes dans IndexedDB.
 */
const reconstructFormData = async (item) => {
  const formData = new FormData();

  if (item.fileRefs && item.fileRefs.length > 0) {
    for (const fileRef of item.fileRefs) {
      const fileData = await getOfflineFile(fileRef.fileId);
      if (fileData) {
        const file = new File([fileData.blob], fileData.metadata.name, {
          type: fileData.metadata.type
        });
        formData.append(fileRef.fieldName || 'file', file);
      }
    }
  }

  if (item.formFields) {
    for (const [key, value] of Object.entries(item.formFields)) {
      formData.append(key, value);
    }
  }

  return formData;
};

/**
 * Synchronise les mutations en attente avec le serveur.
 */
export const syncPendingMutations = async () => {
  if (isSyncing || !connectivity.isOnline) return { synced: 0, failed: 0 };
  isSyncing = true;

  let synced = 0;
  let failed = 0;

  try {
    const items = await getPendingSyncItems();
    if (items.length === 0) {
      isSyncing = false;
      return { synced: 0, failed: 0 };
    }

    console.log(`[Sync] ${items.length} mutation(s) en attente`);
    window.dispatchEvent(new CustomEvent('sync-progress', { detail: { total: items.length, current: 0 } }));

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      window.dispatchEvent(new CustomEvent('sync-progress', { detail: { total: items.length, current: i + 1, item: item.url } }));

      // Utiliser le token ACTUEL (pas celui stocké au moment offline, qui peut avoir expiré)
      const currentToken = localStorage.getItem('token');
      const authHeader = currentToken ? `Bearer ${currentToken}` : item.headers?.Authorization;

      try {
        let config;

        if (item.fileRefs && item.fileRefs.length > 0) {
          const formData = await reconstructFormData(item);
          config = {
            method: item.method,
            url: item.url,
            data: formData,
            headers: {
              Authorization: authHeader,
              'X-Offline-Sync': 'true'
            }
          };
        } else {
          config = {
            method: item.method,
            url: item.url,
            headers: { ...item.headers, Authorization: authHeader, 'X-Offline-Sync': 'true' }
          };
          if (item.data) config.data = item.data;
        }

        const response = await api(config);

        // Après sync réussie d'une DI : uploader les fichiers en attente
        if (item.pendingFiles && item.pendingFiles.length > 0 && response?.data?.id) {
          const newId = response.data.id;
          console.log(`[Sync] Upload de ${item.pendingFiles.length} fichier(s) pour DI ${newId}`);
          for (const fileRef of item.pendingFiles) {
            try {
              const fileData = await getOfflineFile(fileRef.fileId);
              if (fileData) {
                const fd = new FormData();
                const file = new File([fileData.blob], fileData.metadata?.name || fileRef.name, {
                  type: fileData.metadata?.type || fileRef.type
                });
                fd.append('file', file);
                await api.post(`${item.url}/${newId}/attachments`, fd, {
                  headers: {
                    Authorization: authHeader,
                    'Content-Type': 'multipart/form-data'
                  }
                });
                await removeOfflineFile(fileRef.fileId);
                console.log(`[Sync] Fichier uploade: ${fileRef.name}`);
              }
            } catch (fileErr) {
              console.warn(`[Sync] Echec upload fichier ${fileRef.name}:`, fileErr?.response?.status || fileErr?.message);
            }
          }
        }

        if (item.fileRefs) {
          for (const ref of item.fileRefs) {
            await removeOfflineFile(ref.fileId);
          }
        }
        await removeFilesForSyncItem(item.id);
        await removeSyncItem(item.id);
        synced++;
        console.log(`[Sync] OK: ${item.method} ${item.url}`);
      } catch (err) {
        console.warn(`[Sync] Echec: ${item.method} ${item.url}`, err?.response?.status);
        await incrementRetry(item.id);
        failed++;
      }
    }

    window.dispatchEvent(new CustomEvent('sync-complete', { detail: { synced, failed } }));

    if (synced > 0) {
      localStorage.setItem('gmao_last_sync', new Date().toISOString());
    }
  } catch (e) {
    console.error('[Sync] Erreur globale:', e);
  } finally {
    isSyncing = false;
    window.dispatchEvent(new CustomEvent('sync-progress', { detail: { total: 0, current: 0, done: true } }));
  }

  return { synced, failed };
};

/**
 * Force la synchronisation manuelle.
 */
export const forceSyncNow = async () => {
  if (!connectivity.isOnline) {
    return { synced: 0, failed: 0, error: 'Pas de connexion internet' };
  }
  return syncPendingMutations();
};

/**
 * Initialise le service de synchronisation.
 */
export const initOfflineSync = () => {
  // Écouter le ConnectivityManager pour la reconnexion
  const handleOnline = async () => {
    await new Promise(r => setTimeout(r, 2000));
    if (connectivity.isOnline) {
      const result = await syncPendingMutations();
      if (result.synced > 0) {
        console.log(`[Sync] ${result.synced} mutation(s) synchronisee(s)`);
      }
    }
  };

  window.addEventListener('app-online', handleOnline);

  // Tenter une sync au demarrage si en ligne
  if (connectivity.isOnline) {
    setTimeout(() => syncPendingMutations(), 3000);
  }

  return () => window.removeEventListener('app-online', handleOnline);
};
