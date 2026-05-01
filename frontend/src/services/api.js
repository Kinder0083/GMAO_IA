import axios from 'axios';
import { BACKEND_URL } from '../utils/config';
import { cacheApiResponse, getCachedResponse, addToSyncQueue, storeOfflineFile } from './offlineDb';
import connectivity from './connectivityManager';

const API_BASE = `${BACKEND_URL}/api`;

// URLs a exclure du cache offline (temps reel, auth, etc.)
const CACHE_EXCLUDE_PATTERNS = ['/auth/', '/chat/', '/mqtt/', '/ai/chat', '/voice/', '/websocket'];
const shouldCache = (url) => {
  if (!url) return false;
  return !CACHE_EXCLUDE_PATTERNS.some(p => url.includes(p));
};

// URLs a ne pas mettre en queue offline (IA, websocket)
const SKIP_QUEUE_PATTERNS = ['/ai/', '/chat/', '/mqtt/', '/voice/', '/websocket'];
const shouldSkipQueue = (url) => {
  if (!url) return true;
  return SKIP_QUEUE_PATTERNS.some(p => url.includes(p));
};

/**
 * Serialise un FormData en objets stockables dans IndexedDB.
 * Les fichiers (File/Blob) sont stockes separement dans le fileStore.
 */
const serializeFormData = async (formData) => {
  const fileRefs = [];
  const formFields = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File || value instanceof Blob) {
      const fileId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await storeOfflineFile(fileId, value, {
        name: value.name || 'file',
        type: value.type || 'application/octet-stream',
        size: value.size,
        fieldName: key
      });
      fileRefs.push({ fileId, fieldName: key, name: value.name, type: value.type, size: value.size });
    } else {
      formFields[key] = value;
    }
  }

  return { fileRefs, formFields };
};

// Axios instance avec intercepteurs
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Intercepteur pour ajouter le token JWT et empêcher le cache navigateur
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // Renouvellement préventif : si le token expire dans moins de 7 jours, en obtenir un nouveau silencieusement
      try {
        const payload = JSON.parse(window.atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
        const REFRESH_THRESHOLD = 7 * 24 * 3600; // 7 jours avant expiry
        if (expiresIn > 0 && expiresIn < REFRESH_THRESHOLD && !config._isRefresh) {
          // Lancer le refresh en arrière-plan (sans bloquer la requête courante)
          setTimeout(async () => {
            try {
              const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (res.ok) {
                const data = await res.json();
                if (data.access_token) {
                  localStorage.setItem('token', data.access_token);
                  console.log('[Auth] Token renouvelé automatiquement');
                }
              }
            } catch {}
          }, 100);
        }
      } catch {}
    }
    // Anti-cache : forcer le navigateur a ne jamais utiliser de reponse en cache HTTP
    config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    config.headers['Pragma'] = 'no-cache';
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercepteur pour gerer les reponses et le cache offline
api.interceptors.response.use(
  (response) => {
    // Signaler la connectivité au manager
    connectivity.reportSuccess();
    
    // Cache les reponses GET reussies dans IndexedDB pour le mode hors-ligne
    if (response.config.method === 'get' && shouldCache(response.config.url)) {
      const cacheKey = response.config.url + (response.config.params ? '?' + new URLSearchParams(response.config.params).toString() : '');
      cacheApiResponse(cacheKey, response.data).catch(() => {});
    }
    return response;
  },
  async (error) => {
    // 401 -> deconnexion
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Erreur réseau (pas de réponse du serveur)
    // Condition SIMPLE et ROBUSTE : si pas de réponse serveur = erreur réseau
    // (exclut les requêtes annulées volontairement)
    const isNetworkError = !error.response && error.code !== 'ERR_CANCELED';

    if (isNetworkError) {
      // Signaler l'erreur réseau au manager
      connectivity.reportNetworkError();
      
      const config = error.config;

      // GET -> servir depuis le cache IndexedDB
      if (config.method === 'get' && shouldCache(config.url)) {
        const cacheKey = config.url + (config.params ? '?' + new URLSearchParams(config.params).toString() : '');
        const cached = await getCachedResponse(cacheKey);
        if (cached) {
          console.log('[Offline] Servi depuis le cache:', cacheKey);
          return { data: cached, status: 200, statusText: 'OK (cache)', config, headers: {} };
        }
      }

      // POST/PUT/DELETE -> mettre en file d'attente de synchronisation
      if (['post', 'put', 'delete', 'patch'].includes(config.method)) {
        if (shouldSkipQueue(config.url)) {
          window.dispatchEvent(new CustomEvent('offline-action-blocked', {
            detail: { url: config.url, method: config.method }
          }));
          return Promise.reject(error);
        }

        const isMultipart = config.data instanceof FormData;

        if (isMultipart) {
          try {
            const { fileRefs, formFields } = await serializeFormData(config.data);
            await addToSyncQueue(
              config.method,
              config.url,
              null,
              { Authorization: config.headers?.Authorization },
              fileRefs
            );
            const db = (await import('./offlineDb')).getOfflineDb;
            const idb = await db();
            const items = await idb.getAllFromIndex('syncQueue', 'status', 'pending');
            const lastItem = items[items.length - 1];
            if (lastItem) {
              lastItem.formFields = formFields;
              await idb.put('syncQueue', lastItem);
            }

            console.log('[Offline] Upload fichier mis en attente:', fileRefs.length, 'fichier(s)');
            window.dispatchEvent(new CustomEvent('offline-file-queued', { detail: { count: fileRefs.length } }));
            return {
              data: {
                _offline_queued: true,
                _has_files: true,
                message: `${fileRefs.length} fichier(s) enregistre(s), sera synchronise au retour en ligne`
              },
              status: 202, config, headers: {}
            };
          } catch (e) {
            console.error('[Offline] Erreur stockage fichier offline:', e);
            return Promise.reject(error);
          }
        } else {
          try {
            await addToSyncQueue(config.method, config.url, config.data, {
              Authorization: config.headers?.Authorization
            });
            console.log('[Offline] Mutation mise en file d\'attente:', config.method, config.url);
            return {
              data: { _offline_queued: true, message: 'Action enregistree, sera synchronisee au retour en ligne' },
              status: 202, config, headers: {}
            };
          } catch (e) {
            console.error('[Offline] Erreur mise en file d\'attente:', e);
            return Promise.reject(error);
          }
        }
      }
    }

    return Promise.reject(error);
  }
);

// ==================== AUTH ====================
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
  changePassword: (data) => api.post('/auth/change-password', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  validateInvitation: (token) => api.get(`/auth/validate-invitation/${token}`),
  completeRegistration: (data) => api.post('/auth/complete-registration', data),
  changePasswordFirstLogin: (data) => api.post('/auth/change-password-first-login', data)
};

// ==================== NOTIFICATIONS ====================
export const notificationsAPI = {
  getAll: (unreadOnly = false, limit = 50) => api.get('/notifications', { params: { unread_only: unreadOnly, limit } }),
  getCount: () => api.get('/notifications/count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`)
};

// ==================== WORK ORDERS ====================
export const workOrdersAPI = {
  getAll: (params) => api.get('/work-orders', { params }),
  getById: (id) => api.get(`/work-orders/${id}`),
  create: (data) => api.post('/work-orders', data),
  update: (id, data) => api.put(`/work-orders/${id}`, data),
  delete: (id) => api.delete(`/work-orders/${id}`),
  
  // IA
  aiDiagnostic: (workOrderId) => api.post('/ai-work-orders/diagnostic', { work_order_id: workOrderId }).then(r => r.data),
  aiSummary: (workOrderId) => api.post('/ai-work-orders/summary', { work_order_id: workOrderId }).then(r => r.data),
  
  // Add time spent
  addTimeSpent: (workOrderId, hours, minutes) => 
    api.post(`/work-orders/${workOrderId}/add-time`, { hours, minutes }),
  
  // Attachments
  uploadAttachment: (workOrderId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/work-orders/${workOrderId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  getAttachments: (workOrderId) => api.get(`/work-orders/${workOrderId}/attachments`),
  downloadAttachment: (workOrderId, attachmentId) => {
    return api.get(`/work-orders/${workOrderId}/attachments/${attachmentId}`, {
      responseType: 'blob'
    });
  },
  deleteAttachment: (workOrderId, attachmentId) => {
    return api.delete(`/work-orders/${workOrderId}/attachments/${attachmentId}`);
  },
  
  // Admin: Edit/Delete time entries
  updateTimeEntry: (workOrderId, entryId, hours, timestamp, userId) =>
    api.put(`/work-orders/${workOrderId}/time-entries/${entryId}`, {
      hours,
      ...(timestamp ? { timestamp } : {}),
      ...(userId ? { user_id: userId } : {})
    }),
  deleteTimeEntry: (workOrderId, entryId) =>
    api.delete(`/work-orders/${workOrderId}/time-entries/${entryId}`),

  // Parts used
  addWorkOrderParts: async (workOrderId, parts) => {
    const response = await api.post(`/work-orders/${workOrderId}/parts-used`, parts);
    return response.data;
  }
};

// ==================== EQUIPMENTS ====================
export const equipmentsAPI = {
  getAll: () => api.get('/equipments'),
  getParents: () => api.get('/equipments?parents_only=true'),
  getById: (id) => api.get(`/equipments/${id}`),
  create: (data) => api.post('/equipments', data),
  update: (id, data) => api.put(`/equipments/${id}`, data),
  delete: (id) => api.delete(`/equipments/${id}`),
  getChildren: (id) => api.get(`/equipments/${id}/children`),
  getHierarchy: (id) => api.get(`/equipments/${id}/hierarchy`),
  updateStatus: (id, statut, force = false) => api.patch(`/equipments/${id}/status`, null, { params: { statut, force } }),
  getStatusHistory: (params) => api.get('/equipments/status-history', { params }),
  reorder: (items) => api.put('/equipments/reorder', items)
};

// ==================== LOCATIONS ====================
export const locationsAPI = {
  getAll: () => api.get('/locations'),
  getById: (id) => api.get(`/locations/${id}`),
  create: (data) => api.post('/locations', data),
  update: (id, data) => api.put(`/locations/${id}`, data),
  delete: (id) => api.delete(`/locations/${id}`)
};

// ==================== INVENTORY ====================
export const inventoryAPI = {
  getAll: () => api.get('/inventory'),
  getById: (id) => api.get(`/inventory/${id}`),
  create: (data) => api.post('/inventory', data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  delete: (id) => api.delete(`/inventory/${id}`),
  toggleMonitoring: (id) => api.patch(`/inventory/${id}/toggle-monitoring`),
  // Services d'inventaire (onglets)
  getServices: () => api.get('/inventory/services'),
  createService: (data) => api.post('/inventory/services', data),
  deleteService: (id) => api.delete(`/inventory/services/${id}`),
  getByService: (serviceId) => api.get(`/inventory/by-service/${serviceId}`),
  // Partage inter-services
  shareItem: (itemId, targetServiceId) => api.post(`/inventory/${itemId}/share`, { target_service_id: targetServiceId }),
  unshareItem: (itemId, serviceId) => api.delete(`/inventory/${itemId}/unshare/${serviceId}`)
};

// ==================== PREVENTIVE MAINTENANCE ====================
export const preventiveMaintenanceAPI = {
  getAll: () => api.get('/preventive-maintenance'),
  getById: (id) => api.get(`/preventive-maintenance/${id}`),
  create: (data) => api.post('/preventive-maintenance', data),
  update: (id, data) => api.put(`/preventive-maintenance/${id}`, data),
  delete: (id) => api.delete(`/preventive-maintenance/${id}`),
  
  // Attachments (nouveau)
  uploadAttachment: (pmId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/preventive-maintenance/${pmId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  getAttachments: (pmId) => api.get(`/preventive-maintenance/${pmId}/attachments`),
  downloadAttachment: (pmId, attachmentId) => api.get(`/preventive-maintenance/${pmId}/attachments/${attachmentId}`, {
    responseType: 'blob'
  }),
  deleteAttachment: (pmId, attachmentId) => api.delete(`/preventive-maintenance/${pmId}/attachments/${attachmentId}`)
};

// ==================== CHECKLISTS ====================
export const checklistsAPI = {
  // Templates (modèles de checklists)
  getTemplates: () => api.get('/checklists/templates'),
  getTemplate: (id) => api.get(`/checklists/templates/${id}`),
  createTemplate: (data) => api.post('/checklists/templates', data),
  updateTemplate: (id, data) => api.put(`/checklists/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/checklists/templates/${id}`),
  
  // Executions (exécutions de checklists)
  getExecutions: (params) => api.get('/checklists/executions', { params }),
  getExecution: (id) => api.get(`/checklists/executions/${id}`),
  createExecution: (data) => api.post('/checklists/executions', data),
  updateExecution: (id, data) => api.put(`/checklists/executions/${id}`, data),
  
  // Historique
  getHistory: (params) => api.get('/checklists/history', { params })
};

// ==================== IA MAINTENANCE (Checklists + Maintenance Prev.) ====================
export const aiMaintenanceAPI = {
  // Feature 1: Génération IA de checklists
  generateChecklist: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/ai-maintenance/generate-checklist', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000
    }).then(res => res.data);
  },
  createChecklistsBatch: (data) => api.post('/ai-maintenance/create-checklists-batch', data).then(res => res.data),

  // Feature 2: Génération IA de programme de maintenance
  generateMaintenanceProgram: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/ai-maintenance/generate-maintenance-program', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000
    }).then(res => res.data);
  },
  createMaintenanceBatch: (data) => api.post('/ai-maintenance/create-maintenance-batch', data).then(res => res.data),

  // Feature 3: Analyse IA des non-conformités
  analyzeNonconformities: (days = 90) => api.post('/ai-maintenance/analyze-nonconformities', { days }).then(res => res.data),

  // Feature 4: Création d'OT curatifs depuis l'analyse
  createWorkOrdersFromAnalysis: (workOrders) => api.post('/ai-maintenance/create-work-orders-from-analysis', { work_orders: workOrders }).then(res => res.data),
};

// ==================== USERS ====================
export const usersAPI = {
  getAll: () => api.get('/users'),
  // Retourne uniquement les utilisateurs actifs (pour les dropdowns d'assignation)
  getActive: () => api.get('/users').then(res => ({
    ...res,
    data: (res.data || []).filter(u => (u.statut || 'actif').toLowerCase() !== 'inactif')
  })),
  getById: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  invite: (data) => api.post('/users/invite', data),
  inviteMember: (data) => api.post('/users/invite-member', data),
  createMember: (data) => api.post('/users/create-member', data),
  getPermissions: (id) => api.get(`/users/${id}/permissions`),
  updatePermissions: (id, permissions) => api.put(`/users/${id}/permissions`, permissions),
  getDefaultPermissionsByRole: (role) => api.get(`/users/default-permissions/${role}`),
  setPasswordPermanent: (userId) => api.post(`/users/${userId}/set-password-permanent`),
  resetPasswordByAdmin: (userId) => api.post(`/users/${userId}/reset-password-admin`),
  getHeaderVisibility: (userId) => api.get(`/users/${userId}/header-visibility`),
  updateHeaderVisibility: (userId, visibility) => api.put(`/users/${userId}/header-visibility`, visibility)
};

// ==================== VENDORS ====================
export const vendorsAPI = {
  getAll: () => api.get('/vendors'),
  getById: (id) => api.get(`/vendors/${id}`),
  create: (data) => api.post('/vendors', data),
  update: (id, data) => api.put(`/vendors/${id}`, data),
  delete: (id) => api.delete(`/vendors/${id}`),
  aiExtract: (formData) => api.post('/vendors/ai/extract', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
};

// ==================== PURCHASE HISTORY ====================
export const purchaseHistoryAPI = {
  getAll: () => api.get('/purchase-history'),
  getGrouped: () => api.get('/purchase-history/grouped'),
  getStats: (params = {}) => api.get('/purchase-history/stats', { params }),
  downloadTemplate: (format = 'csv') => 
    api.get('/purchase-history/template', {
      params: { format },
      responseType: 'blob'
    }),
  deleteAll: () => api.delete('/purchase-history/all'),
  create: (data) => api.post('/purchase-history', data),
  update: (id, data) => api.put(`/purchase-history/${id}`, data),
  delete: (id) => api.delete(`/purchase-history/${id}`),
  // IA Purchase History
  aiAnalyzeTrends: () => api.post('/ai-purchase-history/analyze-trends', {}).then(res => res.data),
  aiGenerateReport: () => api.post('/ai-purchase-history/generate-report', {}).then(res => res.data),
  getAIArchives: () => api.get('/ai-purchase-history/archives').then(res => res.data),
  getAIArchive: (id) => api.get(`/ai-purchase-history/archives/${id}`).then(res => res.data),
  deleteAIArchive: (id) => api.delete(`/ai-purchase-history/archives/${id}`).then(res => res.data),
};

// ==================== REPORTS ====================
export const reportsAPI = {
  getAnalytics: (period) => api.get('/reports/analytics', { params: { period } }),
  getTimeByCategory: (startMonth) => api.get('/reports/time-by-category', { params: { start_month: startMonth } }),
  getUserTimeTracking: (params) => api.get('/reports/user-time-tracking', { params })
};

// ==================== IMPORT/EXPORT ====================
export const importExportAPI = {
  exportData: (module, format = 'xlsx') => 
    api.get(`/export/${module}`, { 
      params: { format },
      responseType: 'blob' 
    }),
  importData: (module, file, mode = 'add') => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/import/${module}`, formData, {
      params: { mode },
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};

// ==================== AUDIT LOGS (JOURNAL) ====================
export const auditAPI = {
  getAuditLogs: async (params) => {
    const response = await api.get('/audit-logs', { params });
    return response.data;
  },
  getEntityHistory: async (entityType, entityId) => {
    const response = await api.get(`/audit-logs/entity/${entityType}/${entityId}`);
    return response.data;
  },
  exportAuditLogs: async (params) => {
    const response = await api.get('/audit-logs/export', {
      params,
      responseType: 'blob'
    });
    
    // Créer un lien de téléchargement
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit_logs_${new Date().getTime()}.${params.format || 'csv'}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    
    return response;
  }
};

// ==================== WORK ORDER COMMENTS ====================
export const commentsAPI = {
  addWorkOrderComment: async (workOrderId, data) => {
    // Accepte soit un string (ancien format) soit un objet (nouveau format avec parts_used)
    const payload = typeof data === 'string' ? { text: data, parts_used: [] } : data;
    const response = await api.post(`/work-orders/${workOrderId}/comments`, payload);
    return response.data;
  },
  getWorkOrderComments: async (workOrderId) => {
    const response = await api.get(`/work-orders/${workOrderId}/comments`);
    return response.data;
  },
  // Admin: Edit/Delete comments
  updateComment: (workOrderId, commentId, text) =>
    api.put(`/work-orders/${workOrderId}/comments/${commentId}`, { text }),
  deleteComment: (workOrderId, commentId) =>
    api.delete(`/work-orders/${workOrderId}/comments/${commentId}`)
};

// ==================== METERS (COMPTEURS) ====================
export const metersAPI = {
  getAll: () => api.get('/meters'),
  getById: (id) => api.get(`/meters/${id}`),
  create: (data) => api.post('/meters', data),
  update: (id, data) => api.put(`/meters/${id}`, data),
  delete: (id) => api.delete(`/meters/${id}`),
  
  // Readings (Relevés)
  getReadings: (meterId, params) => api.get(`/meters/${meterId}/readings`, { params }),
  createReading: (meterId, data) => api.post(`/meters/${meterId}/readings`, data),
  deleteReading: (readingId) => api.delete(`/readings/${readingId}`),
  getStatistics: (meterId, period = 'month') => api.get(`/meters/${meterId}/statistics`, { params: { period } })
};

// ==================== INTERVENTION REQUESTS (DEMANDES D'INTERVENTION) ====================
export const interventionRequestsAPI = {
  getAll: () => api.get('/intervention-requests'),
  getById: (id) => api.get(`/intervention-requests/${id}`),
  create: (data) => api.post('/intervention-requests', data),
  update: (id, data) => api.put(`/intervention-requests/${id}`, data),
  delete: (id) => api.delete(`/intervention-requests/${id}`),
  convertToWorkOrder: (id, assigneeId, dateLimite, assigneeType, assigneeService, tempsEstime) => api.post(`/intervention-requests/${id}/convert-to-work-order`, null, { 
    params: { 
      assignee_id: assigneeId,
      date_limite: dateLimite,
      assignee_type: assigneeType,
      assignee_service: assigneeService,
      temps_estime: tempsEstime
    } 
  }),
  downloadAttachment: (requestId, attachmentId) => api.get(`/intervention-requests/${requestId}/attachments/${attachmentId}`, {
    responseType: 'arraybuffer'
  }),
  refuse: (id, data) => api.post(`/intervention-requests/${id}/refuse`, data),
};

// ==================== IMPROVEMENT REQUESTS (DEMANDES D'AMÉLIORATION) ====================
export const improvementRequestsAPI = {
  getAll: () => api.get('/improvement-requests'),
  getById: (id) => api.get(`/improvement-requests/${id}`),
  create: (data) => api.post('/improvement-requests', data),
  update: (id, data) => api.put(`/improvement-requests/${id}`, data),
  delete: (id) => api.delete(`/improvement-requests/${id}`),
  convertToImprovement: (id, assigneeId, dateLimite) => api.post(`/improvement-requests/${id}/convert-to-improvement`, null, { 
    params: { 
      assignee_id: assigneeId,
      date_limite: dateLimite
    } 
  }),
  
  // Validation
  updateStatus: (id, statusData) => api.put(`/improvement-requests/${id}/status`, statusData),
  getPendingValidation: () => api.get('/improvement-requests/pending-validation'),
  
  // Attachments
  uploadAttachment: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/improvement-requests/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  downloadAttachment: (id, filenameOrAttachmentId) => api.get(`/improvement-requests/${id}/attachments/${filenameOrAttachmentId}`, {
    responseType: 'arraybuffer'
  }),
  deleteAttachment: (id, attachmentId) => api.delete(`/improvement-requests/${id}/attachments/${attachmentId}`),
  
  // Comments
  addComment: (id, text) => api.post(`/improvement-requests/${id}/comments`, { text }),
  getComments: (id) => api.get(`/improvement-requests/${id}/comments`)
};

// ==================== IMPROVEMENTS (AMÉLIORATIONS) ====================
export const improvementsAPI = {
  getAll: (params) => api.get('/improvements', { params }),
  getById: (id) => api.get(`/improvements/${id}`),
  create: (data) => api.post('/improvements', data),
  update: (id, data) => api.put(`/improvements/${id}`, data),
  delete: (id) => api.delete(`/improvements/${id}`),
  
  // Add time spent
  addTimeSpent: (improvementId, hours, minutes) => 
    api.post(`/improvements/${improvementId}/add-time`, { hours, minutes }),

  // Edit/Delete time entries (admin ou permission)
  updateTimeEntry: (improvementId, entryId, hours, timestamp, userId) =>
    api.put(`/improvements/${improvementId}/time-entries/${entryId}`, {
      hours,
      ...(timestamp ? { timestamp } : {}),
      ...(userId ? { user_id: userId } : {})
    }),
  deleteTimeEntry: (improvementId, entryId) =>
    api.delete(`/improvements/${improvementId}/time-entries/${entryId}`),
  
  // Attachments
  uploadAttachment: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/improvements/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  getAttachments: (id) => api.get(`/improvements/${id}/attachments`),
  downloadAttachment: (id, attachmentId) => api.get(`/improvements/${id}/attachments/${attachmentId}`, {
    responseType: 'blob'
  }),
  deleteAttachment: (id, attachmentId) => api.delete(`/improvements/${id}/attachments/${attachmentId}`),
  
  // Comments
  addComment: (id, text) => api.post(`/improvements/${id}/comments`, { text }),
  getComments: (id) => api.get(`/improvements/${id}/comments`)
};

// System Settings API
api.settings = {
  getSettings: () => api.get('/settings'),
  updateSettings: (data) => api.put('/settings', data)
};

// ==================== TIMEZONE ====================
api.timezone = {
  getConfig: () => api.get('/timezone/config'),
  updateConfig: (data) => api.put('/timezone/config', data),
  getTimezones: () => api.get('/timezone/timezones'),
  getNtpServers: () => api.get('/timezone/ntp-servers'),
  testNtp: (server) => api.post(`/timezone/test-ntp?server=${encodeURIComponent(server)}`),
  getCurrentTime: () => api.get('/timezone/current-time'),
  getOffset: () => api.get('/timezone/offset')
};

// ==================== SURVEILLANCE ====================
export const surveillanceAPI = {
  // CRUD
  getItems: (params) => api.get('/surveillance/items', { params }).then(res => res.data),
  getItem: (id) => api.get(`/surveillance/items/${id}`).then(res => res.data),
  createItem: (data) => api.post('/surveillance/items', data).then(res => res.data),
  updateItem: (id, data) => api.put(`/surveillance/items/${id}`, data).then(res => res.data),
  deleteItem: (id) => api.delete(`/surveillance/items/${id}`).then(res => res.data),
  
  // Upload
  uploadFile: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/surveillance/items/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
  
  // Stats et alertes
  getStats: (annee) => api.get('/surveillance/stats', { params: annee ? { annee } : {} }).then(res => res.data),
  getAlerts: () => api.get('/surveillance/alerts').then(res => res.data),
  getBadgeStats: () => api.get('/surveillance/badge-stats').then(res => res.data),
  getRapportStats: (annee) => api.get('/surveillance/rapport-stats', { params: annee ? { annee } : {} }).then(res => res.data),
  
  // Années disponibles
  getAvailableYears: () => api.get('/surveillance/available-years').then(res => res.data),
  
  // Migration des années
  migrateYears: () => api.post('/surveillance/migrate-years').then(res => res.data),
  
  // Occurrences d'un contrôle récurrent
  getOccurrences: (groupeId) => api.get(`/surveillance/occurrences/${groupeId}`).then(res => res.data),
  
  // Tendances de conformité en lot
  getBatchTrends: (groupeIds, currentYear) => api.post('/surveillance/batch-trends', { groupe_controle_ids: groupeIds, current_year: currentYear }).then(res => res.data),
  
  // Vérification automatique des échéances
  checkDueDates: () => api.post('/surveillance/check-due-dates').then(res => res.data),
  
  // Envoi manuel d'un email de rappel
  sendManualReminder: (itemId) => api.post(`/surveillance/items/${itemId}/send-reminder`).then(res => res.data),
  
  // Import/Export
  importData: (formData) => api.post('/surveillance/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(res => res.data),
  
  exportTemplate: () => api.get('/surveillance/export/template', {
    responseType: 'blob'
  }).then(res => res.data),
  
  // Upload pièces jointes
  uploadAttachments: (itemId, files) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    return api.post(`/surveillance/items/${itemId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
  
  // Supprimer pièce jointe
  deleteAttachment: (itemId, attachmentId) => api.delete(`/surveillance/items/${itemId}/attachments/${attachmentId}`).then(res => res.data),
  
  // Recherche
  searchItems: (query) => api.post('/surveillance/search', { query }).then(res => res.data),
  
  // Extraction IA
  extractFromDocument: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/surveillance/ai/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000
    }).then(res => res.data);
  },
  
  // Création batch depuis IA
  createBatchFromAI: (data) => api.post('/surveillance/ai/create-batch', data).then(res => res.data),
  
  // Analyse de rapport pour une occurrence spécifique (icône robot)
  analyzeReportForItem: (itemId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/surveillance/items/${itemId}/analyze-report`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000
    }).then(res => res.data);
  },
  
  // Confirmer une correspondance ambiguë
  confirmMatch: (data) => api.post('/surveillance/ai/confirm-match', data).then(res => res.data),
  
  // Historique des analyses IA
  getAIHistory: (params) => api.get('/surveillance/ai/history', { params }).then(res => res.data),
  getAIHistoryDetail: (id) => api.get(`/surveillance/ai/history/${id}`).then(res => res.data),
  
  // Analytics & Tendances IA
  getAIAnalytics: () => api.get('/surveillance/ai/analytics').then(res => res.data),
  
  // Alertes intelligentes IA
  getAIAlerts: () => api.get('/surveillance/ai/alerts').then(res => res.data)
};

// ==================== PRESQU'ACCIDENT ====================
export const presquAccidentAPI = {
  // CRUD
  getItems: (params) => api.get('/presqu-accident/items', { params }).then(res => res.data),
  getItem: (id) => api.get(`/presqu-accident/items/${id}`).then(res => res.data),
  createItem: (data) => api.post('/presqu-accident/items', data).then(res => res.data),
  updateItem: (id, data) => api.put(`/presqu-accident/items/${id}`, data).then(res => res.data),
  deleteItem: (id) => api.delete(`/presqu-accident/items/${id}`).then(res => res.data),
  
  // Alias pour compatibilité
  create: (data) => api.post('/presqu-accident/items', data).then(res => res.data),
  update: (id, data) => api.put(`/presqu-accident/items/${id}`, data).then(res => res.data),
  delete: (id) => api.delete(`/presqu-accident/items/${id}`).then(res => res.data),
  
  // IA Presqu'accidents
  aiAnalyzeRootCauses: (itemId) => api.post('/ai-presqu-accident/analyze-root-causes', { item_id: itemId }).then(res => res.data),
  aiFindSimilar: (data) => api.post('/ai-presqu-accident/find-similar', data).then(res => res.data),
  aiAnalyzeTrends: (days = 365) => api.post('/ai-presqu-accident/analyze-trends', { days }).then(res => res.data),
  aiGenerateReport: (days = 365) => api.post('/ai-presqu-accident/generate-report', { days }).then(res => res.data),
  getAIArchives: () => api.get('/ai-presqu-accident/archives').then(res => res.data),
  getAIArchive: (id) => api.get(`/ai-presqu-accident/archives/${id}`).then(res => res.data),
  deleteAIArchive: (id) => api.delete(`/ai-presqu-accident/archives/${id}`).then(res => res.data),
  
  // Attachments (nouveau format multi-fichiers)
  uploadAttachment: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/presqu-accident/items/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  getAttachments: (id) => api.get(`/presqu-accident/items/${id}/attachments`),
  downloadAttachment: (itemId, attachmentId) => api.get(`/presqu-accident/items/${itemId}/attachments/${attachmentId}`, {
    responseType: 'blob'
  }),
  deleteAttachment: (itemId, attachmentId) => api.delete(`/presqu-accident/items/${itemId}/attachments/${attachmentId}`),
  
  // Upload legacy (pour compatibilité)
  uploadFile: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/presqu-accident/items/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
  
  // Stats et alertes
  getStats: () => api.get('/presqu-accident/stats').then(res => res.data),
  getAlerts: () => api.get('/presqu-accident/alerts').then(res => res.data),
  getBadgeStats: () => api.get('/presqu-accident/badge-stats').then(res => res.data),
  getRapportStats: () => api.get('/presqu-accident/rapport-stats').then(res => res.data),
  
  // Import/Export
  importData: (formData) => api.post('/presqu-accident/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(res => res.data),
  
  exportTemplate: () => api.get('/presqu-accident/export/template', {
    responseType: 'blob'
  }).then(res => res.data),

  export: () => api.get('/presqu-accident/export', {
    responseType: 'blob'
  }).then(res => res.data)
};

// ==================== DOCUMENTATIONS ====================
export const documentationsAPI = {
  // Pôles de Service
  getPoles: () => api.get('/documentations/poles').then(res => res.data),
  getPole: (id) => api.get(`/documentations/poles/${id}`).then(res => res.data),
  createPole: (data) => api.post('/documentations/poles', data).then(res => res.data),
  updatePole: (id, data) => api.put(`/documentations/poles/${id}`, data).then(res => res.data),
  deletePole: (id) => api.delete(`/documentations/poles/${id}`).then(res => res.data),
  
  // Documents
  getDocuments: (params) => api.get('/documentations/documents', { params }).then(res => res.data),
  getDocument: (id) => api.get(`/documentations/documents/${id}`).then(res => res.data),
  createDocument: (data) => api.post('/documentations/documents', data).then(res => res.data),
  updateDocument: (id, data) => api.put(`/documentations/documents/${id}`, data).then(res => res.data),
  deleteDocument: (id) => api.delete(`/documentations/documents/${id}`).then(res => res.data),
  
  // Upload/Download
  uploadFile: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/documentations/documents/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
  downloadFile: (id) => api.get(`/documentations/documents/${id}/download`, {
    responseType: 'blob'
  }).then(res => res.data),
  
  // Bons de Travail
  getBonsTravail: (params) => api.get('/documentations/bons-travail', { params }).then(res => res.data),
  getBonTravail: (id) => api.get(`/documentations/bons-travail/${id}`).then(res => res.data),
  createBonTravail: (data) => api.post('/documentations/bons-travail', data).then(res => res.data),
  updateBonTravail: (id, data) => api.put(`/documentations/bons-travail/${id}`, data).then(res => res.data),
  deleteBonTravail: (id) => api.delete(`/documentations/bons-travail/${id}`).then(res => res.data),

  // Autorisations particulières (explorateur)
  deleteAutorisation: (id) => api.delete(`/documentations/autorisations-particulieres/${id}`).then(res => res.data),
  updateAutorisation: (id, data) => api.patch(`/documentations/autorisations-particulieres/${id}`, data).then(res => res.data),
  getAutorisationPdfUrl: (id) => {
    const token = localStorage.getItem('token');
    return `${API_BASE}/autorisations/${id}/pdf?token=${token}`;
  },
  
  // Actions
  generatePDF: (id) => api.post(`/documentations/bons-travail/${id}/pdf`).then(res => res.data),
  sendEmail: (id, email) => api.post(`/documentations/bons-travail/${id}/email`, { email_to: email }).then(res => res.data),

  // Dossiers (Vue Explorateur)
  getFolders: (poleId, parentId) => api.get(`/documentations/poles/${poleId}/folders`, { params: { parent_id: parentId || null } }).then(res => res.data),
  createFolder: (poleId, data) => api.post(`/documentations/poles/${poleId}/folders`, data).then(res => res.data),
  updateFolder: (folderId, data) => api.put(`/documentations/folders/${folderId}`, data).then(res => res.data),
  deleteFolder: (folderId) => api.delete(`/documentations/folders/${folderId}`).then(res => res.data),
  moveDocument: (docId, data) => api.put(`/documentations/documents/${docId}/move`, data).then(res => res.data),
  getExplorerContents: (poleId, folderId, sortBy) => api.get(`/documentations/poles/${poleId}/explorer`, { params: { folder_id: folderId || null, sort_by: sortBy || 'name' } }).then(res => res.data),

  // Copier / Déplacer
  copyNode: (data) => api.post('/documentations/copy', data).then(res => res.data),
  moveNode: (data) => api.post('/documentations/move', data).then(res => res.data),

  // Permissions
  togglePermission: (nodeId, data) => api.patch(`/documentations/permissions/${nodeId}`, data).then(res => res.data),

  // Envoyer vers un autre pôle
  sendToPole: (data) => api.post('/documentations/send-to', data).then(res => res.data),

  // Partager par email FSAO
  shareByEmail: (data) => api.post('/documentations/share-email', data).then(res => res.data),

  // Insérer dans OT / Amélioration / M.Prev
  getInsertTargets: (targetType) => api.get('/documentations/insert-targets', { params: { target_type: targetType } }).then(res => res.data),
  insertInto: (data) => api.post('/documentations/insert-into', data).then(res => res.data),

  // Form Templates
  getFormTemplates: () => api.get('/documentations/form-templates').then(res => res.data),

  // Upload direct de fichiers
  uploadFiles: (poleId, folderId, files) => {
    const formData = new FormData();
    formData.append('pole_id', poleId);
    formData.append('folder_id', folderId || 'null');
    files.forEach(file => formData.append('files', file));
    return api.post('/documentations/upload-files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },

  // IA - Génération de formulaires
  generateFormAI: (formData) => api.post('/documentations/form-templates/generate-ai', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  }).then(res => res.data),

  // Config modèle IA
  getAIModelConfig: () => api.get('/documentations/ai-model-config').then(res => res.data),
  updateAIModelConfig: (data) => api.put('/documentations/ai-model-config', data).then(res => res.data),
};

// ==================== AUTORISATIONS PARTICULIÈRES ====================
export const autorisationsAPI = {
  getAll: (poleId = null) => {
    const params = poleId ? { pole_id: poleId } : {};
    return api.get('/autorisations/', { params }).then(res => res.data);
  },
  getById: (id) => api.get(`/autorisations/${id}`).then(res => res.data),
  getByBonTravail: (bonTravailId) => api.get(`/autorisations/by-bon-travail/${bonTravailId}`).then(res => res.data),
  create: (data) => api.post('/autorisations/', data).then(res => res.data),
  update: (id, data) => api.put(`/autorisations/${id}`, data).then(res => res.data),
  delete: (id) => api.delete(`/autorisations/${id}`).then(res => res.data),
  generatePDF: (id) => {
    const token = localStorage.getItem('token');
    return `${API_BASE}/autorisations/${id}/pdf?token=${token}`;
  }
};

// ==================== DEMANDES D'ARRÊT MAINTENANCE ====================
export const demandesArretAPI = {
  getAll: (statut = null) => {
    const params = statut ? { statut } : {};
    return api.get('/demandes-arret/', { params }).then(res => res.data);
  },
  getById: (id) => api.get(`/demandes-arret/${id}`).then(res => res.data),
  create: (data) => api.post('/demandes-arret/', data).then(res => res.data),
  getPlanningEquipements: (params = {}) => api.get('/demandes-arret/planning/equipements', { params }).then(res => res.data),
  cancel: (id, motif) => api.post(`/demandes-arret/${id}/cancel`, null, { params: { motif } }).then(res => res.data),
  requestReport: (id, data) => api.post(`/demandes-arret/${id}/request-report`, null, { 
    params: { 
      raison: data.raison, 
      nouvelle_date_debut: data.nouvelle_date_debut, 
      nouvelle_date_fin: data.nouvelle_date_fin 
    } 
  }).then(res => res.data),
  acceptReport: (id) => api.post(`/demandes-arret/${id}/accept-report`).then(res => res.data),
  getReportsHistory: () => api.get('/demandes-arret/reports/history').then(res => res.data),
  // Pièces jointes
  uploadAttachment: (demandeId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/demandes-arret/${demandeId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
  getAttachments: (demandeId) => api.get(`/demandes-arret/${demandeId}/attachments`).then(res => res.data),
  downloadAttachment: (demandeId, attachmentId) => api.get(`/demandes-arret/${demandeId}/attachments/${attachmentId}`, { responseType: 'blob' }),
  deleteAttachment: (demandeId, attachmentId) => api.delete(`/demandes-arret/${demandeId}/attachments/${attachmentId}`).then(res => res.data),
  // Rappels automatiques
  triggerReminders: () => api.get('/demandes-arret/trigger-reminders').then(res => res.data),
  // Vérification fins de maintenance
  checkEndMaintenance: () => api.post('/demandes-arret/check-end-maintenance').then(res => res.data),
  // Maintenances en attente de nouveau statut
  getPendingStatusUpdate: () => api.get('/demandes-arret/pending-status-update').then(res => res.data)
};

// User Preferences API
export const userPreferencesAPI = {
  getAll: () => api.get('/user-preferences').then(res => res.data),
  get: (key) => api.get(`/user-preferences/${key}`).then(res => res.data),
  set: (key, value) => api.post('/user-preferences', { key, value }).then(res => res.data),
  setBulk: (preferences) => api.put('/user-preferences/bulk', { preferences }).then(res => res.data),
  delete: (key) => api.delete(`/user-preferences/${key}`).then(res => res.data)
};


// Chat Live API
const chatAPI = {
  getMessages: (limit = 50, skip = 0) => api.get(`/chat/messages?limit=${limit}&skip=${skip}`),
  createMessage: (messageData) => api.post('/chat/messages', messageData),
  createMessageWithFiles: (formData) => api.post('/chat/messages-with-files', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteMessage: (messageId) => api.delete(`/chat/messages/${messageId}`),
  getUnreadCount: () => api.get('/chat/unread-count'),
  markAsRead: () => api.post('/chat/mark-as-read'),
  getOnlineUsers: () => api.get('/chat/online-users'),
  addReaction: (messageId, emoji) => api.post(`/chat/reactions/${messageId}`, { emoji }),
  uploadFile: (formData) => api.post('/chat/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  downloadFile: (attachmentId) => api.get(`/chat/download/${attachmentId}`, { responseType: 'blob' }),
  transferToWorkOrder: (attachmentId, workorderId) => {
    const formData = new FormData();
    formData.append('attachment_id', attachmentId);
    formData.append('workorder_id', workorderId);
    return api.post('/chat/transfer-to-workorder', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  transferToImprovement: (attachmentId, improvementId) => {
    const formData = new FormData();
    formData.append('attachment_id', attachmentId);
    formData.append('improvement_id', improvementId);
    return api.post('/chat/transfer-to-improvement', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  transferToPreventive: (attachmentId, preventiveId) => {
    const formData = new FormData();
    formData.append('attachment_id', attachmentId);
    formData.append('preventive_id', preventiveId);
    return api.post('/chat/transfer-to-preventive', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  transferToNearMiss: (attachmentId, nearmissId) => {
    const formData = new FormData();
    formData.append('attachment_id', attachmentId);
    formData.append('nearmiss_id', nearmissId);
    return api.post('/chat/transfer-to-nearmiss', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  transferByEmail: (attachmentId, recipientUserIds, message) => {
    const formData = new FormData();
    formData.append('attachment_id', attachmentId);
    formData.append('recipient_user_ids', JSON.stringify(recipientUserIds));
    formData.append('message_text', message || '');
    return api.post('/chat/transfer-by-email', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};

// Ajouter chatAPI à l'export api
api.chat = chatAPI;

// ==================== MQTT API ====================
const mqttAPI = {
  // Configuration
  getConfig: () => api.get('/mqtt/config'),
  saveConfig: (config) => api.post('/mqtt/config', config),
  
  // Connexion
  connect: () => api.post('/mqtt/connect'),
  disconnect: () => api.post('/mqtt/disconnect'),
  getStatus: () => api.get('/mqtt/status'),
  
  // Publication
  publish: (data) => api.post('/mqtt/publish', data),
  
  // Abonnement
  subscribe: (data) => api.post('/mqtt/subscribe', data),
  unsubscribe: (topic) => api.delete('/mqtt/unsubscribe', { params: { topic } }),
  getSubscriptions: () => api.get('/mqtt/subscriptions'),
  
  // Messages
  getMessages: (topic = null, limit = 100) => {
    const params = {};
    if (topic) params.topic = topic;
    if (limit) params.limit = limit;
    return api.get('/mqtt/messages', { params });
  },
  clearMessages: () => api.delete('/mqtt/messages')
};

api.mqtt = {
  ...mqttAPI,
  // MQTT Logs
  getLogs: (filters = {}) => api.get('/mqtt/logs/', { params: filters }),
  getLogsStats: (hours = 24) => api.get('/mqtt/logs/stats', { params: { hours } }),
  getLogsTopics: (hours = 24) => api.get('/mqtt/logs/topics', { params: { hours } }),
  clearLogs: (hours = null) => {
    const params = hours ? { hours } : {};
    return api.delete('/mqtt/logs/clear', { params });
  }
};

// ==================== Sensors API ====================
export const sensorsAPI = {
  getAll: (type = null) => {
    const params = {};
    if (type) params.type = type;
    return api.get('/sensors', { params });
  },
  getById: (id) => api.get(`/sensors/${id}`),
  create: (data) => api.post('/sensors', data),
  update: (id, data) => api.put(`/sensors/${id}`, data),
  delete: (id) => api.delete(`/sensors/${id}`),
  
  // Readings
  getReadings: (id, limit = 100, hours = 24) => 
    api.get(`/sensors/${id}/readings`, { params: { limit, hours } }),
  getStatistics: (id, hours = 24) => 
    api.get(`/sensors/${id}/statistics`, { params: { hours } }),
  clearReadings: (id) => api.delete(`/sensors/${id}/readings`),
  
  // Templates
  getTemplates: () => api.get('/sensors/templates/list'),
  getTemplate: (templateId) => api.get(`/sensors/templates/${templateId}`),
  
  // Import/Export
  exportJson: () => api.get('/sensors/export/json', { responseType: 'blob' }),
  exportCsv: () => api.get('/sensors/export/csv', { responseType: 'blob' }),
  importJson: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/sensors/import/json', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  // Groupements
  getGroupsByLocation: () => api.get('/sensors/groups/by-location'),
  getGroupsByType: () => api.get('/sensors/groups/by-type'),
  
  // Export historique des lectures
  exportReadings: (periodDays = 7, format = 'csv') => 
    api.get('/sensors/export/readings', { 
      params: { period_days: periodDays, format },
      responseType: 'blob'
    }),
  
  // Test de formule
  testFormula: (formula, testValue) =>
    api.post('/sensors/test-formula', null, {
      params: { formula, test_value: testValue }
    }),
  
  // IA - Analyse prédictive
  aiAnalyze: (sensorId) => api.post('/ai-sensors/analyze', { sensor_id: sensorId }).then(r => r.data),
};

api.sensors = sensorsAPI;

// ==================== Alerts API ====================
const alertsAPI = {
  getAll: (unreadOnly = false, limit = 50) => 
    api.get('/alerts', { params: { unread_only: unreadOnly, limit } }),
  getUnreadCount: () => api.get('/alerts/unread-count'),
  markAsRead: (id) => api.post(`/alerts/${id}/read`),
  markAllAsRead: () => api.post('/alerts/mark-all-read'),
  delete: (id) => api.delete(`/alerts/${id}`),
  clearAll: () => api.delete('/alerts'),
  
  // Configuration des actions
  getConfig: (sourceType, sourceId) => 
    api.get(`/alerts/config/${sourceType}/${sourceId}`),
  saveConfig: (config) => api.post('/alerts/config', config)
};

api.alerts = alertsAPI;


// ==================== PURCHASE REQUESTS ====================
export const purchaseRequestsAPI = {
  getAll: (params) => api.get('/purchase-requests', { params }),
  getById: (id) => api.get(`/purchase-requests/${id}`),
  create: (data) => api.post('/purchase-requests', data),
  update: (id, data) => api.put(`/purchase-requests/${id}`, data),
  updateStatus: (id, data) => api.put(`/purchase-requests/${id}/status`, data),
  delete: (id) => api.delete(`/purchase-requests/${id}`),
  getUsersList: () => api.get('/purchase-requests/users-list'),
  getVendorsList: () => api.get('/purchase-requests/vendors-list'),
  addToInventory: (id) => api.post(`/purchase-requests/${id}/add-to-inventory`),
  addToExistingInventory: (id, inventoryItemId) => api.post(`/purchase-requests/${id}/add-to-existing-inventory?inventory_item_id=${inventoryItemId}`)
};

api.purchaseRequests = purchaseRequestsAPI;

// ==================== AI Chatbot API ====================
const aiAPI = {
  getProviders: () => api.get('/ai/providers'),
  chat: (data) => api.post('/ai/chat', data),
  getHistory: (sessionId) => api.get(`/ai/history/${sessionId}`),
  clearHistory: (sessionId) => api.delete(`/ai/history/${sessionId}`),
  getSessions: () => api.get('/ai/sessions'),
  // Contexte enrichi de l'application
  getContext: () => api.get('/ai/context'),
  
  // Actions automatiques
  createWorkOrder: (data) => api.post('/ai/action/create-ot', data),
  addTimeToOT: (data) => api.post('/ai/action/add-time', data),
  addCommentToOT: (data) => api.post('/ai/action/comment', data),
  search: (data) => api.post('/ai/action/search', data),
  
  // Fonctions vocales (STT & TTS)
  transcribeAudio: (formData) => api.post('/ai/voice/transcribe', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  synthesizeSpeech: (data) => api.post('/ai/voice/tts', data)
};

api.ai = aiAPI;

// API Historique des mises à jour système
export const systemUpdateHistoryAPI = {
  getHistory: (params = {}) => api.get('/api/updates/history-list', { params }),
  getStats: () => api.get('/api/updates/history-stats')
};

// ==================== ROLES API ====================
export const rolesAPI = {
  getAll: () => api.get('/roles').then(res => res.data),
  getById: (id) => api.get(`/roles/${id}`).then(res => res.data),
  getByCode: (code) => api.get(`/roles/by-code/${code}`).then(res => res.data),
  create: (data) => api.post('/roles', data).then(res => res.data),
  update: (id, data) => api.put(`/roles/${id}`, data).then(res => res.data),
  delete: (id) => api.delete(`/roles/${id}`).then(res => res.data),
  
  // Service Responsables
  getServiceResponsables: () => api.get('/roles/service-responsables/all').then(res => res.data),
  getServiceResponsable: (service) => api.get(`/roles/service-responsables/${service}`).then(res => res.data),
  setServiceResponsable: (data) => api.post('/roles/service-responsables', data).then(res => res.data),
  removeServiceResponsable: (service) => api.delete(`/roles/service-responsables/${service}`).then(res => res.data),
  
  // Services list
  getServices: () => api.get('/roles/services/list').then(res => res.data)
};

// API pour les ordres de travail type (modèles)
export const workOrderTemplatesAPI = {
  getAll: () => api.get('/work-order-templates').then(res => res.data),
  getByCategory: (category) => api.get(`/work-order-templates/by-category/${category}`).then(res => res.data),
  getById: (id) => api.get(`/work-order-templates/${id}`).then(res => res.data),
  create: (data) => api.post('/work-order-templates', data).then(res => res.data),
  update: (id, data) => api.put(`/work-order-templates/${id}`, data).then(res => res.data),
  delete: (id) => api.delete(`/work-order-templates/${id}`).then(res => res.data),
  duplicate: (id) => api.post(`/work-order-templates/${id}/duplicate`).then(res => res.data),
  incrementUsage: (id) => api.post(`/work-order-templates/${id}/increment-usage`).then(res => res.data),
  checkAccess: () => api.get('/work-order-templates/check-access/me').then(res => res.data)
};

// ==================== CUSTOM WIDGETS API ====================
export const customWidgetsAPI = {
  // CRUD
  getAll: (params = {}) => api.get('/custom-widgets', { params }).then(res => res.data),
  getMyWidgets: () => api.get('/custom-widgets/my-widgets').then(res => res.data),
  getById: (id) => api.get(`/custom-widgets/${id}`).then(res => res.data),
  create: (data) => api.post('/custom-widgets', data).then(res => res.data),
  update: (id, data) => api.put(`/custom-widgets/${id}`, data).then(res => res.data),
  delete: (id) => api.delete(`/custom-widgets/${id}`).then(res => res.data),
  updatePosition: (id, position) => api.put(`/custom-widgets/${id}/position`, null, { params: { position } }),

  // Rafraîchissement
  refresh: (id) => api.post(`/custom-widgets/${id}/refresh`).then(res => res.data),

  // Configuration dashboard
  getDashboardConfig: () => api.get('/custom-widgets/dashboard/config').then(res => res.data),
  updateDashboardConfig: (data) => api.put('/custom-widgets/dashboard/config', data).then(res => res.data),

  // Types de données FSAO
  getGmaoDataTypes: () => api.get('/custom-widgets/data-types/gmao').then(res => res.data),

  // Tests et validations
  testExcelConnection: (smbPath, username, password) => 
    api.post('/custom-widgets/test/excel-connection', null, {
      params: { smb_path: smbPath, username, password }
    }).then(res => res.data),
  previewExcel: (smbPath, sheetName, maxRows, username, password) =>
    api.post('/custom-widgets/preview/excel', null, {
      params: { smb_path: smbPath, sheet_name: sheetName, max_rows: maxRows, username, password }
    }).then(res => res.data),
  validateFormula: (formula, sourceNames) =>
    api.post('/custom-widgets/validate/formula', null, {
      params: { formula, source_names: sourceNames }
    }).then(res => res.data),
  testFormula: (formula, testValues) =>
    api.post('/custom-widgets/test/formula', testValues, {
      params: { formula }
    }).then(res => res.data),

  // Configuration SMB (admin)
  configureSMB: (username, password, domain) =>
    api.post('/custom-widgets/config/smb', null, {
      params: { username, password, domain }
    }).then(res => res.data),
};


// ==================== CONTRATS ====================
export const contractsAPI = {
  getContracts: (params) => api.get('/contracts', { params }).then(res => res.data),
  getContract: (id) => api.get(`/contracts/${id}`).then(res => res.data),
  getStats: () => api.get('/contracts/stats').then(res => res.data),
  getDashboard: () => api.get('/contracts/dashboard').then(res => res.data),
  getAlerts: () => api.get('/contracts/alerts').then(res => res.data),
  createContract: (data) => api.post('/contracts', data).then(res => res.data),
  updateContract: (id, data) => api.put(`/contracts/${id}`, data).then(res => res.data),
  deleteContract: (id) => api.delete(`/contracts/${id}`).then(res => res.data),
  uploadFile: (contractId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/contracts/${contractId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
  downloadFile: (contractId, fileId) => api.get(`/contracts/${contractId}/download/${fileId}`, { responseType: 'blob' }),
  deleteFile: (contractId, fileId) => api.delete(`/contracts/${contractId}/files/${fileId}`).then(res => res.data),
  extractWithAI: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/contracts/ai/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000
    }).then(res => res.data);
  }
};

// IA Rapports Hebdomadaires
export const aiReportsAPI = {
  generate: (service, periodDays, reportType) => api.post('/ai-weekly-reports/generate', { service, period_days: periodDays, report_type: reportType }).then(r => r.data),
};

// Automatisations
export const automationsAPI = {
  parse: (message) => api.post('/automations/parse', { message }).then(r => r.data),
  apply: (automation) => api.post('/automations/apply', { automation }).then(r => r.data),
  list: () => api.get('/automations/list').then(r => r.data),
  remove: (id) => api.delete(`/automations/${id}`).then(r => r.data),
  toggle: (id) => api.put(`/automations/${id}/toggle`).then(r => r.data),
  testTrigger: (id) => api.post(`/automations/test-trigger/${id}`).then(r => r.data),
};

// Attacher les APIs nommees a l'objet api pour acces universel
api.workOrders = workOrdersAPI;
api.automations = automationsAPI;
api.aiWidgets = {
  generate: (data) => api.post('/ai/widgets/generate', data).then(r => r.data),
};

export const dashboardAPI = {
  getWidgetData: () => api.get('/dashboard/widget-data').then(res => res.data),
};


export const accidentAnalysisAPI = {
  list: () => api.get('/accident-analysis').then(r => r.data),
  get: (id) => api.get(`/accident-analysis/${id}`).then(r => r.data),
  create: (data) => api.post('/accident-analysis', data).then(r => r.data),
  update: (id, data) => api.put(`/accident-analysis/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/accident-analysis/${id}`).then(r => r.data),
  // IA
  aiQqoqcp: (id, data) => api.post(`/accident-analysis/${id}/ai/qqoqcp`, data).then(r => r.data),
  ai5Pourquoi: (id, data) => api.post(`/accident-analysis/${id}/ai/5pourquoi`, data).then(r => r.data),
  aiIshikawa: (id, data) => api.post(`/accident-analysis/${id}/ai/ishikawa`, data).then(r => r.data),
  aiAlarm: (id, data) => api.post(`/accident-analysis/${id}/ai/alarm`, data).then(r => r.data),
  aiGenerateActions: (id) => api.post(`/accident-analysis/${id}/ai/generate-actions`).then(r => r.data),
  // Actions correctives
  createWorkOrder: (id, data) => api.post(`/accident-analysis/${id}/create-work-order`, data).then(r => r.data),
  createPreventive: (id, data) => api.post(`/accident-analysis/${id}/create-preventive`, data).then(r => r.data),
  createChecklist: (id, data) => api.post(`/accident-analysis/${id}/create-checklist`, data).then(r => r.data),
  // Config IA
  getAIConfig: () => api.get('/accident-analysis/settings/ai-config').then(r => r.data),
  updateAIConfig: (data) => api.put('/accident-analysis/settings/ai-config', data).then(r => r.data),
  // Config methodes & ALARM admin
  getMethodsConfig: () => api.get('/accident-analysis/settings/methods-config').then(r => r.data),
  updateMethodsConfig: (data) => api.put('/accident-analysis/settings/methods-config', data).then(r => r.data),
  getAlarmItems: () => api.get('/accident-analysis/settings/alarm-items').then(r => r.data),
  updateAlarmItems: (data) => api.put('/accident-analysis/settings/alarm-items', data).then(r => r.data),
  importAlarmDocument: (formData) => api.post('/accident-analysis/settings/alarm-import-document', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }).then(r => r.data),
  // PDF & Archive
  archivePdf: (id, data) => api.post(`/accident-analysis/${id}/archive-pdf`, data).then(r => r.data),
};

export default api;