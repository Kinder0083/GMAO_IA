/**
 * Hook pour les éléments en retard (échéances dépassées)
 * Refresh déclenché par WebSocket via useHeaderWebSocket
 * Polling 5min en fallback
 */
import { useState, useEffect, useCallback } from 'react';
import { getBackendURL } from '../utils/config';

const FALLBACK_INTERVAL = 300000; // 5 min

export const useOverdueItems = () => {
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueDetails, setOverdueDetails] = useState({});
  const [overdueExecutionCount, setOverdueExecutionCount] = useState(0);
  const [overdueRequestsCount, setOverdueRequestsCount] = useState(0);
  const [overdueMaintenanceCount, setOverdueMaintenanceCount] = useState(0);

  const loadOverdueItems = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const backend_url = getBackendURL();
    const userInfo = localStorage.getItem('user');
    const permissions = userInfo ? JSON.parse(userInfo).permissions : {};
    const canViewModule = (module) => permissions[module]?.view === true;

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    let total = 0;
    let executionCount = 0;
    let requestsCount = 0;
    let maintenanceCount = 0;
    const details = {};

    try {
      // 1. Ordres de travail (ORANGE)
      if (canViewModule('workOrders')) {
        try {
          const res = await fetch(`${backend_url}/api/work-orders`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const items = await res.json();
            const overdue = items.filter(wo => {
              if (!wo.dateLimite || wo.statut === 'TERMINE' || wo.statut === 'ANNULE') return false;
              return new Date(wo.dateLimite) < today;
            });
            if (overdue.length > 0) {
              details.workOrders = { count: overdue.length, label: 'Ordres de travail', route: '/work-orders', category: 'execution' };
              executionCount += overdue.length;
              total += overdue.length;
            }
          }
        } catch (err) { console.error('Erreur work orders:', err); }
      }

      // 2. Améliorations (ORANGE)
      if (canViewModule('improvements')) {
        try {
          const res = await fetch(`${backend_url}/api/improvements`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const items = await res.json();
            const overdue = items.filter(imp => {
              if (!imp.dateLimite || imp.statut === 'TERMINE' || imp.statut === 'ANNULE' || imp.statut === 'REFUSE') return false;
              return new Date(imp.dateLimite) < today;
            });
            if (overdue.length > 0) {
              details.improvements = { count: overdue.length, label: 'Améliorations', route: '/improvements', category: 'execution' };
              executionCount += overdue.length;
              total += overdue.length;
            }
          }
        } catch (err) { console.error('Erreur improvements:', err); }
      }

      // 3. Demandes d'intervention (JAUNE)
      if (canViewModule('interventionRequests')) {
        try {
          const res = await fetch(`${backend_url}/api/intervention-requests`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const items = await res.json();
            const overdue = items.filter(ir => {
              if (!ir.date_limite_desiree || ir.statut === 'TERMINE' || ir.statut === 'ANNULE' || ir.statut === 'REFUSE') return false;
              // Exclure les DI converties en OT ou refusées
              if (ir.work_order_id || ir.refused) return false;
              return new Date(ir.date_limite_desiree) < today;
            });
            if (overdue.length > 0) {
              details.interventionRequests = { count: overdue.length, label: "Demandes d'intervention", route: '/intervention-requests', category: 'requests' };
              requestsCount += overdue.length;
              total += overdue.length;
            }
          }
        } catch (err) { console.error('Erreur intervention requests:', err); }
      }

      // 4. Demandes d'amélioration (JAUNE) - Exclut REJETEE et CONVERTIE
      if (canViewModule('improvementRequests')) {
        try {
          const res = await fetch(`${backend_url}/api/improvement-requests`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const items = await res.json();
            const overdue = items.filter(impr => {
              if (!impr.date_limite_desiree || impr.status === 'REJETEE' || impr.status === 'CONVERTIE') return false;
              return new Date(impr.date_limite_desiree) < today;
            });
            if (overdue.length > 0) {
              details.improvementRequests = { count: overdue.length, label: "Demandes d'amélioration", route: '/improvement-requests', category: 'requests' };
              requestsCount += overdue.length;
              total += overdue.length;
            }
          }
        } catch (err) { console.error('Erreur improvement requests:', err); }
      }

      // 5. Maintenances préventives (BLEU)
      if (canViewModule('preventiveMaintenance')) {
        try {
          const res = await fetch(`${backend_url}/api/preventive-maintenance`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const items = await res.json();
            const overdue = items.filter(pm => {
              if (!pm.prochaineMaintenance || pm.statut !== 'ACTIF') return false;
              return new Date(pm.prochaineMaintenance) < today;
            });
            if (overdue.length > 0) {
              details.preventiveMaintenance = { count: overdue.length, label: 'Maintenances préventives', route: '/preventive-maintenance', category: 'maintenance' };
              maintenanceCount += overdue.length;
              total += overdue.length;
            }
          }
        } catch (err) { console.error('Erreur preventive maintenance:', err); }
      }

      setOverdueCount(total);
      setOverdueExecutionCount(executionCount);
      setOverdueRequestsCount(requestsCount);
      setOverdueMaintenanceCount(maintenanceCount);
      setOverdueDetails(details);
    } catch (error) {
      console.error('Erreur chargement échéances:', error);
    }
  }, []);

  useEffect(() => {
    loadOverdueItems();
    const interval = setInterval(loadOverdueItems, FALLBACK_INTERVAL);

    const refresh = () => loadOverdueItems();
    // Events déclenchés par le WebSocket header
    const events = [
      'workOrderCreated', 'workOrderUpdated', 'workOrderDeleted',
      'improvementCreated', 'improvementUpdated', 'improvementDeleted',
      'interventionRequestChanged', 'improvementRequestChanged',
      'preventiveMaintenanceChanged'
    ];
    events.forEach(evt => window.addEventListener(evt, refresh));

    return () => {
      clearInterval(interval);
      events.forEach(evt => window.removeEventListener(evt, refresh));
    };
  }, [loadOverdueItems]);

  return { overdueCount, overdueDetails, overdueExecutionCount, overdueRequestsCount, overdueMaintenanceCount, refresh: loadOverdueItems };
};

export default useOverdueItems;
