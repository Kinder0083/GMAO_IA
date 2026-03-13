import { getPendingSyncItems, removeSyncItem, incrementRetry, getOfflineFile, removeOfflineFile, removeFilesForSyncItem } from './offlineDb';
import api from './api';

let isSyncing = false;

/**
 * Reconstruit un FormData a partir des references de fichiers stockes dans IndexedDB.
 * Utilise pour re-envoyer les uploads de fichiers mis en attente hors-ligne.
 */
const reconstructFormData = async (item) => {
  const formData = new FormData();

  // Ajouter les fichiers depuis IndexedDB
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

  // Ajouter les champs texte
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
  if (isSyncing || !navigator.onLine) return { synced: 0, failed: 0 };
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

      try {
        let config;

        // Si c'est un upload de fichier (a des fileRefs)
        if (item.fileRefs && item.fileRefs.length > 0) {
          const formData = await reconstructFormData(item);
          config = {
            method: item.method,
            url: item.url,
            data: formData,
            headers: {
              Authorization: item.headers?.Authorization,
              'X-Offline-Sync': 'true'
            }
          };
        } else {
          config = {
            method: item.method,
            url: item.url,
            headers: { ...item.headers, 'X-Offline-Sync': 'true' }
          };
          if (item.data) config.data = item.data;
        }

        await api(config);

        // Nettoyer les fichiers associes
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

    // Stocker le timestamp de derniere synchronisation
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
  if (!navigator.onLine) {
    return { synced: 0, failed: 0, error: 'Pas de connexion internet' };
  }
  return syncPendingMutations();
};

/**
 * Initialise le service de synchronisation.
 */
export const initOfflineSync = () => {
  const handleOnline = async () => {
    // Attendre que la connexion se stabilise
    await new Promise(r => setTimeout(r, 2000));
    if (navigator.onLine) {
      const result = await syncPendingMutations();
      if (result.synced > 0) {
        console.log(`[Sync] ${result.synced} mutation(s) synchronisee(s)`);
      }
    }
  };

  window.addEventListener('app-online', handleOnline);

  // Tenter une sync au demarrage si en ligne
  if (navigator.onLine) {
    setTimeout(() => syncPendingMutations(), 3000);
  }

  return () => window.removeEventListener('app-online', handleOnline);
};
