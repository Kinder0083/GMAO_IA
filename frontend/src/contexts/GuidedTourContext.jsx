import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const GuidedTourContext = createContext();

// Clé de stockage local pour le cache rapide (fallback offline)
const TOUR_STORAGE_KEY = 'gmao_guided_tour_completed';
const TOUR_VERSION = '1.0';

// API base URL depuis l'environnement
const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

async function fetchTourStatusFromDB() {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return null;
    const res = await fetch(`${API_BASE}/api/user-preferences/tour-status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.tour_completed === true;
  } catch {
    return null;
  }
}

async function saveTourCompletedToDB() {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return;
    await fetch(`${API_BASE}/api/user-preferences/tour-completed`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
  } catch {
    // Silencieux : localStorage reste le fallback
  }
}

async function resetTourInDB() {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return;
    await fetch(`${API_BASE}/api/user-preferences/tour-completed`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch {}
}

export const GuidedTourProvider = ({ children }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentPage, setCurrentPage] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  // Initialement true = on n'affiche pas la visite avant vérification DB
  const [hasCompletedTour, setHasCompletedTour] = useState(true);
  const [dbChecked, setDbChecked] = useState(false);
  const startedRef = useRef(false);

  // Étape 1 : vérification rapide depuis localStorage
  // Étape 2 : vérification depuis la DB (source de vérité)
  useEffect(() => {
    const checkTourStatus = async () => {
      // Vérifier localStorage en premier (réponse immédiate)
      const localData = localStorage.getItem(TOUR_STORAGE_KEY);
      let localCompleted = false;
      if (localData) {
        try {
          const { completed, version } = JSON.parse(localData);
          localCompleted = completed && version === TOUR_VERSION;
        } catch {
          localCompleted = false;
        }
      }

      // Si localStorage dit "complété" → afficher l'app immédiatement, vérifier DB en arrière-plan
      if (localCompleted) {
        setHasCompletedTour(true);
        setDbChecked(true);
        // Sync silencieux avec la DB pour s'assurer de la cohérence
        fetchTourStatusFromDB().then(dbCompleted => {
          if (dbCompleted === false) {
            // DB dit non-complété mais localStorage dit complété → resync DB
            saveTourCompletedToDB();
          }
        });
        return;
      }

      // localStorage dit "non-complété" → vérifier la DB (cas : nouvel appareil / cache effacé)
      const dbCompleted = await fetchTourStatusFromDB();
      setDbChecked(true);

      if (dbCompleted === true) {
        // DB dit complété → mettre à jour localStorage et ne pas montrer la visite
        localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({
          completed: true, version: TOUR_VERSION, completedAt: new Date().toISOString()
        }));
        setHasCompletedTour(true);
      } else {
        // Ni localStorage ni DB ne disent complété → montrer la visite
        setHasCompletedTour(false);
      }
    };

    checkTourStatus();
  }, []);

  // Démarrer la visite automatiquement pour les nouveaux utilisateurs (après vérification DB)
  useEffect(() => {
    if (!dbChecked) return;
    if (!hasCompletedTour && !isRunning && !startedRef.current) {
      const timer = setTimeout(() => {
        const currentPath = window.location.pathname;
        if (currentPath === '/' || currentPath === '/dashboard') {
          startedRef.current = true;
          startTour('dashboard');
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedTour, isRunning, dbChecked]);

  const startTour = useCallback((page = null) => {
    setCurrentPage(page);
    setStepIndex(0);
    setIsRunning(true);
  }, []);

  const stopTour = useCallback(() => {
    setIsRunning(false);
    setCurrentPage(null);
    setStepIndex(0);
  }, []);

  // Appelé par "Terminer" ET par "Passer" — sauvegarde dans localStorage ET en DB
  const completeTour = useCallback(() => {
    setIsRunning(false);
    setHasCompletedTour(true);
    // Sauvegarder en localStorage (cache local)
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({
      completed: true,
      version: TOUR_VERSION,
      completedAt: new Date().toISOString()
    }));
    // Sauvegarder en base de données (source de vérité multi-appareils)
    saveTourCompletedToDB();
  }, []);

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    startedRef.current = false;
    setHasCompletedTour(false);
    setDbChecked(true);
    resetTourInDB();
  }, []);

  const goToStep = useCallback((index) => {
    setStepIndex(index);
  }, []);

  return (
    <GuidedTourContext.Provider value={{
      isRunning,
      currentPage,
      stepIndex,
      hasCompletedTour,
      startTour,
      stopTour,
      completeTour,
      resetTour,
      goToStep,
      setStepIndex
    }}>
      {children}
    </GuidedTourContext.Provider>
  );
};

export const useGuidedTour = () => {
  const context = useContext(GuidedTourContext);
  if (!context) {
    throw new Error('useGuidedTour must be used within a GuidedTourProvider');
  }
  return context;
};

export default GuidedTourContext;
