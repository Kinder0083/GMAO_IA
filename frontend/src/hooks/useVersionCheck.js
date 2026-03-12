import { useEffect, useRef } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000; // Verifier toutes les 5 minutes

const useVersionCheck = () => {
  const currentVersion = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverVersion = data.version;

        if (!serverVersion || serverVersion === '__BUILD_TIMESTAMP__') return;

        if (currentVersion.current === null) {
          // Premier chargement : on enregistre la version
          currentVersion.current = serverVersion;
        } else if (currentVersion.current !== serverVersion) {
          // Version differente detectee : nouvelle mise a jour deployee
          console.log('[VersionCheck] Nouvelle version detectee:', serverVersion, '(actuelle:', currentVersion.current, ')');
          currentVersion.current = serverVersion;

          // Desinregistrer le SW pour forcer le rechargement propre
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
              await reg.unregister();
            }
          }

          // Recharger la page pour obtenir les nouveaux fichiers
          window.location.reload();
        }
      } catch (err) {
        // Silencieux - pas de blocage si version.json n'est pas disponible
      }
    };

    // Verifier au demarrage (apres un delai)
    const initTimeout = setTimeout(checkVersion, 3000);

    // Verifier periodiquement
    intervalRef.current = setInterval(checkVersion, CHECK_INTERVAL);

    // Verifier aussi quand l'onglet redevient visible (retour sur l'app)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(initTimeout);
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
};

export default useVersionCheck;
