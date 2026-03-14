/**
 * ConnectivityManager — Détection fiable de connectivité.
 * 
 * navigator.onLine est notoirement peu fiable dans les PWA installées.
 * Ce manager détecte la connectivité RÉELLE en observant :
 *  1. Les événements navigateur online/offline (baseline)
 *  2. Les échecs réseau des appels API (pas de réponse = offline)
 *  3. Les succès des appels API (réponse reçue = online)
 *  4. Un ping périodique quand on est offline pour détecter le retour
 */

class ConnectivityManager {
  constructor() {
    this._isOnline = navigator.onLine;
    this._listeners = new Set();
    this._pingInterval = null;
    this._consecutiveFailures = 0;
    this._FAILURE_THRESHOLD = 1;
    this._backendUrl = '';

    // Écouter les événements navigateur comme baseline
    window.addEventListener('online', () => this._onBrowserOnline());
    window.addEventListener('offline', () => this._setOffline());

    // Initialiser l'URL backend (sera disponible après le build React)
    try {
      this._backendUrl = process.env.REACT_APP_BACKEND_URL || '';
    } catch {}
  }

  get isOnline() {
    return this._isOnline;
  }

  /** Appelé quand une requête API réussit */
  reportSuccess() {
    this._consecutiveFailures = 0;
    if (!this._isOnline) {
      this._setOnline();
    }
  }

  /** Appelé quand une requête API échoue sans réponse (erreur réseau) */
  reportNetworkError() {
    this._consecutiveFailures++;
    if (this._consecutiveFailures >= this._FAILURE_THRESHOLD && this._isOnline) {
      this._setOffline();
    }
  }

  /** S'abonner aux changements de connectivité */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _setOnline() {
    if (this._isOnline) return;
    this._isOnline = true;
    this._consecutiveFailures = 0;
    this._stopPing();
    this._notify();
    window.dispatchEvent(new Event('app-online'));
    console.log('[Connectivity] En ligne');
  }

  _setOffline() {
    if (!this._isOnline) return;
    this._isOnline = false;
    this._notify();
    this._startPing();
    console.log('[Connectivity] Hors ligne');
  }

  _notify() {
    this._listeners.forEach(cb => {
      try { cb(this._isOnline); } catch {}
    });
  }

  _onBrowserOnline() {
    // Le navigateur signale "online" — on tente plusieurs pings rapides
    // ET on vérifie aussi navigator.onLine comme signal de base
    if (navigator.onLine) {
      // Optimistic : passer en ligne immédiatement si navigator le confirme
      // Le prochain appel API confirmera via reportSuccess()
      this._setOnline();
    }
    // Quand même vérifier avec un ping
    this._pingServer();
    setTimeout(() => { if (!this._isOnline) this._pingServer(); }, 2000);
  }

  _startPing() {
    if (this._pingInterval) return;
    this._pingServer();
    this._pingInterval = setInterval(() => this._pingServer(), 5000);
  }

  _stopPing() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  async _pingServer() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const url = this._backendUrl ? `${this._backendUrl}/api/health` : '/api/health';
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      clearTimeout(timeout);
      if (response.ok || response.status < 500) {
        this._setOnline();
      }
    } catch {
      // Toujours offline
    }
  }
}

// Singleton
const connectivity = new ConnectivityManager();
export default connectivity;
