import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * ErrorBoundary global au niveau de l'application.
 * Capture toute erreur de rendu React (ex: rendu accidentel d'un objet,
 * composant qui plante) et affiche un fallback clair plutôt qu'un écran blanc.
 */
class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[GlobalErrorBoundary] Erreur capturée:', error, info);
    this.setState({ info });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, info: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, info: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const errMsg =
        typeof this.state.error?.message === 'string'
          ? this.state.error.message
          : 'Erreur inconnue';
      return (
        <div
          className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4"
          data-testid="global-error-boundary"
        >
          <div className="max-w-xl w-full bg-white border border-red-200 rounded-2xl shadow-xl p-6">
            <div className="flex items-start gap-4">
              <div className="bg-red-100 p-3 rounded-full">
                <AlertTriangle size={28} className="text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-red-800">
                  Oups… une erreur inattendue s'est produite
                </h2>
                <p className="text-sm text-gray-700 mt-2">
                  L'application a rencontré un problème et n'a pas pu afficher cette page
                  correctement. Vous pouvez recharger la page ou revenir à l'accueil.
                </p>
                <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-800 break-words">
                  <strong>Détail :</strong> {errMsg}
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    type="button"
                    onClick={this.handleReload}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                    data-testid="error-reload-btn"
                  >
                    <RefreshCw size={14} />
                    Recharger la page
                  </button>
                  <button
                    type="button"
                    onClick={this.handleGoHome}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                    data-testid="error-home-btn"
                  >
                    <Home size={14} />
                    Retour à l'accueil
                  </button>
                </div>
                {process.env.NODE_ENV !== 'production' && this.state.info?.componentStack && (
                  <details className="mt-3">
                    <summary className="text-xs text-gray-500 cursor-pointer">
                      Stack technique (dev)
                    </summary>
                    <pre className="mt-1 text-[10px] text-gray-600 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded">
                      {this.state.info.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default GlobalErrorBoundary;
