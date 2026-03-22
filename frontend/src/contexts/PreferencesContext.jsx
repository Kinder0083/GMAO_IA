import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { getBackendURL } from '../utils/config';

const PreferencesContext = createContext();

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};

export const PreferencesProvider = ({ children }) => {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);

  // Charger les préférences quand le token est disponible
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      loadPreferences();
    } else {
      setLoading(false);
      // Attendre que le token apparaisse (après login)
      const checkToken = setInterval(() => {
        if (localStorage.getItem('token')) {
          clearInterval(checkToken);
          loadPreferences();
        }
      }, 500);
      return () => clearInterval(checkToken);
    }
  }, []);

  const loadPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const backend_url = getBackendURL();
      const response = await axios.get(`${backend_url}/api/user-preferences`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const rawData = response.data;
      const prefs = rawData?.preferences || rawData || {};
      setPreferences(prefs);
      applyPreferences(prefs);
      try { localStorage.setItem('cached_preferences', JSON.stringify(prefs)); } catch {}
    } catch (error) {
      console.error('Erreur lors du chargement des préférences:', error);
      // Fallback : charger depuis le cache local (mode hors ligne)
      try {
        const cached = localStorage.getItem('cached_preferences');
        if (cached) {
          const cachedPrefs = JSON.parse(cached);
          setPreferences(cachedPrefs);
          applyPreferences(cachedPrefs);
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (updates) => {
    try {
      const token = localStorage.getItem('token');
      const backend_url = getBackendURL();

      const response = await axios.put(
        `${backend_url}/api/user-preferences`,
        updates,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const prefs = response.data?.preferences || response.data || {};
      setPreferences(prefs);
      applyPreferences(prefs);
      try { localStorage.setItem('cached_preferences', JSON.stringify(prefs)); } catch {}
      return prefs;
    } catch (error) {
      console.error('Erreur lors de la mise à jour des préférences:', error);
      throw error;
    }
  };

  const resetPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      const backend_url = getBackendURL();

      const response = await axios.post(
        `${backend_url}/api/user-preferences/reset`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPreferences(response.data.preferences);
      applyPreferences(response.data.preferences);
      try { localStorage.setItem('cached_preferences', JSON.stringify(response.data.preferences)); } catch {}
      return response.data.preferences;
    } catch (error) {
      console.error('Erreur lors de la réinitialisation des préférences:', error);
      throw error;
    }
  };

  const applyPreferences = (prefs) => {
    if (!prefs) return;

    const root = document.documentElement;

    // Appliquer les couleurs CSS
    root.style.setProperty('--primary-color', prefs.primary_color);
    root.style.setProperty('--secondary-color', prefs.secondary_color);
    root.style.setProperty('--sidebar-bg-color', prefs.sidebar_bg_color);
    root.style.setProperty('--sidebar-icon-color', prefs.sidebar_icon_color);

    // Appliquer le thème (light/dark)
    if (prefs.theme_mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Appliquer la densité d'affichage
    root.setAttribute('data-density', prefs.display_density);

    // Appliquer la taille de police
    root.setAttribute('data-font-size', prefs.font_size);

    // Appliquer l'image de fond si définie
    if (prefs.background_image_url) {
      root.style.setProperty('--background-image', `url(${prefs.background_image_url})`);
    } else {
      root.style.setProperty('--background-image', 'none');
    }
  };

  const value = {
    preferences,
    loading,
    updatePreferences,
    resetPreferences,
    loadPreferences
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};
