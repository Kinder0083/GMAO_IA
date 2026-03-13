import { openDB } from 'idb';

const DB_NAME = 'gmao-iris-offline';
const DB_VERSION = 2;

/**
 * Ouvre la base IndexedDB pour le mode hors-ligne.
 * Stores :
 *  - apiCache : cache des reponses API (cle = url)
 *  - syncQueue : file d'attente des mutations a synchroniser
 *  - fileStore : stockage des fichiers/photos hors-ligne (blobs)
 */
export const getOfflineDb = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Cache des reponses API
      if (!db.objectStoreNames.contains('apiCache')) {
        const cache = db.createObjectStore('apiCache', { keyPath: 'url' });
        cache.createIndex('timestamp', 'timestamp');
      }
      // File d'attente de synchronisation
      if (!db.objectStoreNames.contains('syncQueue')) {
        const queue = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        queue.createIndex('timestamp', 'timestamp');
        queue.createIndex('status', 'status');
      }
      // Store pour les fichiers hors-ligne (photos, PJ)
      if (!db.objectStoreNames.contains('fileStore')) {
        const files = db.createObjectStore('fileStore', { keyPath: 'fileId' });
        files.createIndex('timestamp', 'timestamp');
        files.createIndex('syncItemId', 'syncItemId');
      }
    }
  });
};

// ==================== API CACHE ====================

export const cacheApiResponse = async (url, data) => {
  try {
    const db = await getOfflineDb();
    await db.put('apiCache', { url, data, timestamp: Date.now() });
  } catch (e) {
    console.warn('[Offline] Erreur cache:', e);
  }
};

export const getCachedResponse = async (url) => {
  try {
    const db = await getOfflineDb();
    const entry = await db.get('apiCache', url);
    return entry ? entry.data : null;
  } catch {
    return null;
  }
};

// ==================== SYNC QUEUE ====================

export const addToSyncQueue = async (method, url, data, headers = {}, fileRefs = []) => {
  try {
    const db = await getOfflineDb();
    const id = await db.add('syncQueue', {
      method,
      url,
      data,
      headers,
      fileRefs,
      timestamp: Date.now(),
      status: 'pending',
      retries: 0
    });
    window.dispatchEvent(new Event('sync-queue-updated'));
    return id;
  } catch (e) {
    console.warn('[Offline] Erreur ajout sync queue:', e);
    return null;
  }
};

export const getPendingSyncItems = async () => {
  try {
    const db = await getOfflineDb();
    return await db.getAllFromIndex('syncQueue', 'status', 'pending');
  } catch {
    return [];
  }
};

export const removeSyncItem = async (id) => {
  try {
    const db = await getOfflineDb();
    await db.delete('syncQueue', id);
    window.dispatchEvent(new Event('sync-queue-updated'));
  } catch (e) {
    console.warn('[Offline] Erreur suppression sync item:', e);
  }
};

export const incrementRetry = async (id) => {
  try {
    const db = await getOfflineDb();
    const item = await db.get('syncQueue', id);
    if (item) {
      item.retries = (item.retries || 0) + 1;
      if (item.retries >= 5) {
        item.status = 'failed';
      }
      await db.put('syncQueue', item);
      window.dispatchEvent(new Event('sync-queue-updated'));
    }
  } catch (e) {
    console.warn('[Offline] Erreur increment retry:', e);
  }
};

export const getFailedSyncItems = async () => {
  try {
    const db = await getOfflineDb();
    return await db.getAllFromIndex('syncQueue', 'status', 'failed');
  } catch {
    return [];
  }
};

export const retrySyncItem = async (id) => {
  try {
    const db = await getOfflineDb();
    const item = await db.get('syncQueue', id);
    if (item) {
      item.status = 'pending';
      item.retries = 0;
      await db.put('syncQueue', item);
      window.dispatchEvent(new Event('sync-queue-updated'));
    }
  } catch (e) {
    console.warn('[Offline] Erreur retry sync item:', e);
  }
};

// ==================== FILE STORE (photos/PJ offline) ====================

export const storeOfflineFile = async (fileId, blob, metadata = {}) => {
  try {
    const db = await getOfflineDb();
    await db.put('fileStore', {
      fileId,
      blob,
      metadata: {
        name: metadata.name || 'file',
        type: metadata.type || 'application/octet-stream',
        size: metadata.size || blob.size,
        fieldName: metadata.fieldName || 'file',
        ...metadata
      },
      timestamp: Date.now(),
      syncItemId: metadata.syncItemId || null
    });
    window.dispatchEvent(new Event('sync-queue-updated'));
    return fileId;
  } catch (e) {
    console.warn('[Offline] Erreur stockage fichier:', e);
    return null;
  }
};

export const getOfflineFile = async (fileId) => {
  try {
    const db = await getOfflineDb();
    const entry = await db.get('fileStore', fileId);
    if (!entry) return null;
    return { blob: entry.blob, metadata: entry.metadata };
  } catch {
    return null;
  }
};

export const removeOfflineFile = async (fileId) => {
  try {
    const db = await getOfflineDb();
    await db.delete('fileStore', fileId);
  } catch (e) {
    console.warn('[Offline] Erreur suppression fichier:', e);
  }
};

export const removeFilesForSyncItem = async (syncItemId) => {
  try {
    const db = await getOfflineDb();
    const files = await db.getAllFromIndex('fileStore', 'syncItemId', syncItemId);
    for (const file of files) {
      await db.delete('fileStore', file.fileId);
    }
  } catch (e) {
    console.warn('[Offline] Erreur suppression fichiers sync:', e);
  }
};

// ==================== STORAGE USAGE ====================

export const getStorageUsage = async () => {
  try {
    const db = await getOfflineDb();
    let totalSize = 0;
    let fileCount = 0;

    // Taille des fichiers
    const tx = db.transaction('fileStore', 'readonly');
    const store = tx.objectStore('fileStore');
    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.value.blob) {
        totalSize += cursor.value.blob.size || 0;
      }
      fileCount++;
      cursor = await cursor.continue();
    }

    // Nombre d'items en attente
    const pendingCount = (await getPendingSyncItems()).length;
    const failedCount = (await getFailedSyncItems()).length;

    return {
      totalSize,
      fileCount,
      pendingCount,
      failedCount,
      formattedSize: formatBytes(totalSize)
    };
  } catch {
    return { totalSize: 0, fileCount: 0, pendingCount: 0, failedCount: 0, formattedSize: '0 o' };
  }
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// ==================== CACHE CLEANUP ====================

export const cleanOldCache = async () => {
  try {
    const db = await getOfflineDb();
    const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48h
    const tx = db.transaction('apiCache', 'readwrite');
    const store = tx.objectStore('apiCache');
    const index = store.index('timestamp');
    let cursor = await index.openCursor();
    while (cursor) {
      if (cursor.value.timestamp < cutoff) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
  } catch (e) {
    console.warn('[Offline] Erreur nettoyage cache:', e);
  }
};
