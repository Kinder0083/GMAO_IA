import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const TokenValidator = () => {
  const location = useLocation();

  useEffect(() => {
    const validateToken = () => {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');

      // Si on est sur la page de login, ne rien faire
      if (location.pathname === '/login' || location.pathname === '/reset-password') {
        return;
      }

      // Si pas de token, rediriger vers login (rechargement complet)
      if (!token || !user) {
        window.location.href = '/login';
        return;
      }

      try {
        // Décoder le token JWT pour vérifier l'expiration
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(window.atob(base64));
        
        // Vérifier si le token est expiré
        const currentTime = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < currentTime) {
          console.log('Token expiré, déconnexion silencieuse');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      } catch (error) {
        // Token invalide, déconnecter
        console.error('Token invalide:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    };

    // Vérifier au montage du composant
    validateToken();

    // Vérifier toutes les 30 secondes
    const interval = setInterval(validateToken, 30000);

    return () => clearInterval(interval);
  }, [location.pathname]);

  return null; // Ce composant ne rend rien
};

export default TokenValidator;
