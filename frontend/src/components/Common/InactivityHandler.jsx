import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { AlertTriangle, LogOut } from 'lucide-react';
import api from '../../services/api';

const InactivityHandler = () => {
  const location = useLocation();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [inactivityTimeout, setInactivityTimeout] = useState(15 * 60 * 1000); // Par défaut 15 minutes
  const [isTimeoutDisabled, setIsTimeoutDisabled] = useState(false);

  // Charger les paramètres au démarrage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.settings.getSettings();
        const timeoutMinutes = response.data.inactivity_timeout_minutes || 15;
        setInactivityTimeout(timeoutMinutes * 60 * 1000);
      } catch (error) {
        console.error('Erreur lors du chargement des paramètres:', error);
        // En cas d'erreur, garder la valeur par défaut
      }
    };
    loadSettings();
  }, []);

  // Durées en millisecondes
  const WARNING_DURATION = 60 * 1000; // 60 secondes

  // Réinitialiser le timer d'activité
  const resetActivityTimer = useCallback(() => {
    setLastActivity(Date.now());
    if (showWarning) {
      setShowWarning(false);
      setCountdown(60);
    }
  }, [showWarning]);

  // Déconnexion avec rechargement complet (évite le mélange d'état entre utilisateurs)
  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }, []);

  // Rester connecté
  const handleStayConnected = () => {
    resetActivityTimer();
  };

  // Polling force-logout : vérifie toutes les 30s si l'admin a forcé la déconnexion
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const checkForceLogout = async () => {
      try {
        await api.get('/auth/session-check');
      } catch (err) {
        if (err.response?.status === 401) {
          // Session invalidée par l'admin → déconnexion immédiate
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
    };

    const interval = setInterval(checkForceLogout, 30000);
    return () => clearInterval(interval);
  }, []);

  // Détection d'activité utilisateur
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, resetActivityTimer, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetActivityTimer);
      });
    };
  }, [resetActivityTimer]);

  // Détecter si l'utilisateur est sur une page où le timeout est désactivé
  useEffect(() => {
    const disabledPaths = ['/chat-live', '/whiteboard'];
    setIsTimeoutDisabled(disabledPaths.includes(location.pathname));
  }, [location.pathname]);

  // Vérification de l'inactivité
  useEffect(() => {
    const checkInactivity = setInterval(() => {
      // Si sur une page protégée (Chat Live ou Whiteboard), désactiver le timeout
      if (isTimeoutDisabled) {
        return;
      }

      const inactiveTime = Date.now() - lastActivity;
      
      if (inactiveTime >= inactivityTimeout && !showWarning) {
        // Afficher le popup d'avertissement
        setShowWarning(true);
        setCountdown(60);
      }
    }, 1000); // Vérifier toutes les secondes

    return () => clearInterval(checkInactivity);
  }, [lastActivity, showWarning, inactivityTimeout, isTimeoutDisabled]);

  // Compte à rebours du popup
  useEffect(() => {
    if (!showWarning) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Déconnexion automatique
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showWarning, handleLogout]);

  return (
    <Dialog open={showWarning} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[450px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 p-3 rounded-full">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <DialogTitle className="text-orange-900">
                ⚠️ Inactivité détectée
              </DialogTitle>
              <DialogDescription className="mt-2">
                Vous serez déconnecté automatiquement dans {countdown} seconde{countdown > 1 ? 's' : ''}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-2">
          <div className="flex items-center justify-center">
            <div className="text-6xl font-bold text-orange-600 tabular-nums">
              {countdown}
            </div>
          </div>
          <p className="text-sm text-center text-orange-800 mt-2">
            secondes restantes
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            onClick={handleStayConnected}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Rester connecté
          </Button>
          <Button
            type="button"
            onClick={handleLogout}
            variant="outline"
            className="w-full"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Me déconnecter maintenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InactivityHandler;
