/**
 * Hook pour les compteurs de la cloche du header
 * 3 badges : OT en attente, Améliorations en attente, Maintenances préventives échues
 */
import { useState, useEffect, useCallback } from 'react';
import { getBackendURL } from '../utils/config';

const FALLBACK_INTERVAL = 300000; // 5 min

export const useBellCounts = () => {
  const [bellCounts, setBellCounts] = useState({
    work_orders: 0,
    att_materiel: 0,
    att_decision: 0,
    improvements: 0,
    preventive: 0
  });

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const backend_url = getBackendURL();
      const response = await fetch(`${backend_url}/api/bell-counts`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setBellCounts(data);
      }
    } catch (error) {
      console.error('Erreur chargement bell-counts:', error);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, FALLBACK_INTERVAL);

    const refresh = () => load();
    const events = ['workOrderCreated', 'workOrderUpdated', 'workOrderDeleted',
                    'improvementCreated', 'improvementUpdated', 'improvementDeleted'];
    events.forEach(evt => window.addEventListener(evt, refresh));

    return () => {
      clearInterval(interval);
      events.forEach(evt => window.removeEventListener(evt, refresh));
    };
  }, [load]);

  return bellCounts;
};

export default useBellCounts;
