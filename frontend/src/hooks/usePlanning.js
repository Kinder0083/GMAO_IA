import { useCallback } from 'react';
import { useRealtimeData } from './useRealtimeData';
import { usersAPI } from '../services/api';
import axios from 'axios';
import { getBackendURL } from '../utils/config';

/**
 * Hook pour le Planning du Personnel avec synchronisation temps réel via WebSocket
 * Gère les utilisateurs et les disponibilités
 */
export const usePlanning = (currentDate) => {
  const backend_url = getBackendURL();
  const token = localStorage.getItem('token');

  /**
   * Fonction pour charger les utilisateurs
   */
  const fetchUsers = useCallback(async () => {
    try {
      // getActive : exclut les utilisateurs au statut "inactif"
      const response = await usersAPI.getActive();
      // Filtrer le compte de secours du planning
      return (response?.data || []).filter(u => u.email !== 'buenogy@gmail.com');
    } catch (error) {
      console.error('[usePlanning] Erreur chargement users:', error);
      return [];
    }
  }, []);

  /**
   * Fonction pour charger les disponibilités du mois
   */
  const fetchAvailabilities = useCallback(async () => {
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const response = await axios.get(`${backend_url}/api/availabilities`, {
        params: {
          start_date: startOfMonth.toISOString(),
          end_date: endOfMonth.toISOString()
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      return response?.data || [];
    } catch (error) {
      console.error('[usePlanning] Erreur chargement availabilities:', error);
      return [];
    }
  }, [currentDate, backend_url, token]);

  // Hook temps réel pour les utilisateurs
  // Polling plus rapide (5s) pour détecter rapidement les changements de service
  const {
    data: users,
    loading: loadingUsers,
    wsConnected: wsUsersConnected,
    refresh: refreshUsers,
  } = useRealtimeData('users', fetchUsers, {
    enableWebSocket: true,
    fallbackPolling: true,
    pollingInterval: 5000,  // 5 secondes pour une meilleure réactivité
  });

  // Hook temps réel pour les disponibilités
  const {
    data: availabilities,
    loading: loadingAvailabilities,
    wsConnected: wsAvailabilitiesConnected,
    refresh: refreshAvailabilities,
  } = useRealtimeData('availabilities', fetchAvailabilities, {
    enableWebSocket: true,
    fallbackPolling: true,
    pollingInterval: 30000,
  });

  // Fonction pour tout rafraîchir
  const refresh = useCallback(() => {
    refreshUsers();
    refreshAvailabilities();
  }, [refreshUsers, refreshAvailabilities]);

  // État global de chargement et connexion
  const loading = loadingUsers || loadingAvailabilities;
  const wsConnected = wsUsersConnected || wsAvailabilitiesConnected;

  return {
    users,
    availabilities,
    loading,
    wsConnected,
    refresh,
    refreshAvailabilities,
  };
};

export default usePlanning;
